import type { DiscoveryContext, DiscoveryRun, DiscoverySource, Observation, PageCoverage } from '../discovery'
import { describeError, isRateLimited, isRecord, str } from '../http'
import { githubRepoOf } from '../stars'
import { addSkip } from '../types'

// Tencent SkillHub (skillhub.cn). The list endpoint needs no key and lists without a
// keyword (Tencent/skillhub, skills/find-skill-skillhub/references/api.md). Part of it
// mirrors ClawHub (source "clawhub", upstream_url on clawhub.ai); those map to the
// ClawHub skill so the two sites' counts stay one skill's, never two.
export const SKILLHUB_API = 'https://api.skillhub.cn'

const PAGE = 100

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined)

export interface SkillHubOptions {
  baseUrl?: string
  /** Pages of each board read per run. */
  boardPages?: number
  /** Directory pages read per run, continuing from where the last run stopped. */
  directoryPages?: number
}

const CLAWHUB_LISTING = /^https:\/\/clawhub\.ai\/([^/?#]+)\/(?:skills\/)?([^/?#]+)\/?$/i

/** The cross-site key of a SkillHub entry; a ClawHub mirror gets the ClawHub skill's key. */
export function skillhubKey(item: Record<string, unknown>, canonical: string): string {
  if (item['source'] === 'clawhub') {
    const m = CLAWHUB_LISTING.exec(str(item['upstream_url']) ?? '')
    if (m) return `clawhub:${m[1]}/${m[2]}`.toLowerCase()
  }
  return `skillhub:${canonical.replace(/^@/, '')}`
}

export function skillhubSource(options: SkillHubOptions = {}): DiscoverySource {
  const base = options.baseUrl ?? SKILLHUB_API
  const boardPages = options.boardPages ?? 2
  const directoryPages = options.directoryPages ?? 10

  async function page(ctx: DiscoveryContext, sortBy: string, n: number): Promise<{ items: Record<string, unknown>[]; total: number | null }> {
    const url = new URL('/api/skills', base)
    url.searchParams.set('sortBy', sortBy)
    url.searchParams.set('order', 'desc')
    url.searchParams.set('page', String(n))
    url.searchParams.set('pageSize', String(PAGE))
    const body = await ctx.http.get(url.toString()).json<unknown>()
    const data = isRecord(body) && body['code'] === 0 && isRecord(body['data']) ? body['data'] : null
    if (!data || !Array.isArray(data['skills'])) throw new Error(`${sortBy} page ${n}: unexpected response shape`)
    return { items: data['skills'].filter(isRecord), total: count(data['total']) ?? null }
  }

  function observe(run: DiscoveryRun, item: Record<string, unknown>, board: string | null, rank: number | null): void {
    const slug = str(item['slug'])
    const ns = isRecord(item['namespace']) ? item['namespace'] : {}
    const owner = str(item['ownerName'])
    const canonical = str(ns['canonicalName']) ?? (slug && owner ? `@${owner}/${slug}` : null)
    if (!slug || !canonical) {
      addSkip(run.skipped, 'no slug or namespace')
      return
    }
    const metrics = Object.fromEntries(
      Object.entries({
        downloads_total: count(item['downloads']),
        installs_reported: count(item['installs']),
        site_stars: count(item['stars']),
      }).filter(([, v]) => v !== undefined),
    ) as Observation['metrics']
    run.observations.push({
      listingId: canonical.toLowerCase(),
      skillKey: skillhubKey(item, canonical),
      name: str(item['name']) ?? slug,
      // The documented public page; the API's `homepage` field points at the API host.
      url: `https://skillhub.cn/skills/${slug}`,
      githubRepo: githubRepoOf(str(item['upstream_url'])),
      board,
      rank,
      metrics,
    })
  }

  async function walk(
    ctx: DiscoveryContext,
    run: DiscoveryRun,
    list: string,
    sortBy: string,
    first: number,
    pages: number,
    each: (item: Record<string, unknown>, rank: number) => void,
  ): Promise<PageCoverage & { last: number }> {
    const cov: PageCoverage & { last: number } = { list, pages: 0, items: 0, total: null, stoppedBy: 'depth', last: first - 1 }
    for (let n = first; n < first + pages; n++) {
      let p: Awaited<ReturnType<typeof page>>
      try {
        p = await page(ctx, sortBy, n)
      } catch (e) {
        run.errors.push(`${list}: ${describeError(e)}`)
        cov.stoppedBy = isRateLimited(e) ? 'rate-limited' : 'error'
        break
      }
      cov.pages++
      cov.last = n
      cov.total = p.total
      p.items.forEach((item, i) => each(item, (n - 1) * PAGE + i + 1))
      cov.items += p.items.length
      if (p.items.length < PAGE || (p.total !== null && n * PAGE >= p.total)) {
        cov.stoppedBy = 'end'
        break
      }
    }
    return cov
  }

  return {
    name: 'skillhub',
    async run(ctx): Promise<DiscoveryRun> {
      const run: DiscoveryRun = { observations: [], coverage: [], skipped: {}, errors: [], state: {} }
      for (const board of ['downloads', 'installs']) {
        const { last: _last, ...cov } = await walk(ctx, run, board, board, 1, boardPages, (item, rank) => observe(run, item, board, rank))
        run.coverage.push(cov)
      }
      // The whole directory, by downloads, a few pages per run from where the last run stopped.
      const saved = Number(ctx.state['directory_page'])
      const first = !ctx.full && Number.isInteger(saved) && saved > 0 ? saved : 1
      const { last, ...cov } = await walk(ctx, run, 'directory', 'downloads', first, directoryPages, (item) => observe(run, item, null, null))
      // After an error `last + 1` is the page that failed, so it is retried.
      const next = cov.stoppedBy === 'end' ? 1 : last + 1
      run.coverage.push({ ...cov, next: String(next) })
      run.state!['directory_page'] = String(next)
      return run
    },
  }
}
