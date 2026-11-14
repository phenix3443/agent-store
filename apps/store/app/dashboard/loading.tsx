import { getTranslations } from 'next-intl/server'
import { SubscriptionSkeleton } from '@/components/SubscriptionSkeleton'

export default async function DashboardLoading() {
  const t = await getTranslations('site.dashboard')
  return (
    <section className="page-hero">
      <div className="wrap">
        <h1 className="h1 mb-9">{t('title')}</h1>
        <SubscriptionSkeleton label={t('loading')} />
      </div>
    </section>
  )
}
