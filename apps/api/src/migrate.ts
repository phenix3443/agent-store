import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

// Applies ./drizzle migrations. Runs as the API pod's init container, so a
// release whose migrations fail never starts serving.
const url = process.env['DATABASE_URL']
if (!url) throw new Error('Missing database config: set DATABASE_URL.')

const sql = postgres(url, { max: 1 })
await migrate(drizzle(sql), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
await sql.end()
// eslint-disable-next-line no-console
console.log(JSON.stringify({ level: 'info', message: 'migrations applied' }))
