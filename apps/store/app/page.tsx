import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { formatPrice } from '@as/types'
import { getItems } from '@/lib/catalog'
import { desktopOsFromUserAgent } from '@/lib/desktop-os'
import { getLatestRelease } from '@/lib/latest-release'
import { DownloadSection } from '@/components/landing/DownloadSection'
import { Faq } from '@/components/landing/Faq'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { HeroDownload } from '@/components/landing/HeroDownload'
import { InstallMap, type MapCategory, type MapSample } from '@/components/landing/InstallMap'
import { Screenshot } from '@/components/landing/Screenshot'
import { SHOTS } from '@/components/landing/shots'
import { Sources } from '@/components/landing/Sources'
import { TerminalDemo } from '@/components/landing/TerminalDemo'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.home')
  return { title: { absolute: t('metaTitle') }, description: t('lede') }
}

const MAP_CATEGORIES: MapCategory[] = ['skill', 'mcp', 'provider']
const TRUST = ['preview', 'restore', 'keys'] as const

async function mapSamples(): Promise<Record<MapCategory, MapSample | null>> {
  const lists = await Promise.all(MAP_CATEGORIES.map((category) => getItems({ category }).catch(() => [])))
  return Object.fromEntries(
    MAP_CATEGORIES.map((c, i) => {
      const item = lists[i][0]
      return [c, item ? { name: item.name, slug: item.slug, tools: item.compatibleWith } : null]
    }),
  ) as Record<MapCategory, MapSample | null>
}

const NO_SAMPLES: Record<MapCategory, MapSample | null> = { skill: null, mcp: null, provider: null }

function SectionHead({ id, title, lede }: { id: string; title: string; lede?: string }) {
  return (
    <div className="grid gap-x-16 gap-y-4 lg:grid-cols-2 lg:items-end">
      <h2 id={id} className="max-w-[18ch] text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
        {title}
      </h2>
      {lede && <p className="max-w-[56ch] text-[15px] leading-[26px] text-ink-2">{lede}</p>}
    </div>
  )
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const t = await getTranslations('site.home')
  // ?state=empty|error open the degraded states for screenshots and review (frontend-build step 8).
  const { state } = await searchParams
  const [samples, release, requestHeaders] = await Promise.all([
    state === 'empty' ? NO_SAMPLES : mapSamples(),
    state === 'error' ? null : getLatestRelease(),
    headers(),
  ])
  const visitorOs = desktopOsFromUserAgent(requestHeaders.get('user-agent'))

  return (
    <div className="px-4 lg:px-10">
      <section className="grid gap-x-14 gap-y-12 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pb-20 lg:pt-16">
        <div className="min-w-0">
          <h1 className="text-[44px] leading-[1.02] tracking-[-0.035em] [text-wrap:balance] [word-break:keep-all] sm:text-[56px] lg:text-[clamp(56px,4.8vw,80px)] lg:leading-[1]">
            <span className="block">{t('titleA')}</span>
            <span className="block">{t('titleB')}</span>
          </h1>
          <p className="mt-7 max-w-[46ch] text-lg leading-7">{t('lede')}</p>
          <Link href="/store" className="btn btn-primary mt-9">
            {t('browse')}
          </Link>

          <div className="mt-8 max-w-[34rem] border-t border-line pt-5">
            <p className="text-[13px] leading-5 text-ink-2">
              {t('unsigned')}{' '}
              <Link href="/download#first-run" className="link text-ink">
                {t('unsignedLink')}
              </Link>
            </p>
            <div className="mt-4">
              <HeroDownload visitorOs={visitorOs} />
            </div>
          </div>
          <p className="mt-6 text-sm leading-[22px]">
            <Link href="/pricing" className="link">
              {t('price', { monthly: formatPrice('monthly') })}
            </Link>
          </p>
        </div>

        <div className="min-w-0 px-2 sm:px-0 lg:pt-2">
          <Screenshot shot={SHOTS.hero} alt={t('heroShotAlt')} marks priority sizes="(min-width: 1024px) 55vw, 100vw" />
          <ul aria-label={t('trustLabel')} className="mt-10 border-t border-line">
            {TRUST.map((key) => (
              <li key={key} className="flex gap-3 border-b border-line py-3 text-[15px] leading-6">
                <Check size={16} aria-hidden className="mt-1 shrink-0" />
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="home-map" className="border-t border-ink py-14 lg:py-20">
        <SectionHead id="home-map" title={t('map.title')} lede={t('map.lede')} />
        <InstallMap samples={samples} />
      </section>

      <section aria-labelledby="home-terminal" className="grid gap-x-16 gap-y-8 border-t border-ink py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-20">
        <div>
          <h2 id="home-terminal" className="max-w-[16ch] text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
            {t('terminal.title')}
          </h2>
          <p className="mt-4 max-w-[48ch] text-[15px] leading-[26px] text-ink-2">{t('terminal.lede')}</p>
          <p className="mt-4 max-w-[48ch] text-sm leading-[22px] text-ink-2">{t('terminal.note')}</p>
        </div>
        <TerminalDemo />
      </section>

      <section aria-labelledby="home-features" className="border-t border-ink py-14 lg:py-20">
        <SectionHead id="home-features" title={t('features.title')} lede={t('features.lede')} />
        <FeatureGrid />
      </section>

      <section aria-labelledby="home-sources" className="border-t border-ink py-14 lg:py-20">
        <SectionHead id="home-sources" title={t('sources.title')} lede={t('sources.lede')} />
        <Sources />
      </section>

      <section aria-labelledby="home-faq" className="grid gap-x-16 gap-y-8 border-t border-ink py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-20">
        <h2 id="home-faq" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
          {t('faq.title')}
        </h2>
        <Faq />
      </section>

      <DownloadSection release={release} visitorOs={visitorOs} />
    </div>
  )
}
