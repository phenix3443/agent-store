import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

/** Env bag carrying the Postgres connection string. Tests pass it explicitly;
 * the server falls back to process.env. */
export type DbEnv = {
  DATABASE_URL?: string
}

export type Database = ReturnType<typeof drizzle<typeof schema>>

function databaseUrl(env: DbEnv | undefined): string {
  const url = env?.DATABASE_URL ?? (typeof process !== 'undefined' ? process.env?.['DATABASE_URL'] : undefined)
  if (!url) throw new Error('Missing database config: set DATABASE_URL.')
  return url
}

// One pool per connection string for the life of the process. postgres() opens
// connections lazily, so constructing a client never touches the network.
const pools = new Map<string, Database>()

export function getDb(env?: DbEnv): Database {
  const url = databaseUrl(env)
  let db = pools.get(url)
  if (!db) {
    db = drizzle(
      postgres(url, {
        max: 10,
        // A hung query or a transaction left open would otherwise hold its pooled
        // connection until the process restarts.
        connection: { statement_timeout: 10_000, idle_in_transaction_session_timeout: 30_000 },
      }),
      { schema }
    )
    pools.set(url, db)
  }
  return db
}
