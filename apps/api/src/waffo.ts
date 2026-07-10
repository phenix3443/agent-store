import { WaffoPancake } from '@waffo/pancake-ts'

/** Waffo Pancake config, supplied via Cloudflare Workers secrets or local process.env. */
export type WaffoEnv = {
  WAFFO_MERCHANT_ID?: string
  WAFFO_PRIVATE_KEY?: string
  WAFFO_PRIVATE_KEY_BASE64?: string
  WAFFO_PRODUCT_ID_PRO_MONTHLY?: string
  WAFFO_PRODUCT_ID_PRO_YEARLY?: string
  WAFFO_PRODUCT_ID_LIFETIME?: string
  WAFFO_CHECKOUT_SUCCESS_URL?: string
}

export type BillingPlan = 'monthly' | 'yearly' | 'lifetime'

function pickEnv(env: WaffoEnv | undefined, k: keyof WaffoEnv): string | undefined {
  return env?.[k] ?? (typeof process !== 'undefined' ? process.env?.[k] : undefined)
}

/** Resolves the RSA private key, preferring the base64 form (CI/CD-friendly) over the raw PEM. */
function resolvePrivateKey(env?: WaffoEnv): string | undefined {
  const b64 = pickEnv(env, 'WAFFO_PRIVATE_KEY_BASE64')
  if (b64) return Buffer.from(b64, 'base64').toString('utf-8')
  return pickEnv(env, 'WAFFO_PRIVATE_KEY')
}

/** Builds a Waffo client. Throws if the merchant id or private key is missing. */
export function getWaffoClient(env?: WaffoEnv): WaffoPancake {
  const merchantId = pickEnv(env, 'WAFFO_MERCHANT_ID')
  const privateKey = resolvePrivateKey(env)
  if (!merchantId || !privateKey) {
    throw new Error('Missing Waffo config: set WAFFO_MERCHANT_ID and WAFFO_PRIVATE_KEY (or WAFFO_PRIVATE_KEY_BASE64).')
  }
  return new WaffoPancake({ merchantId, privateKey })
}

/** The dashboard product id for a Pro plan, or undefined if unset. */
export function proProductId(env: WaffoEnv | undefined, plan: BillingPlan): string | undefined {
  if (plan === 'lifetime') return pickEnv(env, 'WAFFO_PRODUCT_ID_LIFETIME')
  if (plan === 'yearly') return pickEnv(env, 'WAFFO_PRODUCT_ID_PRO_YEARLY')
  return pickEnv(env, 'WAFFO_PRODUCT_ID_PRO_MONTHLY')
}

/** Optional post-payment redirect URL (falls back to the store's checkout setting when unset). */
export function checkoutSuccessUrl(env?: WaffoEnv): string | undefined {
  return pickEnv(env, 'WAFFO_CHECKOUT_SUCCESS_URL')
}

/**
 * The explicit `withTrial` flag to send to Waffo for a checkout:
 * - subscriptions (monthly/yearly): `true` when a trial was requested, otherwise
 *   `false` — always explicit, so "direct upgrade" skips the product's default
 *   trial (products carry `metadata.trialDays`, and omitting `withTrial` makes
 *   Waffo fall back to that default) instead of silently inheriting it;
 * - lifetime: `undefined` — a one-time product has no trial to toggle, so the
 *   field is omitted entirely.
 */
export function trialFlag(plan: BillingPlan, trial: boolean | undefined): boolean | undefined {
  if (plan === 'lifetime') return undefined
  return trial === true
}
