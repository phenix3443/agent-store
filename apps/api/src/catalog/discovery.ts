import { Database } from 'bun:sqlite'
import type { KyInstance } from 'ky'
import { githubRepoOf } from './stars'

// discovery.db: what the skill directories list, with dated popularity snapshots and
// the queue of GitHub repos to scan. It is a separate file from catalog.db because
// the API downloads catalog.db and never reads this history.

const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE runs (
    id       INTEGER PRIMARY KEY,
    taken_at TEXT NOT NULL
  );

  -- One entry on one site. skill_key is the same for the same skill on every site:
  -- github:<owner/repo>/<skill>, clawhub:<owner>/<slug>, skillhub:<namespace>/<slug>.
  CREATE TABLE listings (
    id            INTEGER PRIMARY KEY,
    source        TEXT NOT NULL,
    listing_id    TEXT NOT NULL,
    skill_key     TEXT NOT NULL,
    name          TEXT NOT NULL,
    url           TEXT NOT NULL,              -- the listing on its site
    github_repo   TEXT,                       -- lowercase owner/repo when the site names one
    resource_id   TEXT,                       -- catalog.db resources.id once the skill is scanned
    metrics       TEXT NOT NULL DEFAULT '{}', -- latest value of each metric, JSON
    first_seen_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    UNIQUE (source, listing_id)
  );
  CREATE INDEX listings_by_skill ON listings (skill_key);
  CREATE INDEX listings_by_repo ON listings (github_repo) WHERE github_repo IS NOT NULL;

  -- A listing's place on a board in one run. metric 'rank' rows hold only the rank.
  CREATE TABLE snapshots (
    listing INTEGER NOT NULL,
    board   TEXT NOT NULL,
    metric  TEXT NOT NULL,
    run_id  INTEGER NOT NULL,
    rank    INTEGER,
    value   INTEGER,
    PRIMARY KEY (listing, board, metric, run_id)
  ) WITHOUT ROWID;
  CREATE INDEX snapshots_by_run ON snapshots (run_id);

  -- GitHub repos to scan for SKILL.md. last_attempt_at NULL means never tried.
  CREATE TABLE repos (
    full_name       TEXT PRIMARY KEY,         -- lowercase owner/repo
    first_seen_at   TEXT NOT NULL,
    discovered_by   TEXT NOT NULL,
    best_rank       INTEGER,                  -- best board position any listing of it reached
    last_attempt_at TEXT,
    last_status     TEXT
  );
  `,
]

/** Snapshots older than this are dropped; listings and repos are kept for good. */
export const SNAPSHOT_RETENTION_DAYS = 180

export function openDiscoveryForWrite(path: string): Database {
  const db = new Database(path, { create: true, strict: true })
  db.exec('PRAGMA journal_mode = DELETE')
  const from = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
  if (from > MIGRATIONS.length) throw new Error(`discovery schema version ${from} is newer than this code (${MIGRATIONS.length})`)
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })()
  }
  return db
}

const getMeta = (db: Database, key: string) =>
  (db.query('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | null)?.value ?? null
const setMeta = (db: Database, key: string, value: string) =>
  db.query('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)

/**
 * Metric kinds. Each is stored per site and never added to another kind or another
 * site's count. A repo's GitHub stars live in catalog.db and are not a skill metric.
 */
export type Metric =
  | 'installs_total' // cumulative installs
  | 'installs_window' // installs in the board's trailing window
  | 'installs_hour' // installs in the last hour
  | 'installs_hour_change' // last hour minus the same hour yesterday
  | 'downloads_total' // cumulative downloads
  | 'installs_reported' // the site's own "installs" figure, meaning undocumented
  | 'site_stars' // users starring the skill on that site

export interface Observation {
  listingId: string
  skillKey: string
  name: string
  url: string
  githubRepo: string | null
  /** The board this was read from, or null for a directory page (no snapshot). */
  board: string | null
  rank: number | null
  metrics: Partial<Record<Metric, number>>
  /** Metrics snapshotted for the board; defaults to all of `metrics`, an empty list means rank only. */
  snapshot?: Metric[]
}

export interface PageCoverage {
  /** A board (ranked list) or 'directory' (the full listing, walked a few pages per run). */
  list: string
  pages: number
  items: number
  /** Entries the site says the list has, when it says. */
  total: number | null
  /** Why reading stopped: the list's end, the depth read per run, the site's own cut-off, or an error. */
  stoppedBy: 'end' | 'depth' | 'site-limit' | 'error' | 'rate-limited'
  /** Where the next run continues, for a directory walked across runs. */
  next?: string | null
}

export interface DiscoveryRun {
  observations: Observation[]
  coverage: PageCoverage[]
  skipped: Record<string, number>
  errors: string[]
  /** Saved and handed back as `state` next run; a null value deletes the key. */
  state?: Record<string, string | null>
}

export interface DiscoveryContext {
  http: KyInstance
  now: Date
  full: boolean
  state: Record<string, string>
  log: (message: string) => void
}

/** One directory site. Its boards are signals of the same site, not separate sources. */
export interface DiscoverySource {
  name: string
  run(ctx: DiscoveryContext): Promise<DiscoveryRun>
}

export interface DiscoverySourceReport {
  source: string
  status: 'ok' | 'partial' | 'failed'
  seen: number
  added: number
  updated: number
  unchanged: number
  /** Listings on a board this run that were on no board in an earlier run. */
  newOnBoards: number
  /** Listings whose rank on a board improved since the previous run. */
  rose: number
  newRepos: number
  examples: { newOnBoards: string[]; rose: string[] }
  coverage: PageCoverage[]
  skipped: Record<string, number>
  errors: string[]
  durationMs: number
  lastSuccessAt: string | null
}

export interface RepoQueueReport {
  budget: number
  pickedNew: number
  pickedKnown: number
  waitingNew: number
  known: number
  oldestAttemptAt: string | null
}

/** What the API's search lookups found since it started keeping them (GET /api/discovery/export). */
export interface SearchFindsReport {
  status: 'ok' | 'failed'
  listings: number
  newListings: number
  repos: number
  newRepos: number
  skipped: number
  error?: string
}

export interface DiscoveryReport {
  runId: number
  sources: DiscoverySourceReport[]
  searchFinds?: SearchFindsReport
  listings: number
  /** Distinct skill_key values: a skill listed on two sites counts once. */
  skills: number
  /** Skills listed on more than one site. */
  crossSite: number
  linkedResources: number
  snapshots: number
  prunedSnapshots: number
  queue?: RepoQueueReport
}

const stateKey = (source: string, key: string) => `source:${source}:state:${key}`

export function loadState(db: Database, source: string): Record<string, string> {
  const prefix = stateKey(source, '')
  const rows = db.query('SELECT key, value FROM meta WHERE key >= ? AND key < ?').all(prefix, `${prefix}￿`) as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key.slice(prefix.length), r.value]))
}

export function beginRun(db: Database, stamp: string): number {
  return Number(db.query('INSERT INTO runs (taken_at) VALUES (?)').run(stamp).lastInsertRowid)
}

const EXAMPLES = 10

/** Writes one source's observations. Nothing is removed: a site not listing a skill says nothing about the skill. */
export function applyDiscovery(db: Database, source: string, run: DiscoveryRun, runId: number, stamp: string, report: DiscoverySourceReport): void {
  const select = db.query('SELECT id, metrics FROM listings WHERE source = ? AND listing_id = ?')
  const insert = db.query(`INSERT INTO listings (source, listing_id, skill_key, name, url, github_repo, metrics, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const update = db.query('UPDATE listings SET skill_key = ?, name = ?, url = ?, github_repo = ?, metrics = ?, last_seen_at = ? WHERE id = ?')
  const snap = db.query('INSERT OR IGNORE INTO snapshots (listing, board, metric, run_id, rank, value) VALUES (?, ?, ?, ?, ?, ?)')
  const onBoardBefore = db.query('SELECT 1 FROM snapshots WHERE listing = ? AND run_id < ? LIMIT 1')
  const prevRank = db.query('SELECT rank FROM snapshots WHERE listing = ? AND board = ? AND run_id < ? AND rank IS NOT NULL ORDER BY run_id DESC LIMIT 1')
  const repoInsert = db.query(`INSERT INTO repos (full_name, first_seen_at, discovered_by, best_rank) VALUES (?, ?, ?, ?)
    ON CONFLICT (full_name) DO UPDATE SET best_rank = min(coalesce(best_rank, excluded.best_rank), coalesce(excluded.best_rank, best_rank))`)
  const repoExists = db.query('SELECT 1 FROM repos WHERE full_name = ?')

  const seen = new Set<number>()
  const rises: Array<{ label: string; by: number }> = []
  for (const o of run.observations) {
    const existing = select.get(source, o.listingId) as { id: number; metrics: string } | null
    let id: number
    if (!existing) {
      id = Number(insert.run(source, o.listingId, o.skillKey, o.name, o.url, o.githubRepo, JSON.stringify(o.metrics), stamp, stamp).lastInsertRowid)
      report.added++
    } else {
      id = existing.id
      const before = JSON.parse(existing.metrics) as Record<string, number>
      const changed = Object.entries(o.metrics).some(([k, v]) => before[k] !== v)
      update.run(o.skillKey, o.name, o.url, o.githubRepo, JSON.stringify({ ...before, ...o.metrics }), stamp, id)
      // A listing seen on two boards in one run counts once.
      if (!seen.has(id)) {
        if (changed) report.updated++
        else report.unchanged++
      }
    }
    const firstSighting = !seen.has(id)
    seen.add(id)

    if (o.githubRepo) {
      if (!repoExists.get(o.githubRepo)) report.newRepos++
      repoInsert.run(o.githubRepo, stamp, source, o.rank)
    }
    if (o.board === null) continue

    if (firstSighting && !onBoardBefore.get(id, runId)) {
      report.newOnBoards++
      if (report.examples.newOnBoards.length < EXAMPLES) report.examples.newOnBoards.push(`${o.board} #${o.rank}: ${o.listingId}`)
    }
    if (o.rank !== null) {
      const prev = prevRank.get(id, o.board, runId) as { rank: number } | null
      if (prev && prev.rank > o.rank) {
        report.rose++
        rises.push({ label: `${o.board} #${prev.rank} → #${o.rank}: ${o.listingId}`, by: prev.rank - o.rank })
      }
    }
    const metrics = o.snapshot ?? (Object.keys(o.metrics) as Metric[])
    if (metrics.length === 0) snap.run(id, o.board, 'rank', runId, o.rank, o.rank)
    for (const m of metrics) snap.run(id, o.board, m, runId, o.rank, o.metrics[m] ?? null)
  }
  report.seen = seen.size
  report.examples.rose = rises.sort((a, b) => b.by - a.by).slice(0, EXAMPLES).map((r) => r.label)

  for (const [k, v] of Object.entries(run.state ?? {})) {
    if (v === null) db.query('DELETE FROM meta WHERE key = ?').run(stateKey(source, k))
    else setMeta(db, stateKey(source, k), v)
  }
}

/** Runs each discovery source and writes what it saw. A failing source leaves its data as it was. */
export async function runDiscovery(
  db: Database,
  sources: DiscoverySource[],
  ctx: Omit<DiscoveryContext, 'state'>,
  runId: number,
  stampNow: () => string,
): Promise<DiscoverySourceReport[]> {
  const reports: DiscoverySourceReport[] = []
  for (const source of sources) {
    const started = Date.now()
    const report: DiscoverySourceReport = {
      source: source.name, status: 'ok', seen: 0, added: 0, updated: 0, unchanged: 0, newOnBoards: 0, rose: 0,
      newRepos: 0, examples: { newOnBoards: [], rose: [] }, coverage: [], skipped: {}, errors: [], durationMs: 0,
      lastSuccessAt: getMeta(db, `source:${source.name}:last_success`),
    }
    reports.push(report)
    try {
      ctx.log(`${source.name}: fetching`)
      const run = await source.run({ ...ctx, state: loadState(db, source.name) })
      report.coverage = run.coverage
      report.skipped = run.skipped
      report.errors = run.errors
      if (run.errors.length) report.status = run.observations.length ? 'partial' : 'failed'
      const stamp = stampNow()
      db.transaction(() => {
        applyDiscovery(db, source.name, run, runId, stamp, report)
        if (report.status !== 'failed') setMeta(db, `source:${source.name}:last_success`, stamp)
      })()
      if (report.status !== 'failed') report.lastSuccessAt = stamp
    } catch (e) {
      report.status = 'failed'
      report.errors.push(e instanceof Error ? e.message : String(e))
    }
    report.durationMs = Date.now() - started
    ctx.log(`${source.name}: ${report.status}, ${report.seen} seen, +${report.added} new, ${report.newOnBoards} new on boards`)
  }
  return reports
}

const FIND_SOURCES = new Set(['clawhub', 'skillhub', 'skillsmp'])
const FIND_KEY = /^(github|clawhub|skillhub):\S/

/**
 * Takes in the listings and GitHub repos the API's search lookups stored. A listing
 * joins under its own site, so a later board read of the same entry updates that row;
 * rows already here are left as they are. New repos enter the scan queue as never tried.
 * The body comes from our own API, but it is checked like any other input.
 */
export function applySearchFinds(db: Database, body: unknown, stamp: string): SearchFindsReport {
  const report: SearchFindsReport = { status: 'ok', listings: 0, newListings: 0, repos: 0, newRepos: 0, skipped: 0 }
  const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
  const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  const root = rec(body)
  if (!Array.isArray(root['listings']) || !Array.isArray(root['repos'])) throw new Error('unexpected response shape')
  const repoOf = (v: unknown) => {
    const name = text(v)
    return name && /^[^/]+\/[^/]+$/.test(name) ? githubRepoOf(`https://github.com/${name}`) : null
  }
  const addListing = db.query(`INSERT INTO listings (source, listing_id, skill_key, name, url, github_repo, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source, listing_id) DO NOTHING`)
  const addRepo = db.query(`INSERT INTO repos (full_name, first_seen_at, discovered_by) VALUES (?, ?, 'search')
    ON CONFLICT (full_name) DO NOTHING`)
  db.transaction(() => {
    for (const item of root['listings'] as unknown[]) {
      const l = rec(item)
      const source = text(l['source'])
      const listingId = text(l['listingId'])
      const skillKey = text(l['skillKey'])
      const name = text(l['name'])
      const url = text(l['url'])
      if (!source || !FIND_SOURCES.has(source) || !listingId || !skillKey || !FIND_KEY.test(skillKey) || !name || !url?.startsWith('https://')) {
        report.skipped++
        continue
      }
      report.listings++
      report.newListings += addListing.run(source, listingId, skillKey, name, url, repoOf(l['githubRepo']), stamp, stamp).changes
    }
    for (const item of root['repos'] as unknown[]) {
      const fullName = repoOf(rec(item)['fullName'])
      if (!fullName) {
        report.skipped++
        continue
      }
      report.repos++
      report.newRepos += addRepo.run(fullName, stamp).changes
    }
  })()
  return report
}

/** Repos the catalog already holds skills from join the queue as known repos. */
export function seedRepos(db: Database, scopes: Array<{ scope: string; syncedAt: string }>, stamp: string): void {
  const q = db.query(`INSERT INTO repos (full_name, first_seen_at, discovered_by, last_attempt_at, last_status)
    VALUES (?, ?, 'catalog', ?, 'scanned') ON CONFLICT (full_name) DO NOTHING`)
  db.transaction(() => {
    for (const s of scopes) q.run(s.scope, stamp, s.syncedAt)
  })()
}

/**
 * This run's repos: up to half the budget for repos never tried (oldest discovery
 * first, then best rank), the rest for the repos tried longest ago. Either side
 * takes the other's unused share, so new repos are not crowded out and known
 * repos keep rotating.
 */
export function pickRepos(db: Database, budget: number): { repos: string[]; report: RepoQueueReport } {
  const fresh = (db.query(`SELECT full_name FROM repos WHERE last_attempt_at IS NULL
    ORDER BY first_seen_at, best_rank IS NULL, best_rank, full_name`).all() as { full_name: string }[]).map((r) => r.full_name)
  const known = (db.query(`SELECT full_name FROM repos WHERE last_attempt_at IS NOT NULL
    ORDER BY last_attempt_at, full_name`).all() as { full_name: string }[]).map((r) => r.full_name)
  const freshSlots = Math.min(fresh.length, Math.max(Math.ceil(budget / 2), budget - known.length))
  const knownSlots = Math.min(known.length, budget - freshSlots)
  const oldest = db.query('SELECT min(last_attempt_at) AS t FROM repos').get() as { t: string | null }
  return {
    repos: [...fresh.slice(0, freshSlots), ...known.slice(0, knownSlots)],
    report: {
      budget, pickedNew: freshSlots, pickedKnown: knownSlots, waitingNew: fresh.length - freshSlots,
      known: known.length, oldestAttemptAt: oldest.t,
    },
  }
}

export function recordAttempts(db: Database, attempted: Array<{ repo: string; status: string }>, stamp: string): void {
  const q = db.query(`INSERT INTO repos (full_name, first_seen_at, discovered_by, last_attempt_at, last_status) VALUES (?, ?, 'catalog', ?, ?)
    ON CONFLICT (full_name) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, last_status = excluded.last_status`)
  db.transaction(() => {
    for (const a of attempted) q.run(a.repo.toLowerCase(), stamp, stamp, a.status)
  })()
}

/** `owner/repo/skill` (lowercase) → latest all-time installs on skills.sh. */
export function skillsShInstalls(db: Database): Map<string, number> {
  const rows = db.query(`SELECT listing_id, json_extract(metrics, '$.installs_total') AS n FROM listings
    WHERE source = 'skills-sh' AND json_extract(metrics, '$.installs_total') IS NOT NULL`).all() as { listing_id: string; n: number }[]
  return new Map(rows.map((r) => [r.listing_id, r.n]))
}

/**
 * Points GitHub-backed listings at the catalog rows they describe. A skills.sh skill id
 * is the SKILL.md name or the directory name, so both are tried, within the same repo
 * only; two skills of one repo never share a key.
 */
export function linkResources(db: Database, catalog: Database): number {
  const rows = catalog.query(`SELECT id, scope, name, json_extract(detail, '$.repo.dir') AS dir FROM resources
    WHERE kind = 'skill' AND site = 'github' AND scope IS NOT NULL`).all() as { id: string; scope: string; name: string; dir: string | null }[]
  const byKey = new Map<string, string>()
  for (const r of rows) {
    const base = r.dir ? r.dir.split('/').pop()!.toLowerCase() : ''
    if (base && !byKey.has(`${r.scope}/${base}`)) byKey.set(`${r.scope}/${base}`, r.id)
  }
  // A SKILL.md name wins over another skill's directory name.
  for (const r of rows) byKey.set(`${r.scope}/${r.name.toLowerCase()}`, r.id)
  const listings = db.query("SELECT id, skill_key, resource_id FROM listings WHERE skill_key LIKE 'github:%'").all() as
    { id: number; skill_key: string; resource_id: string | null }[]
  const set = db.query('UPDATE listings SET resource_id = ? WHERE id = ?')
  let linked = 0
  db.transaction(() => {
    for (const l of listings) {
      const rid = byKey.get(l.skill_key.slice('github:'.length)) ?? null
      if (rid) linked++
      if (rid !== l.resource_id) set.run(rid, l.id)
    }
  })()
  return linked
}

export function pruneSnapshots(db: Database, now: Date): number {
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 86_400_000).toISOString()
  return db.query('DELETE FROM snapshots WHERE run_id IN (SELECT id FROM runs WHERE taken_at < ?)').run(cutoff).changes
}

export function discoveryTotals(db: Database): Pick<DiscoveryReport, 'listings' | 'skills' | 'crossSite' | 'snapshots'> {
  const one = (sql: string) => (db.query(sql).get() as { n: number }).n
  return {
    listings: one('SELECT count(*) AS n FROM listings'),
    skills: one('SELECT count(DISTINCT skill_key) AS n FROM listings'),
    crossSite: one('SELECT count(*) AS n FROM (SELECT skill_key FROM listings GROUP BY skill_key HAVING count(DISTINCT source) > 1)'),
    snapshots: one('SELECT count(*) AS n FROM snapshots'),
  }
}
