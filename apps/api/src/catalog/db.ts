import { Database } from 'bun:sqlite'

// The catalog is its own SQLite file, rebuilt by the sync and downloaded by the
// API. PRAGMA user_version holds the schema version; MIGRATIONS[i] moves a file
// from version i to i + 1. Only append to this list.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE catalog_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE resources (
    id                  TEXT PRIMARY KEY,        -- '<site>:<upstream_id>'
    kind                TEXT NOT NULL CHECK (kind IN ('skill', 'mcp', 'provider')),
    site                TEXT NOT NULL,
    source              TEXT NOT NULL,           -- the source module that owns the row
    upstream_id         TEXT NOT NULL,
    scope               TEXT,                    -- reconcile unit, e.g. a skill repo
    name                TEXT NOT NULL,
    description         TEXT,
    author_name         TEXT,
    author_url          TEXT,
    version             TEXT,
    homepage_url        TEXT,
    source_url          TEXT,
    upstream_version    TEXT,
    upstream_updated_at TEXT,
    installs            INTEGER,
    verified            INTEGER NOT NULL DEFAULT 0,
    tags                TEXT NOT NULL DEFAULT '[]',
    transports          TEXT NOT NULL DEFAULT '[]',
    detail              TEXT NOT NULL,           -- kind-specific install data, JSON
    content_hash        TEXT NOT NULL,
    first_seen_at       TEXT NOT NULL,
    updated_at          TEXT NOT NULL,           -- last content change
    synced_at           TEXT NOT NULL,           -- last run that saw it upstream
    unavailable_at      TEXT,
    unavailable_reason  TEXT
  );

  -- Default order; SQLite sorts NULLs last under DESC.
  CREATE INDEX resources_by_kind ON resources (kind, verified DESC, installs DESC, upstream_updated_at DESC, id)
    WHERE unavailable_at IS NULL;
  CREATE INDEX resources_by_rank ON resources (verified DESC, installs DESC, upstream_updated_at DESC, id)
    WHERE unavailable_at IS NULL;
  CREATE INDEX resources_by_kind_updated ON resources (kind, upstream_updated_at DESC) WHERE unavailable_at IS NULL;
  CREATE INDEX resources_by_kind_name ON resources (kind, name COLLATE NOCASE) WHERE unavailable_at IS NULL;
  CREATE INDEX resources_by_source ON resources (source, scope);

  -- Rebuilt after every sync. trigram matches substrings of 3+ characters, CJK included.
  CREATE VIRTUAL TABLE resources_fts USING fts5(
    name, description, tags,
    content = 'resources', content_rowid = 'rowid', tokenize = 'trigram'
  );
  `,
]

export const CATALOG_SCHEMA_VERSION = MIGRATIONS.length

export function schemaVersion(db: Database): number {
  return (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
}

export function migrateCatalog(db: Database): void {
  const from = schemaVersion(db)
  if (from > CATALOG_SCHEMA_VERSION) {
    throw new Error(`catalog schema version ${from} is newer than this code (${CATALOG_SCHEMA_VERSION})`)
  }
  for (let v = from; v < CATALOG_SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })()
  }
}

export function openCatalogForWrite(path: string): Database {
  const db = new Database(path, { create: true, strict: true })
  // A single file with no -wal sidecar, so the result can be copied and served as is.
  db.exec('PRAGMA journal_mode = DELETE')
  migrateCatalog(db)
  return db
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query('SELECT value FROM catalog_meta WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function setMeta(db: Database, key: string, value: string): void {
  db.query('INSERT INTO catalog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function countAvailable(db: Database): number {
  return (db.query('SELECT count(*) AS n FROM resources WHERE unavailable_at IS NULL').get() as { n: number }).n
}
