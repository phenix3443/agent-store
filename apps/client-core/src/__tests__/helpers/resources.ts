// Fixtures in the shape GET /api/resources[/<id>] returns, and a fetch stand-in
// that serves them (search by name/id substring, kind filter, paging).
import type {
  McpPackage, McpRemote, McpResourceDetail, ProviderResourceDetail, ResourceDetail, ResourceOrigin,
  SkillFile, SkillResourceDetail,
} from '@as/types'

const origin = (site: ResourceOrigin['site'], upstreamId: string): ResourceOrigin => ({
  site, upstreamId, url: null, upstreamVersion: null, upstreamUpdatedAt: '2026-11-12T00:00:00Z',
  syncedAt: '2026-11-12T00:00:00Z', unavailableAt: null, unavailableReason: null,
})

const summary = (kind: ResourceDetail['kind'], site: ResourceOrigin['site'], upstreamId: string) => ({
  id: `${site}:${upstreamId}`, kind, name: upstreamId.split('/').pop()!, description: `${upstreamId} description`,
  author: { name: upstreamId.split('/')[0], url: null }, version: '1.0.0', homepageUrl: null, installs: null, stars: null,
  verified: false, tags: [], transports: [], origin: origin(site, upstreamId),
})

export const emptyInput = {
  description: null, isRequired: false, isSecret: false, default: null, value: null, placeholder: null, choices: [], format: null,
}

export function npmPackage(identifier: string, overrides: Partial<McpPackage> = {}): McpPackage {
  return {
    registryType: 'npm', identifier, version: '1.2.3', registryBaseUrl: null, runtimeHint: null, fileSha256: null,
    transport: { type: 'stdio', url: null, headers: [], variables: {} },
    runtimeArguments: [], packageArguments: [], environmentVariables: [],
    ...overrides,
  }
}

export function mcpResource(upstreamId: string, parts: { packages?: McpPackage[]; remotes?: McpRemote[] } & Partial<McpResourceDetail> = {}): McpResourceDetail {
  return {
    ...summary('mcp', 'mcp-registry', upstreamId), kind: 'mcp', title: null, status: 'active', statusMessage: null,
    publishedAt: null, repository: null, icons: [], packages: [], remotes: [], ...parts,
  }
}

export const SKILL_COMMIT = 'c'.repeat(40)

export function skillResource(upstreamId: string, files: Record<string, string>, overrides: Partial<SkillResourceDetail> = {}): SkillResourceDetail {
  const [owner, repo, ...rest] = upstreamId.split('/')
  const dir = `skills/${rest.join('/')}`
  const list: SkillFile[] = Object.entries(files).map(([path, body]) => ({
    path, type: 'file', mode: '100644', size: body.length, sha: 'b'.repeat(40),
    downloadUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${SKILL_COMMIT}/${dir}/${path}`,
  }))
  return {
    ...summary('skill', 'github', upstreamId), kind: 'skill', version: 'tree123',
    repo: { fullName: `${owner}/${repo}`, ref: 'main', commit: SKILL_COMMIT, dir, treeSha: 't'.repeat(40), url: '' },
    frontmatter: {}, files: list, archiveUrl: `https://codeload.github.com/${owner}/${repo}/tar.gz/${SKILL_COMMIT}`,
    ...overrides,
  }
}

export function providerResource(slug: string, overrides: Partial<ProviderResourceDetail> = {}): ProviderResourceDetail {
  return {
    ...summary('provider', 'builtin', slug), kind: 'provider', verified: true, compatibleWith: ['claude', 'codex'],
    connection: { baseUrl: 'https://llm.example.com/v1', authType: 'bearer' },
    configSchema: { type: 'object', required: ['apiKey'], properties: { apiKey: { type: 'string', 'x-secret': true } } },
    supportedModels: [],
    ...overrides,
  }
}

/** The body of each skill file, by its download URL. */
export function skillFiles(r: SkillResourceDetail, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(r.files.map(f => [f.downloadUrl, files[f.path]]))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Serves `resources` the way the API does, plus `raw` (exact URL → text body).
 * Anything else throws, so a test notices an unexpected request.
 */
export function serveCatalog(resources: ResourceDetail[], raw: Record<string, string> = {}, requests: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const u = String(input instanceof Request ? input.url : input)
    requests.push(u)
    if (u in raw) return new Response(raw[u], { status: 200 })
    const url = new URL(u)
    if (url.pathname === '/api/resources') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const kind = url.searchParams.get('kind')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const hits = resources.filter(r => (!kind || r.kind === kind) && (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)))
      const page = hits.slice(offset, offset + limit)
      return json({ resources: page, nextOffset: offset + limit < hits.length ? offset + limit : null })
    }
    if (url.pathname.startsWith('/api/resources/')) {
      const id = url.pathname.slice('/api/resources/'.length).split('/').map(decodeURIComponent).join('/')
      const r = resources.find(x => x.id === id)
      return r ? json({ resource: r }) : json({ error: 'Not found' }, 404)
    }
    throw new Error(`Unmocked URL: ${u}`)
  }) as typeof fetch
}
