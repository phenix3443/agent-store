import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { DesktopOs } from '@/lib/desktop-os'

// mac/win are route handlers that redirect to the newest release asset. Linux ships
// two package formats, so it goes to the download section to pick one.
const DOWNLOADS = [
  { os: 'mac', name: 'macOS', href: '/download/mac', label: 'downloadMac' },
  { os: 'win', name: 'Windows', href: '/download/win', label: 'downloadWin' },
  { os: 'linux', name: 'Linux', href: '/#download', label: 'downloadLinux' },
] as const

/** The OS-recommended download (#92). Always a secondary button: the primary on this screen is "Browse the store". */
export function HeroDownload({ visitorOs }: { visitorOs: DesktopOs | null }) {
  const t = useTranslations('site.home')
  const recommended = DOWNLOADS.find((d) => d.os === visitorOs)

  if (!recommended) {
    return (
      <div className="flex flex-wrap gap-3">
        {DOWNLOADS.map((d) => (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a key={d.href} href={d.href} className="btn min-h-12 px-5">
            {t(d.label)}
          </a>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href={recommended.href} className="btn min-h-12 px-5">
        {t(recommended.label)}
      </a>
      <p className="mt-3 text-[13px] leading-5 text-ink-2">
        {t('osHint')} · {t('otherOs')}
        {DOWNLOADS.filter((d) => d !== recommended).map((d, i) => (
          <span key={d.href}>
            {i > 0 && ' · '}
            {d.href.startsWith('/#') ? (
              <Link href={d.href} className="link text-ink">
                {d.name}
              </Link>
            ) : (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href={d.href} className="link text-ink">
                {d.name}
              </a>
            )}
          </span>
        ))}
      </p>
    </div>
  )
}
