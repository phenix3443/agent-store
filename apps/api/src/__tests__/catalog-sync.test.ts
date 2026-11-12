import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { openCatalogForWrite } from '../catalog/db'
import { normalizeServer } from '../catalog/sources/mcp-registry'
import { builtinProvidersSource } from '../catalog/sources/providers'
import { syncCatalog } from '../catalog/sync'
import type { CatalogRecord, CatalogSource, SourceRun } from '../catalog/types'
import { fakeFetch, fixtureJson, octokitWith } from './helpers/upstream-fixtures'

const mcp = (fixture: string): CatalogRecord => {
  const out = normalizeServer(fixtureJson(fixture))
  if (!('record' in out)) throw new Error('fixture is not installable')
  return out.record
}
const NPM = mcp('mcp-io-github-ChromeDevTools-chrome-devtools-mcp.json')
const REMOTE = mcp('mcp-ac-inference-sh-mcp.json')
const PYPI = mcp('mcp-io-github-GreptimeTeam-greptimedb-mcp-server.json')

function skill(repo: string, name: string, version = 'v1'): CatalogRecord {
  return {
    kind: 'skill', site: 'github', upstreamId: `${repo}/${name}`, name, description: `${name} skill`,
    author: { name: repo.split('/')[0]!, url: null }, version, homepageUrl: null, installs: 5, verified: false,
    tags: [], transports: [], sourceUrl: null, upstreamVersion: version, upstreamUpdatedAt: null, scope: repo,
    detail: { repo: { fullName: repo, ref: 'HEAD', commit: 'c', dir: name, treeSha: version, url: '' }, frontmatter: {}, files: [], archiveUrl: '' },
  }
}

/** A source that replays scripted runs, one per sync. */
function scripted(name: string, kind: CatalogSource['kind'], site: CatalogSource['site'], runs: Array<Partial<SourceRun> | Error>): CatalogSource {
  let i = 0
  return {
    name, kind, site,
    async run() {
      const r = runs[i++]
      if (!r) throw new Error('no more scripted runs')
      if (r instanceof Error) throw r
      return { records: [], removed: [], skipped: {}, errors: [], coverage: { mode: 'full' }, ...r }
    },
  }
}

let dir: string
let db: Database
let clock: number
const f = fakeFetch()
const sync = (sources: CatalogSource[]) =>
  syncCatalog(db, { sources, fetch: f, github: octokitWith(f), now: () => new Date((clock += 1000)) })
const row = (id: string) =>
  db.query('SELECT unavailable_at, unavailable_reason, installs, upstream_updated_at FROM resources WHERE id = ?').get(id) as
    { unavailable_at: string | null; unavailable_reason: string | null; installs: number | null; upstream_updated_at: string | null } | null

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'catalog-sync-'))
  db = openCatalogForWrite(join(dir, 'catalog.db'))
  clock = Date.parse('2026-11-12T00:00:00Z')
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('syncCatalog', () => {
  test('adds, leaves unchanged, updates and marks unavailable on a full run', async () => {
    const src = scripted('mcp', 'mcp', 'mcp-registry', [
      { records: [NPM, REMOTE, PYPI] },
      { records: [NPM, { ...REMOTE, description: 'changed' }] },
    ])
    const first = await sync([src])
    expect(first.sources[0]).toMatchObject({ status: 'ok', added: 3, updated: 0, unavailable: 0 })
    const second = await sync([src])
    expect(second.sources[0]).toMatchObject({ added: 0, unchanged: 1, updated: 1, unavailable: 1 })
    expect(row(`mcp-registry:${PYPI.upstreamId}`)).toMatchObject({ unavailable_reason: 'no longer listed upstream' })
    expect(row(`mcp-registry:${PYPI.upstreamId}`)!.unavailable_at).not.toBeNull()
    expect(second.after).toMatchObject({ available: 2, unavailable: 1, byKind: { mcp: 2 } })
  })

  test('an incremental run marks only what upstream reports removed, and a comeback restores it', async () => {
    const src = scripted('mcp', 'mcp', 'mcp-registry', [
      { records: [NPM, REMOTE] },
      { coverage: { mode: 'incremental' }, removed: [{ upstreamId: REMOTE.upstreamId, reason: 'deleted upstream' }] },
      { coverage: { mode: 'incremental' }, records: [REMOTE] },
    ])
    await sync([src])
    const second = await sync([src])
    expect(second.sources[0]!.unavailable).toBe(1)
    expect(row(`mcp-registry:${NPM.upstreamId}`)!.unavailable_at).toBeNull()
    expect(row(`mcp-registry:${REMOTE.upstreamId}`)!.unavailable_reason).toBe('deleted upstream')
    const third = await sync([src])
    expect(third.sources[0]!.restored).toBe(1)
    expect(row(`mcp-registry:${REMOTE.upstreamId}`)!.unavailable_at).toBeNull()
  })

  test('a scoped run reconciles only the scopes it covered', async () => {
    const src = scripted('skills', 'skill', 'github', [
      { records: [skill('a/x', 'one'), skill('b/y', 'two')], coverage: { mode: 'scoped', scopes: ['a/x', 'b/y'] } },
      { records: [], coverage: { mode: 'scoped', scopes: ['a/x'] } },
    ])
    await sync([src])
    const second = await sync([src])
    expect(second.sources[0]!.unavailable).toBe(1)
    expect(row('github:a/x/one')!.unavailable_at).not.toBeNull()
    expect(row('github:b/y/two')!.unavailable_at).toBeNull()
  })

  test('a failing source changes nothing of its own and does not stop the others', async () => {
    const mcpSrc = scripted('mcp', 'mcp', 'mcp-registry', [{ records: [NPM] }, new Error('registry down')])
    const providers = builtinProvidersSource()
    await sync([mcpSrc, providers])
    const second = await sync([mcpSrc, providers])
    expect(second.sources.map((s) => s.status)).toEqual(['failed', 'ok'])
    expect(second.sources[0]!.errors).toEqual(['registry down'])
    expect(row(`mcp-registry:${NPM.upstreamId}`)!.unavailable_at).toBeNull()
    expect(second.after.byKind).toEqual({ mcp: 1, provider: 4 })
  })

  test('installs survive a run that has no count; the upstream date only moves with the version', async () => {
    const src = scripted('skills', 'skill', 'github', [
      { records: [skill('a/x', 'one')], coverage: { mode: 'scoped', scopes: ['a/x'] } },
      { records: [{ ...skill('a/x', 'one'), installs: null }], coverage: { mode: 'scoped', scopes: ['a/x'] } },
      { records: [{ ...skill('a/x', 'one', 'v2'), installs: null }], coverage: { mode: 'scoped', scopes: ['a/x'] } },
    ])
    await sync([src])
    const firstSeen = row('github:a/x/one')!.upstream_updated_at
    await sync([src])
    expect(row('github:a/x/one')).toMatchObject({ installs: 5, upstream_updated_at: firstSeen })
    await sync([src])
    expect(row('github:a/x/one')!.upstream_updated_at).not.toBe(firstSeen)
  })

  test('the full-text index follows the data', async () => {
    await sync([scripted('mcp', 'mcp', 'mcp-registry', [{ records: [NPM, REMOTE] }])])
    const hits = db.query("SELECT r.id FROM resources r JOIN resources_fts f ON f.rowid = r.rowid WHERE resources_fts MATCH '\"devtools\"'").all()
    expect(hits).toEqual([{ id: `mcp-registry:${NPM.upstreamId}` }])
  })
})
