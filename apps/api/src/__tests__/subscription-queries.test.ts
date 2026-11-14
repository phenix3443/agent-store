import { test, expect } from 'bun:test'
import { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../db/schema'
import { subscriptionUpsertQuery } from '../subscription-queries'
import type { SubscriptionRecord } from '../billing'

// .toSQL() only compiles the query, so an empty in-memory database is enough.
const db = drizzle({ client: new Sqlite(':memory:'), schema })

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    waffoOrderId: 'ORD_1',
    buyerEmail: 'buyer@example.com',
    buyerIdentity: 'user-1',
    plan: 'pro',
    status: 'active',
    productName: null,
    storeId: 'STO_1',
    mode: 'prod',
    eventTimestamp: '2026-07-06T00:00:00.000Z',
    billingPeriod: null,
    currentPeriodEnd: null,
    ...overrides,
  }
}

test('the conflict-update only overwrites when the incoming event_timestamp is not older', () => {
  const { sql } = subscriptionUpsertQuery(db, record()).toSQL()
  const normalized = sql.toLowerCase()
  // A stale, out-of-order delivery must not reactivate a canceled subscription,
  // so the DO UPDATE carries a WHERE comparing incoming vs. stored timestamps.
  expect(normalized).toContain('on conflict')
  expect(normalized).toContain('do update')
  expect(normalized).toContain('where')
  expect(normalized).toContain('excluded.event_timestamp >=')
  expect(normalized).toContain('is null or')
})
