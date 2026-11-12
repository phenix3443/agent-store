import type {
  McpArgument,
  McpKeyValueInput,
  McpPackage,
  McpRemote,
  McpResourceDetail,
  ResourceDetail,
  ResourceKind,
  ResourceSort,
  ResourceSummary,
} from '@as/types'

export const KINDS: readonly ResourceKind[] = ['skill', 'mcp', 'provider']
export const SORTS: readonly ResourceSort[] = ['default', 'installs', 'updated', 'name']

export interface StoreQuery {
  kind: ResourceKind | null
  q: string
  sort: ResourceSort
}

/** Reads the store's URL state. `created` from before #120 maps to `updated`; other old sorts fall back to the default. */
export function parseStoreQuery(sp: { category?: string; q?: string; sort?: string }): StoreQuery {
  const kind = KINDS.includes(sp.category as ResourceKind) ? (sp.category as ResourceKind) : null
  const sort = SORTS.includes(sp.sort as ResourceSort) ? (sp.sort as ResourceSort) : sp.sort === 'created' ? 'updated' : 'default'
  return { kind, q: (sp.q ?? '').trim().slice(0, 200), sort }
}

/**
 * `/store/<kind>/<id>`. Ids hold ':' and '/': each '/'-separated part becomes a
 * path segment, so the URL stays readable and the catch-all route rebuilds it.
 */
export function resourceHref(r: Pick<ResourceSummary, 'kind' | 'id'>): string {
  const path = r.id
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ':'))
    .join('/')
  return `/store/${r.kind}/${path}`
}

export function idFromSegments(segments: string[]): string {
  return segments
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join('/')
}

// Compact counts matching the design (e.g. 142.0K, 1.2M).
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

// Upstream descriptions are the author's own text, often a skill's trigger
// instructions. Listings show the first whole sentence so a summary never ends
// mid-word; the full text stays on the detail page.
export function leadSentence(text: string): string {
  const first = sentences.segment(text.trim())[Symbol.iterator]().next().value
  return (first?.segment ?? text).trim()
}

/** `owner/repo` and the skill name, from a skill's `owner/repo/name` upstream id. */
function skillParts(upstreamId: string): { repo: string; name: string } | null {
  const parts = upstreamId.split('/')
  if (parts.length < 3) return null
  return { repo: `${parts[0]}/${parts[1]}`, name: parts.slice(2).join('/') }
}

const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/
function quote(arg: string): string {
  if (SAFE.test(arg)) return arg
  // A `<placeholder>` is meant to be replaced, not quoted.
  if (/^<[^<>]+>$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

const lastSegment = (upstreamId: string) => upstreamId.split('/').pop() ?? upstreamId

/** The name a server is registered under in `claude mcp add`. */
function mcpName(upstreamId: string): string {
  return lastSegment(upstreamId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp'
}

function inputValue(input: { value: string | null; default: string | null }, name: string): string {
  return input.value ?? input.default ?? `<${name}>`
}

function args(list: McpArgument[]): string[] {
  const out: string[] = []
  for (const a of list) {
    const hint = a.valueHint ?? a.name?.replace(/^-+/, '') ?? 'value'
    const value = a.value ?? a.default
    if (a.type === 'named') {
      if (!a.name) continue
      out.push(a.name)
      if (value != null) out.push(quote(value))
      else if (a.isRequired || a.valueHint) out.push(`<${hint}>`)
    } else {
      if (value == null && !a.isRequired) continue
      out.push(value != null ? quote(value) : `<${hint}>`)
    }
  }
  return out
}

/** Variables the user has to fill in: no fixed value and no default. */
export function neededInputs(list: McpKeyValueInput[]): string[] {
  return list.filter((v) => v.value == null && v.default == null && (v.isRequired || v.isSecret)).map((v) => v.name)
}

/** How the registry's conventions launch a package locally; null when there is no known launcher. */
export function packageLaunch(pkg: McpPackage): string | null {
  const runtime = args(pkg.runtimeArguments)
  const rest = args(pkg.packageArguments)
  const hint = pkg.runtimeHint
  const type = pkg.registryType
  let head: string[]
  if ((type === 'npm' && !hint) || hint === 'npx') {
    head = ['npx', '-y', ...runtime, pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier]
  } else if ((type === 'pypi' && !hint) || hint === 'uvx') {
    head = ['uvx', ...runtime, pkg.version ? `${pkg.identifier}==${pkg.version}` : pkg.identifier]
  } else if ((type === 'oci' && !hint) || hint === 'docker') {
    const env = pkg.environmentVariables.flatMap((v) => ['-e', v.name])
    head = ['docker', 'run', '-i', '--rm', ...env, ...runtime, pkg.identifier]
  } else if (hint) {
    head = [hint, ...runtime, pkg.identifier]
  } else {
    return null
  }
  return [...head.map(quote), ...rest].join(' ')
}

function envFlags(pkg: McpPackage): string[] {
  return pkg.environmentVariables
    .filter((v) => v.isRequired || v.value != null)
    .flatMap((v) => ['-e', `${v.name}=${quote(inputValue(v, v.name))}`])
}

function remoteCommand(name: string, remote: McpRemote): string {
  const transport = remote.type === 'sse' ? 'sse' : 'http'
  const headers = remote.headers
    .filter((h) => h.isRequired || h.value != null)
    .flatMap((h) => ['--header', `'${`${h.name}: ${inputValue(h, h.name)}`.replace(/'/g, `'\\''`)}'`])
  return ['claude', 'mcp', 'add', '--transport', transport, ...headers, name, quote(remote.url)].join(' ')
}

/**
 * The Claude Code command that adds an MCP server. Prefers an npm or PyPI
 * package run over stdio, then a remote, then any other package with a launcher;
 * the registry lists them in no ranked order.
 */
export function mcpCommand(r: McpResourceDetail): string | null {
  const name = mcpName(r.origin.upstreamId)
  const stdio = r.packages.filter((p) => p.transport.type === 'stdio')
  const local = (pkg: McpPackage) => {
    const launch = packageLaunch(pkg)
    return launch ? ['claude', 'mcp', 'add', ...envFlags(pkg), name, '--', launch].join(' ') : null
  }
  const preferred = stdio.find((p) => p.registryType === 'npm' || p.registryType === 'pypi')
  const first = preferred && local(preferred)
  if (first) return first
  if (r.remotes[0]) return remoteCommand(name, r.remotes[0])
  for (const pkg of stdio) {
    const cmd = local(pkg)
    if (cmd) return cmd
  }
  return null
}

/**
 * An install command for what the data supports, or null (an MCP summary does
 * not carry its packages; the detail does).
 * - skill: the skills.sh CLI, which reads the GitHub repo
 * - mcp: `claude mcp add`
 * - provider: the Agent Store CLI, whose built-in providers share these slugs
 */
export function installCommand(r: ResourceSummary | ResourceDetail): string | null {
  if (r.kind === 'skill') {
    const parts = skillParts(r.origin.upstreamId)
    return parts ? `npx skills add ${parts.repo} --skill ${quote(parts.name)}` : null
  }
  if (r.kind === 'provider') return `aas install ${r.origin.upstreamId}`
  return 'packages' in r ? mcpCommand(r) : null
}

const SLUG = /^[a-z0-9-]{1,128}$/

/**
 * The slug the desktop client's install link carries. The client still looks
 * slugs up in /api/items; these match its slugs for the packages both catalogs
 * hold (providers: the slug; skills: `<repo>-<name>`; MCP: the server name).
 */
export function desktopSlug(r: Pick<ResourceSummary, 'kind' | 'origin'>): string | null {
  const id = r.origin.upstreamId
  let raw = id
  if (r.kind === 'skill') {
    const parts = skillParts(id)
    raw = parts ? `${parts.repo.split('/')[1]}-${parts.name}` : id
  } else if (r.kind === 'mcp') {
    raw = lastSegment(id)
  }
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128)
  return SLUG.test(slug) ? slug : null
}

export type RunKind = 'command' | 'connect' | 'needs' | 'files'
export interface RunEntry {
  kind: RunKind
  value: string
  href?: string
}

/** What installing launches, connects to or copies, as far as the record says. */
export function runEntries(r: ResourceDetail): RunEntry[] {
  const entries: RunEntry[] = []
  if (r.kind === 'mcp') {
    for (const pkg of r.packages) {
      const launch = packageLaunch(pkg)
      entries.push({ kind: 'command', value: launch ?? `${pkg.registryType} ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}` })
      const needs = neededInputs(pkg.environmentVariables)
      if (needs.length) entries.push({ kind: 'needs', value: needs.join(', ') })
    }
    for (const remote of r.remotes) {
      entries.push({ kind: 'connect', value: remote.url })
      const needs = neededInputs(remote.headers)
      if (needs.length) entries.push({ kind: 'needs', value: needs.join(', ') })
    }
  } else if (r.kind === 'skill') {
    entries.push({ kind: 'files', value: `${r.repo.fullName}${r.repo.dir ? `/${r.repo.dir}` : ''}`, href: r.repo.url })
  } else if (r.connection) {
    entries.push({ kind: 'connect', value: r.connection.baseUrl })
  }
  return entries.filter((e, i, all) => all.findIndex((o) => o.kind === e.kind && o.value === e.value) === i)
}
