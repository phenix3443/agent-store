import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth/server'
import { StoreClient } from '@as/sdk'
import type { Plan } from '@as/types'
import { UpgradeProButton } from '@/components/UpgradeProButton'

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const PLAN_KEY: Record<Plan, string> = { free: 'planFree', pro: 'planPro', team: 'planTeam' }

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

  const displayName = user.username || user.name || user.email
  const avatarUrl = user.image ?? undefined
  const email = user.email ?? ''

  // The plan comes from the API, authenticated with a Better Auth JWT minted
  // in-process: fetching our own public URL would leave the pod and need the tailnet.
  let token: string | undefined
  try {
    token = (await auth().api.getToken({ headers: h })).token
  } catch {
    token = undefined
  }
  const entResult = token ? await new StoreClient(API_URL).getMyEntitlements(token) : { data: null }
  const plan: Plan = entResult.data?.plan ?? 'free'

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <header className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="flex min-w-0 items-center gap-5">
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 border border-line object-cover sm:h-20 sm:w-20" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[40px] leading-[1.1] tracking-[-0.03em] sm:text-[56px]">{displayName}</h1>
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
        </div>
      </header>
    </div>
  )
}
