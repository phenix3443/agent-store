import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getTopic } from '@/lib/catalog'
import { ItemTable } from '@/components/ItemTable'

interface TopicPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { slug } = await params
  const topic = await getTopic(slug)
  if (!topic) return {}
  return { title: topic.title, description: topic.description, alternates: { canonical: `/topics/${topic.slug}` } }
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { slug } = await params
  const topic = await getTopic(slug)
  if (!topic) notFound()
  const t = await getTranslations('site.topics')

  return (
    <div className="store-shell px-4 pb-20 lg:px-10">
      <nav aria-label={t('breadcrumb')} className="flex h-14 items-center gap-2 text-sm text-ink-2">
        <Link href="/topics" className="link">
          {t('breadcrumb')}
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate text-ink">
          {topic.title}
        </span>
      </nav>

      <header className="border-b border-ink pb-8 pt-4">
        <h1 className="max-w-[18ch] break-words text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px] lg:text-[72px]">
          {topic.title}
        </h1>
        <p className="mt-5 max-w-[52ch] text-lg leading-7">{topic.description}</p>
      </header>

      <div className="grid gap-x-16 gap-y-10 py-10 lg:grid-cols-[minmax(0,62ch)_minmax(0,1fr)]">
        <p className="max-w-[62ch] text-[15px] leading-[26px]">{topic.intro}</p>
        {topic.capabilities.length > 0 && (
          <section>
            <h2 className="label mb-2">{t('capabilitiesTitle')}</h2>
            <ul>
              {topic.capabilities.map((capability) => (
                <li key={capability} className="flex gap-3 border-t border-line py-2.5 text-[15px] leading-6 last:border-b">
                  <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-ink" />
                  {capability}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-labelledby="topic-packages">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
          <h2 id="topic-packages" className="label text-ink">
            {t('packagesTitle')}
          </h2>
          <span className="font-mono text-xs text-ink-2">{t('packagesCount', { count: topic.packages.length })}</span>
        </div>
        {topic.packages.length > 0 ? (
          <ItemTable items={topic.packages} />
        ) : (
          <p className="border-b border-line py-10 text-sm text-ink-2">{t('packagesEmpty')}</p>
        )}
      </section>

      {topic.related.length > 0 && (
        <section className="mt-14">
          <h2 className="label mb-2">{t('relatedTitle')}</h2>
          <ul className="grid sm:grid-cols-2">
            {topic.related.map((related) => (
              <li key={related.slug} className="border-t border-line last:border-b sm:[&:nth-last-child(-n+2)]:border-b">
                <Link href={`/topics/${related.slug}`} className="flex min-h-14 items-center justify-between gap-4 px-1 text-lg hover:bg-sel sm:pr-6">
                  {related.title}
                  <ArrowRight size={18} aria-hidden className="shrink-0 text-ink-2" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
