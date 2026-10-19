import { expect, mock, test } from 'bun:test'
import type { ManageableBillingOrder } from '../billing-management'

let currentOrder: ManageableBillingOrder | null = {
  waffoOrderId: 'ORD_1',
  waffoPaymentId: 'PAY_1',
  paidAmount: '9.99',
  currency: 'USD',
  storeId: 'STO_1',
  billingPeriod: 'monthly',
  status: 'active',
}
let lastAction: { method: string; args: unknown } | null = null

mock.module('../auth', () => ({
  getAuthUser: async (_env: unknown, authHeader: string | undefined | null) =>
    authHeader === 'Bearer good-token' ? { id: 'user-1', email: 'user@app.co' } : null,
}))

mock.module('../subscription-queries', () => ({
  isWebhookProcessed: async () => false,
  markWebhookProcessed: async () => undefined,
  upsertSubscription: async () => undefined,
  getPlanByEmail: async () => 'free',
  getPlanByUserId: async () => 'pro',
  getManageableBillingOrder: async () => currentOrder,
}))

mock.module('../waffo', () => ({
  proProductId: () => 'PROD_1',
  checkoutSuccessUrl: () => undefined,
  trialFlag: () => false,
  getWaffoClient: () => ({
    auth: {
      issueSessionToken: async (args: unknown) => {
        lastAction = { method: 'issueSessionToken', args }
        return { token: 'buyer-token' }
      },
    },
    buyer: () => ({
      cancelSubscription: async (args: unknown) => {
        lastAction = { method: 'cancelSubscription', args }
        return { orderId: 'ORD_1', status: 'canceling' }
      },
      createRefundTicket: async (args: unknown) => {
        lastAction = { method: 'createRefundTicket', args }
        return { ticket: { id: 'TKT_1', status: 'pending' } }
      },
    }),
  }),
}))

const { app } = await import('../app')

function request(path: string, init: RequestInit = {}, authenticated = true) {
  const headers = new Headers(init.headers)
  if (authenticated) headers.set('authorization', 'Bearer good-token')
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }))
}

test('GET /api/me/billing returns the current user billing state without provider IDs', async () => {
  const res = await request('/api/me/billing')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    billing: { paidAmount: '9.99', currency: 'USD', billingPeriod: 'monthly', status: 'active' },
  })
})

test('billing management routes require authentication', async () => {
  const res = await request('/api/me/billing/cancel', { method: 'POST' }, false)
  expect(res.status).toBe(401)
})

test('POST /api/me/billing/cancel cancels the current user subscription', async () => {
  const res = await request('/api/me/billing/cancel', { method: 'POST' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ orderId: 'ORD_1', status: 'canceling' })
  expect(lastAction).toEqual({ method: 'cancelSubscription', args: { orderId: 'ORD_1' } })
})

test('POST /api/me/billing/refund requires a reason', async () => {
  const res = await request('/api/me/billing/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: '  ' }),
  })
  expect(res.status).toBe(400)
})

test('POST /api/me/billing/refund requests a full refund for the current user payment', async () => {
  const res = await request('/api/me/billing/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'The product did not work for my use case.' }),
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ticketId: 'TKT_1', status: 'pending' })
  expect(lastAction).toEqual({
    method: 'createRefundTicket',
    args: {
      paymentId: 'PAY_1',
      reason: 'The product did not work for my use case.',
      requestedAmount: { amount: '9.99', currency: 'USD' },
    },
  })
})

test('billing management returns 404 when the user has no order', async () => {
  currentOrder = null
  const res = await request('/api/me/billing')
  expect(res.status).toBe(404)
})
