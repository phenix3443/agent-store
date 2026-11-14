import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { ResourceKind, ResourceSummary } from '@as/types'
import { listResources } from '@/lib/catalog'
import { desktopOsFromUserAgent } from '@/lib/desktop-os'
import { getLatestRelease, RELEASES_PAGE } from '@/lib/latest-release'
import { CatalogShelf } from '@/components/marketing/CatalogShelf'
import { SHELF_KINDS } from '@/components/marketing/shelf'
import { FeatureKeys } from '@/components/marketing/FeatureKeys'
import { Cta, DownloadButton, SupportedAgents } from '@/components/marketing/Marketing'
import { ProductDemo } from '@/components/marketing/ProductDemo'
import { AppShot, SHOTS, WindowFrame } from '@/components/marketing/Window'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.home')
  return { title: { absolute: t('metaTitle') }, description: t('metaDescription') }
}

const SHELF_SIZE = 10
const NO_SAMPLES: Record<ResourceKind, ResourceSummary[]> = { skill: [], mcp: [], provider: [] }

async function shelfSamples(): Promise<Record<ResourceKind, ResourceSummary[]>> {
  const pages = await Promise.all(
    SHELF_KINDS.map((kind) => listResources({ kind, q: '', sort: 'default' }, 0, SHELF_SIZE).catch(() => null)),
  )
  return Object.fromEntries(
    SHELF_KINDS.map((k, i) => {
      const page = pages[i]
      return [k, page?.ok ? page.resources : []]
    }),
  ) as Record<ResourceKind, ResourceSummary[]>
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const t = await getTranslations('site.home')
  const tm = await getTranslations('site.marketing')
  // ?state=empty|error open the degraded states for screenshots and review.
  const { state } = await searchParams
  const [samples, release, requestHeaders] = await Promise.all([
    state === 'empty' ? NO_SAMPLES : shelfSamples(),
    state === 'error' ? null : getLatestRelease(),
    headers(),
  ])
  const visitorOs = desktopOsFromUserAgent(requestHeaders.get('user-agent'))
  const version = release?.version ?? null

  return (
    <>
      <section className="hero">
        <div aria-hidden className="beams">
          <i />
          <i />
          <i />
        </div>
        <div aria-hidden className="horizon" />
        <div className="wrap relative">
          <h1 aria-label={t('titlePlain')} className="h-hero hero-title mx-auto mb-[22px] max-w-[14em]">
            <span aria-hidden>{t('titleA')}</span>
            {t('titleComma') && (
              <span aria-hidden className="hero-comma">
                {t('titleComma')}
              </span>
            )}
            <span aria-hidden className="text-grad">
              {t('titleB')}
            </span>
          </h1>
          <p className="lede mx-auto mb-3 max-w-[38em]">{t('lede')}</p>
          <p className="mx-auto mb-[30px] text-[13.5px] text-fg-3">{tm('supLine')}</p>
          <DownloadButton visitorOs={visitorOs} />
          <div className="cap mt-[18px] flex flex-col items-center gap-1">
            <span>
              {version && `${version} · `}
              {tm('platforms')}
            </span>
            <span className="flex flex-wrap justify-center gap-y-0.5">
              <Link href="/docs#cli">{t('cli')}</Link>
              <i aria-hidden className="mx-2 not-italic text-line-strong">
                |
              </i>
              <a href={release?.url ?? RELEASES_PAGE}>{t('allReleases')}</a>
              <i aria-hidden className="mx-2 not-italic text-line-strong">
                |
              </i>
              <Link href="/store">{t('browse')}</Link>
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="home-demo" className="section">
        <div className="wrap">
          <h2 id="home-demo" className="h2 mb-[clamp(36px,5vw,64px)] text-center">
            {t('demo.title')}
            <span className="dim">{t('demo.dim')}</span>
          </h2>
          <ProductDemo />
          <p className="cap text-center">{tm('shotNote')}</p>
        </div>
      </section>

      <section aria-labelledby="home-keys" className="section">
        <div className="wrap split">
          <div className="stack">
            <h2 id="home-keys" className="h2">
              {t('keys.title')}
              <span className="dim">{t('keys.dim')}</span>
            </h2>
            <SupportedAgents />
            <p className="!mt-[26px] flex flex-wrap items-center gap-[18px]">
              <DownloadButton visitorOs={visitorOs} small />
              <Link href="/client" className="link inline-flex items-center gap-1.5 font-semibold text-fg">
                {t('keys.more')}
                <ArrowRight size={15} aria-hidden />
              </Link>
            </p>
          </div>
          <FeatureKeys />
        </div>
      </section>

      <section aria-labelledby="home-manage" className="section-tight">
        <div className="wrap split split-rev">
          <div className="stack">
            <h2 id="home-manage" className="h2">
              {t('manage.title')}
              <span className="dim">{t('manage.dim')}</span>
            </h2>
            <p className="lede">{t('manage.lede')}</p>
            <p>
              <Link href="/client" className="link inline-flex items-center gap-1.5 font-semibold text-fg">
                {t('manage.link')}
                <ArrowRight size={15} aria-hidden />
              </Link>
            </p>
          </div>
          <WindowFrame title={t('manage.window')} kind="skill">
            <AppShot shot={SHOTS.skillsNarrow} alt={t('manage.alt')} sizes="(min-width: 900px) 640px, 100vw" />
          </WindowFrame>
        </div>
      </section>

      <section aria-labelledby="home-catalog" className="section !pb-0">
        <CatalogShelf samples={samples} />
      </section>

      <Cta visitorOs={visitorOs} version={version} />
    </>
  )
}
