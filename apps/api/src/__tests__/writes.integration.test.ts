import { test, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { processedWebhooks, subscriptions } from '../db/schema'
import { recordWebhook } from '../subscription-queries'

// Runs against a real Postgres (a Postgres service container in CI). Every row uses a
// random suffix so runs never collide; nothing depends on cleanup.
const DB_URL = process.env['DATABASE_URL']
const maybe = DB_URL ? test : test.skip
const env = { DATABASE_URL: DB_URL }
const suffix = () => crypto.randomUUID().slice(0, 8)

maybe('the same webhook delivered twice at once is applied once and does not fail', async () => {
  const db = getDb(env)
  const tag = suffix()
  const deliveryId = `test-delivery-${tag}`
  const record = {
    waffoOrderId: `test-order-${tag}`,
    buyerEmail: `${tag}@example.com`,
    buyerIdentity: null,
    plan: 'pro' as const,
    status: 'active' as const,
    productName: null,
    storeId: 'STO_TEST',
    mode: 'test' as const,
    eventTimestamp: new Date().toISOString(),
  }

  await Promise.all([
    recordWebhook(env, deliveryId, 'subscription.activated', record),
    recordWebhook(env, deliveryId, 'subscription.activated', record),
  ])

  const marks = await db.select().from(processedWebhooks).where(eq(processedWebhooks.deliveryId, deliveryId))
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.waffoOrderId, record.waffoOrderId))
  expect(marks).toHaveLength(1)
  expect(subs).toHaveLength(1)
})
