import { useTranslations } from 'next-intl'

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d="M2 6.4 4.8 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/**
 * Shape, not colour: a tick and the word. Verified means the MCP publisher
 * proved a domain to the registry, or a provider we curate; skills are never verified.
 */
export function VerifiedLabel({ className = '' }: { className?: string }) {
  const t = useTranslations('store.tier')
  return (
    <span className={`inline-flex items-center gap-[5px] whitespace-nowrap ${className}`} data-tier="verified">
      <Tick />
      {t('verified')}
    </span>
  )
}

/** The tick alone, for a narrow table cell; the word goes to screen readers. */
export function VerifiedMark() {
  const t = useTranslations('store.tier')
  return (
    <span className="inline-flex text-fg-2" data-tier="verified" title={t('verified')}>
      <Tick />
      <span className="sr-only">{t('verified')}</span>
    </span>
  )
}
