import type { Plan } from '@as/types'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { getDb, type Database, type DbEnv } from './db/client'
import { processedWebhooks, subscriptions } from './db/schema'
import { planForSubscription, type SubscriptionRecord, type SubscriptionStatus } from './billing'

/** Whether a webhook delivery id has already been processed (idempotent dedup). */
export async function isWebhookProcessed(env: DbEnv | undefined, deliveryId: string): Promise<boolean> {
  const db = getDb(env)
  const row = db
    .select({ deliveryId: processedWebhooks.deliveryId })
    .from(processedWebhooks)
    .where(eq(processedWebhooks.deliveryId, deliveryId))
    .limit(1)
    .get()
  return row !== undefined
}

/**
 * Applies a webhook's subscription change and marks the delivery processed in one
 * transaction: if either fails, neither is kept and Waffo's retry
 * processes it again. The upsert is order-safe, so a delivery applied twice is
 * harmless; the second mark is a no-op.
 */
export async function recordWebhook(
  env: DbEnv | undefined,
  deliveryId: string,
  eventType: string,
  record: SubscriptionRecord | null
): Promise<void> {
  const db = getDb(env)
  // bun:sqlite is synchronous, so the callback must be too: drizzle commits as
  // soon as it returns. IMMEDIATE takes the write lock up front, where
  // busy_timeout applies, instead of failing on a read-to-write upgrade while
  // the store holds the lock.
  db.transaction(
    (tx) => {
      if (record) subscriptionUpsertQuery(tx, record).run()
      tx.insert(processedWebhooks).values({ deliveryId, eventType }).onConflictDoNothing().run()
    },
    { behavior: 'immediate' }
  )
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
// Takes a transaction as well as the client, hence only `insert`.
export function subscriptionUpsertQuery(db: Pick<Database, 'insert'>, record: SubscriptionRecord) {
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
    billingPeriod: record.billingPeriod,
    currentPeriodEnd: record.currentPeriodEnd,
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
        // subscription.payment_succeeded carries no period fields.
        billingPeriod: sql`coalesce(excluded.billing_period, ${subscriptions.billingPeriod})`,
        currentPeriodEnd: sql`coalesce(excluded.current_period_end, ${subscriptions.currentPeriodEnd})`,
      },
      setWhere: sql`${subscriptions.eventTimestamp} is null or excluded.event_timestamp >= ${subscriptions.eventTimestamp}`,
    })
}

/** Resolves the current entitlement plan for a buyer email from their most recent subscription row. */
export async function getPlanByEmail(env: DbEnv | undefined, email: string): Promise<Plan> {
  const db = getDb(env)
  const row = db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(sql`lower(${subscriptions.buyerEmail}) = lower(${email})`)
    .orderBy(desc(subscriptions.eventTimestamp))
    .limit(1)
    .get()
  if (!row) return 'free'
  return planForSubscription(row.status as SubscriptionStatus, row.plan as Plan)
}

/**
 * The subscription row that decides an app user's plan: one that still grants
 * the plan wins over a newer ended one (a lifetime purchase outlives a canceled
 * monthly), otherwise the most recent.
 */
export async function getSubscriptionByUserId(env: DbEnv | undefined, userId: string) {
  const db = getDb(env)
  return db
    .select({
      waffoOrderId: subscriptions.waffoOrderId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      waffoStoreId: subscriptions.waffoStoreId,
      mode: subscriptions.mode,
      billingPeriod: subscriptions.billingPeriod,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.buyerIdentity, userId))
    .orderBy(
      // The statuses isActiveStatus grants the plan for.
      asc(sql`case when ${subscriptions.status} in ('active', 'canceling', 'trialing') then 0 else 1 end`),
      desc(subscriptions.eventTimestamp)
    )
    .limit(1)
    .get()
}

/** Resolves the current entitlement plan for an authenticated app user. */
export async function getPlanByUserId(env: DbEnv | undefined, userId: string): Promise<Plan> {
  const row = await getSubscriptionByUserId(env, userId)
  if (!row) return 'free'
  return planForSubscription(row.status as SubscriptionStatus, row.plan as Plan)
}

/**
 * Records the status Waffo returned for a cancel or resume, so the dashboard
 * shows it before the webhook arrives. The event timestamp is left alone: the
 * webhook for the same change must still apply.
 */
export async function setSubscriptionStatus(
  env: DbEnv | undefined,
  waffoOrderId: string,
  status: SubscriptionStatus
): Promise<void> {
  getDb(env)
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.waffoOrderId, waffoOrderId))
    .run()
}
