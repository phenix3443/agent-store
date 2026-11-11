'use client'

import { useTranslations } from 'next-intl'
import { useCopy } from '@/lib/use-copy'

interface CopyCommandButtonProps {
  command: string
  /** Names the package for screen readers when the visible label is just "Copy". */
  name: string
  variant?: 'row' | 'primary'
  className?: string
}

export function CopyCommandButton({ command, name, variant = 'row', className = '' }: CopyCommandButtonProps) {
  const t = useTranslations('store.list')
  const td = useTranslations('store.detail')
  const { state, copy } = useCopy()

  const idle = variant === 'primary' ? td('copyInstall') : t('copy')
  const text = state === 'copied' ? t('copied') : state === 'failed' ? t('copyFailed') : idle
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
        aria-label={variant === 'row' ? t('copyLabel', { name }) : undefined}
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
