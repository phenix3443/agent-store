import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Check, CreditCard, User } from 'lucide-react'
import { StoreClient } from '@as/sdk'
import type { Plan } from '@as/types'
import { auth } from '@/lib/auth/server'
import { enabledLoginProviders } from '@/lib/auth/providers'
import { LoginGate } from '@/components/LoginGate'

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

async function loadPlan(h: Headers): Promise<Plan | null> {
  // Authenticated with a Better Auth JWT minted in-process: fetching our own
  // public URL would leave the pod and need the tailnet.
  try {
    const { token } = await auth().api.getToken({ headers: h })
    const result = await new StoreClient(API_URL).getMyEntitlements(token)
    return result.data?.plan ?? null
  } catch {
    return null
  }
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
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

  const { tab: rawTab } = await searchParams
  const tab: Tab = rawTab === 'subscription' ? 'subscription' : 'account'
  const [plan, methods] = await Promise.all([loadPlan(h), loadSignInMethods(h)])
  const tp = await getTranslations('site.pricing')
  const displayName = user.username || user.name || user.email
  const paid = plan != null && plan !== 'free'

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
            ) : plan == null ? (
              <section className="card" role="status">
                <h2 className="dash-h">{t('plan')}</h2>
                <p className="text-[15px] text-fg-2">{t('planError')}</p>
              </section>
            ) : paid ? (
              <>
                <section className="card plan-card">
                  <h2 className="dash-h">
                    {t('plan')}
                    <span className="chip">{t('active')}</span>
                  </h2>
                  <p className="plan-big">{PLAN_LABEL[plan]}</p>
                  <p className="mt-1.5 text-[15px] text-fg-2">
                    {t.rich('manage', {
                      mail: (chunks) => (
                        <a href="mailto:support@panghuli.tech" className="link text-fg">
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                </section>
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
                <section className="card">
                  <h2 className="dash-h">{t('billing')}</h2>
                  <Rows rows={[[t('merchant'), 'Waffo']]} />
                </section>
              </>
            ) : (
              <section className="card">
                <h2 className="dash-h">{t('plan')}</h2>
                <p className="plan-big">Free</p>
                <p className="mb-4 mt-1.5 text-[15px] text-fg-2">{t('freeBody')}</p>
                <Link href="/pricing" className="btn btn-primary">
                  {t('upgrade')}
                </Link>
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
