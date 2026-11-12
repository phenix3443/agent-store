import type { Database } from 'bun:sqlite'
import type { Octokit } from '@octokit/rest'
import type { ResourceKind } from '@as/types'
import { countAvailable, getMeta, setMeta, CATALOG_SCHEMA_VERSION } from './db'
import { encodeDetail } from './detail-codec'
import type { CatalogRecord, CatalogSource, SourceRun } from './types'

export interface SourceReport {
  source: string
  kind: ResourceKind
  status: 'ok' | 'partial' | 'failed'
  mode: 'full' | 'scoped' | 'incremental' | null
  fetched: number
  added: number
  updated: number
  restored: number
  unchanged: number
  unavailable: number
  skipped: Record<string, number>
  errors: string[]
  durationMs: number
}

export interface SyncReport {
  startedAt: string
  finishedAt: string
  sources: SourceReport[]
  before: { available: number }
  after: { available: number; unavailable: number; byKind: Record<string, number> }
}

export interface SyncOptions {
  sources: CatalogSource[]
  fetch: typeof fetch
  github: Octokit
  full?: boolean
  now?: () => Date
  log?: (message: string) => void
}

const watermarkKey = (source: string) => `source:${source}:watermark`

function contentHash(r: CatalogRecord): string {
  const { installs: _installs, ...content } = r
  return new Bun.CryptoHasher('sha256').update(JSON.stringify(content)).digest('hex')
}

interface ExistingRow {
  content_hash: string
  unavailable_at: string | null
  upstream_version: string | null
  upstream_updated_at: string | null
  installs: number | null
}

function applyRun(db: Database, source: CatalogSource, run: SourceRun, stamp: string, report: SourceReport): void {
  const select = db.query('SELECT content_hash, unavailable_at, upstream_version, upstream_updated_at, installs FROM resources WHERE id = ?')
  const insert = db.query(`
    INSERT INTO resources (id, kind, site, source, upstream_id, scope, name, description, author_name, author_url,
      version, homepage_url, source_url, upstream_version, upstream_updated_at, installs, verified, tags, transports,
      detail, content_hash, first_seen_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const update = db.query(`
    UPDATE resources SET kind = ?, site = ?, source = ?, upstream_id = ?, scope = ?, name = ?, description = ?,
      author_name = ?, author_url = ?, version = ?, homepage_url = ?, source_url = ?, upstream_version = ?,
      upstream_updated_at = ?, installs = ?, verified = ?, tags = ?, transports = ?, detail = ?, content_hash = ?,
      updated_at = ?, synced_at = ?, unavailable_at = NULL, unavailable_reason = NULL
    WHERE id = ?`)
  const touch = db.query('UPDATE resources SET synced_at = ?, installs = ?, unavailable_at = NULL, unavailable_reason = NULL WHERE id = ?')
  const markGone = db.query('UPDATE resources SET unavailable_at = ?, unavailable_reason = ? WHERE id = ? AND unavailable_at IS NULL')

  const seen = new Set<string>()
  for (const r of run.records) {
    const id = `${r.site}:${r.upstreamId}`
    if (seen.has(id)) continue
    seen.add(id)
    const existing = select.get(id) as ExistingRow | null
    const hash = contentHash(r)
    const installs = r.installs ?? existing?.installs ?? null
    if (existing && existing.content_hash === hash) {
      touch.run(stamp, installs, id)
      if (existing.unavailable_at) report.restored++
      else report.unchanged++
      continue
    }
    // Sources that cannot date a change get the time the sync first saw this version.
    const upstreamUpdatedAt =
      r.upstreamUpdatedAt ??
      (existing && existing.upstream_version === r.upstreamVersion ? existing.upstream_updated_at : stamp)
    const values = [
      r.kind, r.site, source.name, r.upstreamId, r.scope, r.name, r.description, r.author?.name ?? null,
      r.author?.url ?? null, r.version, r.homepageUrl, r.sourceUrl, r.upstreamVersion, upstreamUpdatedAt, installs,
      r.verified ? 1 : 0, JSON.stringify(r.tags), JSON.stringify(r.transports), encodeDetail(r.kind, r.detail), hash,
    ] as const
    if (existing) {
      update.run(...values, stamp, stamp, id)
      if (existing.unavailable_at) report.restored++
      else report.updated++
    } else {
      insert.run(id, ...values, stamp, stamp, stamp)
      report.added++
    }
  }

  for (const { upstreamId, reason } of run.removed) {
    const id = `${source.site}:${upstreamId}`
    if (seen.has(id)) continue
    report.unavailable += markGone.run(stamp, reason, id).changes
  }

  const reason = 'no longer listed upstream'
  if (run.coverage.mode === 'full') {
    report.unavailable += db
      .query('UPDATE resources SET unavailable_at = ?, unavailable_reason = ? WHERE source = ? AND unavailable_at IS NULL AND synced_at < ?')
      .run(stamp, reason, source.name, stamp).changes
  } else if (run.coverage.mode === 'scoped' && run.coverage.scopes.length > 0) {
    report.unavailable += db
      .query(`UPDATE resources SET unavailable_at = ?, unavailable_reason = ?
              WHERE source = ? AND unavailable_at IS NULL AND synced_at < ?
                AND scope IN (SELECT value FROM json_each(?))`)
      .run(stamp, reason, source.name, stamp, JSON.stringify(run.coverage.scopes)).changes
  }
  if (run.watermark) setMeta(db, watermarkKey(source.name), run.watermark)
}

/**
 * Runs every source against an open, migrated catalog and writes what each one
 * saw. A source that throws leaves its rows untouched; the others still apply.
 */
export async function syncCatalog(db: Database, options: SyncOptions): Promise<SyncReport> {
  const now = options.now ?? (() => new Date())
  const log = options.log ?? (() => {})
  const startedAt = now().toISOString()
  const before = { available: countAvailable(db) }
  const reports: SourceReport[] = []

  for (const source of options.sources) {
    const started = Date.now()
    const report: SourceReport = {
      source: source.name, kind: source.kind, status: 'ok', mode: null, fetched: 0, added: 0, updated: 0,
      restored: 0, unchanged: 0, unavailable: 0, skipped: {}, errors: [], durationMs: 0,
    }
    reports.push(report)
    const knownScopes = (db
      .query('SELECT DISTINCT scope FROM resources WHERE source = ? AND scope IS NOT NULL AND unavailable_at IS NULL')
      .all(source.name) as { scope: string }[]).map((r) => r.scope)
    try {
      log(`${source.name}: fetching`)
      const run = await source.run({
        fetch: options.fetch,
        github: options.github,
        now: now(),
        full: options.full ?? false,
        state: { watermark: getMeta(db, watermarkKey(source.name)), knownScopes },
        log,
      })
      report.mode = run.coverage.mode
      report.fetched = run.records.length
      report.skipped = run.skipped
      report.errors = run.errors
      if (run.errors.length) report.status = 'partial'
      // The stamp is taken after fetching, so rows a run saw are always newer than it.
      const stamp = now().toISOString()
      db.transaction(() => applyRun(db, source, run, stamp, report))()
    } catch (e) {
      report.status = 'failed'
      report.errors.push(e instanceof Error ? e.message : String(e))
    }
    report.durationMs = Date.now() - started
    log(`${source.name}: ${report.status}, +${report.added} ~${report.updated} -${report.unavailable}`)
  }

  db.exec("INSERT INTO resources_fts (resources_fts) VALUES ('rebuild')")
  const finishedAt = now().toISOString()
  setMeta(db, 'schema_version', String(CATALOG_SCHEMA_VERSION))
  setMeta(db, 'built_at', finishedAt)
  const byKind = Object.fromEntries(
    (db.query('SELECT kind, count(*) AS n FROM resources WHERE unavailable_at IS NULL GROUP BY kind').all() as { kind: string; n: number }[]).map((r) => [r.kind, r.n]),
  )
  const unavailable = (db.query('SELECT count(*) AS n FROM resources WHERE unavailable_at IS NOT NULL').get() as { n: number }).n
  return { startedAt, finishedAt, sources: reports, before, after: { available: countAvailable(db), unavailable, byKind } }
}

export function formatReportMarkdown(report: SyncReport, extra: string[] = []): string {
  const lines = [
    '## Catalog sync',
    '',
    `Started ${report.startedAt}, finished ${report.finishedAt}.`,
    `Available resources: ${report.before.available} before, ${report.after.available} after ` +
      `(${Object.entries(report.after.byKind).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); ${report.after.unavailable} marked unavailable in total.`,
    ...extra,
    '',
    '| Source | Status | Mode | Fetched | Added | Updated | Restored | Unchanged | Unavailable | Skipped |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.sources.map((s) =>
      `| ${s.source} | ${s.status} | ${s.mode ?? '-'} | ${s.fetched} | ${s.added} | ${s.updated} | ${s.restored} | ${s.unchanged} | ${s.unavailable} | ${Object.values(s.skipped).reduce((a, b) => a + b, 0)} |`,
    ),
  ]
  for (const s of report.sources) {
    const skips = Object.entries(s.skipped).sort((a, b) => b[1] - a[1])
    if (skips.length === 0 && s.errors.length === 0) continue
    lines.push('', `### ${s.source}`)
    for (const [reason, n] of skips) lines.push(`- skipped ${n}: ${reason}`)
    for (const e of s.errors.slice(0, 20)) lines.push(`- error: ${e}`)
    if (s.errors.length > 20) lines.push(`- … ${s.errors.length - 20} more errors`)
  }
  return lines.join('\n') + '\n'
}
