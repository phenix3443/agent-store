'use client'

import type { Item } from '@as/types'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { installLink, launchDesktop } from '@/lib/desktop-link'
import { installCommand } from '@/lib/install-preview'
import { usePhone } from '@/lib/use-phone'
import { CopyCommandButton } from './CopyCommandButton'
import { useInstallNotice } from './InstallNotice'

type State = 'idle' | 'launching' | 'opened'

interface InstallButtonProps {
  item: Pick<Item, 'slug' | 'category' | 'name'>
  variant?: 'row' | 'primary'
  className?: string
}

export function InstallButton({ item, variant = 'row', className = '' }: InstallButtonProps) {
  const t = useTranslations('store.install')
  const phone = usePhone()
  const notify = useInstallNotice()
  const [state, setState] = useState<State>('idle')
  const reset = useRef<ReturnType<typeof setTimeout>>()
  const command = installCommand(item)

  useEffect(() => () => clearTimeout(reset.current), [])

  if (phone) {
    return (
      <CopyCommandButton
        command={command}
        name={item.name}
        variant={variant === 'primary' ? 'primary' : 'secondary'}
        className={className}
      />
    )
  }

  async function install() {
    if (state === 'launching') return
    clearTimeout(reset.current)
    setState('launching')
    const result = await launchDesktop(installLink(item))
    if (result === 'opened') {
      setState('opened')
      reset.current = setTimeout(() => setState('idle'), 4000)
      return
    }
    let copied = true
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      copied = false
    }
    setState('idle')
    notify({ command, copied })
  }

  const row = variant === 'row'
  const idle = row ? t('action') : t('desktop')
  const text = state === 'opened' ? (row ? t('openedShort') : t('opened')) : state === 'launching' ? t('opening') : idle

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        aria-label={row && state === 'idle' ? t('label', { name: item.name }) : undefined}
        aria-busy={state === 'launching'}
        data-install-state={state}
        className={`btn ${row ? 'min-w-[68px]' : 'btn-primary'} ${className}`}
      >
        {text}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'opened' ? t('opened') : ''}
      </span>
    </>
  )
}
