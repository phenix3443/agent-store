import { test, expect } from 'bun:test'
import { getItems } from '../queries'

// Integration guard for the recommendation ORDER BY. The unit tests exercise the
// TS mirror (computeRecommendedScore) and mock the query layer, so the actual SQL
// built by recommendedScoreSql() never runs there. That let a param-typing bug
// ship undetected: interpolated constants are sent as bound params that Postgres
// types as `unknown`, and `RATING_PRIOR_COUNT * RATING_PRIOR_MEAN` (plus the tier
// CASE) failed to plan with "operator is not unique: unknown * unknown", so
// getItems(sort='recommended') 500'd and the whole catalog came back empty.
//
// This test runs the real query against Postgres. It's gated on DATABASE_URL so
// it only runs where a database exists (make dev-env / CI), and skips otherwise.
const DB_URL = process.env['DATABASE_URL']
const maybe = DB_URL ? test : test.skip

maybe('getItems(sort=recommended) executes against Postgres without a query error', async () => {
  const { error } = await getItems({ DATABASE_URL: DB_URL }, { sort: 'recommended', limit: 5 })
  expect(error).toBeNull()
})

maybe('getItems(category=provider) returns the seeded providers', async () => {
  const { data, error } = await getItems({ DATABASE_URL: DB_URL }, { category: 'provider', sort: 'recommended' })
  expect(error).toBeNull()
  expect(data.length).toBeGreaterThan(0)
  expect(data.every((i) => i.category === 'provider')).toBe(true)
})
