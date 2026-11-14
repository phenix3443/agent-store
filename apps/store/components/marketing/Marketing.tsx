import Link from 'next/link'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatPrice } from '@as/types'
import type { DesktopOs } from '@/lib/desktop-os'

// mac and win are route handlers that redirect to the newest release asset. Linux ships
// several package formats, so it opens the download page at its card.
const DOWNLOADS: Record<DesktopOs, { href: string; label: 'downloadMac' | 'downloadWin' | 'downloadLinux'; route: boolean }> = {
  mac: { href: '/download/mac', label: 'downloadMac', route: true },
  win: { href: '/download/win', label: 'downloadWin', route: true },
  linux: { href: '/download#linux', label: 'downloadLinux', route: false },
}

/** The download button for the visitor's OS; "Download free" to the download page when the OS is unknown. */
export function DownloadButton({ visitorOs, small = false }: { visitorOs: DesktopOs | null; small?: boolean }) {
  const t = useTranslations('site.marketing')
  const target = visitorOs ? DOWNLOADS[visitorOs] : null
  const className = `btn btn-primary ${small ? 'btn-sm' : ''}`
  const content = (
    <>
      {!small && <Download size={18} aria-hidden />}
      {target ? t(target.label) : t('downloadFree')}
    </>
  )
  if (target?.route) {
    return (
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a href={target.href} className={className}>
        {content}
      </a>
    )
  }
  return (
    <Link href={target?.href ?? '/download'} className={className}>
      {content}
    </Link>
  )
}

export function SupportedAgents() {
  const t = useTranslations('site.marketing')
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12.5px] text-fg-3">{t('supLabel')}</span>
      <span className="agent-chip">Claude Code</span>
      <span className="agent-chip">Codex</span>
      <span className="agent-chip agent-chip-more">{t('supMore')}</span>
    </p>
  )
}

export function Cta({ visitorOs, version }: { visitorOs: DesktopOs | null; version: string | null }) {
  const t = useTranslations('site.marketing')
  return (
    <section aria-labelledby="cta-title" className="section-tight">
      <div className="wrap">
        <div className="cta">
          <div aria-hidden className="aurora -z-10">
            <i />
            <i />
            <i />
          </div>
          <span aria-hidden className="logo">
            <i />
            <i />
            <i />
          </span>
          <h2 id="cta-title" className="h2 mb-7">
            {t('cta.title')}
            <span className="dim">{t('cta.dim')}</span>
          </h2>
          <DownloadButton visitorOs={visitorOs} />
          <p className="cap mt-4">
            {version && `${version} · `}
            {t('cta.cap', { price: formatPrice('monthly') })}
          </p>
        </div>
      </div>
    </section>
  )
}
