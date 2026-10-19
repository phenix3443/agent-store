export interface ManageableBillingOrder {
  waffoOrderId: string
  waffoPaymentId: string | null
  paidAmount: string | null
  currency: string | null
  storeId: string
  billingPeriod: string | null
  status: string
}

interface BuyerSession {
  cancelSubscription(params: { orderId: string }): Promise<{ orderId: string; status: string }>
  createRefundTicket(params: {
    paymentId: string
    reason: string
    requestedAmount: { amount: string; currency: string }
  }): Promise<{ ticket: { id: string; status: string } }>
}

interface BillingClient {
  auth: {
    issueSessionToken(params: { storeId: string; buyerIdentity: string }): Promise<{ token: string }>
  }
  buyer(token: string): BuyerSession
}

async function buyerSession(client: BillingClient, userId: string, storeId: string): Promise<BuyerSession> {
  const { token } = await client.auth.issueSessionToken({ storeId, buyerIdentity: userId })
  return client.buyer(token)
}

export async function cancelBillingSubscription(
  client: BillingClient,
  userId: string,
  order: ManageableBillingOrder
): Promise<{ orderId: string; status: string }> {
  if (!order.billingPeriod) throw new Error('Only subscriptions can be canceled')
  const buyer = await buyerSession(client, userId, order.storeId)
  return buyer.cancelSubscription({ orderId: order.waffoOrderId })
}

export async function requestBillingRefund(
  client: BillingClient,
  userId: string,
  order: ManageableBillingOrder,
  reason: string
): Promise<{ ticketId: string; status: string }> {
  if (!order.waffoPaymentId || !order.paidAmount || !order.currency) {
    throw new Error('Payment details are unavailable')
  }
  const buyer = await buyerSession(client, userId, order.storeId)
  const { ticket } = await buyer.createRefundTicket({
    paymentId: order.waffoPaymentId,
    reason,
    requestedAmount: { amount: order.paidAmount, currency: order.currency },
  })
  return { ticketId: ticket.id, status: ticket.status }
}
