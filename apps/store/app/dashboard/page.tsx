import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { Check, CreditCard, User } from 'lucide-react'
import { StoreClient } from '@as/sdk'
import type { MySubscription, Plan } from '@as/types'
import { auth } from '@/lib/auth/server'
import { enabledLoginProviders } from '@/lib/auth/providers'
import { LoginGate } from '@/components/LoginGate'
import { BillingPortalButton, SubscriptionActions } from '@/components/SubscriptionActions'
import { SubscriptionSkeleton } from '@/components/SubscriptionSkeleton'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' }
const PROVIDER_LABEL: Record<string, string> = { github: 'GitHub', google: 'Google' }
const TABS = [
  { id: 'account', icon: User },
  { id: 'subscription', icon: CreditCard },
] as const
type Tab = (typeof TABS)[number]['id']

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.dashboard')
  return { title: t('metaTitle'), robots: { index: false } }
}

// Authenticated with a Better Auth JWT minted in-process: fetching our own
// public URL would leave the pod and need the tailnet.
async function apiToken(h: Headers): Promise<string | null> {
  try {
    return (await auth().api.getToken({ headers: h })).token
  } catch {
    return null
  }
}

async function loadPlan(token: string | null): Promise<Plan | null> {
  if (!token) return null
  try {
    const result = await new StoreClient(API_URL).getMyEntitlements(token)
    return result.data?.plan ?? null
  } catch {
    return null
  }
}

/** `undefined` when the subscription could not be read. */
async function loadSubscription(token: string | null): Promise<MySubscription | null | undefined> {
  if (!token) return undefined
  try {
    const result = await new StoreClient(API_URL).getMySubscription(token)
    return result.data ? result.data.subscription : undefined
  } catch {
    return undefined
  }
}

/** Waffo sends the period end as a date or a timestamp; shown as the UTC calendar date. */
function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'long', timeZone: 'UTC' }).format(date)
}

async function loadSignInMethods(h: Headers): Promise<string[]> {
  try {
    const accounts = await auth().api.listUserAccounts({ headers: h })
    return [...new Set(accounts.map((a) => PROVIDER_LABEL[a.providerId] ?? a.providerId))]
  } catch {
    return []
  }
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; state?: string }>
}) {
  const h = await headers()
  const t = await getTranslations('site.dashboard')
  const session = await auth()
    .api.getSession({ headers: h })
    .catch(() => null)
  const user = session?.user

  if (!user) {
    return (
      <section className="page-hero">
        <div className="wrap">
          <LoginGate providers={enabledLoginProviders()} />
        </div>
      </section>
    )
  }

  const { tab: rawTab, state } = await searchParams
  const tab: Tab = rawTab === 'subscription' ? 'subscription' : 'account'
  const token = await apiToken(h)
  const [plan, methods, subscription] = await Promise.all([
    loadPlan(token),
    loadSignInMethods(h),
    tab === 'subscription' ? loadSubscription(token) : null,
  ])
  const tp = await getTranslations('site.pricing')
  const locale = await getLocale()
  const displayName = user.username || user.name || user.email

  return (
    <section className="page-hero">
      <div className="wrap">
        <h1 className="h1 mb-9">
          {t('title')}
          <span className="dim">
            {displayName}
            {plan && ` · ${PLAN_LABEL[plan]}`}
          </span>
        </h1>
        <div className="dash">
          <nav aria-label={t('tabs')} className="dash-tabs">
            {TABS.map(({ id, icon: Icon }) => (
              <Link key={id} href={`/dashboard?tab=${id}`} aria-current={id === tab ? 'page' : undefined}>
                <Icon size={17} aria-hidden />
                {t(`tab.${id}`)}
              </Link>
            ))}
          </nav>

          <div className="grid min-w-0 content-start gap-4">
            {tab === 'account' ? (
              <>
                <section className="card">
                  <h2 className="dash-h">{t('tab.account')}</h2>
                  <Rows
                    rows={[
                      [t('name'), displayName],
                      ...(user.email ? ([[t('email'), user.email]] as [string, string][]) : []),
                      ...(methods.length ? ([[t('signIn'), methods.join(' · ')]] as [string, string][]) : []),
                      [
                        t('plan'),
                        <>
                          {plan ? PLAN_LABEL[plan] : t('planUnknown')}
                          <Link href="/dashboard?tab=subscription" className="link ml-3 text-fg-2">
                            {t('view')}
                          </Link>
                        </>,
                      ],
                    ]}
                  />
                </section>
                <section className="card">
                  <h2 className="dash-h">{t('logoutTitle')}</h2>
                  <p className="mb-3.5 text-[15px] text-fg-2">{t('logoutBody')}</p>
                  <a href="/auth/logout" className="btn">
                    {t('logout')}
                  </a>
                </section>
              </>
            ) : state === 'loading' ? (
              <SubscriptionSkeleton label={t('loading')} />
            ) : subscription === undefined || state === 'error' ? (
              <section className="card" role="alert">
                <h2 className="dash-h">{t('plan')}</h2>
                <p className="mb-4 text-[15px] text-fg-2">{t('planError')}</p>
                <a href="/dashboard?tab=subscription" className="btn btn-sm">
                  {t('retry')}
                </a>
              </section>
            ) : subscription === null ? (
              <section className="card">
                <h2 className="dash-h">{t('plan')}</h2>
                <p className="plan-big">Free</p>
                <p className="mb-4 mt-1.5 text-[15px] text-fg-2">{t('freeBody')}</p>
                <Link href="/pricing" className="btn btn-primary">
                  {t('upgrade')}
                </Link>
              </section>
            ) : (
              <SubscriptionPanel
                subscription={subscription}
                endDate={formatDate(subscription.currentPeriodEnd, locale)}
                t={t}
                tp={tp}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

type Translate = { (key: string, values?: Record<string, string>): string; raw(key: string): unknown }

function statusLine(sub: MySubscription, endDate: string | null, t: Translate): string {
  const dated = (key: string) => (endDate ? t(`line.${key}`, { date: endDate }) : t(`line.${key}Undated`))
  if (sub.status === 'canceling') return dated('canceling')
  if (sub.status === 'canceled') return dated('canceled')
  if (sub.status === 'past_due') return t('line.pastDue')
  if (sub.period === 'lifetime') return t('line.lifetime')
  return dated('renews')
}

function SubscriptionPanel({
  subscription: sub,
  endDate,
  t,
  tp,
}: {
  subscription: MySubscription
  endDate: string | null
  t: Translate
  tp: Translate
}) {
  const ended = sub.status === 'canceled'
  const name = `${PLAN_LABEL[sub.plan]}${sub.period ? ` · ${tp(sub.period)}` : ''}`
  const cancelable = (sub.status === 'active' || sub.status === 'trialing') && sub.period !== 'lifetime'
  return (
    <>
      <section className={ended ? 'card' : 'card plan-card'}>
        <h2 className="dash-h">
          {t('plan')}
          <span className={sub.status === 'canceling' || sub.status === 'past_due' ? 'chip chip-warn' : 'chip'}>
            {t(`status.${sub.status}`)}
          </span>
        </h2>
        <p className="plan-big">{name}</p>
        <p className="mb-4 mt-1.5 text-[15px] text-fg-2">{statusLine(sub, endDate, t)}</p>
        {ended ? (
          <Link href="/pricing" className="btn btn-primary">
            {t('resubscribe')}
          </Link>
        ) : cancelable ? (
          <SubscriptionActions mode="cancel" endDate={endDate} />
        ) : sub.status === 'canceling' ? (
          <SubscriptionActions mode="resume" endDate={endDate} />
        ) : null}
      </section>
      {!ended && (
        <section className="card">
          <h2 className="dash-h">{t('perks')}</h2>
          <ul className="featlist">
            {(tp.raw('proFeatures') as string[]).map((f) => (
              <li key={f}>
                <Check size={18} aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h2 className="dash-h">{t('billing')}</h2>
        <Rows rows={[[t('merchant'), 'Waffo']]} />
        <p className="mt-1 text-sm text-fg-3">{t('portalNote')}</p>
        <BillingPortalButton />
      </section>
    </>
  )
}
