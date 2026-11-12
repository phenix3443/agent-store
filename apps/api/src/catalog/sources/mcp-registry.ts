import type {
  McpArgument,
  McpInput,
  McpKeyValueInput,
  McpPackage,
  McpRemote,
  McpResourceDetail,
  McpTransport,
  ResourceAuthor,
} from '@as/types'
import { arr, getJson, isRecord, str } from '../http'
import { addSkip, type CatalogRecord, type CatalogSource, type SourceRun } from '../types'

export const MCP_REGISTRY_URL = 'https://registry.modelcontextprotocol.io'
const PAGE_LIMIT = 100
// updated_since compares registry timestamps; the overlap absorbs entries
// written while the previous run was paging. Re-reading them is harmless.
const WATERMARK_OVERLAP_MS = 10 * 60_000
const OFFICIAL = 'io.modelcontextprotocol.registry/official'

function input(raw: unknown): McpInput {
  const r = isRecord(raw) ? raw : {}
  return {
    description: str(r['description']),
    isRequired: r['isRequired'] === true,
    isSecret: r['isSecret'] === true,
    default: str(r['default']),
    value: str(r['value']),
    placeholder: str(r['placeholder']),
    choices: arr(r['choices']).filter((c): c is string => typeof c === 'string'),
    format: str(r['format']),
  }
}

function variables(raw: unknown): Record<string, McpInput> {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, input(v)]))
}

function keyValue(raw: unknown): McpKeyValueInput | null {
  if (!isRecord(raw)) return null
  const name = str(raw['name'])
  if (!name) return null
  return { ...input(raw), name, variables: variables(raw['variables']) }
}

function argument(raw: unknown): McpArgument | null {
  if (!isRecord(raw)) return null
  const type = raw['type'] === 'named' ? 'named' : raw['type'] === 'positional' ? 'positional' : null
  if (!type) return null
  return {
    ...input(raw),
    type,
    name: str(raw['name']),
    valueHint: str(raw['valueHint']),
    isRepeated: raw['isRepeated'] === true,
    variables: variables(raw['variables']),
  }
}

const notNull = <T>(v: T | null): v is T => v !== null

function transport(raw: unknown): McpTransport {
  const r = isRecord(raw) ? raw : {}
  return {
    type: str(r['type']) ?? 'stdio',
    url: str(r['url']),
    headers: arr(r['headers']).map(keyValue).filter(notNull),
    variables: variables(r['variables']),
  }
}

function pkg(raw: unknown): McpPackage | null {
  if (!isRecord(raw)) return null
  const registryType = str(raw['registryType'])
  const identifier = str(raw['identifier'])
  if (!registryType || !identifier) return null
  return {
    registryType,
    identifier,
    version: str(raw['version']),
    registryBaseUrl: str(raw['registryBaseUrl']),
    runtimeHint: str(raw['runtimeHint']),
    fileSha256: str(raw['fileSha256']),
    transport: transport(raw['transport']),
    runtimeArguments: arr(raw['runtimeArguments']).map(argument).filter(notNull),
    packageArguments: arr(raw['packageArguments']).map(argument).filter(notNull),
    environmentVariables: arr(raw['environmentVariables']).map(keyValue).filter(notNull),
  }
}

function remote(raw: unknown): McpRemote | null {
  const t = transport(raw)
  return t.url && t.type !== 'stdio' ? { ...t, url: t.url } : null
}

/**
 * Namespaces under io.github.* are proven by a GitHub login; any other
 * reverse-DNS namespace was proven by DNS or an HTTP challenge on that domain.
 */
export function namespaceAuthor(serverName: string): { author: ResourceAuthor; domainVerified: boolean } {
  const namespace = serverName.split('/')[0] ?? serverName
  const gh = namespace.match(/^io\.github\.(.+)$/i)
  if (gh) return { author: { name: gh[1], url: `https://github.com/${gh[1]}` }, domainVerified: false }
  const domain = namespace.split('.').reverse().join('.')
  return { author: { name: domain, url: `https://${domain}` }, domainVerified: true }
}

export type ServerOutcome =
  | { record: CatalogRecord }
  | { removed: string; reason: string }
  | { skip: string; name: string | null }

/** One entry of /v0/servers (`{ server, _meta }`) → a catalog record, or why not. */
export function normalizeServer(entry: unknown): ServerOutcome {
  if (!isRecord(entry) || !isRecord(entry['server'])) return { skip: 'malformed entry', name: null }
  const s = entry['server']
  const name = str(s['name'])
  const version = str(s['version'])
  if (!name || !version) return { skip: 'missing name or version', name }
  const meta = isRecord(entry['_meta']) && isRecord(entry['_meta'][OFFICIAL]) ? entry['_meta'][OFFICIAL] : {}
  const status = str(meta['status']) ?? 'active'
  if (status === 'deleted') return { removed: name, reason: 'deleted upstream' }
  if (status === 'deprecated') {
    return { removed: name, reason: `deprecated upstream${str(meta['statusMessage']) ? `: ${str(meta['statusMessage'])}` : ''}` }
  }

  const packages = arr(s['packages']).map(pkg).filter(notNull)
  const remotes = arr(s['remotes']).map(remote).filter(notNull)
  if (packages.length === 0 && remotes.length === 0) return { skip: 'no packages or remotes', name }

  const repoRaw = isRecord(s['repository']) ? s['repository'] : null
  const repoUrl = repoRaw ? str(repoRaw['url']) : null
  const { author, domainVerified } = namespaceAuthor(name)
  const title = str(s['title'])
  const transports = [...new Set([...packages.map((p) => p.registryType), ...remotes.map((r) => r.type)])]
  const detail: Omit<McpResourceDetail, keyof import('@as/types').ResourceSummary> = {
    title,
    status,
    statusMessage: str(meta['statusMessage']),
    publishedAt: str(meta['publishedAt']),
    repository: repoUrl
      ? { url: repoUrl, source: str(repoRaw?.['source']), subfolder: str(repoRaw?.['subfolder']) }
      : null,
    icons: arr(s['icons']).flatMap((i) =>
      isRecord(i) && str(i['src'])
        ? [{
            src: str(i['src'])!,
            mimeType: str(i['mimeType']),
            sizes: arr(i['sizes']).filter((x): x is string => typeof x === 'string'),
            theme: str(i['theme']),
          }]
        : [],
    ),
    packages,
    remotes,
  }
  return {
    record: {
      kind: 'mcp',
      site: 'mcp-registry',
      upstreamId: name,
      name: title ?? name.split('/').pop() ?? name,
      description: str(s['description']),
      author,
      version,
      homepageUrl: str(s['websiteUrl']) ?? repoUrl,
      installs: null,
      verified: domainVerified,
      tags: transports,
      transports,
      sourceUrl: `${MCP_REGISTRY_URL}/v0/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
      upstreamVersion: version,
      upstreamUpdatedAt: str(meta['updatedAt']) ?? str(meta['publishedAt']),
      scope: null,
      detail,
    },
  }
}

export function pageUrl(base: string, cursor: string | null, updatedSince: string | null): string {
  const u = new URL('/v0/servers', base)
  u.searchParams.set('version', 'latest')
  u.searchParams.set('limit', String(PAGE_LIMIT))
  if (updatedSince) u.searchParams.set('updated_since', updatedSince)
  if (cursor) u.searchParams.set('cursor', cursor)
  return u.toString()
}

export function mcpRegistrySource(options: { baseUrl?: string } = {}): CatalogSource {
  const base = options.baseUrl ?? MCP_REGISTRY_URL
  return {
    name: 'mcp-registry',
    site: 'mcp-registry',
    kind: 'mcp',
    async run(ctx): Promise<SourceRun> {
      const incremental = !ctx.full && ctx.state.watermark !== null
      const since = incremental ? new Date(Date.parse(ctx.state.watermark!) - WATERMARK_OVERLAP_MS).toISOString() : null
      const run: SourceRun = { records: [], removed: [], skipped: {}, errors: [], coverage: incremental ? { mode: 'incremental' } : { mode: 'full' } }
      let watermark = ctx.state.watermark
      let cursor: string | null = null
      let pages = 0
      do {
        const body = await getJson(ctx.fetch, pageUrl(base, cursor, since), 'MCP Registry', 30_000)
        if (!isRecord(body) || !Array.isArray(body['servers'])) throw new Error('MCP Registry: unexpected page shape')
        for (const entry of body['servers']) {
          const meta = isRecord(entry) && isRecord(entry['_meta']) && isRecord(entry['_meta'][OFFICIAL]) ? entry['_meta'][OFFICIAL] : {}
          for (const t of [str(meta['updatedAt']), str(meta['statusChangedAt'])]) {
            if (t && (!watermark || Date.parse(t) > Date.parse(watermark))) watermark = t
          }
          const out = normalizeServer(entry)
          if ('record' in out) run.records.push(out.record)
          else if ('removed' in out) run.removed.push({ upstreamId: out.removed, reason: out.reason })
          else {
            addSkip(run.skipped, out.skip)
            // An entry that stops being installable must not stay listed from an older version.
            if (out.name) run.removed.push({ upstreamId: out.name, reason: out.skip })
          }
        }
        cursor = isRecord(body['metadata']) ? str(body['metadata']['nextCursor']) : null
        if (++pages % 50 === 0) ctx.log(`mcp-registry: ${pages} pages, ${run.records.length} servers`)
      } while (cursor)
      run.watermark = watermark
      return run
    },
  }
}
