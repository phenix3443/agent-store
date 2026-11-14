import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { requestId, type RequestIdVariables } from 'hono/request-id'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { sql } from 'drizzle-orm'
import { verifyWebhook, type WebhookEvent, type WebhookEventData } from '@waffo/pancake-ts'
import { getDb, type DbEnv } from './db/client'
import type { AuthEnv } from './auth-token'
import { getWaffoClient, proProductId, checkoutSuccessUrl, trialFlag, type WaffoEnv, type BillingPlan } from './waffo'
import { canCancel, canResume, subscriptionRecordFromEvent, subscriptionView, type SubscriptionStatus } from './billing'
import { cancelSubscription, customerPortalUrl, resumeSubscription } from './billing-management'
import { getAuthUser } from './auth'
import { resourceRoutes } from './catalog/routes'
import { catalogReader, searchSupplement } from './catalog/runtime'
import { favoriteRoutes } from './favorites'
import {
  isWebhookProcessed,
  recordWebhook,
  getPlanByEmail,
  getPlanByUserId,
  getSubscriptionByUserId,
  setSubscriptionStatus,
} from './subscription-queries'

// Under Bun.serve, c.env is the Bun server object with none of these keys, so
// getDb()/getWaffoClient()/getAuthUser() read process.env. Tests pass them in.
type Env = { Bindings: WaffoEnv & DbEnv & AuthEnv; Variables: RequestIdVariables }

export const app = new Hono<Env>()

app.use('*', requestId())
app.use('/api/*', cors())

// One JSON line per failure so Workers logs can be searched by requestId, which is
// also returned to the caller.
function logError(c: Context<Env>, message: string, cause: unknown) {
  console.error(
    JSON.stringify({
      level: 'error',
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      message,
      cause: cause instanceof Error ? cause.message : String(cause),
    })
  )
}

function fail(c: Context<Env>, status: ContentfulStatusCode, message: string, cause: unknown) {
  logError(c, message, cause)
  return c.json({ error: message, requestId: c.get('requestId') }, status)
}

app.get('/', (c) => c.json({ ok: true, service: 'as-api' }))

// Liveness: the process answers. Readiness: it can also open app.db. Kept
// apart so a database problem takes the pod out of the Service instead of
// restarting it in a loop.
app.get('/healthz', (c) => c.json({ ok: true }))
app.get('/readyz', async (c) => {
  try {
    getDb(c.env).get(sql`select 1`)
    return c.json({ ok: true })
  } catch (e) {
    return fail(c, 503, 'Database unavailable', e)
  }
})

// Aggregated catalog, read from catalog.db, and the search supplement (see src/catalog).
app.route('/', resourceRoutes(catalogReader, searchSupplement))

app.route(
  '/',
  favoriteRoutes({
    db: (c) => getDb(c.env as DbEnv),
    user: (c) => getAuthUser(c.env as AuthEnv, c.req.header('Authorization')),
    reader: catalogReader,
    supplement: searchSupplement,
  })
)

// ── Billing (Waffo Pancake, Merchant of Record) ──────────────────────────────

// Create a Pro checkout session and return its hosted checkout URL.
// Body: { period?: 'monthly' | 'yearly' | 'lifetime', email?: string, trial?: boolean }
// The post-payment redirect comes only from WAFFO_CHECKOUT_SUCCESS_URL: a URL taken
// from the request body would let anyone send buyers to their own site.
app.post('/api/billing/checkout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    period?: BillingPlan
    email?: string
    trial?: boolean
  }
  const period: BillingPlan =
    body.period === 'yearly' ? 'yearly' : body.period === 'lifetime' ? 'lifetime' : 'monthly'
  // `true`/`false` for subscriptions, `undefined` (omit) for lifetime.
  const withTrial = trialFlag(period, body.trial)
  const productId = proProductId(c.env, period)
  if (!productId) return c.json({ error: 'Billing not configured' }, 501)

  let client: ReturnType<typeof getWaffoClient>
  try {
    client = getWaffoClient(c.env)
  } catch {
    return c.json({ error: 'Billing not configured' }, 501)
  }

  // Bind the purchase to the logged-in app user when a valid token is present, so
  // the webhook can link the subscription to their account (buyer_identity).
  const user = await getAuthUser(c.env, c.req.header('Authorization'))

  // Trials de-duplicate on a stable, merchant-controlled buyer identity. An
  // anonymous checkout lets the buyer self-report any email and re-claim the
  // trial, so a trial requires an authenticated identity to bind against.
  if (withTrial === true && !user) return c.json({ error: 'Sign in to start a free trial' }, 401)

  const buyerEmail = body.email ?? user?.email
  const metadata: Record<string, string> = {}
  if (user) metadata['userId'] = user.id
  if (buyerEmail) metadata['buyerEmail'] = buyerEmail

  const successUrl = checkoutSuccessUrl(c.env)
  // Echoed back on webhooks (event.data.orderMetadata) to bind the subscription.
  const orderMetadata = Object.keys(metadata).length > 0 ? metadata : undefined

  try {
    if (user) {
      // Authenticated checkout binds the order to a merchant-controlled buyer
      // identity (user.id). The order stays tied to this identity even if the
      // buyer edits the email on the checkout form, so trials can't be re-farmed.
      const session = await client.checkout.authenticated.create({
        productId,
        currency: 'USD',
        buyerIdentity: user.id,
        buyerEmail,
        successUrl,
        metadata: orderMetadata,
        // Always explicit for subscriptions (true = trial, false = direct upgrade
        // skips the product's default trial); omitted for lifetime.
        ...(withTrial !== undefined ? { withTrial } : {}),
      })
      return c.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId })
    }
    // Anonymous checkout has no stable identity (buyer self-reports email), so a
    // subscription can never grant a trial — `withTrial` is guarded off above and
    // pinned false here; lifetime omits the field entirely.
    const session = await client.checkout.anonymous.create({
      productId,
      currency: 'USD',
      buyerEmail,
      successUrl,
      metadata: orderMetadata,
      ...(withTrial !== undefined ? { withTrial: false } : {}),
    })
    return c.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId })
  } catch (e) {
    return fail(c, 502, 'Failed to create checkout session', e)
  }
})

// Waffo webhook receiver. Verifies the RSA signature over the RAW body, dedups
// on the delivery id, and upserts the subscription. Must respond 200 quickly.
app.post('/api/webhooks/waffo', async (c) => {
  const body = await c.req.text() // raw text — parsing as JSON would break the signature
  const signature = c.req.header('x-waffo-signature')

  let event: WebhookEvent<WebhookEventData>
  try {
    event = verifyWebhook<WebhookEventData>(body, signature)
  } catch {
    return c.text('Invalid signature', 401)
  }

  try {
    if (await isWebhookProcessed(c.env, event.id)) return c.text('OK')
    await recordWebhook(c.env, event.id, event.eventType, subscriptionRecordFromEvent(event))
  } catch (e) {
    return fail(c, 500, 'Webhook processing failed', e)
  }
  return c.text('OK')
})

// Resolve the entitlement plan for the authenticated user (account-bound). The
// desktop client calls this with its Supabase session token. Returns { plan }.
app.get('/api/me/entitlements', async (c) => {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const plan = await getPlanByUserId(c.env, user.id)
    return c.json({ plan })
  } catch (e) {
    return fail(c, 500, 'Failed to resolve entitlements', e)
  }
})

type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof getSubscriptionByUserId>>>

// The signed-in user and their subscription row, or the response to send instead.
async function mySubscription(c: Context<Env>): Promise<{ userId: string; row: SubscriptionRow | undefined } | Response> {
  const user = await getAuthUser(c.env, c.req.header('Authorization'))
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  try {
    return { userId: user.id, row: await getSubscriptionByUserId(c.env, user.id) }
  } catch (e) {
    return fail(c, 500, 'Failed to read subscription', e)
  }
}

function waffoClient(c: Context<Env>) {
  try {
    return getWaffoClient(c.env)
  } catch {
    return null
  }
}

// The signed-in user's subscription for the dashboard: { subscription }, null
// for a user who never bought one.
app.get('/api/me/subscription', async (c) => {
  const me = await mySubscription(c)
  if (me instanceof Response) return me
  return c.json({ subscription: me.row ? subscriptionView(me.row) : null })
})

const STORED_STATUSES: readonly string[] = ['active', 'canceling', 'canceled'] satisfies SubscriptionStatus[]

// Cancel (at period end) or resume the subscription through a Waffo customer
// session, then return the subscription as it now stands.
for (const action of ['cancel', 'resume'] as const) {
  app.post(`/api/me/subscription/${action}`, async (c) => {
    const me = await mySubscription(c)
    if (me instanceof Response) return me
    if (!me.row) return c.json({ error: 'No subscription' }, 404)
    const view = subscriptionView(me.row)
    if (action === 'cancel' ? !canCancel(view) : !canResume(view)) {
      return c.json({ error: action === 'cancel' ? 'Subscription cannot be canceled' : 'Subscription is not canceling' }, 409)
    }
    const client = waffoClient(c)
    if (!client) return c.json({ error: 'Billing not configured' }, 501)
    let status: string
    try {
      status = await (action === 'cancel' ? cancelSubscription : resumeSubscription)(client, me.userId, me.row)
    } catch (e) {
      return fail(c, 502, `Failed to ${action} subscription`, e)
    }
    if (STORED_STATUSES.includes(status)) {
      try {
        await setSubscriptionStatus(c.env, me.row.waffoOrderId, status as SubscriptionStatus)
        view.status = status as SubscriptionStatus
      } catch (e) {
        // Waffo has applied the change; its webhook records it.
        logError(c, 'Failed to record subscription status', e)
      }
    }
    return c.json({ subscription: view })
  })
}

// A link that signs the user into the store's Waffo customer portal (orders,
// subscriptions, payments). It carries a bearer token: not cached, not logged.
app.post('/api/me/subscription/portal', async (c) => {
  const me = await mySubscription(c)
  if (me instanceof Response) return me
  if (!me.row) return c.json({ error: 'No subscription' }, 404)
  const client = waffoClient(c)
  if (!client) return c.json({ error: 'Billing not configured' }, 501)
  try {
    const portalUrl = await customerPortalUrl(client, me.userId, me.row)
    c.header('Cache-Control', 'no-store')
    return c.json({ portalUrl })
  } catch (e) {
    return fail(c, 502, 'Failed to open the billing portal', e)
  }
})

// Legacy email-keyed lookup, kept for the lightweight email-activation fallback.
app.get('/api/entitlements', async (c) => {
  const email = c.req.query('email')
  if (!email) return c.json({ error: 'email is required' }, 400)
  try {
    const plan = await getPlanByEmail(c.env, email)
    return c.json({ plan })
  } catch (e) {
    return fail(c, 500, 'Failed to resolve entitlements', e)
  }
})
