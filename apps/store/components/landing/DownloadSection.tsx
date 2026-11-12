import Link from 'next/link'
import { ArrowRight, Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { DesktopOs } from '@/lib/desktop-os'
import { formatSize, RELEASES_PAGE, type LatestRelease } from '@/lib/latest-release'

/** One column per OS with the files of the latest GitHub release; a link to the releases page when it could not be read. */
export function DownloadSection({ release, visitorOs }: { release: LatestRelease | null; visitorOs: DesktopOs | null }) {
  const t = useTranslations('site.home.download')
  const tHome = useTranslations('site.home')

  return (
    <section id="download" aria-labelledby="home-download" className="scroll-mt-24 border-t border-ink py-14 lg:py-20">
      <div className="grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <h2 id="home-download" className="text-[28px] leading-9 tracking-[-0.02em] sm:text-[40px] sm:leading-[1.1]">
          {t('title')}
        </h2>
        <div className="text-[15px] leading-6">
          <p className="text-ink-2">
            {tHome('unsigned')}{' '}
            <Link href="/download#first-run" className="link text-ink">
              {tHome('unsignedLink')}
            </Link>
          </p>
          {release && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-ink-2">
                {t('version')} <span className="font-mono text-ink">{release.version}</span>
              </span>
              <a href={release.url} className="link inline-flex items-center gap-1.5">
                {t('allReleases')}
                <ArrowRight size={14} aria-hidden />
              </a>
            </p>
          )}
        </div>
      </div>

      {release ? (
        <ul className="mt-10 grid border-t border-ink md:grid-cols-3">
          {release.platforms.map((p) => {
            const mine = p.os === visitorOs
            return (
              <li
                key={p.os}
                data-os={p.os}
                data-recommended={mine || undefined}
                className="min-w-0 border-b border-line py-6 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[28px] leading-9 tracking-[-0.015em]">{t(`os.${p.os}`)}</h3>
                  {mine && <p className="text-[13px] text-ink">{t('recommendedOs')}</p>}
                </div>
                <p className="mt-1 text-sm leading-[22px] text-ink-2">{t(`detail.${p.os}`)}</p>
                <ul className="mt-5 border-t border-line">
                  {p.files.map((f) => (
                    <li key={f.name} className="border-b border-line">
                      <a
                        href={f.url}
                        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-3 hover:bg-sel focus-visible:outline-offset-[-2px]"
                      >
                        <Download size={16} aria-hidden className="mt-0.5 text-ink-2 group-hover:text-ink" />
                        <span className="min-w-0">
                          <span className="block text-[15px] leading-6">
                            {t(`kind.${f.kind}`)}
                            {f.recommended && <span className="ml-2 text-[13px] text-ink-2">· {t('recommendedFile')}</span>}
                          </span>
                          <span className="block break-all font-mono text-xs leading-5 text-ink-2">{f.name}</span>
                        </span>
                        <span className="font-mono text-[13px] leading-6 text-ink-2">{formatSize(f.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      ) : (
        <div role="status" className="mt-10 border-t border-ink pt-6">
          <p className="text-[15px] leading-6">{t('unavailable')}</p>
          <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={RELEASES_PAGE} className="link inline-flex items-center gap-1.5">
              {t('unavailableLink')}
              <ArrowRight size={14} aria-hidden />
            </a>
            <Link href="/download" className="link inline-flex items-center gap-1.5">
              {t('downloadPage')}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </p>
        </div>
      )}
    </section>
  )
}
