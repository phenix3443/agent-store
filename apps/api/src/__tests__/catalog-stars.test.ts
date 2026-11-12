import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { openCatalogForWrite } from '../catalog/db'
import { normalizeServer } from '../catalog/sources/mcp-registry'
import { githubRepoOf, mcpStarsRepo, parseStarsResponse, refreshStars, starsQuery } from '../catalog/stars'
import { syncCatalog } from '../catalog/sync'
import type { CatalogRecord, CatalogSource } from '../catalog/types'
import { fakeFetch, fixtureJson, githubGraphqlRoute, json, octokitWith, type Route } from './helpers/upstream-fixtures'

describe('githubRepoOf', () => {
  test.each([
    ['https://github.com/github/github-mcp-server', 'github/github-mcp-server'],
    ['https://github.com/ChromeDevTools/chrome-devtools-mcp.git', 'chromedevtools/chrome-devtools-mcp'],
    ['https://www.github.com/supabase/mcp/tree/main/packages/mcp-server-supabase', 'supabase/mcp'],
    ['git+https://github.com/a-b/c.d_e.git', 'a-b/c.d_e'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['ssh://git@github.com/owner/repo', 'owner/repo'],
    ['github.com/owner/repo#readme', 'owner/repo'],
    ['  https://github.com/owner/repo?tab=readme  ', 'owner/repo'],
  ])('%s', (url, want) => expect(githubRepoOf(url)).toBe(want))

  test.each([
    [null], [''], ['https://gitlab.com/owner/repo'], ['https://github.com/owner'], ['https://github.com/orgs/acme/repositories'],
    ['https://github.com/owner/..'], ['https://github.com/ow"ner/repo'], ['https://example.com/github.com/owner/repo'],
    ['https://github.company.com/owner/repo'],
  ])('rejects %p', (url) => expect(githubRepoOf(url)).toBeNull())
})

describe('mcpStarsRepo', () => {
  test('an io.github namespace only claims repos of its own login', () => {
    expect(mcpStarsRepo('io.github.github/github-mcp-server', 'https://github.com/github/github-mcp-server')).toBe('github/github-mcp-server')
    expect(mcpStarsRepo('io.github.ChromeDevTools/x', 'https://github.com/chromedevtools/chrome-devtools-mcp')).toBe('chromedevtools/chrome-devtools-mcp')
    expect(mcpStarsRepo('io.github.secforge/chrome-devtools-mcp', 'https://github.com/ChromeDevTools/chrome-devtools-mcp')).toBeNull()
    expect(mcpStarsRepo('io.github.IncorporatedPartners/labelhead', 'https://github.com/paperclipai/paperclip')).toBeNull()
  })

  test('a domain namespace keeps whatever GitHub repo it names', () => {
    expect(mcpStarsRepo('com.browser-use/browser-use', 'https://github.com/browser-use/browser-use')).toBe('browser-use/browser-use')
    expect(mcpStarsRepo('com.supabase/mcp', 'https://gitlab.com/x/y')).toBeNull()
  })
})

describe('star queries', () => {
  test('one aliased field per repo, plus the rate limit', () => {
    const q = starsQuery(['a/b', 'c/d.e'])
    expect(q).toContain('r0: repository(owner: "a", name: "b") { stargazerCount }')
    expect(q).toContain('r1: repository(owner: "c", name: "d.e") { stargazerCount }')
    expect(q).toContain('rateLimit { limit cost remaining resetAt }')
  })

  test('a repo GitHub cannot resolve is null; the others keep their counts', () => {
    const out = parseStarsResponse(['a/b', 'gone/x'], {
      data: { r0: { stargazerCount: 12 }, r1: null, rateLimit: { limit: 1000, cost: 1, remaining: 990, resetAt: 't' } },
      errors: [{ type: 'NOT_FOUND', path: ['r1'], message: 'Could not resolve' }],
    })
    expect([...out.stars]).toEqual([['a/b', 12], ['gone/x', null]])
    expect(out.rateLimit).toEqual({ limit: 1000, cost: 1, remaining: 990, resetAt: 't' })
  })

  test('a response without data fails the whole batch', () => {
    expect(() => parseStarsResponse(['a/b'], { errors: [{ message: 'API rate limit exceeded' }] })).toThrow(/rate limit/)
    expect(() => parseStarsResponse(['a/b'], null)).toThrow()
  })
})

const mcp = (fixture: string): CatalogRecord => {
  const out = normalizeServer(fixtureJson(fixture))
  if (!('record' in out)) throw new Error('fixture is not installable')
  return out.record
}
const GITHUB = mcp('mcp-io-github-github-github-mcp-server.json')
const CHROME = mcp('mcp-io-github-ChromeDevTools-chrome-devtools-mcp.json')
const SUPABASE = mcp('mcp-com-supabase-mcp.json')
const GREPTIME = mcp('mcp-io-github-GreptimeTeam-greptimedb-mcp-server.json')
const REMOTE = mcp('mcp-ac-inference-sh-mcp.json')
const withRepo = (r: CatalogRecord, upstreamId: string, url: string | null): CatalogRecord => ({
  ...r,
  upstreamId,
  detail: { ...(r.detail as object), repository: url ? { url, source: 'github', subfolder: null } : null } as CatalogRecord['detail'],
})
const skill = (repo: string, name: string): CatalogRecord => ({
  kind: 'skill', site: 'github', upstreamId: `${repo}/${name}`, name, description: name, author: null, version: 'v1',
  homepageUrl: null, installs: null, verified: false, tags: [], transports: [], sourceUrl: null, upstreamVersion: 'v1',
  upstreamUpdatedAt: null, scope: repo,
  detail: { repo: { fullName: repo, ref: 'HEAD', commit: 'c', dir: name, treeSha: 'v1', url: '' }, frontmatter: {}, files: [], archiveUrl: '' },
})
const STARS = {
  'github/github-mcp-server': 28_000,
  'chromedevtools/chrome-devtools-mcp': 20_000,
  'supabase/mcp': 2_000,
  'anthropics/skills': 90_000,
}

let dir: string
let db: Database
let clock: number
let slept: number[]
beforeEach(() => {
  slept = []
  dir = mkdtempSync(join(tmpdir(), 'catalog-stars-'))
  db = openCatalogForWrite(join(dir, 'catalog.db'))
  clock = Date.parse('2026-11-12T00:00:00Z')
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const source = (kind: 'mcp' | 'skill', records: CatalogRecord[]): CatalogSource => ({
  name: kind, kind, site: kind === 'mcp' ? 'mcp-registry' : 'github',
  async run() {
    return { records, removed: [], skipped: {}, errors: [], coverage: { mode: 'full' } }
  },
})
const stars = (id: string) => (db.query('SELECT stars, github_repo FROM resources WHERE id = ?').get(id) as { stars: number | null; github_repo: string | null })
const run = (routes: Route[], opts: { full?: boolean; batchSize?: number; advanceMs?: number } = {}) => {
  clock += opts.advanceMs ?? 1000
  const f = fakeFetch(...routes)
  return refreshStars(db, octokitWith(f), { now: new Date(clock), full: opts.full ?? false, log: () => {} }, { batchSize: opts.batchSize ?? 100, sleep: async (ms) => { slept.push(ms) } })
}

describe('refreshStars', () => {
  beforeEach(async () => {
    const f = fakeFetch()
    await syncCatalog(db, {
      sources: [
        source('mcp', [GITHUB, CHROME, SUPABASE, GREPTIME, withRepo(REMOTE, 'ac.inference.sh/gitlab', 'https://gitlab.com/x/y'),
          withRepo(GITHUB, 'io.github.github/second', 'https://github.com/github/github-mcp-server.git'),
          withRepo(GITHUB, 'io.github.copycat/github-mcp-server', 'https://github.com/github/github-mcp-server')]),
        source('skill', [skill('anthropics/skills', 'pdf'), skill('anthropics/skills', 'docx')]),
      ],
      fetch: f, github: octokitWith(f), now: () => new Date(clock),
    })
  })

  test('batches distinct repos, records stars, and leaves non-GitHub and unresolved repos null', async () => {
    const gql = githubGraphqlRoute(STARS)
    const report = await run([gql], { batchSize: 2 })
    // github, chrome, supabase, greptime, anthropics/skills: five distinct repos, shared ones asked once.
    expect(gql.queries.map((q) => q.length)).toEqual([2, 2, 1])
    expect(new Set(gql.queries.flat()).size).toBe(5)
    expect(report).toMatchObject({ repos: 5, due: 5, queried: 5, queries: 3, found: 4, missing: 1, failedBatches: 0, cost: 3 })
    expect(stars(`mcp-registry:${GITHUB.upstreamId}`)).toEqual({ stars: 28_000, github_repo: 'github/github-mcp-server' })
    expect(stars('mcp-registry:io.github.github/second').stars).toBe(28_000)
    expect(stars(`mcp-registry:${GREPTIME.upstreamId}`)).toEqual({ stars: null, github_repo: 'greptimeteam/greptimedb-mcp-server' })
    expect(stars('mcp-registry:ac.inference.sh/gitlab')).toEqual({ stars: null, github_repo: null })
    expect(stars('mcp-registry:io.github.copycat/github-mcp-server')).toEqual({ stars: null, github_repo: null })
    expect(stars('github:anthropics/skills/pdf').stars).toBe(90_000)
    expect(report.coverage['mcp']).toEqual({ rows: 7, withRepo: 5, withStars: 4 })
  })

  test('a repo checked within the interval is not asked again unless the run is full', async () => {
    await run([githubGraphqlRoute(STARS)])
    const again = githubGraphqlRoute({ ...STARS, 'supabase/mcp': 2_500 })
    expect(await run([again], { advanceMs: 3600_000 })).toMatchObject({ due: 0, queries: 0 })
    expect(again.queries).toEqual([])
    const full = await run([again], { full: true })
    expect(full).toMatchObject({ due: 5, queries: 1 })
    expect(stars(`mcp-registry:${SUPABASE.upstreamId}`).stars).toBe(2_500)
    const later = githubGraphqlRoute(STARS)
    expect(await run([later], { advanceMs: 73 * 3600_000 })).toMatchObject({ due: 5 })
  })

  test('a failed batch keeps the previous stars; a 401 stops the run', async () => {
    await run([githubGraphqlRoute(STARS)])
    const failing: Route = (url) => (url.pathname === '/graphql' ? json({ message: 'Bad credentials' }, 401) : undefined)
    const report = await run([failing], { full: true, batchSize: 2 })
    expect(report.failedBatches).toBe(1)
    expect(report.queries).toBe(1)
    expect(report.errors.at(-1)).toMatch(/401; stopped/)
    expect(stars(`mcp-registry:${GITHUB.upstreamId}`).stars).toBe(28_000)
  })

  test('a secondary rate limit is waited out and the batch retried', async () => {
    const gql = githubGraphqlRoute(STARS)
    let limited = 1
    const secondary: Route = (url) => {
      if (url.pathname !== '/graphql' || limited-- <= 0) return undefined
      return new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' }), {
        status: 403, headers: { 'content-type': 'application/json', 'retry-after': '7' },
      })
    }
    const report = await run([secondary, gql], { batchSize: 2 })
    expect(slept).toEqual([7000])
    expect(report).toMatchObject({ queried: 5, failedBatches: 0, waitedMs: 7000, errors: [] })
    expect(stars(`mcp-registry:${GITHUB.upstreamId}`).stars).toBe(28_000)
  })

  test('a row whose repository changes picks up the new repo on the next refresh', async () => {
    await run([githubGraphqlRoute(STARS)])
    db.query("UPDATE resources SET detail = json_set(detail, '$.repository.url', 'https://github.com/ChromeDevTools/chrome-devtools-mcp') WHERE id = ?").run(`mcp-registry:${SUPABASE.upstreamId}`)
    await run([githubGraphqlRoute(STARS)])
    expect(stars(`mcp-registry:${SUPABASE.upstreamId}`)).toEqual({ stars: 20_000, github_repo: 'chromedevtools/chrome-devtools-mcp' })
  })

  test('syncCatalog refreshes stars when asked and reports them', async () => {
    const gql = githubGraphqlRoute(STARS)
    const f = fakeFetch(gql)
    const report = await syncCatalog(db, { sources: [], fetch: f, github: octokitWith(f), stars: {}, now: () => new Date((clock += 1000)) })
    expect(report.stars).toMatchObject({ repos: 5, queried: 5, queries: 1 })
    const none = await syncCatalog(db, { sources: [], fetch: f, github: octokitWith(f), now: () => new Date((clock += 1000)) })
    expect(none.stars).toBeUndefined()
  })
})
