import { defineConfig } from 'drizzle-kit'

// Only `drizzle-kit generate` uses this; it diffs the schema against
// ./drizzle/meta and needs no database. `bun src/migrate.ts` applies the result.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
