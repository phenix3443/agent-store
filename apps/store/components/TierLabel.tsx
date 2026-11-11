import type { Publisher } from '@as/types'
import { useTranslations } from 'next-intl'

/** Shape, not colour, tells the tiers apart: a filled square, a tick, or nothing. */
export function TierLabel({ tier, className = '' }: { tier: Publisher['tier']; className?: string }) {
  const t = useTranslations('store.tier')
  return (
    <span className={`inline-flex items-center gap-[5px] whitespace-nowrap ${className}`} data-tier={tier}>
      {tier === 'official' && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="2" y="2" width="8" height="8" fill="currentColor" />
        </svg>
      )}
      {tier === 'verified' && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6.4 4.8 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
      {t(tier)}
    </span>
  )
}
