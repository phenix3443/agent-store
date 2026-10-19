import { expect, test } from 'bun:test'
import { cancelBillingSubscription, requestBillingRefund, type ManageableBillingOrder } from '../billing-management'

function order(overrides: Partial<ManageableBillingOrder> = {}): ManageableBillingOrder {
  return {
    waffoOrderId: 'ORD_1',
    waffoPaymentId: 'PAY_1',
    paidAmount: '9.99',
    currency: 'USD',
    storeId: 'STO_1',
    billingPeriod: 'monthly',
    status: 'active',
    ...overrides,
  }
}

function fakeClient() {
  const calls: Array<{ method: string; args: unknown }> = []
  const buyer = {
    cancelSubscription: async (args: unknown) => {
      calls.push({ method: 'cancelSubscription', args })
      return { orderId: 'ORD_1', status: 'canceling' }
    },
    createRefundTicket: async (args: unknown) => {
      calls.push({ method: 'createRefundTicket', args })
      return { ticket: { id: 'TKT_1', status: 'pending' } }
    },
  }
  return {
    calls,
    client: {
      auth: {
        issueSessionToken: async (args: unknown) => {
          calls.push({ method: 'issueSessionToken', args })
          return { token: 'buyer-token', expiresAt: '2026-07-22T01:00:00Z' }
        },
      },
      buyer: (token: string) => {
        calls.push({ method: 'buyer', args: token })
        return buyer
      },
    },
  }
}

test('cancelBillingSubscription uses a buyer token scoped to the signed-in user and stored order', async () => {
  const { client, calls } = fakeClient()
  const result = await cancelBillingSubscription(client, 'user-1', order())

  expect(result).toEqual({ orderId: 'ORD_1', status: 'canceling' })
  expect(calls).toContainEqual({
    method: 'issueSessionToken',
    args: { storeId: 'STO_1', buyerIdentity: 'user-1' },
  })
  expect(calls).toContainEqual({ method: 'cancelSubscription', args: { orderId: 'ORD_1' } })
})

test('cancelBillingSubscription rejects a lifetime order', async () => {
  const { client } = fakeClient()
  expect(cancelBillingSubscription(client, 'user-1', order({ billingPeriod: null }))).rejects.toThrow(
    'Only subscriptions can be canceled'
  )
})

test('requestBillingRefund submits the stored payment total and currency', async () => {
  const { client, calls } = fakeClient()
  const result = await requestBillingRefund(client, 'user-1', order(), 'The product did not work for my use case.')

  expect(result).toEqual({ ticketId: 'TKT_1', status: 'pending' })
  expect(calls).toContainEqual({
    method: 'createRefundTicket',
    args: {
      paymentId: 'PAY_1',
      reason: 'The product did not work for my use case.',
      requestedAmount: { amount: '9.99', currency: 'USD' },
    },
  })
})

test('requestBillingRefund rejects an order without payment details', async () => {
  const { client } = fakeClient()
  expect(requestBillingRefund(client, 'user-1', order({ waffoPaymentId: null }), 'Refund please')).rejects.toThrow(
    'Payment details are unavailable'
  )
})
