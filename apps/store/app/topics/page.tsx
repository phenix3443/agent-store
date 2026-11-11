import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getTopics } from '@/lib/catalog'
import { TopicList } from '@/components/TopicList'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.topics')
  return { title: t('metaTitle'), description: t('lede'), alternates: { canonical: '/topics' } }
}

export default async function TopicsPage() {
  const t = await getTranslations('site.topics')
  const topics = await getTopics()

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <header className="grid gap-x-10 gap-y-4 border-b border-ink pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,46ch)] lg:items-end">
        <h1 className="text-[44px] leading-none tracking-[-0.03em] sm:text-[56px] lg:text-[88px]">{t('title')}</h1>
        <p className="max-w-[46ch] text-[15px] leading-6 text-ink-2">{t('lede')}</p>
      </header>

      {topics.length === 0 ? (
        <p className="py-14 text-ink-2">{t('empty')}</p>
      ) : (
        <TopicList topics={topics} label={t('listLabel')} />
      )}
    </div>
  )
}
