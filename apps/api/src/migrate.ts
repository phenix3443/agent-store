import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { appDbPath, configureConnection } from './db/client'

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname

/** Creates app.db if needed, switches it to WAL and applies ./drizzle migrations. */
export function migrateAppDb(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Sqlite(path, { create: true, readwrite: true })
  try {
    // WAL is stored in the file, so every later connection (the API, the store,
    // the snapshot) uses it: readers never block the single writer.
    const { journal_mode } = sqlite.query('PRAGMA journal_mode = WAL').get() as { journal_mode: string }
    if (journal_mode !== 'wal') throw new Error(`could not switch ${path} to WAL (journal_mode=${journal_mode})`)
    configureConnection(sqlite)
    migrate(drizzle({ client: sqlite }), { migrationsFolder })
  } finally {
    sqlite.close()
  }
}

// Runs as the API pod's init container, so a release whose migrations fail never
// starts serving.
if (import.meta.main) {
  const path = appDbPath()
  migrateAppDb(path)
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message: 'migrations applied', path }))
}
