import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { X } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth/server'
import { StoreClient } from '@as/sdk'
import type { Item, Plan } from '@as/types'
import { formatDownloads } from '@/lib/item-meta'
import { PendingIcon } from '@/components/ReviewStatus'
import { UpgradeProButton } from '@/components/UpgradeProButton'

// All catalog/publisher data goes through the standalone API server.
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const STATUS_KEY: Record<Item['status'], string> = {
  published: 'statusPublished',
  pending: 'statusPending',
  rejected: 'statusRejected',
}

const PLAN_KEY: Record<Plan, string> = { free: 'planFree', pro: 'planPro', team: 'planTeam' }

/** Shape, not colour: a filled square for published, a dashed ring while in review, a cross when rejected. */
function StatusMark({ status, label }: { status: Item['status']; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" data-status={status}>
      {status === 'published' && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="2" y="2" width="8" height="8" fill="currentColor" />
        </svg>
      )}
      {status === 'pending' && <PendingIcon size={16} />}
      {status === 'rejected' && <X size={14} aria-hidden />}
      <span className={status === 'pending' ? 'text-ink-2' : ''}>{label}</span>
    </span>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.dashboard')
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function DashboardPage() {
  const h = await headers()
  const session = await auth().api.getSession({ headers: h })
  const user = session?.user
  if (!user) redirect('/')

  const t = await getTranslations('site.dashboard')
  const tc = await getTranslations('store.category')

  const githubUsername = user.username ?? undefined
  if (!githubUsername) {
    return (
      <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
        <h1 className="text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">{t('noUsernameTitle')}</h1>
        <p className="mt-6 max-w-[56ch] border-t border-ink pt-6 text-[15px] leading-6 text-ink-2">{t('noUsernameBody')}</p>
      </div>
    )
  }

  const avatarUrl = user.image ?? undefined
  const email = user.email ?? ''

  // Fetch this publisher's submissions and plan via the API server, authenticated
  // with a Better Auth JWT (the API resolves the publisher from its username
  // claim). Minted in-process: fetching our own public URL would leave the pod
  // and need the tailnet.
  let token: string | undefined
  try {
    token = (await auth().api.getToken({ headers: h })).token
  } catch {
    token = undefined
  }
  const client = new StoreClient(API_URL)
  const [itemsResult, entResult] = token
    ? await Promise.all([client.getMyItems(token), client.getMyEntitlements(token)])
    : [{ data: [] as Item[], error: null }, { data: null, error: null }]

  const items: Item[] = itemsResult.data ?? []
  const plan: Plan = entResult.data?.plan ?? 'free'

  const totalItems = items.length
  const totalDownloads = items.reduce((sum, it) => sum + it.downloads, 0)
  const pendingCount = items.filter((it) => it.status === 'pending').length
  const publishedCount = items.filter((it) => it.status === 'published').length

  const stats = [
    { label: t('statItems'), value: String(totalItems) },
    { label: t('statInstalls'), value: formatDownloads(totalDownloads) },
    { label: t('statPending'), value: String(pendingCount) },
    { label: t('statPublished'), value: String(publishedCount) },
  ]
  const head = 'label px-3 py-0 text-left font-normal'

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <header className="grid gap-x-10 gap-y-6 border-b border-ink pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="flex min-w-0 items-center gap-5">
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 border border-line object-cover sm:h-20 sm:w-20" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[40px] leading-[1.1] tracking-[-0.03em] sm:text-[56px]">{githubUsername}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
              <span>
                {t('plan')} <b className="font-mono font-medium text-ink">{t(PLAN_KEY[plan])}</b>
              </span>
              {email && <span className="truncate">{email}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          {plan === 'free' ? (
            <UpgradeProButton className="btn min-h-12 px-5">{t('upgrade')}</UpgradeProButton>
          ) : (
            <span className="text-sm text-ink-2">{t('proActive')}</span>
          )}
          <Link href="/store?publish=1" className="btn btn-primary">
            {t('publish')}
          </Link>
        </div>
      </header>

      <dl aria-label={t('statsLabel')} className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div key={stat.label} className={`py-6 ${i % 2 === 1 ? 'border-l border-line pl-5' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} lg:border-l lg:pl-6 lg:first:border-l-0 lg:first:pl-0`}>
            <dt className="label">{stat.label}</dt>
            <dd className="mt-3 font-mono text-[40px] leading-none tracking-[-0.02em]">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="submissions" className="mt-14">
        <h2 id="submissions" className="border-b border-ink pb-3 text-[22px] leading-7">
          {t('submissions')}
        </h2>
        {items.length > 0 ? (
          <>
          <ul className="md:hidden">
            {items.map((item) => (
              <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-line py-4 text-sm">
                <span className="break-all font-mono font-medium">{item.name}</span>
                <span className="text-right font-mono">{formatDownloads(item.downloads)}</span>
                <span className="text-[13px] text-ink-2">
                  {tc(item.category)} · v{item.version}
                </span>
                <span className="justify-self-end">
                  <StatusMark status={item.status} label={t(STATUS_KEY[item.status] ?? 'statusPending')} />
                </span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="h-9 border-b border-line">
                  <th className={head}>{t('colName')}</th>
                  <th className={head}>{t('colCategory')}</th>
                  <th className={head}>{t('colVersion')}</th>
                  <th className={`${head} text-right`}>{t('colInstalls')}</th>
                  <th className={`${head} text-right`}>{t('colRating')}</th>
                  <th className={head}>{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="h-16 border-b border-line">
                    <td className="px-3 font-mono font-medium">{item.name}</td>
                    <td className="label px-3">{tc(item.category)}</td>
                    <td className="px-3 font-mono text-ink-2">v{item.version}</td>
                    <td className="px-3 text-right font-mono">{formatDownloads(item.downloads)}</td>
                    <td className="px-3 text-right font-mono">{(item.reviewCount ?? 0) > 0 ? item.rating.toFixed(1) : '–'}</td>
                    <td className="px-3">
                      <StatusMark status={item.status} label={t(STATUS_KEY[item.status] ?? 'statusPending')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="border-b border-line py-14">
            <p className="text-lg font-medium">{t('emptyTitle')}</p>
            <p className="mt-1.5 max-w-[56ch] text-sm leading-[22px] text-ink-2">{t('emptyBody')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
