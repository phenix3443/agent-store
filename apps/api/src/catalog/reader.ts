import { Database } from 'bun:sqlite'
import type { ResourceDetail, ResourceKind, ResourceSite, ResourceSummary } from '@as/types'
import { CATALOG_READ_MIN_VERSION, CATALOG_SCHEMA_VERSION, schemaVersion } from './db'
import { decodeDetail } from './detail-codec'

export type ResourceSort = 'default' | 'installs' | 'updated' | 'name'

export interface ListParams {
  kind?: ResourceKind | null
  q?: string
  sort?: ResourceSort
  limit?: number
  offset?: number
}

interface Row {
  id: string
  kind: ResourceKind
  site: ResourceSite
  upstream_id: string
  name: string
  description: string | null
  author_name: string | null
  author_url: string | null
  version: string | null
  homepage_url: string | null
  source_url: string | null
  upstream_version: string | null
  upstream_updated_at: string | null
  installs: number | null
  verified: number
  tags: string
  transports: string
  detail: string
  synced_at: string
  unavailable_at: string | null
  unavailable_reason: string | null
}

function toSummary(r: Row): ResourceSummary {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    author: r.author_name ? { name: r.author_name, url: r.author_url } : null,
    version: r.version,
    homepageUrl: r.homepage_url,
    installs: r.installs,
    verified: r.verified === 1,
    tags: JSON.parse(r.tags) as string[],
    transports: JSON.parse(r.transports) as string[],
    origin: {
      site: r.site,
      upstreamId: r.upstream_id,
      url: r.source_url,
      upstreamVersion: r.upstream_version,
      upstreamUpdatedAt: r.upstream_updated_at,
      syncedAt: r.synced_at,
      unavailableAt: r.unavailable_at,
      unavailableReason: r.unavailable_reason,
    },
  }
}

const SUMMARY_COLUMNS = `r.id, r.kind, r.site, r.upstream_id, r.name, r.description, r.author_name, r.author_url, r.version,
  r.homepage_url, r.source_url, r.upstream_version, r.upstream_updated_at, r.installs, r.verified, r.tags, r.transports,
  r.synced_at, r.unavailable_at, r.unavailable_reason`

// Rank: publisher proved a domain (MCP) or curated (provider), then skills.sh
// installs, then the most recently changed upstream.
// The MCP registry has no install counts, so MCP ranks by verified first. Everywhere
// else installs come first; verified-first there buries skills with millions of installs
// under providers and verified MCP servers (owner, 2026-11-12).
const MCP_DEFAULT_ORDER = 'r.verified DESC, r.installs DESC, r.upstream_updated_at DESC, r.id'
const DEFAULT_ORDER = 'r.installs DESC, r.verified DESC, r.upstream_updated_at DESC, r.id'
const defaultOrder = (kind: string | undefined) => (kind === 'mcp' ? MCP_DEFAULT_ORDER : DEFAULT_ORDER)
const ORDERS: Record<Exclude<ResourceSort, 'default'>, string> = {
  installs: 'r.installs DESC, r.id',
  updated: 'r.upstream_updated_at DESC, r.id',
  name: 'r.name COLLATE NOCASE, r.id',
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const ftsPhrase = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Validates a downloaded file before it may replace the one being served. */
export function checkCatalogFile(path: string): { resources: number } {
  const db = new Database(path, { readonly: true })
  try {
    const version = schemaVersion(db)
    if (version < CATALOG_READ_MIN_VERSION || version > CATALOG_SCHEMA_VERSION) {
      throw new Error(`catalog schema version ${version}, expected ${CATALOG_READ_MIN_VERSION}..${CATALOG_SCHEMA_VERSION}`)
    }
    const check = db.query('PRAGMA quick_check').get() as { quick_check: string }
    if (check.quick_check !== 'ok') throw new Error(`catalog failed quick_check: ${check.quick_check}`)
    const { n } = db.query('SELECT count(*) AS n FROM resources WHERE unavailable_at IS NULL').get() as { n: number }
    if (n === 0) throw new Error('catalog has no available resources')
    return { resources: n }
  } finally {
    db.close()
  }
}

/**
 * Read side of catalog.db. bun:sqlite runs queries synchronously, so swapping
 * the handle between two requests never cuts one short.
 */
export class CatalogReader {
  private db: Database | null = null

  get ready(): boolean {
    return this.db !== null
  }

  /** Opens `path` read-only and makes it the catalog served from now on. */
  open(path: string): void {
    const next = new Database(path, { readonly: true })
    const prev = this.db
    this.db = next
    prev?.close()
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private handle(): Database {
    if (!this.db) throw new CatalogUnavailableError()
    return this.db
  }

  list(params: ListParams = {}): { resources: ResourceSummary[]; nextOffset: number | null } {
    const db = this.handle()
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)
    const offset = Math.max(params.offset ?? 0, 0)
    const where = ['r.unavailable_at IS NULL']
    const args: (string | number)[] = []
    let join = ''
    const base = defaultOrder(params.kind)
    let order = !params.sort || params.sort === 'default' ? base : ORDERS[params.sort] ?? base
    const orderArgs: string[] = []
    if (params.kind) {
      where.push('r.kind = ?')
      args.push(params.kind)
    }
    const q = params.q?.trim() ?? ''
    if (q) {
      const terms = q.split(/\s+/).slice(0, 8)
      const long = terms.filter((t) => [...t].length >= 3)
      if (long.length) {
        join = 'JOIN resources_fts f ON f.rowid = r.rowid'
        where.push('resources_fts MATCH ?')
        args.push(long.map(ftsPhrase).join(' '))
      }
      // trigram cannot match terms shorter than 3 characters.
      for (const t of terms.filter((t) => [...t].length < 3)) {
        where.push("(r.name LIKE ? ESCAPE '\\' OR r.description LIKE ? ESCAPE '\\')")
        args.push(`%${likeEscape(t)}%`, `%${likeEscape(t)}%`)
      }
      if (!params.sort || params.sort === 'default') {
        // Relevance buckets, each in the default order: the name or author is the query,
        // the name starts with it, the name or id contains it, a match elsewhere.
        order = `CASE WHEN r.name = ? COLLATE NOCASE OR r.author_name = ? COLLATE NOCASE THEN 0
          WHEN r.name LIKE ? ESCAPE '\\' THEN 1
          WHEN r.name LIKE ? ESCAPE '\\' OR r.upstream_id LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END, ${base}`
        orderArgs.push(q, q, `${likeEscape(q)}%`, `%${likeEscape(q)}%`, `%${likeEscape(q)}%`)
      }
    }
    const rows = db
      .query(`SELECT ${SUMMARY_COLUMNS} FROM resources r ${join} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...args, ...orderArgs, limit + 1, offset) as Row[]
    const more = rows.length > limit
    return { resources: rows.slice(0, limit).map(toSummary), nextOffset: more ? offset + limit : null }
  }

  /** Unavailable resources are still returned, so installed copies keep resolving. */
  get(id: string): ResourceDetail | null {
    const row = this.handle().query(`SELECT ${SUMMARY_COLUMNS}, r.detail FROM resources r WHERE r.id = ?`).get(id) as Row | null
    if (!row) return null
    return { ...toSummary(row), ...decodeDetail(row.kind, row.detail) } as ResourceDetail
  }

  info(): { builtAt: string | null; available: number } {
    const db = this.handle()
    const built = db.query("SELECT value FROM catalog_meta WHERE key = 'built_at'").get() as { value: string } | null
    const { n } = db.query('SELECT count(*) AS n FROM resources WHERE unavailable_at IS NULL').get() as { n: number }
    return { builtAt: built?.value ?? null, available: n }
  }
}

export class CatalogUnavailableError extends Error {
  constructor() {
    super('catalog not loaded yet')
    this.name = 'CatalogUnavailableError'
  }
}
