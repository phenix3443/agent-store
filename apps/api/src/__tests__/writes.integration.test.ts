import { test, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { items, processedWebhooks, publishers, subscriptions } from '../db/schema'
import { submitReview } from '../review-queries'
import { recordWebhook } from '../subscription-queries'

// Runs against a real Postgres (a Postgres service container in CI). Every row uses a
// random suffix so runs never collide; nothing depends on cleanup.
const DB_URL = process.env['DATABASE_URL']
const maybe = DB_URL ? test : test.skip
const env = { DATABASE_URL: DB_URL }
const suffix = () => crypto.randomUUID().slice(0, 8)

maybe('concurrent reviews all count toward the item aggregate', async () => {
  const db = getDb(env)
  const tag = suffix()
  const [pub] = await db
    .insert(publishers)
    .values({ slug: `test-pub-${tag}`, name: 'Test', avatarUrl: 'https://example.com/a.png', tier: 'community' })
    .returning({ id: publishers.id })
  const slug = `test-item-${tag}`
  await db.insert(items).values({ slug, name: 'Test', description: 'Test', category: 'skill', version: '1.0.0', publisherId: pub!.id })

  const ratings = [5, 4, 3, 5, 1, 2, 4, 5]
  await Promise.all(
    ratings.map((rating) =>
      submitReview(env, { slug, userId: crypto.randomUUID(), authorName: null, rating, body: null })
    )
  )

  const [row] = await db.select({ rating: items.rating, reviewCount: items.reviewCount }).from(items).where(eq(items.slug, slug))
  const avg = Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
  expect(row!.reviewCount).toBe(ratings.length)
  expect(Number(row!.rating)).toBe(avg)
})

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
