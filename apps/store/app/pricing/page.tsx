import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { PricingPlans, type OwnedPlan } from '@/components/marketing/PricingPlans'
import { apiToken, formatDate, loadSubscription, statusLine } from '@/lib/subscription'

// Read per request from the session cookie, so the page is never shared between visitors.
// Anything short of a subscription the user still holds, a failed read included, shows
// the page as signed out.
async function ownedPlan(): Promise<OwnedPlan | null> {
  const token = await apiToken(await headers())
  const sub = await loadSubscription(token)
  if (!sub || sub.status === 'canceled') return null
  const [t, locale] = await Promise.all([getTranslations('site.dashboard'), getLocale()])
  return { period: sub.period, status: sub.status, line: statusLine(sub, formatDate(sub.currentPeriodEnd, locale), t) }
}

export default async function PricingPage() {
  return <PricingPlans owned={await ownedPlan()} />
}
