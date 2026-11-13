import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

// app.db is shared with the API, which creates it and owns its schema
// (apps/api/src/migrate.ts). Both read the path from APP_DB_PATH.
export const DEFAULT_APP_DB_PATH = '/var/lib/agent-store/app.db'

export function appDbPath(): string {
  return process.env.APP_DB_PATH || DEFAULT_APP_DB_PATH
}

// Better Auth's node:sqlite dialect opens transactions with a plain `begin`
// (DEFERRED). A deferred transaction that reads before it writes fails at once
// with SQLITE_BUSY, without waiting out busy_timeout, if the API wrote in
// between. `begin immediate` takes the write lock first, where busy_timeout
// applies. A subclass, not a wrapper: Better Auth detects the driver with
// `instanceof DatabaseSync`.
class AppDatabase extends DatabaseSync {
  override prepare(sql: string) {
    return super.prepare(/^\s*begin\s*;?\s*$/i.test(sql) ? 'begin immediate' : sql)
  }
}

export function missingAppDbMessage(path: string): string {
  return `app.db not found at ${path}. The API's \`bun src/migrate.ts\` creates it; set APP_DB_PATH to the shared file.`
}

/** Opens the existing app.db; never creates it, so a wrong path fails loudly. */
export function openAppDb(path: string = appDbPath()): DatabaseSync {
  if (!existsSync(path)) throw new Error(missingAppDbMessage(path))
  const db = new AppDatabase(path)
  // Same settings as the API (apps/api/src/db/client.ts).
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}
