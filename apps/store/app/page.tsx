import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { formatPrice } from '@as/types'
import { getFeaturedItems, getItems, getTopics } from '@/lib/catalog'
import { reviewVerdict } from '@/lib/review'
import { FeaturedPlate } from '@/components/FeaturedPlate'
import { ItemTable } from '@/components/ItemTable'
import { TopicList } from '@/components/TopicList'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.home')
  return { title: { absolute: t('metaTitle') }, description: t('lede') }
}

const RELAY_CODE = '# Claude Code\nANTHROPIC_BASE_URL=http://127.0.0.1:18780'

export default async function LandingPage() {
  const t = await getTranslations('site.home')
  const [featured, all, topics] = await Promise.all([getFeaturedItems(), getItems({}), getTopics()])

  const counts = { skill: 0, mcp: 0, provider: 0 }
  for (const item of all) counts[item.category] += 1
  // The plate shows the stamp only when a package really passed review.
  const lead = featured.find((item) => reviewVerdict(item) === 'passed') ?? featured[0]
  const rest = featured.filter((item) => item !== lead).slice(0, 5)

  const facts = [
    {
      label: t('factCatalog'),
      value: t('factCatalogValue', { total: all.length, ...counts }),
      href: '/store',
    },
    { label: t('factTopics'), value: t('factTopicsValue', { count: topics.length }), href: '/topics' },
    { label: t('factSource'), value: t('factSourceValue') },
    { label: t('factReview'), value: t('factReviewValue') },
    { label: t('factRelay'), value: t('factRelayValue'), href: '/docs#relay' },
    { label: t('factClient'), value: t('factClientValue'), href: '/download' },
    { label: t('factPrice'), value: t('factPriceValue', { monthly: formatPrice('monthly') }), href: '/pricing' },
  ]

  return (
    <div className="px-4 lg:px-10">
      <section className="grid gap-x-16 gap-y-12 border-b border-ink pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:pb-16 lg:pt-20 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div>
          <h1 className="text-[44px] leading-[1.02] tracking-[-0.035em] [text-wrap:balance] [word-break:keep-all] sm:text-[56px] lg:text-[clamp(60px,5.4vw,88px)] lg:leading-[1]">
            <span className="block">{t('titleA')}</span>
            <span className="block">{t('titleB')}</span>
          </h1>
          <p className="mt-8 max-w-[46ch] text-lg leading-7">{t('lede')}</p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            {/* Route handlers that redirect to the newest release asset, not pages. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/download/mac" className="btn btn-primary">
              {t('downloadMac')}
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/download/win" className="btn min-h-12 px-5">
              {t('downloadWin')}
            </a>
            <Link href="/store" className="link ml-2 inline-flex min-h-12 items-center gap-1.5 text-[15px]">
              {t('browse')}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <p className="mt-4 text-[13px] leading-5 text-ink-2">
            {t('unsigned')}{' '}
            <Link href="/download#first-run" className="link text-ink">
              {t('unsignedLink')}
            </Link>
          </p>
        </div>

        <dl aria-label={t('factsLabel')} className="self-end border-b border-line">
          {facts.map((fact, i) => (
            <div
              key={fact.label}
              className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 border-t py-3 text-sm leading-[22px] sm:grid-cols-[7rem_minmax(0,1fr)] ${i === 0 ? 'border-ink' : 'border-line'}`}
            >
              <dt className="label pt-[3px]">{fact.label}</dt>
              <dd>
                {fact.href ? (
                  <Link href={fact.href} className="link">
                    {fact.value}
                  </Link>
                ) : (
                  fact.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {lead && (
        <section aria-labelledby="home-featured" className="store-shell py-14 lg:py-20">
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
                <ItemTable items={rest} />
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="home-relay" className="grid gap-x-16 gap-y-10 border-t border-ink py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <h2 id="home-relay" className="max-w-[16ch] text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
            {t('relayTitle')}
          </h2>
          <p className="mt-6 max-w-[56ch] text-[15px] leading-[26px]">{t('relayBody')}</p>
          <Link href="/docs#relay" className="link mt-6 inline-flex items-center gap-1.5 text-sm">
            {t('relayDocs')}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
        <div className="min-w-0 lg:pt-3">
          <dl className="border-b border-line">
            {[
              [t('relayLevel1'), t('relayLevel1Value')],
              [t('relayLevel2'), t('relayLevel2Value')],
              [t('relayFallback'), t('relayFallbackValue')],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={`grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-t py-3.5 text-[15px] leading-6 sm:grid-cols-[8rem_minmax(0,1fr)] ${i === 0 ? 'border-ink' : 'border-line'}`}
              >
                <dt className="font-mono text-[13px] leading-6 text-ink-2">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <pre className="mt-6 overflow-x-auto border border-ink bg-plate px-4 py-3.5 font-mono text-[13px] leading-6">
            <code>{RELAY_CODE}</code>
          </pre>
        </div>
      </section>

      {topics.length > 0 && (
        <section aria-labelledby="home-topics" className="border-t border-ink py-14 lg:py-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-6">
            <h2 id="home-topics" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
              {t('topicsTitle')}
            </h2>
            <Link href="/topics" className="link inline-flex items-center gap-1.5 text-sm">
              {t('topicsAll')}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <TopicList topics={topics} label={t('topicsTitle')} />
        </section>
      )}

      <section
        aria-labelledby="home-close"
        className="grid gap-x-16 gap-y-8 border-t border-ink py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-20"
      >
        <div>
          <h2 id="home-close" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
            {t('closeTitle')}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-6 text-ink-2">{t('closeBody')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/download/mac" className="btn min-h-12 px-5">
            {t('downloadMac')}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/download/win" className="btn min-h-12 px-5">
            {t('downloadWin')}
          </a>
          <Link href="/pricing" className="link ml-2 text-sm">
            {t('closePricing')}
          </Link>
        </div>
      </section>
    </div>
  )
}
