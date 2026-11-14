import type { Octokit } from '@octokit/rest'
import type { ExternalListing, ExternalSite, ResourceDetail, ResourceKind, ResourceSummary, SearchSupplementResponse } from '@as/types'
import { isHTTPError, isTimeoutError, type KyInstance } from 'ky'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { upstreamClient } from './http'
import type { FoundExport, FoundListing, FoundStore } from './found-store'
import type { CatalogReader } from './reader'
import { checkFind, type ExternalFind, type SearchSource } from './search-sources'
import { DOWNLOAD_FAILED, isRateLimit, rateLimitResetAt, RepoTooLargeError, scanRepo } from './sources/github-skills'

// Search supplement: when the catalog answers a skill query poorly, the query is looked
// up on other skill directories. Finds are stored in app.db (found-store.ts), GitHub
// repos among them are scanned so their skills can be served at once, and the catalog
// sync later reads the stored finds so they reach the published catalog.
//
// Privacy boundary: a site receives the normalized query string and nothing else. The
// requests are made by this process with a fixed user agent; no header, cookie, address
// or account of the person searching is read here or passed on. The query text is not
// stored (lookups are remembered by its SHA-256) and not logged.

export interface SupplementConfig {
  minQueryLength: number
  maxQueryLength: number
  maxTerms: number
  /** Fewer local results than this count as too few, unless one of them is named exactly like the query. */
  minResults: number
  /** How many local results the trigger rule looks at. */
  sample: number
  sourceTimeoutMs: number
  /** Hits taken from each site. */
  perSource: number
  maxResults: number
  foundTtlMs: number
  noneTtlMs: number
  /** How long a result is kept when a site did not answer. */
  partialTtlMs: number
  /** How long "no site could be asked" is remembered before the sites are tried again. */
  unavailableTtlMs: number
  /** Lookups running at once, over all queries. */
  maxLookups: number
  /** GitHub repos scanned per lookup, most relevant first (`reposByRelevance`); the rest wait for the catalog sync. */
  scanRepos: number
  /** Of a repo with more skills than this, only the skills the finds name are read; the rest wait for the catalog sync. */
  scanMaxSkills: number
  scanTimeoutMs: number
  scansPerHour: number
  rescanAfterMs: number
}

export const SUPPLEMENT_DEFAULTS: SupplementConfig = {
  minQueryLength: 2,
  maxQueryLength: 64,
  maxTerms: 6,
  minResults: 3,
  sample: 10,
  sourceTimeoutMs: 4000,
  perSource: 10,
  maxResults: 20,
  foundTtlMs: 24 * 3_600_000,
  noneTtlMs: 6 * 3_600_000,
  partialTtlMs: 10 * 60_000,
  unavailableTtlMs: 30_000,
  maxLookups: 8,
  scanRepos: 2,
  scanMaxSkills: 40,
  scanTimeoutMs: 10_000,
  scansPerHour: 20,
  rescanAfterMs: 6 * 3_600_000,
}

export function normalizeQuery(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Whether a normalized query may be sent to other sites: long enough to mean something,
 * short enough to be a search, and not an address or a pasted token.
 */
export function lookupEligible(q: string, c: Pick<SupplementConfig, 'minQueryLength' | 'maxQueryLength' | 'maxTerms'>): boolean {
  const length = [...q].length
  if (length < c.minQueryLength || length > c.maxQueryLength) return false
  if (!/[\p{L}\p{N}]/u.test(q)) return false
  if (/@|:\/\//.test(q)) return false
  const terms = q.split(' ')
  return terms.length <= c.maxTerms && terms.every((t) => [...t].length <= 40)
}

export type TriggerReason = 'no_results' | 'few_results' | 'low_relevance'

/**
 * Why the local results for a normalized query are not enough, or null when they are.
 * A result named exactly like the query is enough on its own. Otherwise at least one
 * result must carry every query term in its name or id (a match only in a description
 * is weak), and there must be `minResults` of them.
 */
export function fallbackTrigger(q: string, local: Array<{ name: string; key: string }>, minResults: number): TriggerReason | null {
  if (local.length === 0) return 'no_results'
  const terms = q.split(' ')
  let named = 0
  for (const r of local) {
    const name = r.name.toLowerCase()
    const key = r.key.toLowerCase()
    if (name === q || key === q || key.endsWith(`/${q}`)) return null
    if (terms.every((t) => name.includes(t) || key.includes(t))) named++
  }
  if (named === 0) return 'low_relevance'
  return local.length < minResults ? 'few_results' : null
}

const queryKey = (q: string) => new Bun.CryptoHasher('sha256').update(q).digest('hex')

/** 0 the name is the query, 1 starts with it, 2 holds every term, 3 anything else. */
function nameRank(q: string, name: string): number {
  const n = name.toLowerCase()
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  return q.split(' ').every((t) => n.includes(t)) ? 2 : 3
}

/**
 * One list from each site's ranked hits: by how well the name matches, then by the
 * site's own rank, sites taking turns. The first listing of a skill key is kept.
 */
export function mergeFinds(q: string, lists: ExternalFind[][]): ExternalFind[] {
  const turns: ExternalFind[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) turns.push(l[i]!)
  const ranked = turns.map((f, i) => ({ f, i, rank: nameRank(q, f.name) })).sort((a, b) => a.rank - b.rank || a.i - b.i)
  const seen = new Set<string>()
  return ranked.flatMap(({ f }) => (seen.has(f.skillKey) ? [] : (seen.add(f.skillKey), [f])))
}

/** Two points for each query term in a find's name, one for each found only in its description. */
function termScore(q: string, f: ExternalFind): number {
  const name = f.name.toLowerCase()
  const description = f.description?.toLowerCase() ?? ''
  return q.split(' ').reduce((n, t) => n + (name.includes(t) ? 2 : description.includes(t) ? 1 : 0), 0)
}

export interface RepoToScan {
  repo: string
  /** Lowercase skill names the finds name in it. */
  skills: string[]
}

/**
 * The GitHub repos finds name, best first: by the highest term score among a repo's
 * finds, then by where its first find stands.
 */
export function reposByRelevance(q: string, finds: ExternalFind[]): RepoToScan[] {
  const byRepo = new Map<string, { at: number; score: number; skills: Set<string> }>()
  finds.forEach((f, at) => {
    if (!f.githubRepo) return
    const entry = byRepo.get(f.githubRepo) ?? { at, score: 0, skills: new Set<string>() }
    entry.score = Math.max(entry.score, termScore(q, f))
    const prefix = `github:${f.githubRepo}/`
    if (f.skillKey.startsWith(prefix)) entry.skills.add(f.skillKey.slice(prefix.length).toLowerCase())
    byRepo.set(f.githubRepo, entry)
  })
  return [...byRepo]
    .sort(([, a], [, b]) => b.score - a.score || a.at - b.at)
    .map(([repo, e]) => ({ repo, skills: [...e.skills] }))
}

/** How one repo scan of a lookup ended; logged with the lookup. */
export interface RepoScanOutcome {
  repo: string
  /** scanned, named skills, no skills, partial, too large, error, rate limited, over budget, or running. */
  status: string
  skills?: number
  error?: string
}

/** An error's message for the log, without anything shaped like a GitHub token. */
const errorText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[token]').slice(0, 300)

function wait(ms: number): { done: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return { done, cancel: () => clearTimeout(timer) }
}

type Asked = { source: string; finds: ExternalFind[] } | { source: string; failed: string }

export interface SupplementOptions {
  reader: CatalogReader
  store: FoundStore
  sources: SearchSource[]
  fetch?: typeof fetch
  /** Scans the GitHub repos finds name. Without it they wait for the catalog sync. */
  github?: Octokit
  config?: Partial<SupplementConfig>
  now?: () => Date
  log?: (entry: Record<string, unknown>) => void
}

export class SearchSupplement {
  private readonly c: SupplementConfig
  private readonly http: KyInstance
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly running = new Map<string, Promise<void>>()
  /** Query key → when the sites may be asked for it again. */
  private readonly unavailable = new Map<string, number>()
  /** Site → until when it asked not to be called (429). */
  private readonly cooldown = new Map<string, number>()
  private readonly budgets: Map<string, RateLimiterMemory[]>
  private readonly scans: RateLimiterMemory
  /** Until when GitHub asked not to be called (rate limit). */
  private githubCooldown = 0

  constructor(private readonly o: SupplementOptions) {
    this.c = { ...SUPPLEMENT_DEFAULTS, ...o.config }
    this.fetchImpl = o.fetch ?? fetch
    this.now = o.now ?? (() => new Date())
    // No retries: the person is waiting, and a later lookup asks again.
    this.http = upstreamClient(this.fetchImpl, 0).extend({ timeout: this.c.sourceTimeoutMs, headers: { 'user-agent': 'agent-store-api' } })
    this.budgets = new Map(o.sources.map((s) => [s.name, [
      new RateLimiterMemory({ points: s.budget.perMinute, duration: 60 }),
      new RateLimiterMemory({ points: s.budget.perDay, duration: 86_400 }),
    ]]))
    this.scans = new RateLimiterMemory({ points: this.c.scansPerHour, duration: 3600 })
  }

  private log(entry: Record<string, unknown>): void {
    ;(this.o.log ?? ((e) => console.log(JSON.stringify(e))))(entry)
  }

  /**
   * Answers at once from what is known and starts a lookup when one is due. The same
   * query asked again while its lookup runs joins that lookup.
   */
  lookup(rawQuery: string, kind: ResourceKind | null): SearchSupplementResponse {
    const answer = (
      status: SearchSupplementResponse['status'],
      rest: Partial<Omit<SearchSupplementResponse, 'status'>> = {},
    ): SearchSupplementResponse => ({
      status,
      sources: this.o.sources.map((s) => s.name),
      reason: null,
      resources: [],
      listings: [],
      foundOn: {},
      partial: false,
      retryAfterSeconds: null,
      ...rest,
    })

    const q = normalizeQuery(rawQuery)
    if (this.o.sources.length === 0) return answer('disabled')
    // The sites list skills only.
    if ((kind && kind !== 'skill') || !lookupEligible(q, this.c)) return answer('not_needed')
    const local = this.o.reader.list({ q, kind, limit: this.c.sample }).resources.map((r) => ({ name: r.name, key: r.origin.upstreamId }))
    const reason = fallbackTrigger(q, local, this.c.minResults)
    if (!reason) return answer('not_needed')

    const key = queryKey(q)
    const now = this.now()
    const cached = this.o.store.lookup(key, now.toISOString())
    const extras = this.stored(q, cached?.skillKeys ?? [])
    const found = extras.resources.length + extras.listings.length > 0
    if (this.running.has(key)) return answer('searching', { reason, ...extras, retryAfterSeconds: 2 })
    if (cached) return answer(found ? 'found' : 'none', { reason, ...extras, partial: cached.partial })
    const retryAt = this.unavailable.get(key) ?? 0
    if (retryAt > now.getTime()) return answer('unavailable', { reason, ...extras, retryAfterSeconds: Math.ceil((retryAt - now.getTime()) / 1000) })
    // Earlier lookups for other queries may have stored enough to answer this one.
    const known = [
      ...local,
      ...extras.resources.map((r) => ({ name: r.name, key: r.origin.upstreamId })),
      ...extras.listings.map((l) => ({ name: l.name, key: l.key })),
    ]
    if (!fallbackTrigger(q, known, this.c.minResults)) return answer('found', { reason, ...extras })
    if (this.running.size >= this.c.maxLookups) return answer('unavailable', { reason, ...extras, retryAfterSeconds: 5 })

    const job = this.run(q, key)
      .catch((e) => {
        this.unavailable.set(key, this.now().getTime() + this.c.unavailableTtlMs)
        this.log({ level: 'error', message: 'search supplement failed', key: key.slice(0, 12), error: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => this.running.delete(key))
    this.running.set(key, job)
    return answer('searching', { reason, ...extras, retryAfterSeconds: 2 })
  }

  /** Resolves when the lookup running for this query ends, or after `ms`. */
  async settled(rawQuery: string, ms: number): Promise<void> {
    const job = this.running.get(queryKey(normalizeQuery(rawQuery)))
    if (!job) return
    const timer = wait(ms)
    await Promise.race([job, timer.done])
    timer.cancel()
  }

  /** Detail of a scanned skill the catalog does not hold yet. */
  resource(id: string): ResourceDetail | null {
    return this.o.store.resource(id)
  }

  exportFinds(): FoundExport {
    return this.o.store.export(this.now().toISOString())
  }

  /** Whether the catalog already holds the skill a key names; only GitHub skills can be in it. */
  private inCatalog(skillKey: string): boolean {
    const m = /^github:([^/]+\/[^/]+)\/(.+)$/.exec(skillKey)
    return m !== null && this.o.reader.skillId(m[1]!, m[2]!) !== null
  }

  /**
   * Stored finds for a query: scanned skills as resources, the rest as listings. What
   * the catalog holds by now is left out (it is in the local results) and dropped.
   */
  private stored(q: string, skillKeys: string[]): { resources: ResourceSummary[]; listings: ExternalListing[]; foundOn: Record<string, ExternalSite[]> } {
    const { resources, listings } = this.o.store.find(skillKeys, q.split(' '), this.c.maxResults)
    const published = resources.filter((r) => this.o.reader.has(r.summary.id))
    if (published.length) this.o.store.dropResources(published.map((r) => r.summary.id))
    const kept = resources.filter((r) => !published.includes(r))
    const order = new Map(skillKeys.map((k, i) => [k, i]))
    const byRelevance = <T>(items: T[], name: (t: T) => string, key: (t: T) => string): T[] =>
      items
        .map((t, i) => ({ t, i, rank: nameRank(q, name(t)), at: order.get(key(t)) ?? skillKeys.length }))
        .sort((a, b) => a.rank - b.rank || a.at - b.at || a.i - b.i)
        .map((x) => x.t)

    const promoted = new Set(kept.map((r) => r.skillKey))
    const sitesOfRepo = new Map<string, Set<ExternalSite>>()
    for (const l of listings) {
      const repo = l.githubRepo?.toLowerCase()
      if (repo) sitesOfRepo.set(repo, (sitesOfRepo.get(repo) ?? new Set()).add(l.site))
    }
    const byKey = new Map<string, FoundListing>()
    for (const l of listings) {
      if (promoted.has(l.key) || this.inCatalog(l.key)) continue
      const prev = byKey.get(l.key)
      // Of two sites listing one skill, the site the key names is its home.
      if (!prev || (!prev.key.startsWith(`${prev.site}:`) && l.key.startsWith(`${l.site}:`))) byKey.set(l.key, l)
    }
    const shown = byRelevance(kept, (r) => r.summary.name, (r) => r.skillKey).slice(0, this.c.maxResults)
    const foundOn: Record<string, ExternalSite[]> = {}
    for (const r of shown) {
      const repo = /^github:([^/]+\/[^/]+)\//.exec(r.skillKey)?.[1]
      const sites = repo ? sitesOfRepo.get(repo.toLowerCase()) : undefined
      if (sites?.size) foundOn[r.summary.id] = [...sites].sort()
    }
    return {
      resources: shown.map((r) => r.summary),
      foundOn,
      listings: byRelevance([...byKey.values()], (l) => l.name, (l) => l.key)
        .slice(0, this.c.maxResults)
        .map(({ githubRepo: _repo, ...l }) => l),
    }
  }

  private async run(q: string, key: string): Promise<void> {
    const asked = await Promise.all(this.o.sources.map((s) => this.ask(s, q)))
    const lists = asked.flatMap((a) => ('finds' in a ? [a.finds] : []))
    const outcome = Object.fromEntries(asked.map((a) => [a.source, 'finds' in a ? `ok ${a.finds.length}` : a.failed]))
    const now = this.now()
    if (lists.length === 0) {
      // When every site asked us to back off, retrying before the first of them is due is pointless.
      const waits = [...this.cooldown.values()].map((until) => until - now.getTime()).filter((ms) => ms > 0)
      const limited = asked.every((a) => 'failed' in a && (a.failed === 'rate limited' || a.failed === 'cooling down'))
      for (const [k, until] of this.unavailable) if (until <= now.getTime()) this.unavailable.delete(k)
      this.unavailable.set(key, now.getTime() + (limited && waits.length ? Math.min(...waits) : this.c.unavailableTtlMs))
      this.log({ level: 'warn', message: 'search supplement: no site answered', key: key.slice(0, 12), sources: outcome })
      return
    }
    const stamp = now.toISOString()
    this.o.store.saveFinds(lists.flat(), stamp)
    const finds = mergeFinds(q, lists).filter((f) => !this.inCatalog(f.skillKey)).slice(0, this.c.maxResults)
    const repos = await this.scan(key, q, finds)
    const partial = lists.length < asked.length
    const status = finds.length ? 'found' : 'none'
    const ttl = partial ? this.c.partialTtlMs : status === 'found' ? this.c.foundTtlMs : this.c.noneTtlMs
    this.o.store.saveLookup(key, { status, partial, skillKeys: finds.map((f) => f.skillKey) }, stamp, new Date(now.getTime() + ttl).toISOString())
    this.o.store.prune(now)
    this.log({ level: 'info', message: 'search supplement', key: key.slice(0, 12), sources: outcome, finds: finds.length, repos })
  }

  /** One site's hits, checked. Any failure is this site's alone. */
  private async ask(source: SearchSource, q: string): Promise<Asked> {
    const name = source.name
    if ((this.cooldown.get(name) ?? 0) > this.now().getTime()) return { source: name, failed: 'cooling down' }
    try {
      for (const budget of this.budgets.get(name) ?? []) await budget.consume(name)
    } catch {
      return { source: name, failed: 'over budget' }
    }
    try {
      const hits = await source.search(this.http, q, this.c.perSource)
      const finds = hits.flatMap((h) => checkFind(source, h) ?? []).slice(0, this.c.perSource)
      return { source: name, finds }
    } catch (e) {
      if (isHTTPError(e) && e.response.status === 429) {
        const seconds = Number(e.response.headers.get('retry-after'))
        const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000
        this.cooldown.set(name, this.now().getTime() + Math.min(ms, 3_600_000))
        return { source: name, failed: 'rate limited' }
      }
      if (isTimeoutError(e)) return { source: name, failed: 'timeout' }
      return { source: name, failed: isHTTPError(e) ? `HTTP ${e.response.status}` : 'error' }
    }
  }

  /**
   * Reads the GitHub repos the finds name, the most relevant few per lookup, so their
   * skills can be served and installed before the next catalog build. Only files are
   * read; nothing from a repo is run. Returns how each scan ended; one still running
   * when the wait ends is `running`, and its outcome is logged when it ends.
   */
  private async scan(key: string, q: string, finds: ExternalFind[]): Promise<RepoScanOutcome[]> {
    const github = this.o.github
    if (!github) return []
    const wanted = reposByRelevance(q, finds)
    const before = new Date(this.now().getTime() - this.c.rescanAfterMs).toISOString()
    const due = new Set(this.o.store.reposDue(wanted.map((w) => w.repo), before))
    const picked = wanted.filter((w) => due.has(w.repo)).slice(0, this.c.scanRepos)
    if (picked.length === 0) return []
    const outcomes: RepoScanOutcome[] = picked.map((w) => ({ repo: w.repo, status: 'running' }))
    const work = Promise.all(picked.map(async (w, i) => {
      outcomes[i] = await this.scanOne(github, w)
    })).catch((e) => {
      this.log({ level: 'error', message: 'search supplement: repo scan failed', key: key.slice(0, 12), error: errorText(e) })
    })
    // A slow scan still stores its skills when it ends; the lookup just stops waiting for it.
    const timer = wait(this.c.scanTimeoutMs)
    const ended = await Promise.race([work.then(() => true), timer.done.then(() => false)])
    timer.cancel()
    if (!ended) {
      void work.then(() => this.log({ level: 'info', message: 'search supplement: repo scans ended', key: key.slice(0, 12), repos: outcomes }))
    }
    return outcomes.map((o) => ({ ...o }))
  }

  private async scanOne(github: Octokit, w: RepoToScan): Promise<RepoScanOutcome> {
    const repo = w.repo
    // Not marked as tried: the repo is due again once GitHub or the budget allows.
    if (this.githubCooldown > this.now().getTime()) return { repo, status: 'rate limited' }
    try {
      await this.scans.consume('github')
    } catch {
      return { repo, status: 'over budget' }
    }
    const mark = (outcome: RepoScanOutcome): RepoScanOutcome => {
      this.o.store.markRepo(repo, outcome.status, this.now().toISOString())
      return outcome
    }
    try {
      const scan = await scanRepo(github, this.fetchImpl, repo, new Map(), { maxSkills: this.c.scanMaxSkills, named: new Set(w.skills) })
      this.o.store.saveResources(repo, scan.records, this.now().toISOString(), { replace: !scan.subset })
      const status = scan.skipped[DOWNLOAD_FAILED] ? 'partial' : scan.records.length === 0 ? 'no skills' : scan.subset ? 'named skills' : 'scanned'
      return mark({ repo, status, skills: scan.records.length })
    } catch (e) {
      if (e instanceof RepoTooLargeError) return mark({ repo, status: 'too large', error: errorText(e) })
      if (isRateLimit(e)) {
        const now = this.now().getTime()
        this.githubCooldown = Math.min(rateLimitResetAt(e, now) ?? now + 15 * 60_000, now + 3_600_000)
        return { repo, status: 'rate limited', error: errorText(e) }
      }
      return mark({ repo, status: 'error', error: errorText(e) })
    }
  }
}
