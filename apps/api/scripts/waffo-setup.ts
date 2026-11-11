/**
 * Waffo Pancake setup for the AgentStore store: creates the Pro subscription
 * products if they are missing and points the webhook at this deployment.
 * Safe to re-run; existing products are reused and an existing webhook is updated.
 *   pnpm --filter @as/types build
 *   WAFFO_MERCHANT_ID=... WAFFO_PRIVATE_KEY_BASE64=... \
 *   [WAFFO_STORE_NAME=AgentStore] [WAFFO_WEBHOOK_URL=...] [WAFFO_TEST=true] \
 *   bun run scripts/waffo-setup.ts [--dry-run]
 */
import { PRICING } from '@as/types'
import { getWaffoClient } from '../src/waffo'

const storeName = process.env['WAFFO_STORE_NAME'] ?? 'AgentStore'
const webhookUrl = process.env['WAFFO_WEBHOOK_URL'] ?? 'https://agent-store-test.panghuli.tech/api/webhooks/waffo'
const testMode = process.env['WAFFO_TEST'] !== 'false'
const dryRun = process.argv.includes('--dry-run')
const events = [
  'order.completed', 'subscription.activated', 'subscription.payment_succeeded',
  'subscription.canceling', 'subscription.uncanceled', 'subscription.updated',
  'subscription.canceled', 'subscription.past_due',
]

type Webhook = { id: string; channel: string; url: string; testMode: boolean; events: string[] }
type Store = { id: string; name: string; storeWebhooks: Webhook[] }

const client = getWaffoClient()

const res = await client.graphql.query<{ stores: Store[] }>({
  query: `query { stores { id name storeWebhooks { id channel url testMode events } } }`,
})
const stores = res.data?.stores ?? []
// The merchant owns stores for other projects too, so never fall back to the first one.
const store = stores.find((s) => s.name === storeName)
if (!store) throw new Error(`No store named ${storeName}; found: ${stores.map((s) => s.name).join(', ')}`)
console.log('store:', store.id, store.name, dryRun ? '(dry run)' : '')

const existing = await client.graphql.query<{ subscriptionProducts: Array<{ id: string; name: string }> }>({
  query: `query ($storeId: String!) { subscriptionProducts(storeId: $storeId) { id name } }`,
  variables: { storeId: store.id },
})
const products = existing.data?.subscriptionProducts ?? []

async function ensureProduct(storeId: string, name: string, period: 'monthly' | 'yearly'): Promise<string> {
  const found = products.find((p) => p.name === name)
  if (found) return found.id
  if (dryRun) return `(would create ${name})`
  const price = PRICING[period]
  const created = await client.subscriptionProducts.create({
    storeId, name, billingPeriod: period as never,
    prices: { USD: { amount: price.amount, taxIncluded: true, taxCategory: price.taxCategory } },
    metadata: { trialDays: PRICING.trialDays },
  })
  return created.product.id
}

const monthlyId = await ensureProduct(store.id, 'Pro Monthly', 'monthly')
const yearlyId = await ensureProduct(store.id, 'Pro Yearly', 'yearly')

const hook = store.storeWebhooks.find((w) => w.channel === 'http' && w.testMode === testMode)
const sameEvents = hook !== undefined && [...hook.events].sort().join() === [...events].sort().join()
if (hook && hook.url === webhookUrl && sameEvents) {
  console.log('webhook unchanged:', hook.id)
} else if (hook) {
  console.log(`webhook ${hook.id}: ${hook.url} -> ${webhookUrl}`)
  if (!dryRun) await client.webhooks.update({ id: hook.id, url: webhookUrl, events: events as never })
} else {
  console.log('webhook: add', webhookUrl)
  if (!dryRun) await client.webhooks.add({ storeId: store.id, channel: 'http', url: webhookUrl, testMode, events: events as never })
}

console.log('---RESULT---')
console.log('STORE_ID=' + store.id)
console.log('MONTHLY_PRODUCT_ID=' + monthlyId)
console.log('YEARLY_PRODUCT_ID=' + yearlyId)
console.log('WEBHOOK=' + webhookUrl + ' (test=' + testMode + ')')
