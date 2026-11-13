import { existsSync } from 'node:fs'
import { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

/** app.db is shared with the store's Better Auth; both read the path from APP_DB_PATH. */
export const DEFAULT_APP_DB_PATH = '/var/lib/agent-store/app.db'

/** Env bag carrying the app.db path. Tests pass it explicitly; the server falls back to process.env. */
export type DbEnv = {
  APP_DB_PATH?: string
}

export type Database = ReturnType<typeof drizzle<typeof schema>>

export function appDbPath(env?: DbEnv): string {
  return env?.APP_DB_PATH || process.env['APP_DB_PATH'] || DEFAULT_APP_DB_PATH
}

/** Per-connection settings. The store sets the same ones (apps/store/lib/app-db.ts). */
export function configureConnection(sqlite: Sqlite): void {
  // The store writes to the same file; wait for its lock instead of failing at once.
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec('PRAGMA foreign_keys = ON')
}

/** Opens an existing app.db. Only `bun src/migrate.ts` creates the file. */
export function openAppDb(path: string): Sqlite {
  if (!existsSync(path)) {
    throw new Error(`app.db not found at ${path}: run \`bun src/migrate.ts\` first, or set APP_DB_PATH.`)
  }
  const sqlite = new Sqlite(path, { readwrite: true, create: false })
  configureConnection(sqlite)
  return sqlite
}

// One connection per path for the life of the process. bun:sqlite is synchronous,
// so the process's own writes never contend with each other.
const connections = new Map<string, Database>()

export function getDb(env?: DbEnv): Database {
  const path = appDbPath(env)
  let db = connections.get(path)
  if (!db) {
    db = drizzle({ client: openAppDb(path), schema })
    connections.set(path, db)
  }
  return db
}
