import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpResourceDetail, ResourceListResponse, SkillResourceDetail } from '@as/types'
import { Database } from 'bun:sqlite'
import { migrateCatalog, openCatalogForWrite } from '../catalog/db'
import { CatalogReader, checkCatalogFile } from '../catalog/reader'
import { resourceRoutes } from '../catalog/routes'
import { normalizeServer } from '../catalog/sources/mcp-registry'
import { builtinProvidersSource } from '../catalog/sources/providers'
import { githubSkillsSource } from '../catalog/sources/github-skills'
import { syncCatalog } from '../catalog/sync'
import type { CatalogSource } from '../catalog/types'
import { CatalogUpdater } from '../catalog/updater'
import { fakeFetch, fixtureJson, githubGraphqlRoute, githubRoutes, octokitWith } from './helpers/upstream-fixtures'

const MCP_FIXTURES = [
  'mcp-io-github-ChromeDevTools-chrome-devtools-mcp.json',
  'mcp-com-supabase-mcp.json',
  'mcp-io-github-GreptimeTeam-greptimedb-mcp-server.json',
  'mcp-io-github-github-github-mcp-server.json',
  'mcp-ac-inference-sh-mcp.json',
  'mcp-ai-biel-biel-ai.json',
]

const dir = mkdtempSync(join(tmpdir(), 'catalog-api-'))
const v1 = join(dir, 'v1.db')
const v2 = join(dir, 'v2.db')
// A file of schema version 2, before resources.stars, as the release held when stars shipped.
const old = join(dir, 'schema2.db')
const SKILL_INSTALLS = new Map([['anthropics/skills/frontend-design', 1106066]])
const STARS = { 'github/github-mcp-server': 28_000, 'chromedevtools/chrome-devtools-mcp': 20_000, 'supabase/mcp': 2_000 }

async function build(path: string, mcpFixtures: string[], schema?: number) {
  const mcp: CatalogSource = {
    name: 'mcp-registry', site: 'mcp-registry', kind: 'mcp',
    async run() {
      const records = mcpFixtures.map((x) => normalizeServer(fixtureJson(x))).flatMap((o) => ('record' in o ? [o.record] : []))
      return { records, removed: [], skipped: {}, errors: [], coverage: { mode: 'full' } }
    },
  }
  const f = fakeFetch(
    githubGraphqlRoute(STARS),
    githubRoutes,
  )
  let db: Database
  if (schema) {
    db = new Database(path, { create: true, strict: true })
    migrateCatalog(db, schema)
  } else {
    db = openCatalogForWrite(path)
  }
  await syncCatalog(db, {
    stars: schema ? false : {},
    sources: [builtinProvidersSource(), mcp, githubSkillsSource({ repos: ['anthropics/skills'], installs: SKILL_INSTALLS })],
    fetch: f,
    github: octokitWith(f),
  })
  db.close()
}

const reader = new CatalogReader()
const app = resourceRoutes(reader)
const get = async <T>(path: string) => {
  const res = await app.fetch(new Request(`http://local${path}`))
  return { status: res.status, body: (await res.json()) as T }
}

beforeAll(async () => {
  await build(v1, MCP_FIXTURES)
  await build(v2, MCP_FIXTURES.slice(0, 2))
  await build(old, MCP_FIXTURES, 2)
})
afterAll(() => {
  reader.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('resource routes', () => {
  test('503 until a catalog is loaded', async () => {
    expect((await get('/api/resources')).status).toBe(503)
    reader.open(v1)
  })

  test('list: default order is installs first, but stars first within MCP', async () => {
    const { body } = await get<ResourceListResponse>('/api/resources?limit=5')
    expect(body.resources).toHaveLength(5)
    expect(body.nextOffset).toBe(5)
    expect(body.resources[0]!.id).toBe('github:anthropics/skills/frontend-design')
    const installs = body.resources.map((r) => r.installs ?? -1)
    expect(installs).toEqual([...installs].sort((a, b) => b - a))
    const mcp = await get<ResourceListResponse>('/api/resources?kind=mcp&limit=20')
    // Stars first, nulls last; among nulls, verified first.
    expect(mcp.body.resources.map((r) => [r.origin.upstreamId, r.stars, r.verified])).toEqual([
      ['io.github.github/github-mcp-server', 28_000, false],
      ['io.github.ChromeDevTools/chrome-devtools-mcp', 20_000, false],
      ['com.supabase/mcp', 2_000, true],
      ...mcp.body.resources.slice(3).map((r) => [r.origin.upstreamId, null, r.verified]),
    ])
    const rest = mcp.body.resources.slice(3).map((r) => r.verified)
    expect(rest).toEqual([...rest].sort((a, b) => Number(b) - Number(a)))
    expect(rest).toContain(false)
    const skills = await get<ResourceListResponse>('/api/resources?kind=skill&limit=2')
    expect(skills.body.resources[0]!.id).toBe('github:anthropics/skills/frontend-design')
  })

  test('search matches names and descriptions; name hits come first', async () => {
    const { body } = await get<ResourceListResponse>('/api/resources?q=github')
    expect(body.resources[0]!.id).toBe('mcp-registry:io.github.github/github-mcp-server')
    const frontend = await get<ResourceListResponse>('/api/resources?q=frontend')
    expect(frontend.body.resources.map((r) => r.id)).toContain('github:anthropics/skills/frontend-design')
    const cjk = await get<ResourceListResponse>('/api/resources?q=本地转发')
    expect(cjk.body.resources.map((r) => r.id)).toEqual(['builtin:local'])
    const short = await get<ResourceListResponse>('/api/resources?q=ai&kind=mcp')
    expect(short.body.resources.length).toBeGreaterThan(0)
  })

  test('sort=stars ranks every kind by stars, skill repos included', async () => {
    const { status, body } = await get<ResourceListResponse>('/api/resources?sort=stars&limit=5')
    expect(status).toBe(200)
    expect(body.resources[0]!.origin.upstreamId).toBe('io.github.github/github-mcp-server')
    const counted = body.resources.map((r) => r.stars).filter((s) => s !== null)
    expect(counted).toEqual([...counted].sort((a, b) => b! - a!))
    const skill = await get<{ resource: SkillResourceDetail }>('/api/resources/github:anthropics/skills/frontend-design')
    // anthropics/skills is not in the GraphQL fixture: unresolved, so null.
    expect(skill.body.resource.stars).toBeNull()
  })

  test('a catalog file from before stars is still served, with stars null', async () => {
    expect(checkCatalogFile(old).resources).toBeGreaterThan(0)
    const r = new CatalogReader()
    r.open(old)
    const mcp = r.list({ kind: 'mcp', limit: 20 }).resources
    expect(mcp).toHaveLength(6)
    expect(mcp.every((x) => x.stars === null)).toBe(true)
    const verified = mcp.map((x) => x.verified)
    expect(verified).toEqual([...verified].sort((a, b) => Number(b) - Number(a)))
    expect(r.list({ sort: 'stars', limit: 3 }).resources).toHaveLength(3)
    expect(r.get('mcp-registry:com.supabase/mcp')!.stars).toBeNull()
    r.close()
  })

  test('rejects bad parameters', async () => {
    expect((await get('/api/resources?kind=plugin')).status).toBe(400)
    expect((await get('/api/resources?limit=0')).status).toBe(400)
    expect((await get('/api/resources?sort=random')).status).toBe(400)
  })

  test('detail by id, raw or encoded, with the install data', async () => {
    const raw = await get<{ resource: McpResourceDetail }>('/api/resources/mcp-registry:com.supabase/mcp')
    const enc = await get<{ resource: McpResourceDetail }>(`/api/resources/${encodeURIComponent('mcp-registry:com.supabase/mcp')}`)
    expect(raw.status).toBe(200)
    expect(enc.body).toEqual(raw.body)
    expect(raw.body.resource.packages[0]!.environmentVariables[0]).toMatchObject({ name: 'SUPABASE_ACCESS_TOKEN', isSecret: true, isRequired: true })
    expect(raw.body.resource.origin).toMatchObject({ site: 'mcp-registry', upstreamId: 'com.supabase/mcp', unavailableAt: null })
    const skill = await get<{ resource: SkillResourceDetail }>('/api/resources/github:anthropics/skills/frontend-design')
    expect(skill.body.resource.repo.dir).toBe('skills/frontend-design')
    expect((await get('/api/resources/github:nope/nope/nope')).status).toBe(404)
  })
})

describe('CatalogUpdater', () => {
  const served = { file: v1, etag: '"v1"', fail: false }
  let server: ReturnType<typeof Bun.serve>
  const local = join(dir, 'live', 'catalog.db')
  const updaterReader = new CatalogReader()
  const updaterApp = resourceRoutes(updaterReader)
  let updater: CatalogUpdater
  const count = async () => {
    const res = await updaterApp.fetch(new Request('http://local/api/resources?kind=mcp&limit=100'))
    return ((await res.json()) as ResourceListResponse).resources.length
  }

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        if (served.fail) return new Response('corrupt', { headers: { etag: '"bad"' } })
        if (req.headers.get('if-none-match') === served.etag) return new Response(null, { status: 304 })
        const body = readFileSync(served.file)
        return new Response(new URL(req.url).pathname.endsWith('.gz') ? Bun.gzipSync(body) : body, { headers: { etag: served.etag } })
      },
    })
    updater = new CatalogUpdater({ reader: updaterReader, url: `http://localhost:${server.port}/catalog.db`, path: local, log: () => {} })
  })
  afterAll(() => {
    server.stop(true)
    updaterReader.close()
  })

  test('downloads, then gets 304 while unchanged', async () => {
    expect(await updater.check()).toBe('updated')
    expect(await count()).toBe(6)
    expect(await updater.check()).toBe('unchanged')
  })

  test('swaps in a new version while serving, without a gap', async () => {
    served.file = v2
    served.etag = '"v2"'
    const before = await count()
    const pending = updater.check()
    // Requests made while the download is in flight still see the old catalog.
    expect(await count()).toBe(before)
    expect(await pending).toBe('updated')
    expect(await count()).toBe(2)
  })

  test('a broken download keeps the current catalog', async () => {
    served.fail = true
    expect(await updater.check()).toBe('failed')
    expect(await count()).toBe(2)
    expect(existsSync(local)).toBe(true)
  })

  test('a .gz URL is unpacked while downloading', async () => {
    const r = new CatalogReader()
    const u = new CatalogUpdater({ reader: r, url: `http://localhost:${server.port}/catalog.db.gz`, path: join(dir, 'gz', 'catalog.db'), log: () => {} })
    served.fail = false
    expect(await u.check()).toBe('updated')
    expect(r.list({ kind: 'mcp' }).resources).toHaveLength(2)
    r.close()
    served.fail = true
  })

  test('on restart the local copy is served before any download', () => {
    const r = new CatalogReader()
    const u = new CatalogUpdater({ reader: r, url: 'http://127.0.0.1:9/never', path: local, log: () => {} })
    expect(u.openLocal()).toBe(true)
    expect(r.list({ kind: 'mcp' }).resources).toHaveLength(2)
    r.close()
  })

  test('a local file that is not a catalog is not served', () => {
    const junk = join(dir, 'junk.db')
    writeFileSync(junk, 'not sqlite')
    const r = new CatalogReader()
    expect(new CatalogUpdater({ reader: r, url: 'http://127.0.0.1:9/x', path: junk, log: () => {} }).openLocal()).toBe(false)
    expect(r.ready).toBe(false)
  })
})
