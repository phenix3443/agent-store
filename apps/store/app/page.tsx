import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { formatPrice } from '@as/types'
import { getFeaturedItems, getItems, getTopics } from '@/lib/catalog'
import { leadSentence } from '@/lib/item-meta'
import { reviewVerdict } from '@/lib/review'
import { FeaturedPlate } from '@/components/FeaturedPlate'
import { ItemTable } from '@/components/ItemTable'
import { TopicList } from '@/components/TopicList'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.home')
  return { title: { absolute: t('metaTitle') }, description: t('lede') }
}

// mac/win are route handlers that redirect to the newest release asset. Linux ships
// two package formats, so it goes to the download page to pick one.
const DOWNLOADS = [
  { href: '/download/mac', label: 'downloadMac' },
  { href: '/download/win', label: 'downloadWin' },
  { href: '/download#linux', label: 'downloadLinux' },
] as const

export default async function LandingPage() {
  const t = await getTranslations('site.home')
  const [featured, all, topics] = await Promise.all([getFeaturedItems(), getItems({}), getTopics()])

  // The plate shows the stamp only when a package really passed review.
  const lead = featured.find((item) => reviewVerdict(item) === 'passed') ?? featured[0]
  const rest = featured
    .filter((item) => item !== lead)
    .slice(0, 5)
    .map((item) => ({ ...item, description: leadSentence(item.description) }))

  return (
    <div className="px-4 lg:px-10">
      <section className="grid gap-x-16 gap-y-12 border-b border-ink pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:pb-16 lg:pt-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div>
          <h1 className="text-[44px] leading-[1.02] tracking-[-0.035em] [text-wrap:balance] [word-break:keep-all] sm:text-[56px] lg:text-[clamp(60px,5.4vw,88px)] lg:leading-[1]">
            <span className="block">{t('titleA')}</span>
            <span className="block">{t('titleB')}</span>
          </h1>
          <p className="mt-8 max-w-[46ch] text-lg leading-7">{t('lede')}</p>
          <Link href="/store" className="btn btn-primary mt-10">
            {t('browse')}
          </Link>
        </div>

        <section aria-labelledby="home-client" className="self-end border-t border-ink pt-5">
          <h2 id="home-client" className="text-[28px] leading-9 tracking-[-0.015em]">
            {t('clientTitle')}
          </h2>
          <p className="mt-3 text-[15px] leading-6">{t('clientBody')}</p>
          <p className="mt-4 border-t border-line pt-4 text-[13px] leading-5 text-ink-2">
            {t('unsigned')}{' '}
            <Link href="/download#first-run" className="link text-ink">
              {t('unsignedLink')}
            </Link>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {DOWNLOADS.map((d) => (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a key={d.href} href={d.href} className="btn min-h-12 px-5">
                {t(d.label)}
              </a>
            ))}
          </div>
          <p className="mt-5 border-t border-line pt-4 text-sm leading-[22px]">
            <Link href="/pricing" className="link">
              {t('price', { monthly: formatPrice('monthly') })}
            </Link>
          </p>
        </section>
      </section>

      {topics.length > 0 && (
        <section aria-labelledby="home-topics" className="py-14 lg:py-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-6">
            <h2 id="home-topics" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
              {t('topicsTitle')}
            </h2>
            <Link href="/topics" className="link inline-flex items-center gap-1.5 text-sm">
              {t('topicsAll', { count: topics.length })}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <TopicList topics={topics} label={t('topicsTitle')} />
        </section>
      )}

      {lead && (
        <section aria-labelledby="home-featured" className="store-shell border-t border-ink py-14 lg:py-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id="home-featured" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
              {t('featuredTitle')}
            </h2>
            <Link href="/store" className="link inline-flex items-center gap-1.5 text-sm">
              {t('featuredAll', { count: all.length })}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="mt-10 grid gap-x-12 gap-y-14 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
            <div className="px-2 sm:px-0">
              <FeaturedPlate item={lead} />
            </div>
            {rest.length > 0 && (
              <div className="min-w-0 xl:border-t xl:border-ink">
                <ItemTable items={rest} wrapDescriptions />
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="home-relay" className="grid gap-x-16 gap-y-6 border-t border-ink py-14 lg:grid-cols-2 lg:py-20">
        <h2 id="home-relay" className="max-w-[16ch] text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
          {t('relayTitle')}
        </h2>
        <div className="lg:pt-3">
          <p className="max-w-[56ch] text-[15px] leading-[26px]">{t('relayBody')}</p>
          <Link href="/docs#relay" className="link mt-6 inline-flex items-center gap-1.5 text-sm">
            {t('relayDocs')}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}
