import type { Database } from 'bun:sqlite'
import type { Octokit } from '@octokit/rest'
import pMap from 'p-map'
import { isRecord } from './http'

// Stars are per repo, and tens of thousands of rows share about 30k repos, so they
// are fetched per repo into github_repos and copied onto the rows afterwards.

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,38})$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/
// github.com/<first>/… paths that are pages, not an owner.
const NOT_OWNERS = new Set([
  'orgs', 'users', 'topics', 'features', 'marketplace', 'apps', 'sponsors', 'settings', 'search', 'collections',
  'enterprise', 'login', 'about', 'site', 'pricing', 'explore', 'trending', 'issues', 'pulls', 'notifications',
])

/** Lowercase `owner/name` of a github.com repository URL, or null for anything else. */
export function githubRepoOf(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url
    .trim()
    .match(/^(?:git\+)?(?:(?:https?|git|ssh):\/\/)?(?:[^@/]+@)?(?:www\.)?github\.com[/:]([^/]+)\/([^/#?]+)/i)
  if (!m) return null
  const owner = m[1]!
  const name = m[2]!.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || NOT_OWNERS.has(owner.toLowerCase())) return null
  if (!NAME.test(name) || name === '.' || name === '..') return null
  return `${owner}/${name}`.toLowerCase()
}

/** One GraphQL document asking for the stars of each repo, aliased r0, r1, … in order. */
export function starsQuery(repos: string[]): string {
  const fields = repos.map((full, i) => {
    const [owner, name] = full.split('/') as [string, string]
    // githubRepoOf only lets [A-Za-z0-9._-] through, so nothing here needs escaping.
    return `r${i}: repository(owner: "${owner}", name: "${name}") { stargazerCount }`
  })
  return `query {\n  ${fields.join('\n  ')}\n  rateLimit { limit cost remaining resetAt }\n}`
}

export interface RateLimit {
  limit: number
  cost: number
  remaining: number
  resetAt: string
}

export interface StarsBatch {
  /** Stars by repo; null for a repo GitHub did not resolve (missing, private, blocked). */
  stars: Map<string, number | null>
  rateLimit: RateLimit | null
}

/** Reads a POST /graphql body. Throws when the batch as a whole failed, so its repos keep their values. */
export function parseStarsResponse(repos: string[], body: unknown): StarsBatch {
  if (!isRecord(body) || !isRecord(body['data'])) {
    const errors = isRecord(body) && Array.isArray(body['errors']) ? body['errors'] : []
    const message = errors.map((e) => (isRecord(e) ? String(e['message']) : String(e))).join('; ')
    throw new Error(`GitHub GraphQL: ${message || 'no data'}`)
  }
  const data = body['data']
  const stars = new Map<string, number | null>()
  repos.forEach((full, i) => {
    const node = data[`r${i}`]
    stars.set(full, isRecord(node) && typeof node['stargazerCount'] === 'number' ? node['stargazerCount'] : null)
  })
  const rl = data['rateLimit']
  const rateLimit =
    isRecord(rl) && typeof rl['remaining'] === 'number'
      ? { limit: Number(rl['limit']), cost: Number(rl['cost']), remaining: rl['remaining'], resetAt: String(rl['resetAt']) }
      : null
  return { stars, rateLimit }
}

export interface StarsOptions {
  /** A repo checked more recently than this is not asked again (except on a full run). */
  refreshAfterMs?: number
  batchSize?: number
  /** Upper bound on queries per run. */
  maxQueries?: number
  concurrency?: number
  /** Stop starting batches once GitHub reports fewer points than this. */
  minRemaining?: number
}

export interface StarsReport {
  /** Distinct GitHub repos of available rows. */
  repos: number
  due: number
  queried: number
  queries: number
  found: number
  missing: number
  failedBatches: number
  errors: string[]
  rateLimit: RateLimit | null
  /** GraphQL points the run's queries cost, as GitHub reported them. */
  cost: number
  durationMs: number
  /** Available rows per kind: how many have a GitHub repo, and how many of those have stars. */
  coverage: Record<string, { rows: number; withRepo: number; withStars: number }>
}

const DEFAULTS: Required<StarsOptions> = {
  refreshAfterMs: 20 * 3600_000,
  batchSize: 100,
  maxQueries: 450,
  concurrency: 4,
  minRemaining: 50,
}

/** Sets resources.github_repo from each row's own data: an MCP server's repository URL, a skill's repo. */
export function assignGithubRepos(db: Database): number {
  const rows = db
    .query("SELECT id, kind, scope, detail, github_repo FROM resources WHERE kind IN ('mcp', 'skill')")
    .all() as { id: string; kind: string; scope: string | null; detail: string; github_repo: string | null }[]
  const set = db.query('UPDATE resources SET github_repo = ? WHERE id = ?')
  let changed = 0
  for (const r of rows) {
    let repo: string | null = null
    if (r.kind === 'skill') {
      repo = r.scope ? githubRepoOf(`https://github.com/${r.scope}`) : null
    } else {
      try {
        const d = JSON.parse(r.detail) as { repository?: { url?: string } | null }
        repo = githubRepoOf(d.repository?.url)
      } catch {
        repo = null
      }
    }
    if (repo !== r.github_repo) {
      set.run(repo, r.id)
      changed++
    }
  }
  return changed
}

/** Copies github_repos.stars onto the rows; rows without a checked repo get NULL. */
export function applyStars(db: Database): void {
  db.exec(`
    UPDATE resources SET stars = g.stars FROM github_repos g
      WHERE g.full_name = resources.github_repo AND resources.stars IS NOT g.stars;
    UPDATE resources SET stars = NULL
      WHERE stars IS NOT NULL
        AND (github_repo IS NULL OR NOT EXISTS (SELECT 1 FROM github_repos g WHERE g.full_name = resources.github_repo));
  `)
}

function coverage(db: Database): StarsReport['coverage'] {
  const rows = db
    .query(`SELECT kind, count(*) AS n, count(github_repo) AS repo, count(stars) AS stars
            FROM resources WHERE unavailable_at IS NULL GROUP BY kind`)
    .all() as { kind: string; n: number; repo: number; stars: number }[]
  return Object.fromEntries(rows.map((r) => [r.kind, { rows: r.n, withRepo: r.repo, withStars: r.stars }]))
}

/**
 * Refreshes GitHub stars of the repos behind available rows, in batched GraphQL
 * queries, oldest check first. A batch that fails leaves its repos as they were.
 */
export async function refreshStars(
  db: Database,
  github: Octokit,
  ctx: { now: Date; full: boolean; log: (m: string) => void },
  options: StarsOptions = {},
): Promise<StarsReport> {
  const o = { ...DEFAULTS, ...options }
  const started = Date.now()
  assignGithubRepos(db)
  const cutoff = new Date(ctx.now.getTime() - o.refreshAfterMs).toISOString()
  const all = db
    .query(`SELECT r.github_repo AS repo, g.checked_at AS checked
            FROM (SELECT DISTINCT github_repo FROM resources WHERE github_repo IS NOT NULL AND unavailable_at IS NULL) r
            LEFT JOIN github_repos g ON g.full_name = r.github_repo
            ORDER BY g.checked_at IS NOT NULL, g.checked_at, r.github_repo`)
    .all() as { repo: string; checked: string | null }[]
  const due = all.filter((r) => ctx.full || r.checked === null || r.checked < cutoff).map((r) => r.repo)
  const batches: string[][] = []
  for (let i = 0; i < due.length && batches.length < o.maxQueries; i += o.batchSize) batches.push(due.slice(i, i + o.batchSize))

  const report: StarsReport = {
    repos: all.length, due: due.length, queried: 0, queries: 0, found: 0, missing: 0, failedBatches: 0, errors: [],
    rateLimit: null, cost: 0, durationMs: 0, coverage: {},
  }
  const upsert = db.query(`INSERT INTO github_repos (full_name, stars, checked_at) VALUES (?, ?, ?)
    ON CONFLICT (full_name) DO UPDATE SET stars = excluded.stars, checked_at = excluded.checked_at`)
  const stamp = ctx.now.toISOString()
  let stop: string | null = null
  await pMap(
    batches,
    async (repos) => {
      if (stop) return
      if (report.rateLimit && report.rateLimit.remaining < o.minRemaining) {
        stop = `GitHub GraphQL budget down to ${report.rateLimit.remaining} points; the remaining repos wait for the next run`
        return
      }
      report.queries++
      try {
        const res = await github.request('POST /graphql', { query: starsQuery(repos), request: { signal: AbortSignal.timeout(60_000) } })
        const batch = parseStarsResponse(repos, res.data)
        if (batch.rateLimit) {
          report.rateLimit = batch.rateLimit
          report.cost += batch.rateLimit.cost
        }
        db.transaction(() => {
          for (const [repo, stars] of batch.stars) {
            upsert.run(repo, stars, stamp)
            if (stars === null) report.missing++
            else report.found++
          }
        })()
        report.queried += repos.length
        if (report.queries % 50 === 0) ctx.log(`stars: ${report.queries} queries, ${report.queried} repos`)
      } catch (e) {
        report.failedBatches++
        const status = isRecord(e) && typeof e['status'] === 'number' ? e['status'] : null
        report.errors.push(e instanceof Error ? e.message : String(e))
        // No token, a bad token or an exhausted budget fails every later batch the same way.
        if (status === 401 || status === 403 || status === 429) stop = `GitHub GraphQL HTTP ${status}; stopped`
        else if (/rate limit/i.test(String(isRecord(e) ? e['message'] : e))) stop = 'GitHub GraphQL rate limit; stopped'
      }
    },
    { concurrency: o.concurrency },
  )
  if (stop) report.errors.push(stop)
  if (batches.length * o.batchSize < due.length) {
    report.errors.push(`${due.length - batches.length * o.batchSize} due repos over the ${o.maxQueries}-query cap wait for the next run`)
  }
  applyStars(db)
  report.coverage = coverage(db)
  report.durationMs = Date.now() - started
  return report
}
