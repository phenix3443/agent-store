import { StoreClient } from '@as/sdk'
import type { MySubscription } from '@as/types'
import { auth } from '@/lib/auth/server'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

// Authenticated with a Better Auth JWT minted in-process: fetching our own
// public URL would leave the pod and need the tailnet.
export async function apiToken(h: Headers): Promise<string | null> {
  try {
    return (await auth().api.getToken({ headers: h })).token
  } catch {
    return null
  }
}

/** `undefined` when the subscription could not be read. */
export async function loadSubscription(token: string | null): Promise<MySubscription | null | undefined> {
  if (!token) return undefined
  try {
    const result = await new StoreClient(API_URL).getMySubscription(token)
    return result.data ? result.data.subscription : undefined
  } catch {
    return undefined
  }
}

/** Waffo sends the period end as a date or a timestamp; shown as the UTC calendar date. */
export function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

type Translate = (key: string, values?: Record<string, string>) => string

/** The dashboard's one-line state of a subscription, with `t` on `site.dashboard`. */
export function statusLine(sub: MySubscription, endDate: string | null, t: Translate): string {
  const dated = (key: string) => (endDate ? t(`line.${key}`, { date: endDate }) : t(`line.${key}Undated`))
  if (sub.status === 'canceling') return dated('canceling')
  if (sub.status === 'canceled') return dated('canceled')
  if (sub.status === 'past_due') return t('line.pastDue')
  if (sub.period === 'lifetime') return t('line.lifetime')
  return dated('renews')
}
