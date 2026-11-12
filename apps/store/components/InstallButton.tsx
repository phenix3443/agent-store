'use client'

import type { ResourceSummary } from '@as/types'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { installLink, launchDesktop } from '@/lib/desktop-link'
import { desktopSlug } from '@/lib/resource'
import { usePhone } from '@/lib/use-phone'
import { CopyCommandButton } from './CopyCommandButton'
import { useInstallNotice } from './InstallNotice'

type State = 'idle' | 'launching' | 'opened'

interface InstallButtonProps {
  resource: Pick<ResourceSummary, 'id' | 'kind' | 'name' | 'origin'>
  /** Copied when the desktop client does not take the link; null when the caller has none (an MCP row). */
  command: string | null
  variant?: 'row' | 'primary'
  className?: string
}

export function InstallButton({ resource, command, variant = 'row', className = '' }: InstallButtonProps) {
  const t = useTranslations('store.install')
  const phone = usePhone()
  const notify = useInstallNotice()
  const [state, setState] = useState<State>('idle')
  const reset = useRef<ReturnType<typeof setTimeout>>()
  const slug = desktopSlug(resource)

  useEffect(() => () => clearTimeout(reset.current), [])

  if (phone) {
    // Without a command the row itself, which opens the detail, is the way on.
    if (!command) return null
    return (
      <CopyCommandButton
        command={command}
        name={resource.name}
        variant={variant === 'primary' ? 'primary' : 'secondary'}
        className={className}
      />
    )
  }

  async function install() {
    if (state === 'launching') return
    clearTimeout(reset.current)
    setState('launching')
    const result = slug ? await launchDesktop(installLink({ slug, kind: resource.kind, id: resource.id })) : 'missing'
    if (result === 'opened') {
      setState('opened')
      reset.current = setTimeout(() => setState('idle'), 4000)
      return
    }
    let copied = false
    if (command) {
      try {
        await navigator.clipboard.writeText(command)
        copied = true
      } catch {
        copied = false
      }
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
        aria-label={row && state === 'idle' ? t('label', { name: resource.name }) : undefined}
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
