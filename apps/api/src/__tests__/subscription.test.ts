import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateAppDb } from '../migrate'
import { getDb } from '../db/client'
import { subscriptions } from '../db/schema'
import { recordWebhook } from '../subscription-queries'
import type { SubscriptionRecord } from '../billing'

// Waffo is replaced by a recorder: no request reaches the payment API.
type Call = { method: string; args: unknown[] }
let calls: Call[] = []
let configured = true
let failWith: Error | null = null
let cancelStatus = 'canceling'

function record(method: string, ...args: unknown[]) {
  calls.push({ method, args })
  if (failWith) throw failWith
}

mock.module('../waffo', () => ({
  proProductId: () => undefined,
  checkoutSuccessUrl: () => undefined,
  trialFlag: () => undefined,
  getWaffoClient: () => {
    if (!configured) throw new Error('Missing Waffo config')
    return {
      auth: {
        issueSessionToken: async (params: unknown) => {
          record('issueSessionToken', params)
          return { token: 'session-token', expiresAt: '2026-11-14T00:05:00.000Z' }
        },
        createCustomerPortalLink: async (params: unknown) => {
          record('createCustomerPortalLink', params)
          return { portalUrl: 'https://pancake.waffo.ai/consumer/portal/store/STO_1#token=secret', expiresAt: '' }
        },
      },
      customer: (token: string, options: unknown) => ({
        cancelSubscription: async (params: { orderId: string }) => {
          record('cancelSubscription', token, options, params)
          return { orderId: params.orderId, status: cancelStatus }
        },
        reactivateSubscription: async (params: { orderId: string }) => {
          record('reactivateSubscription', token, options, params)
          return { orderId: params.orderId, status: 'active' }
        },
      }),
    }
  },
}))

mock.module('../auth', () => ({
  getAuthUser: async (_env: unknown, authHeader: string | undefined | null) => {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
    return token ? { id: token, email: `${token}@app.co` } : null
  },
}))

const { app } = await import('../app')

let dir: string
let env: { APP_DB_PATH: string }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'subscription-'))
  env = { APP_DB_PATH: join(dir, 'app.db') }
  migrateAppDb(env.APP_DB_PATH)
  calls = []
  configured = true
  failWith = null
  cancelStatus = 'canceling'
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function sub(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    waffoOrderId: 'ORD_1',
    buyerEmail: 'user-1@app.co',
    buyerIdentity: 'user-1',
    plan: 'pro',
    status: 'active',
    productName: 'Pro Monthly',
    storeId: 'STO_1',
    mode: 'test',
    eventTimestamp: '2026-11-01T00:00:00.000Z',
    billingPeriod: 'monthly',
    currentPeriodEnd: '2026-12-01',
    ...overrides,
  }
}

let delivery = 0
async function seed(...records: SubscriptionRecord[]) {
  for (const r of records) await recordWebhook(env, `d${delivery++}`, 'subscription.activated', r)
}

function call(method: 'GET' | 'POST', path: string, user?: string) {
  const headers: Record<string, string> = {}
  if (user) headers['authorization'] = `Bearer ${user}`
  return app.fetch(new Request(`http://localhost${path}`, { method, headers }), env)
}

function stored() {
  return getDb(env).select().from(subscriptions).get()
}

test.each([
  ['GET', '/api/me/subscription'],
  ['POST', '/api/me/subscription/cancel'],
  ['POST', '/api/me/subscription/resume'],
  ['POST', '/api/me/subscription/portal'],
] as const)('%s %s needs a signed-in user', async (method, path) => {
  const res = await call(method, path)
  expect(res.status).toBe(401)
})

test('a user who never bought gets a null subscription', async () => {
  const res = await call('GET', '/api/me/subscription', 'user-1')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ subscription: null })
})

test('the subscription shows plan, status, period and period end, and only the caller’s', async () => {
  await seed(sub(), sub({ waffoOrderId: 'ORD_2', buyerIdentity: 'user-2', billingPeriod: 'yearly' }))
  const res = await call('GET', '/api/me/subscription', 'user-1')
  expect(await res.json()).toEqual({
    subscription: { plan: 'pro', status: 'active', period: 'monthly', currentPeriodEnd: '2026-12-01' },
  })
})

test('a renewal receipt without period fields keeps the stored period', async () => {
  await seed(sub())
  await recordWebhook(env, 'receipt', 'subscription.payment_succeeded', sub({
    eventTimestamp: '2026-11-02T00:00:00.000Z',
    billingPeriod: null,
    currentPeriodEnd: null,
  }))
  const body = (await (await call('GET', '/api/me/subscription', 'user-1')).json()) as { subscription: Record<string, unknown> }
  expect(body.subscription['period']).toBe('monthly')
  expect(body.subscription['currentPeriodEnd']).toBe('2026-12-01')
})

test('a lifetime purchase outranks a newer canceled subscription', async () => {
  await seed(
    sub({ waffoOrderId: 'ORD_LIFE', billingPeriod: 'lifetime', currentPeriodEnd: null, eventTimestamp: '2026-10-01T00:00:00.000Z' }),
    sub({ status: 'canceled', eventTimestamp: '2026-11-05T00:00:00.000Z' })
  )
  const body = (await (await call('GET', '/api/me/subscription', 'user-1')).json()) as { subscription: Record<string, unknown> }
  expect(body.subscription['period']).toBe('lifetime')
  expect(await (await call('GET', '/api/me/entitlements', 'user-1')).json()).toEqual({ plan: 'pro' })
})

test('cancel goes through a customer session bound to the user and the order’s environment', async () => {
  await seed(sub())
  const res = await call('POST', '/api/me/subscription/cancel', 'user-1')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    subscription: { plan: 'pro', status: 'canceling', period: 'monthly', currentPeriodEnd: '2026-12-01' },
  })
  expect(calls).toEqual([
    { method: 'issueSessionToken', args: [{ storeId: 'STO_1', buyerIdentity: 'user-1' }] },
    { method: 'cancelSubscription', args: ['session-token', { environment: 'test' }, { orderId: 'ORD_1' }] },
  ])
  expect(stored()?.status).toBe('canceling')
  // Still Pro until the period ends.
  expect(await (await call('GET', '/api/me/entitlements', 'user-1')).json()).toEqual({ plan: 'pro' })
})

test('the webhook for the same cancel still applies after the local update', async () => {
  await seed(sub())
  await call('POST', '/api/me/subscription/cancel', 'user-1')
  await recordWebhook(env, 'canceling', 'subscription.canceling', sub({
    status: 'canceling',
    eventTimestamp: '2026-11-03T00:00:00.000Z',
    currentPeriodEnd: '2026-12-02',
  }))
  expect(stored()?.currentPeriodEnd).toBe('2026-12-02')
})

test('a status the table does not allow is returned but not stored', async () => {
  await seed(sub())
  cancelStatus = 'expired'
  const res = await call('POST', '/api/me/subscription/cancel', 'user-1')
  expect(res.status).toBe(200)
  expect(stored()?.status).toBe('active')
})

test.each([
  ['a lifetime purchase', { billingPeriod: 'lifetime' }],
  ['a canceling subscription', { status: 'canceling' as const }],
  ['a canceled subscription', { status: 'canceled' as const }],
  ['a past-due subscription', { status: 'past_due' as const }],
])('cancel refuses %s without calling Waffo', async (_name, overrides) => {
  await seed(sub(overrides))
  const res = await call('POST', '/api/me/subscription/cancel', 'user-1')
  expect(res.status).toBe(409)
  expect(calls).toEqual([])
})

test('resume only applies to a canceling subscription, and makes it active', async () => {
  await seed(sub())
  expect((await call('POST', '/api/me/subscription/resume', 'user-1')).status).toBe(409)
  expect(calls).toEqual([])

  await seed(sub({ status: 'canceling', eventTimestamp: '2026-11-02T00:00:00.000Z' }))
  const res = await call('POST', '/api/me/subscription/resume', 'user-1')
  expect(res.status).toBe(200)
  expect(((await res.json()) as { subscription: { status: string } }).subscription.status).toBe('active')
  expect(calls.map((c) => c.method)).toEqual(['issueSessionToken', 'reactivateSubscription'])
  expect(stored()?.status).toBe('active')
})

test('the portal link is for the user’s store and identity, and is not cached', async () => {
  await seed(sub())
  const res = await call('POST', '/api/me/subscription/portal', 'user-1')
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({ portalUrl: 'https://pancake.waffo.ai/consumer/portal/store/STO_1#token=secret' })
  expect(calls).toEqual([{ method: 'createCustomerPortalLink', args: [{ storeId: 'STO_1', buyerIdentity: 'user-1' }] }])
})

test.each(['cancel', 'resume', 'portal'])('%s answers 404 for a user without a subscription', async (action) => {
  const res = await call('POST', `/api/me/subscription/${action}`, 'user-1')
  expect(res.status).toBe(404)
  expect(calls).toEqual([])
})

test('without Waffo credentials the actions answer 501', async () => {
  await seed(sub())
  configured = false
  expect((await call('POST', '/api/me/subscription/cancel', 'user-1')).status).toBe(501)
  expect((await call('POST', '/api/me/subscription/portal', 'user-1')).status).toBe(501)
})

test('a Waffo failure answers 502 with a request id, and nothing changes', async () => {
  await seed(sub())
  failWith = new Error('gateway timeout')
  const res = await call('POST', '/api/me/subscription/cancel', 'user-1')
  expect(res.status).toBe(502)
  expect(((await res.json()) as { requestId?: string }).requestId).toBeTruthy()
  expect(stored()?.status).toBe('active')
  expect((await call('POST', '/api/me/subscription/portal', 'user-1')).status).toBe(502)
})
