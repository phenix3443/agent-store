import type { WebhookEvent, WebhookEventData } from '@waffo/pancake-ts'
import type { Plan } from '@as/types'

/** Subscription lifecycle status we persist, derived from Waffo webhook event types. */
export type SubscriptionStatus = 'active' | 'canceling' | 'canceled' | 'past_due' | 'trialing'

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
    case 'subscription.uncanceled':
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
  }
}

/** Resolves the entitlement plan for a subscription's status: the plan while active-ish, else free. */
export function planForSubscription(status: SubscriptionStatus, plan: Plan): Plan {
  return isActiveStatus(status) ? plan : 'free'
}
