import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { openCatalogForWrite } from '../catalog/db'
import { openDiscoveryForWrite, pickRepos, type DiscoveryContext } from '../catalog/discovery'
import { upstreamClient } from '../catalog/http'
import { clawhubSource } from '../catalog/sources/clawhub'
import { githubSkillsSource } from '../catalog/sources/github-skills'
import { skillhubKey, skillhubSource } from '../catalog/sources/skillhub'
import { parseLeaderboard, skillsShSource } from '../catalog/sources/skills-sh'
import { syncCatalog } from '../catalog/sync'
import { fakeFetch, fixtureJson, fixtureText, githubRoutes, json, octokitWith, type Route } from './helpers/upstream-fixtures'

/** A leaderboard page shaped like skills.sh's: the entries inside a Next.js flight chunk. */
function leaderboard(entries: Array<Record<string, unknown>>, total = 9000): string {
  const chunk = `53:["$","$L61",null,${JSON.stringify({ initialSkills: entries, totalSkills: total, view: 'all-time' })}]\n`
  return `<html><script>self.__next_f.push(${JSON.stringify([1, chunk])})</script></html>`
}
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } })

const ctx = (f: typeof fetch, state: Record<string, string> = {}): DiscoveryContext => ({
  http: upstreamClient(f, 0), now: new Date(), full: false, state, log: () => {},
})

describe('skills.sh leaderboards', () => {
  test('recorded page: the embedded entries and the board total', () => {
    const parsed = parseLeaderboard(fixtureText('skills-sh-all-time.html'))!
    expect(parsed.total).toBe(9903)
    expect(parsed.entries).toHaveLength(5)
    expect(parsed.entries[0]).toMatchObject({ source: 'vercel-labs/skills', skillId: 'find-skills', installs: 4344015 })
  })

  test('a page without the data is reported, not taken as an empty board', () => {
    expect(parseLeaderboard('<html><body>maintenance</body></html>')).toBeNull()
  })

  test('three boards of one site; window and hour counts stay separate from cumulative installs', async () => {
    const f = fakeFetch((url) => {
      if (url.hostname !== 'skills.sh') return undefined
      if (url.pathname === '/') return html(fixtureText('skills-sh-all-time.html'))
      if (url.pathname === '/hot') return html(fixtureText('skills-sh-hot.html'))
      return html('', 503)
    })
    const run = await skillsShSource().run(ctx(f))
    expect(f.calls).toEqual(['https://skills.sh/', 'https://skills.sh/trending', 'https://skills.sh/hot'])
    expect(run.skipped).toEqual({ 'not a GitHub skill': 1 })
    expect(run.errors).toEqual(['trending: HTTP 503 from https://skills.sh/trending'])
    expect(run.coverage.map((c) => [c.list, c.items, c.total, c.stoppedBy])).toEqual([
      ['all-time', 5, 9903, 'site-limit'],
      ['trending', 0, null, 'error'],
      ['hot', 3, 9615, 'site-limit'],
    ])
    const find = run.observations.find((o) => o.listingId === 'vercel-labs/skills/find-skills')!
    expect(find).toMatchObject({
      skillKey: 'github:vercel-labs/skills/find-skills', githubRepo: 'vercel-labs/skills', board: 'all-time', rank: 1,
      url: 'https://skills.sh/vercel-labs/skills/find-skills', metrics: { installs_total: 4344015 },
    })
    const hot = run.observations.filter((o) => o.board === 'hot')
    expect(hot).toHaveLength(3)
    expect(hot[0]!.metrics).toEqual({ installs_hour: 69, installs_hour_change: 69 })
  })
})

describe('ClawHub', () => {
  const items = fixtureJson<{ items: unknown[] }>('clawhub-skills-downloads.json').items
  const route = (pages: Record<string, unknown>): Route => (url) => {
    if (url.hostname !== 'clawhub.ai') return undefined
    const key = `${url.searchParams.get('sort')}:${url.searchParams.get('cursor') ?? ''}`
    return key in pages ? json(pages[key]) : json('unexpected', 500)
  }

  test('owner-qualified identities, canonical links, and the directory walked on from the saved cursor', async () => {
    const f = fakeFetch(route({
      'downloads:': fixtureJson('clawhub-skills-downloads.json'),
      'trending:': { items: [items[1]], nextCursor: null },
      'createdAt:': { items: [items[2]], nextCursor: 'c1' },
      'createdAt:saved': { items: [items[0]], nextCursor: 'c2' },
      'createdAt:c2': { items: [], nextCursor: null },
    }))
    const run = await clawhubSource({ directoryPages: 3 }).run(ctx(f, { directory_cursor: 'saved' }))
    expect(run.errors).toEqual([])
    expect(f.calls.every((c) => c.includes('nonSuspiciousOnly=true'))).toBe(true)
    const top = run.observations[0]!
    expect(top).toMatchObject({
      listingId: 'pskoett/self-improving-agent', skillKey: 'clawhub:pskoett/self-improving-agent', githubRepo: null,
      url: 'https://clawhub.ai/pskoett/skills/self-improving-agent', board: 'downloads', rank: 1,
      metrics: { downloads_total: 492663, installs_reported: 18538, site_stars: 4018 },
    })
    // The trending response carries no 7-day count, so only the rank is kept.
    expect(run.observations.find((o) => o.board === 'trending')).toMatchObject({ rank: 1, snapshot: [] })
    expect(run.coverage.find((c) => c.list === 'directory')).toMatchObject({ pages: 3, items: 2, stoppedBy: 'end' })
    expect(run.state).toEqual({ directory_cursor: null })
  })

  test('a rejected saved cursor is dropped so the next run starts over', async () => {
    const f = fakeFetch(
      (url) => (url.searchParams.get('cursor') === 'stale' ? new Response('bad cursor', { status: 400 }) : undefined),
      route({
        'downloads:': { items: [], nextCursor: null },
        'trending:': { items: [], nextCursor: null },
        'createdAt:': { items: [items[0]], nextCursor: 'c1' },
      }),
    )
    const run = await clawhubSource().run(ctx(f, { directory_cursor: 'stale' }))
    expect(run.errors[0]).toStartWith('directory: HTTP 400')
    expect(run.state).toEqual({ directory_cursor: null })
  })
})

describe('SkillHub', () => {
  test('a ClawHub mirror takes the ClawHub skill key; others keep their namespace', async () => {
    const f = fakeFetch((url) => (url.hostname === 'api.skillhub.cn' ? json(fixtureJson('skillhub-skills-downloads.json')) : undefined))
    const run = await skillhubSource({ directoryPages: 2 }).run(ctx(f, { directory_page: '7' }))
    expect(run.errors).toEqual([])
    const keys = Object.fromEntries(run.observations.filter((o) => o.board === 'downloads').map((o) => [o.listingId, o.skillKey]))
    expect(keys).toEqual({
      '@ake/dev-god': 'skillhub:ake/dev-god',
      '@clawhub_pskoett/self-improving-agent': 'clawhub:pskoett/self-improving-agent',
    })
    expect(f.calls.at(-1)).toContain('page=7')
    // Two entries of a total of two: the directory is done and starts over next run.
    expect(run.state).toEqual({ directory_page: '1' })
  })

  test('the ClawHub link form with /skills/ maps the same way', () => {
    expect(skillhubKey({ source: 'clawhub', upstream_url: 'https://clawhub.ai/Pskoett/skills/Self-Improving-Agent' }, '@x/y'))
      .toBe('clawhub:pskoett/self-improving-agent')
    expect(skillhubKey({ source: 'community', upstream_url: 'https://clawhub.ai/a/b' }, '@ns/slug')).toBe('skillhub:ns/slug')
  })
})

describe('repo queue', () => {
  let dir: string
  let disc: Database
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'discovery-'))
    disc = openDiscoveryForWrite(join(dir, 'discovery.db'))
  })
  afterEach(() => {
    disc.close()
    rmSync(dir, { recursive: true, force: true })
  })

  test('new repos get half the budget, known repos the rest, stalest first; unused shares pass over', () => {
    const add = disc.query('INSERT INTO repos (full_name, first_seen_at, discovered_by, last_attempt_at) VALUES (?, ?, ?, ?)')
    for (let i = 0; i < 6; i++) add.run(`new/${i}`, `2026-11-0${i + 1}`, 'skills-sh', null)
    for (let i = 0; i < 6; i++) add.run(`known/${i}`, '2026-10-01', 'catalog', `2026-11-0${6 - i}`)
    expect(pickRepos(disc, 4).repos).toEqual(['new/0', 'new/1', 'known/5', 'known/4'])
    disc.exec("DELETE FROM repos WHERE full_name LIKE 'known/%'")
    expect(pickRepos(disc, 4).repos).toEqual(['new/0', 'new/1', 'new/2', 'new/3'])
  })
})

describe('syncCatalog with discovery', () => {
  let dir: string
  let db: Database
  let disc: Database
  let clock: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'discovery-sync-'))
    db = openCatalogForWrite(join(dir, 'catalog.db'))
    disc = openDiscoveryForWrite(join(dir, 'discovery.db'))
    clock = Date.parse('2026-11-13T00:00:00Z')
  })
  afterEach(() => {
    db.close()
    disc.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const entry = (skillId: string, installs: number) => ({ source: 'anthropics/skills', skillId, name: skillId, installs })
  const skillsSh = (allTime: string | null): Route => (url) => {
    if (url.hostname !== 'skills.sh') return undefined
    return url.pathname === '/' && allTime ? html(allTime) : html('', 503)
  }
  const clawhub: Route = (url) =>
    url.hostname === 'clawhub.ai'
      ? json(url.searchParams.get('sort') === 'downloads' ? fixtureJson('clawhub-skills-downloads.json') : { items: [], nextCursor: null })
      : undefined
  const skillhub: Route = (url) => (url.hostname === 'api.skillhub.cn' ? json(fixtureJson('skillhub-skills-downloads.json')) : undefined)

  async function sync(...routes: Route[]) {
    const f = fakeFetch(...routes, githubRoutes)
    return syncCatalog(db, {
      sources: [githubSkillsSource()],
      fetch: f,
      github: octokitWith(f),
      discovery: { db: disc, sources: [skillsShSource(), clawhubSource(), skillhubSource()], httpRetries: 0 },
      now: () => new Date((clock += 1000)),
    })
  }
  const listing = (source: string, id: string) =>
    disc.query('SELECT skill_key, resource_id, metrics FROM listings WHERE source = ? AND listing_id = ?').get(source, id) as
      { skill_key: string; resource_id: string | null; metrics: string } | null
  const installs = (id: string) => (db.query('SELECT installs FROM resources WHERE id = ?').get(id) as { installs: number | null }).installs

  test('a board finds an unknown repo, its skills get scanned and linked, and later runs record the movement', async () => {
    const first = await sync(skillsSh(leaderboard([entry('frontend-design', 900), entry('pdf', 500)])), clawhub, skillhub)
    const d1 = first.discovery!
    expect(d1.sources.map((s) => [s.source, s.status])).toEqual([['skills-sh', 'partial'], ['clawhub', 'ok'], ['skillhub', 'ok']])
    expect(d1.sources[0]).toMatchObject({ added: 2, newOnBoards: 2, newRepos: 1 })
    expect(d1.queue).toMatchObject({ pickedNew: 1, pickedKnown: 0 })
    expect(first.sources[0]).toMatchObject({ source: 'github-skills', added: 19 })

    // Same repo, different skills: two listings, two catalog rows.
    expect(listing('skills-sh', 'anthropics/skills/frontend-design')!.resource_id).toBe('github:anthropics/skills/frontend-design')
    expect(listing('skills-sh', 'anthropics/skills/pdf')!.resource_id).toBe('github:anthropics/skills/pdf')
    expect(installs('github:anthropics/skills/frontend-design')).toBe(900)
    expect(installs('github:anthropics/skills/pdf')).toBe(500)

    // The SkillHub mirror of a ClawHub skill is the same skill; its counts stay its own.
    expect(listing('skillhub', '@clawhub_pskoett/self-improving-agent')!.skill_key).toBe('clawhub:pskoett/self-improving-agent')
    expect(JSON.parse(listing('skillhub', '@clawhub_pskoett/self-improving-agent')!.metrics).downloads_total).toBe(1674869)
    expect(JSON.parse(listing('clawhub', 'pskoett/self-improving-agent')!.metrics).downloads_total).toBe(492663)
    expect(d1.crossSite).toBe(1)
    expect(d1.skills).toBe(d1.listings - 1)
    const snapshots1 = d1.snapshots

    const second = await sync(skillsSh(leaderboard([entry('pdf', 650), entry('frontend-design', 910)])), clawhub, skillhub)
    const s2 = second.discovery!.sources[0]!
    expect(s2).toMatchObject({ added: 0, updated: 2, newOnBoards: 0, rose: 1 })
    expect(s2.examples.rose).toEqual(['all-time #2 → #1: anthropics/skills/pdf'])
    expect(second.discovery!.snapshots).toBeGreaterThan(snapshots1)
    expect(second.discovery!.queue).toMatchObject({ pickedNew: 0, pickedKnown: 1 })
    expect(installs('github:anthropics/skills/pdf')).toBe(650)
    const ranks = disc.query(`SELECT s.run_id, s.rank, s.value FROM snapshots s JOIN listings l ON l.id = s.listing
      WHERE l.listing_id = 'anthropics/skills/pdf' AND s.board = 'all-time' ORDER BY s.run_id`).all()
    expect(ranks).toEqual([{ run_id: 1, rank: 2, value: 500 }, { run_id: 2, rank: 1, value: 650 }])
  })

  test('a site that is down fails alone: nothing it listed disappears and its last success stays', async () => {
    const first = await sync(skillsSh(leaderboard([entry('frontend-design', 900)])), clawhub, skillhub)
    const lastSuccess = first.discovery!.sources[0]!.lastSuccessAt
    const listings = first.discovery!.listings

    const second = await sync(skillsSh(null), clawhub, skillhub)
    const s = second.discovery!.sources[0]!
    expect(s.status).toBe('failed')
    expect(s.lastSuccessAt).toBe(lastSuccess)
    expect(second.discovery!.listings).toBe(listings)
    expect(second.after.unavailable).toBe(0)
    // The repo stays in rotation and keeps its last known installs.
    expect(second.discovery!.queue!.pickedKnown).toBe(1)
    expect(installs('github:anthropics/skills/frontend-design')).toBe(900)
  })

  test('repos already in the catalog join the queue as known repos, without any list of fixed repos', async () => {
    const f = fakeFetch(githubRoutes)
    await syncCatalog(db, {
      sources: [githubSkillsSource({ repos: ['anthropics/skills'] })], fetch: f, github: octokitWith(f), now: () => new Date((clock += 1000)),
    })
    const run = await sync(skillsSh(null), (url) => (url.hostname === 'clawhub.ai' || url.hostname === 'api.skillhub.cn' ? html('', 503) : undefined))
    expect(run.discovery!.sources.every((s) => s.status === 'failed')).toBe(true)
    expect(run.discovery!.queue).toMatchObject({ pickedNew: 0, pickedKnown: 1 })
    expect(run.sources[0]).toMatchObject({ unchanged: 19, unavailable: 0 })
  })
})
