import type { DiscoveryContext, DiscoveryRun, DiscoverySource, Metric, Observation, PageCoverage } from '../discovery'
import { describeError, isRateLimited, isRecord, str } from '../http'
import type { ExternalFind, SearchSource } from '../search-sources'
import { githubRepoOf } from '../stars'
import { addSkip } from '../types'

// ClawHub's public read API (docs/http-api.md in openclaw/clawhub) invites third-party
// directories to list skills, asking them to cache, honor 429/Retry-After and link to
// the canonical listing. Skills are owner-qualified: slugs repeat across owners.
export const CLAWHUB_URL = 'https://clawhub.ai'

const PAGE = 200

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined)

export interface ClawHubOptions {
  baseUrl?: string
  /** Pages of the downloads board read per run. */
  downloadPages?: number
  /** Pages of the directory (newest first) read per run, the first always from the top. */
  directoryPages?: number
}

interface Page {
  items: Record<string, unknown>[]
  nextCursor: string | null
}

/** Identity and canonical listing URL of a ClawHub skill, shared by the boards and the search. */
function clawhubIdentity(base: string, owner: string, slug: string) {
  const listingId = `${owner}/${slug}`.toLowerCase()
  return { listingId, skillKey: `clawhub:${listingId}`, url: `${base}/${owner}/skills/${slug}` }
}

/** GET /api/v1/search: relevance-ranked keyword search, on the same public read quota as the lists. */
export function clawhubSearch(options: { baseUrl?: string } = {}): SearchSource {
  const base = options.baseUrl ?? CLAWHUB_URL
  return {
    name: 'clawhub',
    hosts: [new URL(base).hostname],
    budget: { perMinute: 30, perDay: 2000 },
    async search(http, q, limit): Promise<ExternalFind[]> {
      const url = new URL('/api/v1/search', base)
      url.searchParams.set('q', q)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('nonSuspiciousOnly', 'true')
      const body = await http.get(url.toString()).json<unknown>()
      if (!isRecord(body) || !Array.isArray(body['results'])) throw new Error('search: unexpected response shape')
      return body['results'].filter(isRecord).flatMap((item) => {
        const owner = str(item['ownerHandle'])
        const slug = str(item['slug'])
        if (!owner || !slug) return []
        const links = isRecord(item['links']) ? item['links'] : {}
        const publisher = isRecord(item['publisher']) ? item['publisher'] : {}
        return [{
          source: 'clawhub',
          ...clawhubIdentity(base, owner, slug),
          name: str(item['displayName']) ?? slug,
          description: str(item['summary']),
          author: str(publisher['displayName']) ?? owner,
          githubRepo: githubRepoOf(str(links['source'])),
        }]
      })
    },
  }
}

export function clawhubSource(options: ClawHubOptions = {}): DiscoverySource {
  const base = options.baseUrl ?? CLAWHUB_URL
  const downloadPages = options.downloadPages ?? 2
  const directoryPages = options.directoryPages ?? 5

  async function page(ctx: DiscoveryContext, sort: string, cursor: string | null): Promise<Page> {
    const url = new URL('/api/v1/skills', base)
    url.searchParams.set('sort', sort)
    url.searchParams.set('limit', String(PAGE))
    // Flagged skills stay out of the catalog.
    url.searchParams.set('nonSuspiciousOnly', 'true')
    if (cursor) url.searchParams.set('cursor', cursor)
    const body = await ctx.http.get(url.toString()).json<unknown>()
    if (!isRecord(body) || !Array.isArray(body['items'])) throw new Error(`${sort}: unexpected response shape`)
    return { items: body['items'].filter(isRecord), nextCursor: str(body['nextCursor']) }
  }

  function observe(run: DiscoveryRun, item: Record<string, unknown>, board: string | null, rank: number | null, snapshot?: Metric[]): void {
    const owner = str(item['ownerHandle'])
    const slug = str(item['slug'])
    if (!owner || !slug) {
      addSkip(run.skipped, 'no owner or slug')
      return
    }
    const stats = isRecord(item['stats']) ? item['stats'] : {}
    const metrics = Object.fromEntries(
      Object.entries({
        downloads_total: count(stats['downloads']),
        installs_reported: count(stats['installs']),
        site_stars: count(stats['stars']),
      }).filter(([, v]) => v !== undefined),
    ) as Observation['metrics']
    run.observations.push({
      ...clawhubIdentity(base, owner, slug),
      name: str(item['displayName']) ?? slug,
      githubRepo: null,
      board,
      rank,
      metrics,
      ...(snapshot ? { snapshot } : {}),
    })
  }

  /** Reads up to `pages` pages; returns the cursor to continue from, null at the end. */
  async function walk(
    ctx: DiscoveryContext,
    run: DiscoveryRun,
    list: string,
    sort: string,
    start: string | null,
    pages: number,
    each: (item: Record<string, unknown>, rank: number) => void,
  ): Promise<PageCoverage> {
    const cov: PageCoverage = { list, pages: 0, items: 0, total: null, stoppedBy: 'depth', next: start }
    let cursor = start
    while (cov.pages < pages) {
      let p: Page
      try {
        p = await page(ctx, sort, cursor)
      } catch (e) {
        run.errors.push(`${list}: ${describeError(e)}`)
        cov.stoppedBy = isRateLimited(e) ? 'rate-limited' : 'error'
        return cov
      }
      cov.pages++
      for (const item of p.items) each(item, ++cov.items)
      cursor = p.nextCursor
      cov.next = cursor
      if (!cursor) {
        cov.stoppedBy = 'end'
        break
      }
    }
    return cov
  }

  return {
    name: 'clawhub',
    async run(ctx): Promise<DiscoveryRun> {
      const run: DiscoveryRun = { observations: [], coverage: [], skipped: {}, errors: [], state: {} }

      run.coverage.push(await walk(ctx, run, 'downloads', 'downloads', null, downloadPages, (item, rank) => observe(run, item, 'downloads', rank)))
      // Ranked by installs over the last 7 days, which the response does not include; the rank is the signal.
      const trending = await walk(ctx, run, 'trending', 'trending', null, 1, (item, rank) => observe(run, item, 'trending', rank, []))
      run.coverage.push(trending)

      // The directory, newest first: page one every run for new skills, then onward from
      // where the last run stopped until the end, after which the walk starts over.
      const saved = ctx.full ? null : (ctx.state['directory_cursor'] ?? null)
      const top = await walk(ctx, run, 'directory', 'createdAt', null, 1, (item) => observe(run, item, null, null))
      let cov = top
      if (top.stoppedBy === 'depth' && directoryPages > 1) {
        const rest = await walk(ctx, run, 'directory', 'createdAt', saved ?? top.next ?? null, directoryPages - 1, (item) => observe(run, item, null, null))
        cov = { ...rest, pages: top.pages + rest.pages, items: top.items + rest.items }
      }
      run.coverage.push(cov)
      // A saved cursor the API rejects (400) would block the walk for good; start over instead.
      const rejected = saved !== null && run.errors.some((e) => e.startsWith('directory: HTTP 400'))
      if (cov.stoppedBy === 'end' || rejected) run.state!['directory_cursor'] = null
      else if (cov.stoppedBy === 'depth' && cov.next) run.state!['directory_cursor'] = cov.next
      return run
    },
  }
}
