'use client'

import { useTranslations } from 'next-intl'
import { useCopy } from '@/lib/use-copy'

interface CopyCommandButtonProps {
  command: string
  /** Names the package for screen readers: several rows carry the same visible label. */
  name: string
  variant?: 'secondary' | 'primary'
  className?: string
}

export function CopyCommandButton({ command, name, variant = 'secondary', className = '' }: CopyCommandButtonProps) {
  const t = useTranslations('store.list')
  const { state, copy } = useCopy()

  const text = state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : t('copyCommand')
  const announce =
    state === 'copied'
      ? t('copiedAnnounce', { command })
      : state === 'failed'
        ? t('copyFailedAnnounce', { command })
        : ''

  return (
    <>
      <button
        type="button"
        onClick={() => void copy(command)}
        aria-label={state === 'idle' ? t('copyLabel', { name }) : undefined}
        data-copy-state={state}
        className={`btn ${variant === 'primary' ? 'btn-primary' : ''} ${className}`}
      >
        {text}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </>
  )
}
