import { test, expect } from 'bun:test'
import type { WebhookEvent, WebhookEventData } from '@waffo/pancake-ts'
import {
  statusForEventType,
  isActiveStatus,
  subscriptionRecordFromEvent,
  planForSubscription,
} from '../billing'

function makeEvent(eventType: string, overrides: Partial<WebhookEventData> = {}): WebhookEvent<WebhookEventData> {
  return {
    id: 'DLV_1',
    timestamp: '2026-07-06T00:00:00.000Z',
    eventType,
    eventId: 'PAY_1',
    storeId: 'STO_1',
    storeName: 'My Store',
    mode: 'prod',
    data: {
      orderId: 'ORD_1',
      buyerEmail: 'buyer@example.com',
      currency: 'USD',
      amount: '9.99',
      taxAmount: '0.00',
      ...overrides,
    } as WebhookEventData,
  } as WebhookEvent<WebhookEventData>
}

test('statusForEventType maps subscription events to statuses', () => {
  expect(statusForEventType('subscription.activated')).toBe('active')
  expect(statusForEventType('subscription.payment_succeeded')).toBe('active')
  expect(statusForEventType('subscription.uncanceled')).toBe('active')
  expect(statusForEventType('subscription.updated')).toBe('active')
  expect(statusForEventType('subscription.canceling')).toBe('canceling')
  expect(statusForEventType('subscription.canceled')).toBe('canceled')
  expect(statusForEventType('subscription.past_due')).toBe('past_due')
})

test('order.completed (one-time / lifetime purchase) grants active', () => {
  expect(statusForEventType('order.completed')).toBe('active')
})

test('statusForEventType revokes access after a successful refund', () => {
  expect(statusForEventType('refund.succeeded')).toBe('canceled')
})

test('statusForEventType returns null for unknown events', () => {
  expect(statusForEventType('something.unknown')).toBeNull()
})

test('isActiveStatus grants access through canceling and trialing, not canceled/past_due', () => {
  expect(isActiveStatus('active')).toBe(true)
  expect(isActiveStatus('canceling')).toBe(true)
  expect(isActiveStatus('trialing')).toBe(true)
  expect(isActiveStatus('canceled')).toBe(false)
  expect(isActiveStatus('past_due')).toBe(false)
})

test('subscriptionRecordFromEvent builds a record for a subscription event', () => {
  const record = subscriptionRecordFromEvent(
    makeEvent('subscription.activated', {
      merchantProvidedBuyerIdentity: 'user-42',
      paymentId: 'PAY_1',
      total: '10.89',
      billingPeriod: 'monthly',
    })
  )
  expect(record).toEqual({
    waffoOrderId: 'ORD_1',
    waffoPaymentId: 'PAY_1',
    buyerEmail: 'buyer@example.com',
    buyerIdentity: 'user-42',
    paidAmount: '10.89',
    currency: 'USD',
    billingPeriod: 'monthly',
    plan: 'pro',
    status: 'active',
    productName: null,
    storeId: 'STO_1',
    mode: 'prod',
    eventTimestamp: '2026-07-06T00:00:00.000Z',
  })
})

test('subscriptionRecordFromEvent binds the app userId from orderMetadata over buyer identity', () => {
  const record = subscriptionRecordFromEvent(
    makeEvent('subscription.activated', {
      orderMetadata: { userId: 'user-99', buyerEmail: 'buyer@example.com' },
      merchantProvidedBuyerIdentity: 'ignored',
    })
  )
  expect(record?.buyerIdentity).toBe('user-99')
})

test('subscriptionRecordFromEvent builds an active record for a one-time (lifetime) order', () => {
  const record = subscriptionRecordFromEvent(makeEvent('order.completed'))
  expect(record?.status).toBe('active')
  expect(record?.plan).toBe('pro')
})

test('subscriptionRecordFromEvent revokes the refunded order entitlement', () => {
  const record = subscriptionRecordFromEvent(makeEvent('refund.succeeded'))
  expect(record?.waffoOrderId).toBe('ORD_1')
  expect(record?.status).toBe('canceled')
})

test('planForSubscription grants the plan while active-ish, else free', () => {
  expect(planForSubscription('active', 'pro')).toBe('pro')
  expect(planForSubscription('canceling', 'pro')).toBe('pro')
  expect(planForSubscription('canceled', 'pro')).toBe('free')
  expect(planForSubscription('past_due', 'pro')).toBe('free')
})
