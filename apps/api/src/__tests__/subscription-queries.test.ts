import { test, expect } from 'bun:test'
import { getDb } from '../db/client'
import { manageableBillingOrderQuery, subscriptionUpsertQuery } from '../subscription-queries'
import type { SubscriptionRecord } from '../billing'

// A fake connection string is enough: neon()'s handle is lazy and .toSQL() only
// compiles the query — it never opens a connection.
const db = getDb({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' })

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    waffoOrderId: 'ORD_1',
    waffoPaymentId: 'PAY_1',
    buyerEmail: 'buyer@example.com',
    buyerIdentity: 'user-1',
    paidAmount: '9.99',
    currency: 'USD',
    billingPeriod: 'monthly',
    plan: 'pro',
    status: 'active',
    productName: null,
    storeId: 'STO_1',
    mode: 'prod',
    eventTimestamp: '2026-07-06T00:00:00.000Z',
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

test('the manageable order query is scoped to the authenticated buyer identity', () => {
  const { sql, params } = manageableBillingOrderQuery(db, 'user-42').toSQL()
  expect(sql.toLowerCase()).toContain('buyer_identity')
  expect(sql.toLowerCase()).toContain('limit')
  expect(params).toContain('user-42')
})
