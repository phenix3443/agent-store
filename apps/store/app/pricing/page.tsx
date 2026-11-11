'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { StoreClient } from '@as/sdk'
import { PRICING, formatPrice } from '@as/types'
import { getAuthToken } from '@/lib/auth/token'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

type Period = 'monthly' | 'yearly'
type Plan = Period | 'lifetime'

export default function PricingPage() {
  const t = useTranslations('site.pricing')
  const [period, setPeriod] = useState<Period>('yearly')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function checkout(plan: Plan, trial = false) {
    const key = trial ? `${plan}-trial` : plan
    if (busy) return
    setBusy(key)
    setError(false)
    try {
      const token = await getAuthToken()
      const result = await new StoreClient(API_URL).createCheckout({ period: plan, trial }, { token: token ?? undefined })
      if (result.data?.checkoutUrl) window.open(result.data.checkoutUrl, '_blank', 'noopener,noreferrer')
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const per = period === 'monthly' ? t('perMonth') : t('perYear')

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <header className="grid gap-x-10 gap-y-5 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,46ch)] lg:items-end">
        <h1 className="text-[44px] leading-none tracking-[-0.03em] sm:text-[56px] lg:text-[88px]">{t('title')}</h1>
        <p className="max-w-[52ch] text-[15px] leading-6 text-ink-2">{t('lede')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
        <div role="group" aria-label={t('period')} className="inline-flex border border-ink">
          {(['monthly', 'yearly'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className="min-h-10 px-4 caps text-xs transition-colors hover:bg-sel aria-pressed:bg-ink aria-pressed:text-on-ink"
            >
              {t(p)}
            </button>
          ))}
        </div>
        {period === 'yearly' && <span className="text-sm text-ink-2">{t('yearlyNote')}</span>}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {t('failed')}
        </p>
      )}

      <div className="grid border-t border-ink md:grid-cols-3">
        <Plan name={t('free')} price="$0" sub={t('freeSub')} features={t.raw('freeFeatures') as string[]}>
          <Link href="/store" className="btn min-h-12 w-full px-5">
            {t('startFree')}
          </Link>
        </Plan>

        <Plan name={t('pro')} price={formatPrice(period)} sub={per} features={t.raw('proFeatures') as string[]} emphasis>
          <button
            type="button"
            onClick={() => checkout(period, true)}
            disabled={busy != null}
            className="btn btn-primary w-full"
          >
            {busy === `${period}-trial` ? t('working') : t('trial', { days: PRICING.trialDays })}
          </button>
          <button type="button" onClick={() => checkout(period)} disabled={busy != null} className="btn mt-2.5 min-h-10 w-full">
            {busy === period ? t('working') : t('upgrade')}
          </button>
          <p className="mt-3 text-[13px] leading-5 text-ink-2">
            {t('trialNote', { days: PRICING.trialDays, price: formatPrice(period), per })}
          </p>
        </Plan>

        <Plan name={t('lifetime')} price={formatPrice('lifetime')} sub={t('lifetimeSub')} features={t.raw('lifetimeFeatures') as string[]}>
          <button type="button" onClick={() => checkout('lifetime')} disabled={busy != null} className="btn min-h-12 w-full px-5">
            {busy === 'lifetime' ? t('working') : t('buy')}
          </button>
        </Plan>
      </div>

      <p className="mt-8 max-w-[70ch] text-[13px] leading-5 text-ink-2">{t('merchant')}</p>
    </div>
  )
}

function Plan({
  name,
  price,
  sub,
  features,
  emphasis,
  children,
}: {
  name: string
  price: string
  sub: string
  features: string[]
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={name}
      className={`flex flex-col border-b border-line py-8 md:border-b-0 md:px-6 md:first:pl-0 md:last:pr-0 md:[&:not(:first-child)]:border-l ${emphasis ? 'bg-plate md:!px-6' : ''} ${emphasis ? 'px-4 md:px-6' : ''}`}
    >
      <h2 className={`text-[22px] leading-7 ${emphasis ? 'font-medium' : ''}`}>{name}</h2>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[44px] leading-none tracking-[-0.02em]">{price}</span>
        <span className="text-sm text-ink-2">{sub}</span>
      </p>
      <ul className="mb-8 mt-7 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 border-t border-line py-2.5 text-sm leading-[22px] last:border-b">
            <Check size={15} aria-hidden className="mt-[3px] shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      {children}
    </section>
  )
}
