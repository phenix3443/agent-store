import { useTranslations } from 'next-intl'
import type { ReviewVerdict } from '@/lib/review'
import { ReviewChop } from './ReviewStamp'

export function WarnIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0 text-warn">
      <path d="M12 3.5 21.5 20h-19z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M12 10v5M12 17v1.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function PendingIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0 text-ink-2">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
    </svg>
  )
}

export function ReviewStatus({ verdict }: { verdict: ReviewVerdict }) {
  const t = useTranslations('store.review')
  const label = t(verdict)
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-sm" data-verdict={verdict}>
      {verdict === 'passed' && <ReviewChop char={t('chop')} />}
      {verdict === 'flagged' && <WarnIcon />}
      {verdict === 'pending' && <PendingIcon />}
      <span className={verdict === 'pending' ? 'text-ink-2' : ''}>{label}</span>
    </span>
  )
}
