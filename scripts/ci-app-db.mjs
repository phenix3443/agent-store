// CI only: builds an app.db for jobs that run the store image without the API
// (images.yml smoke test, store-screenshots.yml). It applies the API's generated
// migrations in journal order, so the schema still comes from one source; real
// environments run `bun src/migrate.ts` in the API image instead.
//
// Usage: node scripts/ci-app-db.mjs <output app.db>
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/ci-app-db.mjs <output app.db>')
  process.exit(2)
}
const dir = new URL('../apps/api/drizzle/', import.meta.url)
const { entries } = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8'))
const db = new DatabaseSync(out)
db.exec('PRAGMA journal_mode = WAL')
for (const { tag } of entries) db.exec(readFileSync(new URL(`${tag}.sql`, dir), 'utf8'))
db.close()
