'use client'

import { useTranslations } from 'next-intl'
import { useCopy } from '@/lib/use-copy'

export function CopyButton({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const t = useTranslations('site.marketing')
  const { state, copy } = useCopy()
  return (
    <>
      <button
        type="button"
        onClick={() => void copy(text)}
        aria-label={state === 'idle' ? `${t('copy')}: ${label}` : undefined}
        data-copy-state={state}
        className={`btn ${className}`}
      >
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copy')}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </>
  )
}
