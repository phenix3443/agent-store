import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResourceListResponse, SearchSupplementResponse, SkillResourceDetail } from '@as/types'
import type { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { openCatalogForWrite } from '../catalog/db'
import { applySearchFinds, openDiscoveryForWrite, pickRepos } from '../catalog/discovery'
import { FoundStore } from '../catalog/found-store'
import { CatalogReader } from '../catalog/reader'
import { resourceRoutes } from '../catalog/routes'
import { buildSearchSupplement } from '../catalog/runtime'
import type { SearchSource } from '../catalog/search-sources'
import { clawhubSearch } from '../catalog/sources/clawhub'
import { githubSkillsSource } from '../catalog/sources/github-skills'
import { skillhubSearch } from '../catalog/sources/skillhub'
import { skillsmpSearch } from '../catalog/sources/skillsmp'
import { fallbackTrigger, lookupEligible, mergeFinds, normalizeQuery, SearchSupplement, SUPPLEMENT_DEFAULTS, type SupplementConfig } from '../catalog/supplement'
import { syncCatalog } from '../catalog/sync'
import { openAppDb } from '../db/client'
import * as schema from '../db/schema'
import { migrateAppDb } from '../migrate'
import { upstreamClient } from '../catalog/http'
import { fakeFetch, fixtureJson, githubRoutes, json, octokitWith, type Route } from './helpers/upstream-fixtures'

// ── Upstream stand-ins ───────────────────────────────────────────────────────

const ACME_SHA = 'a'.repeat(40)
const ACME_SKILLS = ['terraform-plan', 'terraform-drift']
const ACME_PLAN = 'github:acme/tools/terraform-plan'
const ACME_DRIFT = 'github:acme/tools/terraform-drift'

/** acme/tools: a repo outside the catalog holding two skills. */
const acmeRoutes: Route = (url) => {
  if (url.hostname === 'api.github.com' && url.pathname === '/repos/acme/tools/commits/HEAD') return new Response(ACME_SHA)
  if (url.hostname === 'api.github.com' && url.pathname === `/repos/acme/tools/git/trees/${ACME_SHA}`) {
    return json({
      sha: 't0',
      truncated: false,
      tree: [
        { path: 'skills', mode: '040000', type: 'tree', sha: 't1' },
        ...ACME_SKILLS.flatMap((name, i) => [
          { path: `skills/${name}`, mode: '040000', type: 'tree', sha: `t-${name}` },
          { path: `skills/${name}/SKILL.md`, mode: '100644', type: 'blob', sha: `b${i}`, size: 60 },
        ]),
      ],
    })
  }
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith(`/acme/tools/${ACME_SHA}/`)) {
    const name = url.pathname.split('/').at(-2)
    return new Response(`---\nname: ${name}\ndescription: ${name} for infrastructure work\n---\n`)
  }
  return undefined
}

const clawhubHit = (owner: string, slug: string, displayName = slug) => ({
  ownerHandle: owner, slug, displayName, summary: `${displayName} on ClawHub`, publisher: { displayName: owner }, links: { source: null },
})
const skillhubHit = (ns: string, slug: string, extra: Record<string, unknown> = {}) => ({
  slug, name: slug, description: `${slug} on SkillHub`, ownerName: ns, namespace: { canonicalName: `@${ns}/${slug}` }, source: 'community', upstream_url: null, ...extra,
})
const skillsmpHit = (repo: string, name: string) => ({
  id: `${repo.replace('/', '-')}-${name}-skill-md`, name, author: repo.split('/')[0], description: `${name} from ${repo}`,
  githubUrl: `https://github.com/${repo}/tree/main/skills/${name}`, skillUrl: `https://skillsmp.com/creators/${repo}/skills-${name}`,
})

/** The request a fetch call would send, to read the headers ky put on it. */
const requestOf = (input: string | URL | Request, init?: RequestInit) =>
  input instanceof Request ? new Request(input, init) : new Request(String(input), init)

type Answer = () => Response | Promise<Response>
const never: Answer = () => new Promise<Response>(() => {})

/** Routes for the three search APIs; a site without an answer fails the test when it is called. */
function searchRoutes(answers: { clawhub?: Answer; skillhub?: Answer; skillsmp?: Answer }): Route {
  return (url) => {
    if (url.hostname === 'clawhub.ai' && url.pathname === '/api/v1/search') return answers.clawhub?.()
    if (url.hostname === 'api.skillhub.cn' && url.pathname === '/api/skills') return answers.skillhub?.()
    if (url.hostname === 'skillsmp.com' && url.pathname === '/api/v1/skills/search') return answers.skillsmp?.()
    return undefined
  }
}
const clawhubOk = (...hits: unknown[]): Answer => () => json({ results: hits })
const skillhubOk = (...hits: unknown[]): Answer => () => json({ code: 0, message: 'success', data: { total: hits.length, skills: hits } })
const skillsmpOk = (...hits: unknown[]): Answer => () => json({ success: true, data: { skills: hits } })

// ── Fixtures ─────────────────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), 'search-supplement-'))
const catalogV1 = join(root, 'v1.db')
const catalogV1b = join(root, 'v1b.db')
const catalogV2 = join(root, 'v2.db')

async function buildCatalog(path: string, repos: string[]): Promise<void> {
  const f = fakeFetch(acmeRoutes, githubRoutes)
  const db = openCatalogForWrite(path)
  await syncCatalog(db, { stars: false, sources: [githubSkillsSource({ repos })], fetch: f, github: octokitWith(f) })
  db.close()
}

beforeAll(async () => {
  await buildCatalog(catalogV1, ['anthropics/skills'])
  // The next published build without the found repo, and the one after that with it.
  await buildCatalog(catalogV1b, ['anthropics/skills'])
  await buildCatalog(catalogV2, ['anthropics/skills', 'acme/tools'])
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

let dir: string
let appDbPath: string
let reader: CatalogReader
let clock: Date
const connections: Sqlite[] = []

function openRaw(): Sqlite {
  const client = openAppDb(appDbPath)
  connections.push(client)
  return client
}
const openStore = () => new FoundStore(drizzle({ client: openRaw(), schema }))

const SOURCES = { clawhub: clawhubSearch(), skillhub: skillhubSearch(), skillsmp: skillsmpSearch() }

interface Setup {
  sources?: SearchSource[]
  config?: Partial<SupplementConfig>
  /** false: no GitHub client, so found repos are not scanned by the API. */
  scan?: boolean
}

function supplement(f: typeof fetch, setup: Setup = {}): SearchSupplement {
  return new SearchSupplement({
    reader,
    store: openStore(),
    sources: setup.sources ?? [SOURCES.clawhub, SOURCES.skillhub],
    fetch: f,
    ...(setup.scan === false ? {} : { github: octokitWith(f) }),
    config: { sourceTimeoutMs: 200, ...setup.config },
    now: () => clock,
    log: () => {},
  })
}

/** Starts the lookup, waits for it to end and returns the settled answer. */
async function settle(s: SearchSupplement, q: string): Promise<SearchSupplementResponse> {
  const first = s.lookup(q, null)
  if (first.status !== 'searching') return first
  await s.settled(q, 5000)
  return s.lookup(q, null)
}

const calls = (f: { calls: string[] }, host: string) => f.calls.filter((c) => new URL(c).hostname === host)
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms)
}
const MINUTE = 60_000
const HOUR = 60 * MINUTE

beforeEach(() => {
  dir = mkdtempSync(join(root, 'case-'))
  appDbPath = join(dir, 'app.db')
  migrateAppDb(appDbPath)
  reader = new CatalogReader()
  reader.open(catalogV1)
  clock = new Date('2026-11-13T00:00:00.000Z')
})
afterEach(() => {
  reader.close()
  for (const c of connections.splice(0)) c.close()
})

// ── Trigger rule ─────────────────────────────────────────────────────────────

describe('trigger rule', () => {
  const r = (name: string, key = `acme/tools/${name}`) => ({ name, key })

  test('no local result', () => {
    expect(fallbackTrigger('terraform', [], 3)).toBe('no_results')
  })

  test('matches only in descriptions are low relevance, however many there are', () => {
    const local = ['frontend-design', 'canvas-design', 'theme-factory', 'brand-guidelines'].map((n) => r(n))
    expect(fallbackTrigger('typography', local, 3)).toBe('low_relevance')
  })

  test('a name match with too few results around it', () => {
    expect(fallbackTrigger('design', [r('frontend-design'), r('canvas-design')], 3)).toBe('few_results')
  })

  test('enough results with a name match are sufficient', () => {
    expect(fallbackTrigger('design', [r('frontend-design'), r('canvas-design'), r('pptx')], 3)).toBeNull()
    expect(fallbackTrigger('aws design', [r('aws-design-kit'), r('a'), r('b')], 3)).toBeNull()
  })

  test('a result named exactly like the query is sufficient alone', () => {
    expect(fallbackTrigger('pdf', [r('pdf')], 3)).toBeNull()
    expect(fallbackTrigger('pdf', [r('PDF Tools', 'anthropics/skills/pdf')], 3)).toBeNull()
  })

  test('queries that are not sent anywhere', () => {
    const c = SUPPLEMENT_DEFAULTS
    expect(normalizeQuery('  Terraform   Plan ')).toBe('terraform plan')
    expect(lookupEligible('terraform plan', c)).toBe(true)
    expect(lookupEligible('周报', c)).toBe(true)
    for (const q of ['', 'a', '---', 'me@example.com', 'https://example.com/x', 'x'.repeat(65), 'a b c d e f g', `sk_live_${'x'.repeat(40)}`]) {
      expect(lookupEligible(normalizeQuery(q), c)).toBe(false)
    }
  })

  test('sites take turns, name matches lead, one listing per skill key', () => {
    const find = (source: 'clawhub' | 'skillhub', skillKey: string, name: string) =>
      ({ source, listingId: skillKey, skillKey, name, description: null, author: null, url: 'https://x', githubRepo: null })
    const merged = mergeFinds('terraform', [
      [find('clawhub', 'clawhub:a/iac-helper', 'IaC helper'), find('clawhub', 'clawhub:a/terraform', 'Terraform')],
      [find('skillhub', 'clawhub:a/terraform', 'terraform'), find('skillhub', 'skillhub:b/terraform-wrap', 'Terraform Wrap')],
    ])
    expect(merged.map((m) => [m.source, m.skillKey])).toEqual([
      ['skillhub', 'clawhub:a/terraform'],
      ['skillhub', 'skillhub:b/terraform-wrap'],
      ['clawhub', 'clawhub:a/iac-helper'],
    ])
  })
})

// ── Site search APIs ─────────────────────────────────────────────────────────

describe('recorded search responses', () => {
  const search = (source: SearchSource, f: typeof fetch) => source.search(upstreamClient(f, 0), 'terraform', 5)

  test('ClawHub: owner-qualified key and the canonical listing link', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: () => json(fixtureJson('clawhub-search-terraform.json')) }))
    const finds = await search(SOURCES.clawhub, f)
    expect(finds).toHaveLength(2)
    expect(finds[0]).toMatchObject({
      source: 'clawhub', listingId: 'ivangdavila/terraform', skillKey: 'clawhub:ivangdavila/terraform', name: 'Terraform',
      author: 'Iván', url: 'https://clawhub.ai/ivangdavila/skills/terraform', githubRepo: null,
    })
    expect(finds[0]!.description).toStartWith('Writes, debugs, and refactors Terraform')
  })

  test('SkillHub: the keyword search of the documented list endpoint', async () => {
    const f = fakeFetch(searchRoutes({ skillhub: () => json(fixtureJson('skillhub-search-terraform.json')) }))
    const finds = await search(SOURCES.skillhub, f)
    expect(finds.map((x) => [x.listingId, x.skillKey, x.url, x.author])).toEqual([
      ['@user_922b1001/terraform-wrap', 'skillhub:user_922b1001/terraform-wrap', 'https://skillhub.cn/skills/terraform-wrap', 'user_922b1001'],
      ['@user_3c6cb52e/terraform-cloud-mcp-server', 'skillhub:user_3c6cb52e/terraform-cloud-mcp-server', 'https://skillhub.cn/skills/terraform-cloud-mcp-server', 'user_3c6cb52e'],
    ])
  })

  test('SkillsMP: hits name a GitHub repo and skill, keyed like scanned skills; the API key is sent only there', async () => {
    const seen: Array<string | null> = []
    const base = fakeFetch(searchRoutes({ skillsmp: () => json(fixtureJson('skillsmp-search-terraform.json')) }))
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(requestOf(input, init).headers.get('authorization'))
      return base(input, init)
    }) as typeof fetch
    const finds = await search(skillsmpSearch({ apiKey: 'sk_test' }), f)
    expect(seen).toEqual(['Bearer sk_test'])
    expect(base.calls).toEqual(['https://skillsmp.com/api/v1/skills/search?q=terraform&limit=5'])
    expect(finds[0]).toMatchObject({
      source: 'skillsmp', skillKey: 'github:wshobson/agents/terraform-module-library', githubRepo: 'wshobson/agents', author: 'wshobson',
      url: 'https://skillsmp.com/creators/wshobson/agents/plugins-cloud-infrastructure-skills-terraform-module-library',
    })
    expect(finds[1]!.skillKey).toBe('github:github/awesome-copilot/terraform-azurerm-set-diff-analyzer')
  })
})

// ── Lookups ──────────────────────────────────────────────────────────────────

describe('when a lookup runs', () => {
  test('sufficient local results, other kinds and ineligible queries never reach a site', () => {
    const f = fakeFetch()
    const s = supplement(f)
    // 'pdf' is a skill's exact name; 'skill' is in one name and every description.
    for (const q of ['pdf', 'PDF', 'skill', 'x', 'someone@example.com']) {
      expect(s.lookup(q, null)).toEqual({ status: 'not_needed', reason: null, resources: [], listings: [], partial: false, retryAfterSeconds: null })
    }
    expect(s.lookup('terraform', 'mcp').status).toBe('not_needed')
    expect(s.lookup('terraform', 'provider').status).toBe('not_needed')
    expect(f.calls).toEqual([])
  })

  test('no local match: answered at once as searching, then found, with listings from both sites', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: clawhubOk(clawhubHit('ivan', 'terraform', 'Terraform')),
      skillhub: skillhubOk(skillhubHit('ops', 'terraform-wrap')),
    }))
    const s = supplement(f)
    const first = s.lookup('Terraform', null)
    expect(first).toEqual({ status: 'searching', reason: 'no_results', resources: [], listings: [], partial: false, retryAfterSeconds: 2 })
    await s.settled('Terraform', 5000)
    const done = s.lookup('terraform', null)
    expect(done).toMatchObject({ status: 'found', reason: 'no_results', partial: false, retryAfterSeconds: null, resources: [] })
    expect(done.listings).toEqual([
      { key: 'clawhub:ivan/terraform', site: 'clawhub', name: 'Terraform', description: 'Terraform on ClawHub', author: 'ivan', url: 'https://clawhub.ai/ivan/skills/terraform' },
      { key: 'skillhub:ops/terraform-wrap', site: 'skillhub', name: 'terraform-wrap', description: 'terraform-wrap on SkillHub', author: 'ops', url: 'https://skillhub.cn/skills/terraform-wrap' },
    ])
    expect([...f.calls].sort()).toEqual([
      'https://api.skillhub.cn/api/skills?keyword=terraform&sortBy=score&order=desc&page=1&pageSize=10',
      'https://clawhub.ai/api/v1/search?q=terraform&limit=10&nonSuspiciousOnly=true',
    ])
  })

  test('few results and low relevance trigger a lookup too', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(), skillhub: skillhubOk() }))
    const s = supplement(f)
    // Two skills are named *-design; 'typography' is only in a description.
    expect(s.lookup('design', 'skill')).toMatchObject({ status: 'searching', reason: 'few_results' })
    expect(s.lookup('typography', null)).toMatchObject({ status: 'searching', reason: 'low_relevance' })
    await Promise.all([s.settled('design', 5000), s.settled('typography', 5000)])
    expect(calls(f, 'clawhub.ai')).toHaveLength(2)
    expect(calls(f, 'api.skillhub.cn')).toHaveLength(2)
  })

  test('a site is sent the query and nothing about the person searching', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = []
    const base = fakeFetch(searchRoutes({ clawhub: clawhubOk(), skillhub: skillhubOk() }))
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      const req = requestOf(input, init)
      seen.push({ url: req.url, headers: Object.fromEntries(req.headers) })
      return base(input, init)
    }) as typeof fetch
    const s = supplement(f)
    const app = resourceRoutes(reader, () => s)
    const res = await app.fetch(new Request('http://local/api/search/supplement?q=Terraform%20Plan&wait=5', {
      headers: { cookie: 'session=secret', authorization: 'Bearer user-token', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 Person' },
    }))
    expect(((await res.json()) as SearchSupplementResponse).status).toBe('none')
    expect(seen).toHaveLength(2)
    for (const r of seen) {
      expect([...new URL(r.url).searchParams.values()]).toContain('terraform plan')
      expect(r.headers['user-agent']).toBe('agent-store-api')
      for (const h of ['cookie', 'authorization', 'x-forwarded-for', 'forwarded', 'referer', 'origin']) expect(r.headers[h]).toBeUndefined()
      expect(JSON.stringify(r)).not.toMatch(/secret|user-token|203\.0\.113\.9|Person/)
    }
  })

  test('the query text is not kept: a lookup is remembered by its hash', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(clawhubHit('ivan', 'iac-kit')), skillhub: skillhubOk() }))
    expect((await settle(supplement(f), 'zanzibar secret project')).status).toBe('found')
    const db = openRaw()
    const rows = db.query('SELECT * FROM search_lookups').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!['key']).toMatch(/^[0-9a-f]{64}$/)
    for (const table of ['search_lookups', 'found_listings', 'found_repos', 'found_resources']) {
      expect(JSON.stringify(db.query(`SELECT * FROM ${table}`).all())).not.toContain('zanzibar')
    }
  })
})

describe('a failing site', () => {
  const good = clawhubOk(clawhubHit('ivan', 'terraform-kit'))

  test('timeout: the other site still answers; the partial result is kept only briefly', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: good, skillhub: never }))
    const s = supplement(f, { config: { sourceTimeoutMs: 50 } })
    const done = await settle(s, 'terraform')
    expect(done).toMatchObject({ status: 'found', partial: true })
    expect(done.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform-kit'])
    advance(5 * MINUTE)
    expect(s.lookup('terraform', null)).toMatchObject({ status: 'found', partial: true })
    expect(f.calls).toHaveLength(2)
    // After ten minutes the one stored listing is too few on its own, so the sites are asked again.
    advance(6 * MINUTE)
    expect(s.lookup('terraform', null)).toMatchObject({ status: 'searching', reason: 'no_results' })
    await s.settled('terraform', 5000)
    expect(f.calls).toHaveLength(4)
  })

  test('429: the site is left alone for Retry-After; the other site and local search are unaffected', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: good,
      skillhub: () => new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }),
    }))
    const s = supplement(f)
    expect(await settle(s, 'terraform')).toMatchObject({ status: 'found', partial: true })
    expect(await settle(s, 'kubernetes')).toMatchObject({ status: 'found', partial: true })
    expect(calls(f, 'api.skillhub.cn')).toHaveLength(1)
    expect(calls(f, 'clawhub.ai')).toHaveLength(2)
    advance(121_000)
    await settle(s, 'ansible')
    expect(calls(f, 'api.skillhub.cn')).toHaveLength(2)
    expect(reader.list({ q: 'pdf' }).resources[0]!.id).toBe('github:anthropics/skills/pdf')
  })

  test('garbage: a wrong body fails only its site; entries without identity or name are dropped, long text is cut', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      skillhub: skillhubOk(
        skillhubHit('ops', 'terraform-wrap'),
        { name: 'no identity' },
        'not an object',
        { ...skillhubHit('ops', 'blank'), name: '   \u0000 ' },
        { ...skillhubHit('ops', 'long'), description: 'x'.repeat(5000) },
      ),
    }))
    const done = await settle(supplement(f), 'terraform')
    expect(done).toMatchObject({ status: 'found', partial: true })
    expect(done.listings.map((l) => l.key)).toEqual(['skillhub:ops/terraform-wrap', 'skillhub:ops/long'])
    expect(done.listings[1]!.description).toHaveLength(500)
  })

  test('a listing whose link is not an https page of the site it came from is dropped', async () => {
    const f = fakeFetch(searchRoutes({
      skillsmp: skillsmpOk(
        { ...skillsmpHit('acme/tools', 'terraform-plan'), skillUrl: 'https://evil.example/terraform-plan' },
        { ...skillsmpHit('acme/tools', 'terraform-drift'), skillUrl: 'javascript:alert(1)' },
        { ...skillsmpHit('acme/tools', 'no-repo'), githubUrl: 'https://gitlab.com/acme/tools' },
      ),
    }))
    const s = supplement(f, { sources: [SOURCES.skillsmp] })
    expect(await settle(s, 'terraform')).toMatchObject({ status: 'none', listings: [], resources: [] })
    expect(calls(f, 'api.github.com')).toEqual([])
  })

  test('every site failing is unavailable with a retry hint, and the sites are asked again after it', async () => {
    let up = false
    const f = fakeFetch(searchRoutes({
      clawhub: () => (up ? json({ results: [clawhubHit('ivan', 'terraform-kit')] }) : new Response('down', { status: 503 })),
      skillhub: () => json({ code: 500, message: 'error' }),
    }))
    const s = supplement(f)
    expect(await settle(s, 'terraform')).toEqual({ status: 'unavailable', reason: 'no_results', resources: [], listings: [], partial: false, retryAfterSeconds: 30 })
    expect(s.lookup('terraform', null).status).toBe('unavailable')
    expect(f.calls).toHaveLength(2)
    up = true
    advance(31_000)
    expect(await settle(s, 'terraform')).toMatchObject({ status: 'found', partial: true })
    expect(f.calls).toHaveLength(4)
  })

  test('a site over its budget is skipped, the others are still asked', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: good, skillhub: skillhubOk() }))
    const tight: SearchSource = { ...SOURCES.skillhub, budget: { perMinute: 1, perDay: 100 } }
    const s = supplement(f, { sources: [SOURCES.clawhub, tight] })
    expect((await settle(s, 'terraform')).partial).toBe(false)
    expect((await settle(s, 'kubernetes')).partial).toBe(true)
    expect(calls(f, 'api.skillhub.cn')).toHaveLength(1)
    expect(calls(f, 'clawhub.ai')).toHaveLength(2)
  })
})

describe('identity', () => {
  test('one skill on two sites is one listing; one name from two owners and two skills of one repo stay apart', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: clawhubOk(clawhubHit('ivan', 'terraform', 'Terraform'), clawhubHit('oomol', 'terraform', 'Terraform')),
      skillhub: skillhubOk(
        // SkillHub's mirror of ivan's ClawHub skill.
        skillhubHit('mirror', 'terraform', { name: 'Terraform', source: 'clawhub', upstream_url: 'https://clawhub.ai/ivan/terraform' }),
        skillhubHit('ops', 'terraform', { name: 'Terraform' }),
      ),
      skillsmp: skillsmpOk(skillsmpHit('acme/tools', 'terraform-plan'), skillsmpHit('acme/tools', 'terraform-drift')),
    }))
    const s = supplement(f, { sources: [SOURCES.clawhub, SOURCES.skillhub, SOURCES.skillsmp], scan: false })
    const done = await settle(s, 'terraform')
    expect(done.listings.map((l) => [l.key, l.site])).toEqual([
      ['clawhub:ivan/terraform', 'clawhub'],
      ['clawhub:oomol/terraform', 'clawhub'],
      ['skillhub:ops/terraform', 'skillhub'],
      [ACME_PLAN, 'skillsmp'],
      [ACME_DRIFT, 'skillsmp'],
    ])
    expect(done.resources).toEqual([])
    // Both sites' rows of the mirrored skill are kept, under one key.
    const rows = openRaw().query("SELECT source FROM found_listings WHERE skill_key = 'clawhub:ivan/terraform' ORDER BY source").all()
    expect(rows).toEqual([{ source: 'clawhub' }, { source: 'skillhub' }])
  })

  test('a find the catalog already holds is not repeated', async () => {
    const f = fakeFetch(searchRoutes({
      skillsmp: skillsmpOk(skillsmpHit('anthropics/skills', 'Frontend-Design'), skillsmpHit('anthropics/skills', 'not-there')),
    }))
    const s = supplement(f, { sources: [SOURCES.skillsmp], scan: false })
    // Only the description of frontend-design mentions typography.
    const done = await settle(s, 'typography')
    expect(done.listings.map((l) => l.key)).toEqual(['github:anthropics/skills/not-there'])
  })
})

// ── Persistence ──────────────────────────────────────────────────────────────

describe('what a lookup found', () => {
  const routes = () => fakeFetch(acmeRoutes, searchRoutes({
    clawhub: clawhubOk(clawhubHit('ivan', 'terraform', 'Terraform')),
    skillsmp: skillsmpOk(skillsmpHit('acme/tools', 'terraform-plan')),
  }))
  const both = [SOURCES.clawhub, SOURCES.skillsmp]

  test('a GitHub find is read from its repo and served as a resource; a site-hosted find stays a listing', async () => {
    const s = supplement(routes(), { sources: both })
    const done = await settle(s, 'terraform')
    expect(done.status).toBe('found')
    // Both skills of the repo were read; the one the search named comes first.
    expect(done.resources.map((r) => r.id)).toEqual([ACME_PLAN, ACME_DRIFT])
    expect(done.resources[0]).toMatchObject({ kind: 'skill', name: 'terraform-plan', origin: { site: 'github', unavailableAt: null } })
    expect(done.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform'])

    const app = resourceRoutes(reader, () => s)
    const detail = await app.fetch(new Request(`http://local/api/resources/${ACME_PLAN}`))
    expect(detail.status).toBe(200)
    const { resource } = (await detail.json()) as { resource: SkillResourceDetail }
    expect(resource.repo).toMatchObject({ fullName: 'acme/tools', commit: ACME_SHA, dir: 'skills/terraform-plan' })
    expect(resource.files.map((x) => x.downloadUrl)).toEqual([`https://raw.githubusercontent.com/acme/tools/${ACME_SHA}/skills/terraform-plan/SKILL.md`])
    expect((await app.fetch(new Request('http://local/api/resources/clawhub:ivan/terraform'))).status).toBe(404)

    // The list endpoint is as before: it reads only the catalog.
    const list = (await (await app.fetch(new Request('http://local/api/resources?q=terraform'))).json()) as ResourceListResponse
    expect(list).toEqual({ resources: [], nextOffset: null })
  })

  test('a repo with more skills than the limit is left to the catalog sync and shown as a listing', async () => {
    const f = routes()
    const done = await settle(supplement(f, { sources: both, config: { scanMaxSkills: 1 } }), 'terraform')
    expect(done.resources).toEqual([])
    expect(done.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform', ACME_PLAN])
    expect(calls(f, 'raw.githubusercontent.com')).toEqual([])
  })

  test('survives a restart: a new process answers from app.db without asking any site', async () => {
    await settle(supplement(routes(), { sources: both }), 'terraform')
    for (const c of connections.splice(0)) c.close()

    const offline = fakeFetch()
    const restarted = supplement(offline, { sources: both })
    const again = restarted.lookup('terraform', null)
    expect(again.status).toBe('found')
    expect(again.resources.map((r) => r.id)).toEqual([ACME_PLAN, ACME_DRIFT])
    expect(again.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform'])
    expect(restarted.resource(ACME_PLAN)).toMatchObject({ id: ACME_PLAN, kind: 'skill' })
    expect(offline.calls).toEqual([])
  })

  test('survives a catalog swap, and hands over once a published catalog holds the skill', async () => {
    const s = supplement(routes(), { sources: both })
    await settle(s, 'terraform')

    // The next published build does not have the repo yet: the downloaded file is replaced, the finds stay.
    reader.open(catalogV1b)
    expect(s.lookup('terraform', null).resources.map((r) => r.id)).toEqual([ACME_PLAN, ACME_DRIFT])
    expect(reader.get(ACME_PLAN)).toBeNull()
    expect(s.resource(ACME_PLAN)).not.toBeNull()

    // A later build scanned the repo: the same ids now come from the catalog.
    reader.open(catalogV2)
    expect(reader.list({ q: 'terraform' }).resources.map((r) => r.id).sort()).toEqual([ACME_DRIFT, ACME_PLAN])
    const after = s.lookup('terraform', null)
    // Two local results are still fewer than three, so the stored listing is offered; the skills are not repeated.
    expect(after).toMatchObject({ status: 'found', reason: 'few_results', resources: [] })
    expect(after.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform'])
    expect(s.resource(ACME_PLAN)).toBeNull()
    expect(reader.get(ACME_PLAN)).not.toBeNull()
  })

  test('a later query is answered from stored finds when they are enough, long after the lookup expired', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: clawhubOk(clawhubHit('ivan', 'terraform', 'Terraform'), clawhubHit('ivan', 'terraform-lint'), clawhubHit('ivan', 'terraform-docs')),
      skillhub: skillhubOk(),
    }))
    const s = supplement(f)
    await settle(s, 'terraform')
    expect(f.calls).toHaveLength(2)
    advance(48 * HOUR)
    // Three stored listings carry 'terraform' in their names, one of them is named just that.
    const later = s.lookup('TERRAFORM', null)
    expect(later).toMatchObject({ status: 'found', reason: 'no_results' })
    expect(later.listings.map((l) => l.name)).toEqual(['Terraform', 'terraform-docs', 'terraform-lint'])
    expect(f.calls).toHaveLength(2)
  })
})

// ── Coalescing and caching ───────────────────────────────────────────────────

describe('repeated queries', () => {
  test('the same query asked while its lookup runs joins it: one request per site', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const f = fakeFetch(searchRoutes({
      clawhub: async () => {
        await gate
        return json({ results: [clawhubHit('ivan', 'terraform')] })
      },
      skillhub: skillhubOk(),
    }))
    const s = supplement(f, { config: { sourceTimeoutMs: 5000 } })
    const answers = ['terraform', ' Terraform ', 'TERRAFORM', 'terraform'].map((q) => s.lookup(q, null).status)
    expect(answers).toEqual(['searching', 'searching', 'searching', 'searching'])
    release()
    await s.settled('terraform', 5000)
    expect(s.lookup('terraform', null).status).toBe('found')
    expect(f.calls).toHaveLength(2)
    expect(openRaw().query('SELECT count(*) AS n FROM found_listings').get()).toEqual({ n: 1 })
  })

  test('nothing found is remembered: no second request until it expires, also across a restart', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(), skillhub: skillhubOk() }))
    const s = supplement(f)
    expect(await settle(s, 'zzqxjv')).toEqual({ status: 'none', reason: 'no_results', resources: [], listings: [], partial: false, retryAfterSeconds: null })
    advance(5 * HOUR)
    expect(s.lookup('zzqxjv', null).status).toBe('none')
    expect(supplement(f).lookup('zzqxjv', null).status).toBe('none')
    expect(f.calls).toHaveLength(2)
    advance(2 * HOUR)
    expect(s.lookup('zzqxjv', null).status).toBe('searching')
    await s.settled('zzqxjv', 5000)
    expect(f.calls).toHaveLength(4)
  })

  test('a repeated or failed lookup adds no duplicate rows and takes nothing away', async () => {
    const answers = { clawhub: clawhubOk(clawhubHit('ivan', 'terraform')), skillsmp: skillsmpOk(skillsmpHit('acme/tools', 'terraform-plan')) }
    const sources = [SOURCES.clawhub, SOURCES.skillsmp]
    const s = supplement(fakeFetch(acmeRoutes, searchRoutes(answers)), { sources })
    await settle(s, 'terraform')
    const db = openRaw()
    const counts = () => ['found_listings', 'found_repos', 'found_resources'].map((t) => (db.query(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n)
    expect(counts()).toEqual([2, 1, 2])

    // The same finds again under another query, a day later.
    advance(25 * HOUR)
    await settle(supplement(fakeFetch(acmeRoutes, searchRoutes(answers)), { sources }), 'infrastructure')
    expect(counts()).toEqual([2, 1, 2])

    // The sites are down: what is stored stays and still answers.
    const failing: Answer = () => new Response('', { status: 500 })
    const down = supplement(fakeFetch(searchRoutes({ clawhub: failing, skillsmp: failing })), { sources })
    expect((await settle(down, 'kubernetes')).status).toBe('unavailable')
    expect(counts()).toEqual([2, 1, 2])
    expect(down.lookup('terraform', null).resources.map((r) => r.id)).toEqual([ACME_DRIFT, ACME_PLAN])
  })

  test('lookups running at once are capped', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: never, skillhub: never }))
    const s = supplement(f, { config: { maxLookups: 2, sourceTimeoutMs: 50 } })
    expect(s.lookup('alpha one', null).status).toBe('searching')
    expect(s.lookup('beta two', null).status).toBe('searching')
    expect(s.lookup('gamma three', null)).toMatchObject({ status: 'unavailable', retryAfterSeconds: 5 })
    await Promise.all([s.settled('alpha one', 5000), s.settled('beta two', 5000)])
  })
})

// ── Routes and the catalog sync ──────────────────────────────────────────────

describe('routes', () => {
  test('wait holds the request for the lookup; without it the answer is immediate', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(clawhubHit('ivan', 'terraform')), skillhub: skillhubOk() }))
    const s = supplement(f)
    const app = resourceRoutes(reader, () => s)
    const get = async (path: string) => {
      const res = await app.fetch(new Request(`http://local${path}`))
      return { status: res.status, cache: res.headers.get('cache-control'), body: (await res.json()) as SearchSupplementResponse }
    }
    const now = await get('/api/search/supplement?q=kubernetes')
    expect(now).toMatchObject({ status: 200, cache: 'no-store', body: { status: 'searching' } })
    const held = await get('/api/search/supplement?q=terraform&kind=skill&wait=5')
    expect(held.body).toMatchObject({ status: 'found', listings: [{ key: 'clawhub:ivan/terraform' }] })
    expect((await get('/api/search/supplement?q=terraform&kind=tool')).status).toBe(400)
    expect((await get('/api/search/supplement?q=terraform&wait=soon')).status).toBe(400)
    expect((await get('/api/search/supplement')).body.status).toBe('not_needed')
    await s.settled('kubernetes', 5000)
  })

})

describe('SEARCH_FALLBACK_SOURCES', () => {
  const off = { status: 'disabled', reason: null, resources: [], listings: [], partial: false, retryAfterSeconds: null }

  test('unset, empty or none: the endpoint answers disabled and no request leaves the process', async () => {
    const original = globalThis.fetch
    const outbound: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      outbound.push(String(input instanceof Request ? input.url : input))
      throw new Error('no outbound request is expected')
    }) as unknown as typeof fetch
    try {
      for (const env of [{}, { SEARCH_FALLBACK_SOURCES: '' }, { SEARCH_FALLBACK_SOURCES: 'none' }, { SEARCH_FALLBACK_SOURCES: ' , ' }]) {
        const built = buildSearchSupplement({ ...env, APP_DB_PATH: appDbPath }, { reader })
        expect(built).toBeNull()
        const app = resourceRoutes(reader, () => built)
        // 'terraform' has no local match: with the lookups on, this would start one.
        for (const path of ['/api/search/supplement?q=terraform', '/api/search/supplement?q=terraform&kind=skill&wait=2']) {
          const res = await app.fetch(new Request(`http://local${path}`))
          expect(res.status).toBe(200)
          expect((await res.json()) as SearchSupplementResponse).toEqual(off as SearchSupplementResponse)
        }
        const exported = (await (await app.fetch(new Request('http://local/api/discovery/export'))).json()) as { listings: unknown[]; repos: unknown[] }
        expect(exported).toMatchObject({ listings: [], repos: [] })
        // The catalog itself is served as always.
        expect((await app.fetch(new Request('http://local/api/resources?q=pdf'))).status).toBe(200)
      }
      expect(outbound).toEqual([])
    } finally {
      globalThis.fetch = original
    }
  })

  test('clawhub,skillhub,skillsmp: all three sites are asked and a GitHub find becomes a resource', async () => {
    const f = fakeFetch(acmeRoutes, searchRoutes({
      clawhub: clawhubOk(clawhubHit('ivan', 'terraform', 'Terraform')),
      skillhub: skillhubOk(skillhubHit('ops', 'terraform-wrap')),
      skillsmp: skillsmpOk(skillsmpHit('acme/tools', 'terraform-plan')),
    }))
    const s = buildSearchSupplement({ SEARCH_FALLBACK_SOURCES: 'clawhub, skillhub,skillsmp', APP_DB_PATH: appDbPath }, { reader, fetch: f })!
    const done = await settle(s, 'terraform')
    expect(done).toMatchObject({ status: 'found', partial: false })
    expect(done.resources.map((r) => r.id)).toEqual([ACME_PLAN, ACME_DRIFT])
    expect(done.listings.map((l) => l.key)).toEqual(['clawhub:ivan/terraform', 'skillhub:ops/terraform-wrap'])
    for (const host of ['clawhub.ai', 'api.skillhub.cn', 'skillsmp.com']) expect(calls(f, host)).toHaveLength(1)
  })

  test('only the sites named are asked', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk() }))
    const s = buildSearchSupplement({ SEARCH_FALLBACK_SOURCES: 'clawhub,nowhere', APP_DB_PATH: appDbPath }, { reader, fetch: f })!
    expect((await settle(s, 'terraform')).status).toBe('none')
    expect(f.calls).toHaveLength(1)
  })
})

describe('SkillsMP quota', () => {
  const all = [SOURCES.clawhub, SOURCES.skillhub, SOURCES.skillsmp]

  test('its ceiling stays under the anonymous allowance of 10 a minute and 50 a day', () => {
    expect(SOURCES.skillsmp.budget.perMinute).toBeLessThanOrEqual(10)
    expect(SOURCES.skillsmp.budget.perDay).toBeLessThanOrEqual(50)
  })

  test('over our own ceiling: SkillsMP is skipped and the other sites still answer', async () => {
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(clawhubHit('ivan', 'iac-kit')), skillhub: skillhubOk(), skillsmp: skillsmpOk() }))
    const s = supplement(f, { sources: all, scan: false })
    const perMinute = SOURCES.skillsmp.budget.perMinute
    for (let i = 0; i < perMinute; i++) expect(await settle(s, `quota probe ${i}`)).toMatchObject({ status: 'found', partial: false })
    const over = await settle(s, 'one more query')
    expect(over).toMatchObject({ status: 'found', partial: true })
    expect(over.listings.map((l) => l.key)).toEqual(['clawhub:ivan/iac-kit'])
    expect(calls(f, 'skillsmp.com')).toHaveLength(perMinute)
    expect(calls(f, 'clawhub.ai')).toHaveLength(perMinute + 1)
    expect(calls(f, 'api.skillhub.cn')).toHaveLength(perMinute + 1)
  })

  test('the site reporting its daily quota spent: left alone for Retry-After while the others carry on', async () => {
    const spent = () => new Response(JSON.stringify({ success: false, error: { code: 'DAILY_QUOTA_EXCEEDED', message: 'Daily API quota exceeded' } }), {
      status: 429, headers: { 'content-type': 'application/json', 'retry-after': '1800' },
    })
    const f = fakeFetch(searchRoutes({ clawhub: clawhubOk(clawhubHit('ivan', 'iac-kit')), skillhub: skillhubOk(), skillsmp: spent }))
    const s = supplement(f, { sources: all, scan: false })
    expect(await settle(s, 'terraform')).toMatchObject({ status: 'found', partial: true })
    advance(20 * MINUTE)
    expect(await settle(s, 'kubernetes')).toMatchObject({ status: 'found', partial: true })
    expect(calls(f, 'skillsmp.com')).toHaveLength(1)
    expect(calls(f, 'clawhub.ai')).toHaveLength(2)
    advance(11 * MINUTE)
    await settle(s, 'ansible')
    expect(calls(f, 'skillsmp.com')).toHaveLength(2)
  })
})

describe('the catalog sync takes the finds in', () => {
  const FINDS_URL = 'https://api.test/api/discovery/export'

  test('exported listings and repos join discovery.db once; the repo is scanned and its skills reach the catalog', async () => {
    const f = fakeFetch(searchRoutes({
      clawhub: clawhubOk(clawhubHit('ivan', 'terraform')),
      skillsmp: skillsmpOk(skillsmpHit('acme/tools', 'terraform-plan')),
    }))
    // The API scans nothing here: the find reaches the catalog through the sync alone.
    const s = supplement(f, { sources: [SOURCES.clawhub, SOURCES.skillsmp], scan: false })
    await settle(s, 'terraform')
    const app = resourceRoutes(reader, () => s)
    const exportRoute: Route = (url) => (url.hostname === 'api.test' ? app.fetch(new Request(url.href)) : undefined)

    const catalogPath = join(dir, 'catalog.db')
    const catalog = openCatalogForWrite(catalogPath)
    const discovery = openDiscoveryForWrite(join(dir, 'discovery.db'))
    const sync = () => {
      const upstream = fakeFetch(exportRoute, acmeRoutes, githubRoutes)
      return syncCatalog(catalog, {
        stars: false, sources: [githubSkillsSource()], fetch: upstream, github: octokitWith(upstream),
        discovery: { db: discovery, sources: [], findsUrl: FINDS_URL, httpRetries: 0 },
      })
    }
    const first = await sync()
    expect(first.discovery!.searchFinds).toEqual({ status: 'ok', listings: 2, newListings: 2, repos: 1, newRepos: 1, skipped: 0 })
    expect(first.discovery!.queue).toMatchObject({ pickedNew: 1 })
    expect(first.sources[0]).toMatchObject({ source: 'github-skills', added: 2 })
    expect(discovery.query('SELECT source, listing_id, skill_key, github_repo, resource_id FROM listings ORDER BY source').all()).toEqual([
      { source: 'clawhub', listing_id: 'ivan/terraform', skill_key: 'clawhub:ivan/terraform', github_repo: null, resource_id: null },
      { source: 'skillsmp', listing_id: 'acme-tools-terraform-plan-skill-md', skill_key: ACME_PLAN, github_repo: 'acme/tools', resource_id: ACME_PLAN },
    ])
    expect(discovery.query("SELECT discovered_by, last_status FROM repos WHERE full_name = 'acme/tools'").get()).toEqual({ discovered_by: 'search', last_status: 'scanned' })

    const second = await sync()
    expect(second.discovery!.searchFinds).toMatchObject({ status: 'ok', listings: 2, newListings: 0, repos: 1, newRepos: 0 })
    expect(discovery.query('SELECT count(*) AS n FROM listings').get()).toEqual({ n: 2 })
    catalog.close()
    discovery.close()

    // The API downloads that build: the skill is an ordinary catalog result now.
    reader.open(catalogPath)
    expect(reader.list({ q: 'terraform' }).resources.map((r) => r.id)).toContain(ACME_PLAN)
  })

  test('garbage in the export is skipped, and an unreachable API costs only that run', async () => {
    const discovery = openDiscoveryForWrite(join(dir, 'discovery.db'))
    const stamp = '2026-11-13T00:00:00.000Z'
    const report = applySearchFinds(discovery, {
      listings: [
        { source: 'clawhub', listingId: 'a/b', skillKey: 'clawhub:a/b', name: 'B', url: 'https://clawhub.ai/a/skills/b', githubRepo: 'Not A Repo' },
        { source: 'elsewhere', listingId: 'a/b', skillKey: 'clawhub:a/b', name: 'B', url: 'https://clawhub.ai/a/skills/b' },
        { source: 'clawhub', listingId: 'a/c', skillKey: 'npm:a/c', name: 'C', url: 'https://clawhub.ai/a/skills/c' },
        { source: 'clawhub', listingId: 'a/d', skillKey: 'clawhub:a/d', name: 'D', url: 'http://clawhub.ai/a/skills/d' },
        null,
      ],
      repos: [{ fullName: 'Acme/Tools' }, { fullName: '../../etc' }, 7],
    }, stamp)
    expect(report).toEqual({ status: 'ok', listings: 1, newListings: 1, repos: 1, newRepos: 1, skipped: 6 })
    expect(discovery.query('SELECT github_repo FROM listings').all()).toEqual([{ github_repo: null }])
    expect(pickRepos(discovery, 10).repos).toEqual(['acme/tools'])
    expect(() => applySearchFinds(discovery, { error: 'nope' }, stamp)).toThrow('unexpected response shape')

    const catalog = openCatalogForWrite(join(dir, 'catalog.db'))
    const f = fakeFetch((url) => (url.hostname === 'api.test' ? new Response('bad gateway', { status: 502 }) : undefined), acmeRoutes, githubRoutes)
    const run = await syncCatalog(catalog, {
      stars: false, sources: [githubSkillsSource()], fetch: f, github: octokitWith(f),
      discovery: { db: discovery, sources: [], findsUrl: FINDS_URL, httpRetries: 0 },
    })
    expect(run.discovery!.searchFinds).toMatchObject({ status: 'failed', error: `HTTP 502 from ${FINDS_URL}` })
    // The repo queued before still gets scanned.
    expect(run.sources[0]).toMatchObject({ source: 'github-skills', status: 'ok', added: 2 })
    catalog.close()
    discovery.close()
  })
})
