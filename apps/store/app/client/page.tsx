import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { installLink } from '@/lib/desktop-link'
import { desktopOsFromUserAgent } from '@/lib/desktop-os'
import { getLatestRelease } from '@/lib/latest-release'
import { Faq } from '@/components/marketing/Faq'
import { Cta, DownloadButton, SupportedAgents } from '@/components/marketing/Marketing'
import { RelayDemo } from '@/components/marketing/RelayDemo'
import { SkillLinks } from '@/components/marketing/SkillLinks'
import { AppShot, SHOTS, WindowFrame } from '@/components/marketing/Window'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.client')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

// A real install link as the store builds it; OpenRouter is one of the built-in providers.
const SAMPLE_LINK = installLink({ slug: 'openrouter', kind: 'provider', id: 'builtin:openrouter' }, 'agent-store')

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="link inline-flex items-center gap-1.5 font-semibold text-fg">
      {children}
      <ArrowRight size={15} aria-hidden />
    </Link>
  )
}

export default async function ClientPage() {
  const t = await getTranslations('site.client')
  const tm = await getTranslations('site.marketing')
  const [release, requestHeaders] = await Promise.all([getLatestRelease(), headers()])
  const visitorOs = desktopOsFromUserAgent(requestHeaders.get('user-agent'))
  const version = release?.version ?? null

  return (
    <>
      <section className="relative pb-[clamp(36px,5vw,64px)] pt-[clamp(64px,9vw,120px)]">
        <div className="wrap split">
          <div className="stack">
            <h1 className="h1">
              {t('title')}
              <span className="dim">{t('dim')}</span>
            </h1>
            <p className="lede">{t('lede')}</p>
            <SupportedAgents />
            <p className="!mt-[26px]">
              <DownloadButton visitorOs={visitorOs} />
            </p>
            <p className="cap">
              {version && `${version} · `}
              {tm('platforms')} · <Link href="/docs/install">{t('installGuide')}</Link>
            </p>
          </div>
          <WindowFrame title={t('heroWindow')}>
            <AppShot shot={SHOTS.skills} alt={t('heroAlt')} sizes="(min-width: 900px) 640px, 100vw" priority />
          </WindowFrame>
        </div>
      </section>

      <section id="library" aria-labelledby="client-library" data-kind="skill" className="section scroll-mt-24">
        <div className="wrap split split-rev">
          <div className="stack">
            <h2 id="client-library" className="h2">
              {t('library.title')}
              <span className="dim">{t('library.dim')}</span>
            </h2>
            <p className="lede">{t('library.lede')}</p>
          </div>
          <WindowFrame title={t('library.window')} kind="skill">
            <SkillLinks />
          </WindowFrame>
        </div>
      </section>

      <section id="mcp" aria-labelledby="client-mcp" data-kind="mcp" className="section-tight scroll-mt-24">
        <div className="wrap split">
          <div className="stack">
            <h2 id="client-mcp" className="h2">
              {t('mcp.title')}
              <span className="dim">{t('mcp.dim')}</span>
            </h2>
            <p className="lede">{t('mcp.lede')}</p>
            <p>
              <MoreLink href="/store?category=mcp&q=context7">{t('mcp.link')}</MoreLink>
            </p>
          </div>
          <WindowFrame title={t('mcp.window')} kind="mcp">
            <AppShot shot={SHOTS.mcp} alt={t('mcp.alt')} sizes="(min-width: 900px) 640px, 100vw" />
          </WindowFrame>
        </div>
      </section>

      <section id="web" aria-labelledby="client-web" className="section-tight scroll-mt-24">
        <div className="wrap">
          <h2 id="client-web" className="h2 mb-12">
            {t('web.title')}
            <span className="dim">{t('web.dim')}</span>
          </h2>
          <ol className="steps">
            <li className="step">
              <h3 className="mb-1.5 text-[17px] font-bold">{t('web.clickTitle')}</h3>
              <p className="text-[14.5px] text-fg-2">{t('web.clickBody')}</p>
              <div className="code-block mt-3 text-xs">
                <pre>{SAMPLE_LINK}</pre>
              </div>
            </li>
            <li className="step">
              <h3 className="mb-1.5 text-[17px] font-bold">{t('web.openTitle')}</h3>
              <p className="text-[14.5px] text-fg-2">{t('web.openBody')}</p>
            </li>
            <li className="step">
              <h3 className="mb-1.5 text-[17px] font-bold">{t('web.noAppTitle')}</h3>
              <p className="text-[14.5px] text-fg-2">{t('web.noAppBody')}</p>
            </li>
          </ol>
        </div>
      </section>

      <section id="relay" aria-labelledby="client-relay" data-kind="provider" className="section-tight scroll-mt-24">
        <div className="wrap">
          <div className="relative overflow-hidden rounded-frame border border-line bg-bg-2 p-[clamp(20px,4vw,44px)]">
            <div className="grid items-center gap-[clamp(24px,4vw,56px)] lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
              <div className="stack min-w-0">
                <h2 id="client-relay" className="h2">
                  {t('relay.title')}
                  <span className="dim">{t('relay.dim')}</span>
                </h2>
                <p className="lede">{t('relay.lede')}</p>
                <p className="text-[14.5px] text-fg-2">{t('relay.plans')}</p>
              </div>
              <div className="min-w-0">
                <RelayDemo />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="usage" aria-labelledby="client-usage" data-kind="provider" className="section-tight scroll-mt-24">
        <div className="wrap split split-rev">
          <div className="stack">
            <h2 id="client-usage" className="h2">
              {t('usage.title')}
              <span className="dim">{t('usage.dim')}</span>
            </h2>
            <p className="lede">{t('usage.lede')}</p>
            <ul className="text-[15px] text-fg-2">
              {(['free', 'pro'] as const).map((k) => (
                <li key={k} className="grid grid-cols-[22px_minmax(0,1fr)] gap-3 border-t border-line py-3.5">
                  <span aria-hidden className="mt-[9px] h-2 w-2 rounded-[2px] bg-provider shadow-[0_0_12px_rgb(var(--provider-rgb)/0.9)]" />
                  <span>{t(`usage.${k}`)}</span>
                </li>
              ))}
            </ul>
            <p>
              <MoreLink href="/pricing">{t('usage.link')}</MoreLink>
            </p>
          </div>
          <WindowFrame title={t('usage.window')} kind="provider">
            <AppShot shot={SHOTS.usage} alt={t('usage.alt')} sizes="(min-width: 900px) 640px, 100vw" />
          </WindowFrame>
        </div>
      </section>

      <section aria-labelledby="client-faq" className="section-tight">
        <div className="wrap split !items-start">
          <h2 id="client-faq" className="h2">
            {t('faq.title')}
          </h2>
          <Faq />
        </div>
      </section>

      <Cta visitorOs={visitorOs} version={version} />
    </>
  )
}
