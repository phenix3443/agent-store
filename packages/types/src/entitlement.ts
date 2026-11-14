/** The subscription plan a user is on. `free` is the default for anyone not signed in. */
export type Plan = 'free' | 'pro' | 'team'

/** Subscription status the API keeps from Waffo's webhooks. `canceling` keeps the plan until the period ends. */
export type SubscriptionStatus = 'active' | 'canceling' | 'canceled' | 'past_due' | 'trialing'

/** How a subscription is billed; `lifetime` is the one-time purchase. */
export type SubscriptionPeriod = 'monthly' | 'yearly' | 'lifetime'

/** The signed-in user's subscription as `GET /api/me/subscription` returns it. */
export interface MySubscription {
  plan: Exclude<Plan, 'free'>
  status: SubscriptionStatus
  /** Null when Waffo has not told us yet (rows recorded before the period was kept). */
  period: SubscriptionPeriod | null
  /** End of the current billing period as Waffo sent it (ISO 8601 date or timestamp). */
  currentPeriodEnd: string | null
}

/**
 * Feature flags gated by plan, resolved from a user's active plan. Every gated Pro feature
 * gets a boolean here so the client can check a single flag instead of re-deriving from `plan`.
 */
export interface Entitlements {
  plan: Plan
  /** Advanced usage analytics: budgets, project/time breakdowns, overspend alerts, export. */
  advancedUsageAnalytics: boolean
  /** Smart cost/capability-based routing beyond manual level ordering. */
  smartRouting: boolean
  /** Multi-key rotation per provider to bypass rate limits. */
  keyRotation: boolean
}
