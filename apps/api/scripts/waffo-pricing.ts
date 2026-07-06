/**
 * Adjust Pro pricing: monthly $7, yearly $70, and add a one-time Lifetime $99.
 *   WAFFO_MERCHANT_ID=... WAFFO_PRIVATE_KEY_PATH=/abs/key.pem WAFFO_STORE_ID=STO_... \
 *   WAFFO_MONTHLY_ID=PROD_... WAFFO_YEARLY_ID=PROD_... bun run scripts/waffo-pricing.ts
 */
import { readFileSync } from 'fs'
import { WaffoPancake } from '@waffo/pancake-ts'

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Set ${k}`)
  return v
}
const client = new WaffoPancake({
  merchantId: env('WAFFO_MERCHANT_ID'),
  privateKey: readFileSync(env('WAFFO_PRIVATE_KEY_PATH'), 'utf-8'),
})

await client.subscriptionProducts.update({
  id: env('WAFFO_MONTHLY_ID'),
  prices: { USD: { amount: '7.00', taxIncluded: true, taxCategory: 'saas' } },
})
await client.subscriptionProducts.update({
  id: env('WAFFO_YEARLY_ID'),
  prices: { USD: { amount: '70.00', taxIncluded: true, taxCategory: 'saas' } },
})

const lifetime = await client.onetimeProducts.create({
  storeId: env('WAFFO_STORE_ID'),
  name: 'Pro Lifetime',
  description: 'One-time purchase — Pro features forever (local analytics, budgets, smart routing, key rotation).',
  prices: { USD: { amount: '99.00', taxIncluded: true, taxCategory: 'software' } },
})

console.log('---RESULT---')
console.log('monthly -> $7.00, yearly -> $70.00')
console.log('LIFETIME_PRODUCT_ID=' + lifetime.product.id)
