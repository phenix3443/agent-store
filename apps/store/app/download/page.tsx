import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowUpRight, Download } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { CopyButton } from '@/components/marketing/CopyButton'
import { desktopOsFromUserAgent } from '@/lib/desktop-os'
import { getLatestRelease, RELEASES_PAGE } from '@/lib/latest-release'
import { downloadRows, EXT, OS_KIND } from '@/components/marketing/download-rows'

const XATTR = 'xattr -cr "/Applications/Agent Store.app"'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.download')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function DownloadPage() {
  const t = await getTranslations('site.download')
  const [release, requestHeaders] = await Promise.all([getLatestRelease(), headers()])
  const visitorOs = desktopOsFromUserAgent(requestHeaders.get('user-agent'))

  const platforms = downloadRows(release, visitorOs)
  const hasAppImage = platforms.some((p) => p.files.some((f) => f.kind === 'appimage'))
  const releasesUrl = release?.url ?? RELEASES_PAGE

  return (
    <>
      <section className="relative pb-[clamp(36px,5vw,64px)] pt-[clamp(64px,9vw,120px)] text-center">
        <div className="wrap">
          <h1 className="h1 mb-[18px]">
            {t('title')}
            <span className="dim">{visitorOs ? t('dimOs', { os: t(`os.${visitorOs}`) }) : t('dimAny')}</span>
          </h1>
          <p className="lede mx-auto">{t('lede')}</p>
          {release && <p className="cap mt-4">{t('version', { version: release.version })}</p>}
        </div>
      </section>

      <section aria-label={t('platformsLabel')}>
        <div className="wrap">
          {!release && (
            <p role="status" className="mb-5 text-center text-sm text-fg-2">
              {t('unavailable')}
            </p>
          )}
          <ul className="grid gap-[18px] md:grid-cols-3">
            {platforms.map(({ os, files }) => {
              const mine = os === visitorOs
              return (
                <li key={os} id={os} data-kind={OS_KIND[os]} data-recommended={mine || undefined} className="os-card scroll-mt-24">
                  <span aria-hidden className="tile mb-3.5 font-mono text-xs font-semibold">
                    {os}
                  </span>
                  <h2 className="flex items-center justify-between gap-2 text-[22px] font-extrabold">
                    {t(`os.${os}`)}
                    {mine && <span className="chip">{t('recommended')}</span>}
                  </h2>
                  <p className="min-h-[3.2em] text-[14.5px] text-fg-2">{t(`detail.${os}`)}</p>
                  <ul className="mt-4 grid gap-2">
                    {files.map((f) => (
                      <li key={f.kind}>
                        {/* A release asset or a route handler that redirects to one, not a page. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href={f.href} className="file-link">
                          <span className="min-w-0">
                            {t(`kind.${f.kind}`)} <code className="font-mono text-[13px]">{EXT[f.kind]}</code>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-fg-3">
                            {f.size}
                            <Download size={16} aria-hidden className="text-fg-2" />
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
          <p className="mt-[18px] text-center text-[13px] text-fg-3">
            {t('unsigned')}{' '}
            <a href="#first-run" className="link text-fg-2">
              {t('unsignedLink')}
            </a>
          </p>
        </div>
      </section>

      <section id="first-run" aria-labelledby="first-run-title" className="section-tight scroll-mt-24">
        <div className="wrap">
          <h2 id="first-run-title" className="h2 mb-7">
            {t('firstRun.title')}
            <span className="dim">{t('firstRun.dim')}</span>
          </h2>
          <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
            <div data-kind="skill" className="min-w-0 bg-bg-2 p-6">
              <span className="kind">macOS</span>
              <h3 className="mb-2 mt-2.5 font-bold">{t('firstRun.macTitle')}</h3>
              <p className="text-[14.5px] text-fg-2">{t('firstRun.macBody')}</p>
              <div className="code-block mt-3">
                <pre>{XATTR}</pre>
              </div>
              <CopyButton text={XATTR} label={t('firstRun.copyName')} className="mt-2.5" />
            </div>
            <div data-kind="mcp" className="min-w-0 bg-bg-2 p-6">
              <span className="kind">Windows</span>
              <h3 className="mb-2 mt-2.5 font-bold">{t('firstRun.winTitle')}</h3>
              <p className="text-[14.5px] text-fg-2">{t('firstRun.winBody')}</p>
            </div>
            <div data-kind="provider" className="min-w-0 bg-bg-2 p-6">
              <span className="kind">Linux</span>
              <h3 className="mb-2 mt-2.5 font-bold">{t('firstRun.linuxTitle')}</h3>
              <p className="text-[14.5px] text-fg-2 [&_code]:break-all [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg">
                {t.rich('firstRun.linuxBody', { code: (chunks) => <code>{chunks}</code> })}
              </p>
              {hasAppImage && (
                <p className="mt-2 text-[14.5px] text-fg-2 [&_code]:break-all [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg">
                  {t.rich('firstRun.linuxAppImage', { code: (chunks) => <code>{chunks}</code> })}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="releases-title" className="pb-[calc(clamp(72px,10vw,140px)*0.6)]">
        <div className="wrap split !items-start">
          <div id="releases" className="stack scroll-mt-24">
            <h2 id="releases-title" className="h2">
              {t('releases.title')}
              <span className="dim">{t('releases.dim')}</span>
            </h2>
            <p className="lede [&_code]:font-mono [&_code]:text-fg">
              {t.rich('releases.body', { code: (chunks) => <code>{chunks}</code> })}
            </p>
            <p>
              <a href={releasesUrl} className="link inline-flex items-center gap-1.5 font-semibold text-fg">
                {t('releases.link')}
                <ArrowUpRight size={15} aria-hidden />
              </a>
            </p>
          </div>
          <div className="card">
            <h2 className="mb-2 text-xl font-bold">{t('next.title')}</h2>
            <p className="text-[15px] text-fg-2">{t('next.body')}</p>
            <p className="mt-[18px] flex flex-wrap gap-2.5">
              <Link href="/store" className="btn btn-primary btn-sm">
                {t('next.store')}
              </Link>
              <Link href="/docs" className="btn">
                {t('next.docs')}
              </Link>
              <Link href="/client" className="btn">
                {t('next.client')}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
