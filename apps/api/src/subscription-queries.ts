import type { Plan } from '@as/types'
import { desc, eq, sql } from 'drizzle-orm'
import { getDb, type Database, type DbEnv } from './db/client'
import { processedWebhooks, subscriptions } from './db/schema'
import { planForSubscription, type SubscriptionRecord, type SubscriptionStatus } from './billing'

/** Whether a webhook delivery id has already been processed (idempotent dedup). */
export async function isWebhookProcessed(env: DbEnv | undefined, deliveryId: string): Promise<boolean> {
  const db = getDb(env)
  const rows = await db
    .select({ deliveryId: processedWebhooks.deliveryId })
    .from(processedWebhooks)
    .where(eq(processedWebhooks.deliveryId, deliveryId))
    .limit(1)
  return rows.length > 0
}

/** Records a webhook delivery id as processed. */
export async function markWebhookProcessed(
  env: DbEnv | undefined,
  deliveryId: string,
  eventType: string
): Promise<void> {
  const db = getDb(env)
  await db.insert(processedWebhooks).values({ deliveryId, eventType })
}

/**
 * Builds the subscription upsert query keyed by Waffo order id.
 *
 * Webhook deliveries are not ordered: a late `subscription.activated` (retried
 * after a network delay) can arrive *after* the `subscription.canceled` that
 * superseded it. The conflict-update therefore only overwrites the stored row
 * when the incoming `event_timestamp` is not older than the stored one — so a
 * stale event can never reactivate a canceled subscription. Rows without a
 * stored timestamp (pre-existing data) are always allowed to update.
 */
export function subscriptionUpsertQuery(db: Database, record: SubscriptionRecord) {
  const values = {
    waffoOrderId: record.waffoOrderId,
    buyerEmail: record.buyerEmail,
    buyerIdentity: record.buyerIdentity,
    plan: record.plan,
    status: record.status,
    productName: record.productName,
    waffoStoreId: record.storeId,
    mode: record.mode,
    eventTimestamp: record.eventTimestamp ? new Date(record.eventTimestamp) : null,
  }
  return db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.waffoOrderId,
      set: {
        buyerEmail: values.buyerEmail,
        buyerIdentity: values.buyerIdentity,
        plan: values.plan,
        status: values.status,
        productName: values.productName,
        waffoStoreId: values.waffoStoreId,
        mode: values.mode,
        eventTimestamp: values.eventTimestamp,
      },
      setWhere: sql`${subscriptions.eventTimestamp} is null or excluded.event_timestamp >= ${subscriptions.eventTimestamp}`,
    })
}

/** Upserts a subscription row keyed by its Waffo order id. */
export async function upsertSubscription(env: DbEnv | undefined, record: SubscriptionRecord): Promise<void> {
  await subscriptionUpsertQuery(getDb(env), record)
}

/** Resolves the current entitlement plan for a buyer email from their most recent subscription row. */
export async function getPlanByEmail(env: DbEnv | undefined, email: string): Promise<Plan> {
  const db = getDb(env)
  const rows = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(sql`lower(${subscriptions.buyerEmail}) = lower(${email})`)
    .orderBy(desc(subscriptions.eventTimestamp))
    .limit(1)
  const row = rows[0]
  if (!row) return 'free'
  return planForSubscription(row.status as SubscriptionStatus, row.plan as Plan)
}

/** Resolves the current entitlement plan for an authenticated app user from their most recent subscription row. */
export async function getPlanByUserId(env: DbEnv | undefined, userId: string): Promise<Plan> {
  const db = getDb(env)
  const rows = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.buyerIdentity, userId))
    .orderBy(desc(subscriptions.eventTimestamp))
    .limit(1)
  const row = rows[0]
  if (!row) return 'free'
  return planForSubscription(row.status as SubscriptionStatus, row.plan as Plan)
}
