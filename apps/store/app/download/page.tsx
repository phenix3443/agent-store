import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

const RELEASES_URL = 'https://github.com/awesome-agent-store/agent-store/releases'
const XATTR = 'xattr -cr "/Applications/Agent Store CLI.app"'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.download')
  return { title: t('metaTitle'), description: t('lede') }
}

export default async function DownloadPage() {
  const t = await getTranslations('site.download')

  const platforms = [
    { id: 'mac', name: t('mac'), detail: t('macDetail'), actions: [{ label: t('macAction'), href: '/download/mac' }], primary: true },
    { id: 'win', name: t('win'), detail: t('winDetail'), actions: [{ label: t('winAction'), href: '/download/win' }], primary: false },
    {
      id: 'linux',
      name: t('linux'),
      detail: t('linuxDetail'),
      actions: [
        { label: t('linuxDebAction'), href: '/download/linux-deb' },
        { label: t('linuxRpmAction'), href: '/download/linux-rpm' },
      ],
      primary: false,
    },
  ]

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <header className="border-b border-ink pb-8">
        <h1 className="max-w-[14ch] text-[44px] leading-[1.02] tracking-[-0.03em] sm:text-[56px] lg:text-[72px]">{t('title')}</h1>
        <p className="mt-6 max-w-[56ch] text-lg leading-7 text-ink-2">{t('lede')}</p>
      </header>

      <section aria-label={t('platformsLabel')}>
        <ul>
          {platforms.map((p) => (
            <li
              key={p.id}
              id={p.id}
              className="grid scroll-mt-24 gap-x-10 gap-y-3 border-b border-line py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <h2 className="text-[28px] leading-9 tracking-[-0.015em] sm:text-[32px]">{p.name}</h2>
                <p className="mt-1 text-[15px] leading-6 text-ink-2">{p.detail}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {p.actions.map((a) => (
                  // A route handler that redirects to the newest release asset, not a page.
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a
                    key={a.href}
                    href={a.href}
                    className={p.primary ? 'btn btn-primary sm:min-w-[12rem]' : 'btn min-h-12 px-5 sm:min-w-[12rem]'}
                  >
                    {a.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <a href={RELEASES_URL} className="link mt-5 inline-flex items-center gap-1.5 text-sm">
          {t('allReleases')}
          <ArrowRight size={14} aria-hidden />
        </a>
      </section>

      <section id="first-run" aria-labelledby="first-run-title" className="mt-16 grid scroll-mt-24 gap-x-16 gap-y-6 border-t border-ink pt-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 id="first-run-title" className="text-[28px] leading-9 tracking-[-0.015em] sm:text-[32px]">
            {t('unsignedTitle')}
          </h2>
          <p className="mt-3 max-w-[44ch] text-[15px] leading-6 text-ink-2">{t('unsignedBody')}</p>
        </div>
        <div className="min-w-0 max-w-[68ch] text-[15px] leading-[26px]">
          <p>{t('macSteps')}</p>
          <pre className="mt-3 overflow-x-auto border border-ink bg-plate px-4 py-3 font-mono text-[13px] leading-6">
            <code>{XATTR}</code>
          </pre>
          <p className="mt-6 border-t border-line pt-6">{t('winSteps')}</p>
          <p className="mt-6 border-t border-line pt-6">{t('linuxSteps')}</p>
        </div>
      </section>

      <section aria-labelledby="next-title" className="mt-16 grid gap-x-16 gap-y-6 border-t border-ink pt-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <h2 id="next-title" className="text-[28px] leading-9 tracking-[-0.015em] sm:text-[32px]">
          {t('nextTitle')}
        </h2>
        <div className="min-w-0">
          <p className="max-w-[60ch] text-[15px] leading-[26px]">{t('nextBody')}</p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/store" className="link inline-flex items-center gap-1.5">
              {t('nextStore')}
              <ArrowRight size={14} aria-hidden />
            </Link>
            <Link href="/docs#install" className="link inline-flex items-center gap-1.5">
              {t('nextDocs')}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
