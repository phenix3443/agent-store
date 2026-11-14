'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { StoreClient } from '@as/sdk'
import { PRICING, formatPrice, type BillingPeriod, type SubscriptionPeriod, type SubscriptionStatus } from '@as/types'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const PERIODS: BillingPeriod[] = ['monthly', 'yearly', 'lifetime']

// Free / Pro per row of the comparison; `failover` shows how many providers a failover spans.
// Matches the Entitlements in @as/types and FREE_MAX_UPSTREAMS in client-core relay/server.ts.
const COMPARE: ('yes-yes' | 'no-yes' | 'failover')[] = ['yes-yes', 'yes-yes', 'failover', 'yes-yes', 'no-yes', 'no-yes', 'no-yes', 'no-yes']

/** A subscription the signed-in user still holds; `line` is the dashboard's sentence for it. */
export interface OwnedPlan {
  period: SubscriptionPeriod | null
  status: Exclude<SubscriptionStatus, 'canceled'>
  line: string
}

// Checkout always opens a new Waffo order, so an owner is never offered one: a second
// period or lifetime would be bought alongside the subscription, not instead of it.
export function PricingPlans({ owned }: { owned: OwnedPlan | null }) {
  const t = useTranslations('site.pricing')
  const tm = useTranslations('site.marketing')
  const td = useTranslations('site.dashboard')
  const [period, setPeriod] = useState<BillingPeriod>(owned?.period ?? 'monthly')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const lifetime = period === 'lifetime'
  const days = PRICING.trialDays
  const price = formatPrice(period)
  const per = t(`per.${period}`)
  const ownsLifetime = owned?.period === 'lifetime'
  const current = owned != null && (owned.period === period || (owned.period == null && !lifetime))
  const proChip = owned && current
    ? owned.status === 'past_due'
      ? { label: td('status.past_due'), warn: true }
      : { label: t('current') }
    : owned
      ? undefined
      : { label: lifetime ? t('chipLifetime') : t('chipTrial', { days }) }
  const proSubline = owned && current
    ? owned.line
    : owned
      ? ownsLifetime
        ? t('ownedLifetime')
        : t('ownedSubscription', { plan: owned.period ? `Pro · ${t(owned.period)}` : 'Pro' })
      : lifetime
        ? t('lifetimeSub')
        : t('proSub', { days, price, per })

  async function checkout(trial: boolean) {
    const key = trial ? `${period}-trial` : period
    if (busy) return
    setBusy(key)
    setError(false)
    try {
      const token = await getAuthToken()
      const result = await new StoreClient(API_URL).createCheckout({ period, trial }, { token: token ?? undefined })
      if (result.data?.checkoutUrl) window.open(result.data.checkoutUrl, '_blank', 'noopener,noreferrer')
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const compareRows = t.raw('compare.rows') as string[]

  return (
    <>
      <section className="relative pb-[clamp(36px,5vw,64px)] pt-[clamp(64px,9vw,120px)] text-center">
        <div className="wrap">
          <h1 className="h1 mb-[18px]">
            {t('title')}
            <span className="dim">{t('dim')}</span>
          </h1>
          <p className="lede mx-auto">{t('lede')}</p>
          <div className="mt-8">
            <div role="group" aria-label={t('period')} className="seg">
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {t(p)}
                </button>
              ))}
            </div>
          </div>
          <p className="cap mt-3 min-h-[1.6em]">{t(`note.${period}`)}</p>

          {error && (
            <p role="alert" className="mt-4 text-sm text-bad">
              {t('failed')}
            </p>
          )}

          <div className="mx-auto mt-11 grid max-w-[900px] gap-5 text-left md:grid-cols-2">
            <Plan
              name={t('free')}
              price="$0"
              per={t('freePrice')}
              sub={t('freeSub')}
              features={t.raw('freeFeatures') as string[]}
            >
              <Link href="/download" className="btn mt-auto">
                {tm('downloadFree')}
              </Link>
            </Plan>
            <Plan
              pro
              name={t('pro')}
              chip={proChip}
              price={price}
              per={per}
              sub={proSubline}
              features={t.raw(lifetime ? 'lifetimeFeatures' : 'proFeatures') as string[]}
            >
              <div className="mt-auto grid gap-2.5">
                {owned ? (
                  <Link href="/dashboard?tab=subscription" className="btn btn-primary">
                    {ownsLifetime ? t('viewPlan') : t('manage')}
                  </Link>
                ) : lifetime ? (
                  <button type="button" onClick={() => checkout(false)} disabled={busy != null} className="btn btn-primary">
                    {busy === 'lifetime' ? t('working') : t('buy')}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => checkout(true)} disabled={busy != null} className="btn btn-primary">
                      {busy === `${period}-trial` ? t('working') : t('trial', { days })}
                    </button>
                    <button type="button" onClick={() => checkout(false)} disabled={busy != null} className="btn min-h-11">
                      {busy === period ? t('working') : t('upgrade')}
                    </button>
                  </>
                )}
              </div>
            </Plan>
          </div>
          <p className="cap mt-[22px]">{t('merchant')}</p>
        </div>
      </section>

      <section aria-labelledby="pricing-compare" className="section-tight">
        <div className="mx-auto w-[min(820px,100%-2*clamp(16px,4vw,32px))]">
          <h2 id="pricing-compare" className="h2 mb-7">
            {t('compare.title')}
            <span className="dim">{t('compare.dim')}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="col">{t('compare.feature')}</th>
                  <th scope="col">{t('free')}</th>
                  <th scope="col">{t('pro')}</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row, i) => {
                  const kind = COMPARE[i]
                  return (
                    <tr key={row}>
                      <th scope="row" className="font-normal">
                        {row}
                      </th>
                      {kind === 'failover' ? (
                        <>
                          <td className="font-mono">{t('compare.failoverFree')}</td>
                          <td className="font-bold text-fg">{t('compare.failoverPro')}</td>
                        </>
                      ) : (
                        <>
                          <Cell yes={kind === 'yes-yes'} yesLabel={t('compare.yes')} noLabel={t('compare.no')} />
                          <Cell yes yesLabel={t('compare.yes')} noLabel={t('compare.no')} />
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}

function Cell({ yes, yesLabel, noLabel }: { yes: boolean; yesLabel: string; noLabel: string }) {
  return yes ? (
    <td className="font-bold text-fg">{yesLabel}</td>
  ) : (
    <td className="text-fg-3">
      <span aria-hidden>—</span>
      <span className="sr-only">{noLabel}</span>
    </td>
  )
}

function Plan({
  name,
  chip,
  price,
  per,
  sub,
  features,
  pro = false,
  children,
}: {
  name: string
  chip?: { label: string; warn?: boolean }
  price: string
  per: string
  sub: string
  features: string[]
  pro?: boolean
  children: React.ReactNode
}) {
  return (
    <section aria-label={name} className={`plan ${pro ? 'plan-pro' : ''}`}>
      <h2 className="flex items-center justify-between gap-3 text-xl font-bold">
        {name}
        {chip && <span className={chip.warn ? 'chip chip-warn' : 'chip'}>{chip.label}</span>}
      </h2>
      <p className="mt-4 flex flex-wrap items-baseline gap-2">
        <span className="text-[44px] font-extrabold leading-none tracking-[-0.02em]">{price}</span>
        <span className="text-sm text-fg-2">{per}</span>
      </p>
      <p className="mt-2 min-h-[3.3em] text-sm text-fg-3">{sub}</p>
      <ul className="mb-7 mt-5 grid gap-3">
        {features.map((f) => (
          <li key={f} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 text-[15px] text-fg-2">
            <Check size={18} aria-hidden className="mt-[3px] text-fg" />
            {f}
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}
