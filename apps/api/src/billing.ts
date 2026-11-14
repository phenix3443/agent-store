import type { WebhookEvent, WebhookEventData } from '@waffo/pancake-ts'
import type { MySubscription, Plan, SubscriptionPeriod, SubscriptionStatus } from '@as/types'

export type { SubscriptionStatus }

/** A subscription row derived from a webhook event, ready to upsert. */
export interface SubscriptionRecord {
  waffoOrderId: string
  buyerEmail: string
  buyerIdentity: string | null
  plan: Plan
  status: SubscriptionStatus
  productName: string | null
  storeId: string
  mode: 'test' | 'prod'
  eventTimestamp: string
  /** Null when the event carries no period; the stored value is then kept. */
  billingPeriod: string | null
  currentPeriodEnd: string | null
}

/**
 * Maps a Waffo webhook event type to the resulting subscription status, or null
 * for events that don't change subscription state (one-time orders, refunds,
 * unknown types). `canceling` still grants access until period end.
 */
export function statusForEventType(eventType: string): SubscriptionStatus | null {
  switch (eventType) {
    // order.completed is a one-time purchase (Pro Lifetime) — grant Pro permanently.
    // (Lifetime is currently the only one-time product; revisit if others are added.)
    case 'order.completed':
    case 'subscription.activated':
    case 'subscription.payment_succeeded':
    case 'subscription.renewed':
    case 'subscription.recovered':
    case 'subscription.uncanceled':
    case 'subscription.plan_changed':
    case 'subscription.updated':
      return 'active'
    case 'subscription.canceling':
      return 'canceling'
    case 'subscription.canceled':
      return 'canceled'
    case 'subscription.past_due':
      return 'past_due'
    default:
      return null
  }
}

/** Whether a status grants the paid plan (access persists through `canceling` until period end). */
export function isActiveStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'canceling' || status === 'trialing'
}

/** Builds a persistable subscription record from a verified webhook event, or null if the event doesn't affect subscription state. */
export function subscriptionRecordFromEvent(event: WebhookEvent<WebhookEventData>): SubscriptionRecord | null {
  const status = statusForEventType(event.eventType)
  if (status === null) return null
  const data = event.data as WebhookEventData & { productName?: string }
  // Bind to the app user: checkout sends metadata.userId, echoed back here as
  // orderMetadata.userId. Fall back to the buyer-identity field, else null.
  const buyerIdentity = data.orderMetadata?.['userId'] ?? data.merchantProvidedBuyerIdentity ?? null
  return {
    waffoOrderId: data.orderId,
    buyerEmail: data.buyerEmail,
    buyerIdentity,
    // Only the Pro subscription exists today; product-name/metadata mapping can
    // refine this to 'team' later without changing the webhook plumbing.
    plan: 'pro',
    status,
    productName: data.productName ?? null,
    storeId: event.storeId,
    mode: event.mode === 'test' ? 'test' : 'prod',
    eventTimestamp: event.timestamp,
    billingPeriod: event.eventType === 'order.completed' ? 'lifetime' : (data.billingPeriod ?? null),
    currentPeriodEnd: data.currentPeriodEnd ?? null,
  }
}

/** Resolves the entitlement plan for a subscription's status: the plan while active-ish, else free. */
export function planForSubscription(status: SubscriptionStatus, plan: Plan): Plan {
  return isActiveStatus(status) ? plan : 'free'
}

/** What the user may do with a subscription from the dashboard. Waffo only cancels an active subscription and only resumes a canceling one. */
export function canCancel(sub: Pick<MySubscription, 'status' | 'period'>): boolean {
  return (sub.status === 'active' || sub.status === 'trialing') && sub.period !== 'lifetime'
}

export function canResume(sub: Pick<MySubscription, 'status'>): boolean {
  return sub.status === 'canceling'
}

const PERIODS: readonly string[] = ['monthly', 'yearly', 'lifetime'] satisfies SubscriptionPeriod[]

/** The dashboard view of a stored subscription row. */
export function subscriptionView(row: {
  plan: string
  status: string
  billingPeriod: string | null
  currentPeriodEnd: string | null
}): MySubscription {
  return {
    plan: row.plan === 'team' ? 'team' : 'pro',
    status: row.status as SubscriptionStatus,
    period: row.billingPeriod && PERIODS.includes(row.billingPeriod) ? (row.billingPeriod as SubscriptionPeriod) : null,
    currentPeriodEnd: row.currentPeriodEnd,
  }
}
