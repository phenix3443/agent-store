import postgres from 'postgres'

// Loads db/seed.sql into an empty catalog, and does nothing otherwise. Runs after
// migrate.ts in the API pod's init container, so a fresh database comes up with
// the demo catalog and a restart never duplicates or overwrites real rows.
const url = process.env['DATABASE_URL']
if (!url) throw new Error('Missing database config: set DATABASE_URL.')
const seedFile = process.env['SEED_FILE'] ?? new URL('../../../db/seed.sql', import.meta.url).pathname

const sql = postgres(url, { max: 1 })
const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from publishers`
if (count === 0) {
  await sql.begin((tx) => tx.file(seedFile))
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message: 'seeded empty catalog', seedFile }))
} else {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message: 'catalog not empty, seed skipped', publishers: count }))
}
await sql.end()
