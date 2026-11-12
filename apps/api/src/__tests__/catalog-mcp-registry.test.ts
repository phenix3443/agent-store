import { describe, expect, test } from 'bun:test'
import type { McpResourceDetail, ResourceSummary } from '@as/types'
import { mcpRegistrySource, normalizeServer } from '../catalog/sources/mcp-registry'
import type { CatalogRecord, SourceContext } from '../catalog/types'
import { fakeFetch, fixtureJson, json, octokitWith } from './helpers/upstream-fixtures'

type Mcp = Omit<McpResourceDetail, keyof ResourceSummary>

function record(fixture: string): CatalogRecord & { detail: Mcp } {
  const out = normalizeServer(fixtureJson(fixture))
  if (!('record' in out)) throw new Error(`expected a record, got ${JSON.stringify(out)}`)
  return out.record as CatalogRecord & { detail: Mcp }
}

describe('normalizeServer', () => {
  test('npm package without inputs', () => {
    const r = record('mcp-io-github-ChromeDevTools-chrome-devtools-mcp.json')
    expect(r.upstreamId).toBe('io.github.ChromeDevTools/chrome-devtools-mcp')
    expect(r.site).toBe('mcp-registry')
    expect(r.transports).toEqual(['npm'])
    expect(r.author).toEqual({ name: 'ChromeDevTools', url: 'https://github.com/ChromeDevTools' })
    expect(r.verified).toBe(false)
    const [p] = r.detail.packages
    expect(p).toMatchObject({
      registryType: 'npm',
      identifier: 'chrome-devtools-mcp',
      version: '1.13.0',
      registryBaseUrl: 'https://registry.npmjs.org',
      transport: { type: 'stdio', url: null, headers: [], variables: {} },
      runtimeArguments: [],
      packageArguments: [],
      environmentVariables: [],
    })
    expect(r.detail.remotes).toEqual([])
  })

  test('npm package with a required secret env var, plus a remote', () => {
    const r = record('mcp-com-supabase-mcp.json')
    expect(r.verified).toBe(true)
    expect(r.author).toEqual({ name: 'supabase.com', url: 'https://supabase.com' })
    const env = r.detail.packages[0]!.environmentVariables
    expect(env).toContainEqual(expect.objectContaining({
      name: 'SUPABASE_ACCESS_TOKEN', isRequired: true, isSecret: true, format: 'string',
    }))
    expect(r.detail.packages[0]!.runtimeHint).toBe('npx')
    expect(r.detail.remotes[0]).toMatchObject({ type: 'streamable-http' })
    expect(r.transports).toEqual(['npm', 'streamable-http'])
  })

  test('pypi package: optional inputs default to not required, secrets kept', () => {
    const r = record('mcp-io-github-GreptimeTeam-greptimedb-mcp-server.json')
    const p = r.detail.packages[0]!
    expect(p.registryType).toBe('pypi')
    expect(p.identifier).toBe('greptimedb-mcp-server')
    expect(p.version).toBe('0.6.0')
    const password = p.environmentVariables.find((e) => e.name === 'GREPTIMEDB_PASSWORD')!
    expect(password).toMatchObject({ isSecret: true, isRequired: false })
    expect(p.environmentVariables.find((e) => e.name === 'GREPTIMEDB_HOST')).toMatchObject({ isSecret: false, isRequired: false })
  })

  test('remote-only server', () => {
    const r = record('mcp-ac-inference-sh-mcp.json')
    expect(r.detail.packages).toEqual([])
    expect(r.detail.remotes).toEqual([{ type: 'streamable-http', url: 'https://api.inference.sh/mcp', headers: [], variables: {} }])
    expect(r.name).toBe('inference.sh')
  })

  test('remote with URL variables', () => {
    const r = record('mcp-ai-biel-biel-ai.json')
    const [http, sse] = r.detail.remotes
    expect(http!.url).toBe('https://mcp.biel.ai/v2/{project_slug}/mcp')
    expect(http!.variables['project_slug']).toMatchObject({ isRequired: true, isSecret: false })
    expect(sse!.type).toBe('sse')
    expect(Object.keys(sse!.variables).sort()).toEqual(['domain', 'project_slug'])
  })

  test('oci package with templated runtime arguments, and a remote with a secret header', () => {
    const r = record('mcp-io-github-github-github-mcp-server.json')
    const oci = r.detail.packages[0]!
    expect(oci.registryType).toBe('oci')
    expect(oci.identifier).toBe('ghcr.io/github/github-mcp-server:2.1.0')
    const tokenArg = oci.runtimeArguments.find((a) => a.value?.includes('{token}'))!
    expect(tokenArg).toMatchObject({ type: 'named', name: '-e', value: 'GITHUB_PERSONAL_ACCESS_TOKEN={token}' })
    expect(tokenArg.variables['token']).toMatchObject({ isSecret: true, isRequired: false })
    expect(r.detail.remotes[0]!.headers).toEqual([
      expect.objectContaining({ name: 'Authorization', isSecret: true, value: null }),
    ])
    expect(r.transports).toEqual(['oci', 'streamable-http'])
  })

  test('deleted and deprecated servers are reported as removed', () => {
    const base = fixtureJson('mcp-ac-inference-sh-mcp.json')
    const meta = (status: string) => ({ ...base, _meta: { 'io.modelcontextprotocol.registry/official': { status, statusMessage: 'moved' } } })
    expect(normalizeServer(meta('deleted'))).toEqual({ removed: 'ac.inference.sh/mcp', reason: 'deleted upstream' })
    expect(normalizeServer(meta('deprecated'))).toEqual({ removed: 'ac.inference.sh/mcp', reason: 'deprecated upstream: moved' })
  })

  test('a server with nothing to install is skipped', () => {
    const base = fixtureJson('mcp-ac-inference-sh-mcp.json')
    const entry = { ...base, server: { ...base.server, remotes: [] } }
    expect(normalizeServer(entry)).toEqual({ skip: 'no packages or remotes', name: 'ac.inference.sh/mcp' })
  })
})

describe('mcpRegistrySource', () => {
  const ctx = (f: typeof fetch, watermark: string | null, full = false): SourceContext => ({
    fetch: f, github: octokitWith(f), now: new Date('2026-11-12T00:00:00Z'), full,
    state: { watermark, knownScopes: [] }, log: () => {},
  })

  test('pages through version=latest and records the newest upstream timestamp', async () => {
    const page1 = fixtureJson('mcp-search-github.json')
    const page2 = { servers: [fixtureJson('mcp-ac-inference-sh-mcp.json')], metadata: { count: 1 } }
    const f = fakeFetch((url) => (url.searchParams.get('cursor') ? json(page2) : json(page1)))
    const run = await mcpRegistrySource().run(ctx(f, null))
    expect(f.calls).toHaveLength(2)
    expect(f.calls[0]).toContain('version=latest')
    expect(f.calls[0]).not.toContain('updated_since')
    expect(f.calls[1]).toContain(`cursor=${encodeURIComponent(page1.metadata.nextCursor)}`)
    expect(run.coverage).toEqual({ mode: 'full' })
    expect(run.records).toHaveLength(6)
    expect(run.watermark).toBe(
      [...page1.servers, ...page2.servers]
        .map((s: any) => s._meta['io.modelcontextprotocol.registry/official'].updatedAt as string)
        .sort()
        .at(-1),
    )
  })

  test('with a watermark it asks for updates since then, minus an overlap, and reconciles only removals', async () => {
    const f = fakeFetch(() => json({ servers: [], metadata: {} }))
    const run = await mcpRegistrySource().run(ctx(f, '2026-11-10T00:10:00.000Z'))
    expect(new URL(f.calls[0]!).searchParams.get('updated_since')).toBe('2026-11-10T00:00:00.000Z')
    expect(run.coverage).toEqual({ mode: 'incremental' })
  })

  test('--full ignores the watermark', async () => {
    const f = fakeFetch(() => json({ servers: [], metadata: {} }))
    await mcpRegistrySource().run(ctx(f, '2026-11-10T00:10:00.000Z', true))
    expect(f.calls[0]).not.toContain('updated_since')
  })
})
