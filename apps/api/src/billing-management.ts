import type { WaffoPancake } from '@waffo/pancake-ts'

/** The part of the Waffo client the dashboard's billing actions use. */
export type BillingClient = {
  auth: Pick<WaffoPancake['auth'], 'issueSessionToken' | 'createCustomerPortalLink'>
  customer: (token: string, options: { environment: 'test' | 'prod' }) => Pick<
    ReturnType<WaffoPancake['customer']>,
    'cancelSubscription' | 'reactivateSubscription'
  >
}

/** The stored order a billing action applies to. */
export interface BillingOrder {
  waffoOrderId: string
  waffoStoreId: string
  mode: string
}

// A customer session only reaches orders placed under its buyerIdentity, so
// Waffo itself refuses an order that is not this user's.
async function customerSession(client: BillingClient, userId: string, order: BillingOrder) {
  const { token } = await client.auth.issueSessionToken({ storeId: order.waffoStoreId, buyerIdentity: userId })
  return client.customer(token, { environment: order.mode === 'test' ? 'test' : 'prod' })
}

/** Cancels at period end: Waffo answers `canceling` for an active subscription. */
export async function cancelSubscription(client: BillingClient, userId: string, order: BillingOrder): Promise<string> {
  const session = await customerSession(client, userId, order)
  const { status } = await session.cancelSubscription({ orderId: order.waffoOrderId })
  return status
}

/** Withdraws a pending cancellation; Waffo answers `active`. */
export async function resumeSubscription(client: BillingClient, userId: string, order: BillingOrder): Promise<string> {
  const session = await customerSession(client, userId, order)
  const { status } = await session.reactivateSubscription({ orderId: order.waffoOrderId })
  return status
}

/** A link into the store's Waffo customer portal, signed in as this user. It carries a bearer token: never log it. */
export async function customerPortalUrl(client: BillingClient, userId: string, order: BillingOrder): Promise<string> {
  const { portalUrl } = await client.auth.createCustomerPortalLink({ storeId: order.waffoStoreId, buyerIdentity: userId })
  return portalUrl
}
