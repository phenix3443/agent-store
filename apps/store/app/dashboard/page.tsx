import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Check, CreditCard, Heart, User } from 'lucide-react'
import { StoreClient } from '@as/sdk'
import type { FavoriteEntry, Plan } from '@as/types'
import { auth } from '@/lib/auth/server'
import { enabledLoginProviders } from '@/lib/auth/providers'
import { LoginGate } from '@/components/LoginGate'
import { KindTile } from '@/components/KindTile'
import { RemoveFavoriteButton } from '@/components/Favorites'
import { resourceHref } from '@/lib/resource'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const PLAN_LABEL: Record<Plan, string> = { free: 'Free', pro: 'Pro', team: 'Team' }
const PROVIDER_LABEL: Record<string, string> = { github: 'GitHub', google: 'Google' }
const TABS = [
  { id: 'account', icon: User },
  { id: 'subscription', icon: CreditCard },
  { id: 'favorites', icon: Heart },
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

async function loadFavorites(h: Headers): Promise<FavoriteEntry[] | null> {
  try {
    const { token } = await auth().api.getToken({ headers: h })
    const result = await new StoreClient(API_URL).listFavorites(token)
    return result.data?.favorites ?? null
  } catch {
    return null
  }
}

type T = (key: string, values?: Record<string, string | number>) => string

function FavoritesCard({ favorites, t, ts }: { favorites: FavoriteEntry[] | null; t: T; ts: T }) {
  if (!favorites) {
    return (
      <section className="card" role="status">
        <h2 className="dash-h">{t('tab.favorites')}</h2>
        <p className="text-[15px] text-fg-2">{t('favError')}</p>
      </section>
    )
  }
  return (
    <section className="card">
      <h2 className="dash-h">
        {t('tab.favorites')}
        <span className="label font-normal">{t('favCount', { count: favorites.length })}</span>
      </h2>
      {favorites.length === 0 ? (
        <div className="grid justify-items-center gap-2 px-4 py-10 text-center">
          <p className="text-[17px] font-bold">{t('favEmptyTitle')}</p>
          <p className="text-[15px] text-fg-2">{t('favEmptyBody')}</p>
          <Link href="/store" className="btn btn-primary btn-sm mt-3">
            {t('favEmptyAction')}
          </Link>
        </div>
      ) : (
        <ul className="fav-list">
          {favorites.map(({ id, resource: r }) => (
            <li key={id} data-kind={r?.kind}>
              {r ? <KindTile kind={r.kind} /> : <span aria-hidden className="kind-tile opacity-40" />}
              <div className="min-w-0">
                <p className="truncate font-bold">{r?.name ?? id}</p>
                <p className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg-3">
                  {r ? (
                    <>
                      <span className="kind">{ts(`category.${r.kind}`)}</span>
                      <span className="truncate">{r.author?.name ?? ts('list.unknownAuthor')}</span>
                    </>
                  ) : (
                    <span>{t('favGone')}</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r && (
                  <Link href={resourceHref(r)} className="btn" aria-label={t('favViewLabel', { name: r.name })}>
                    {t('favView')}
                  </Link>
                )}
                <RemoveFavoriteButton id={id} name={r?.name ?? id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
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
  const tab: Tab = TABS.find((x) => x.id === rawTab)?.id ?? 'account'
  const [plan, methods, favorites, ts] = await Promise.all([
    loadPlan(h),
    loadSignInMethods(h),
    tab === 'favorites' ? loadFavorites(h) : Promise.resolve(null),
    getTranslations('store'),
  ])
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
            {tab === 'favorites' ? (
              <FavoritesCard favorites={favorites} t={t} ts={ts} />
            ) : tab === 'account' ? (
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
