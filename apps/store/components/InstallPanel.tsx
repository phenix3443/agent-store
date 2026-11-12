'use client'

import type { ResourceSummary } from '@as/types'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { usePhone } from '@/lib/use-phone'
import { CopyCommandButton } from './CopyCommandButton'
import { InstallButton } from './InstallButton'

interface InstallPanelProps {
  resource: Pick<ResourceSummary, 'id' | 'kind' | 'name' | 'origin'>
  command: string | null
  /** Which tool runs the command, shown under it. */
  note: string
}

export function InstallPanel({ resource, command, note }: InstallPanelProps) {
  const t = useTranslations('store.install')
  const phone = usePhone()

  return (
    <>
      {command ? (
        <div className="flex min-h-12 items-center gap-2 border border-ink bg-paper pl-3.5 pr-2 font-mono text-sm">
          <span aria-hidden className="select-none self-start py-3 leading-6 text-ink-2">$</span>
          {/* Wraps rather than scrolls: a hidden scrollbar cut the slug off mid-word. */}
          <code className="min-w-0 flex-1 py-3 leading-6 [overflow-wrap:anywhere]">{command}</code>
          {/* On a phone the primary button below is already the copy action. */}
          {!phone && <CopyCommandButton command={command} name={resource.name} className="shrink-0 self-start mt-2" />}
        </div>
      ) : (
        <p className="border border-line bg-paper px-3.5 py-3 text-sm leading-6">{t('noCommand')}</p>
      )}
      {command && <p className="mt-2 max-w-[62ch] text-[13px] leading-5 text-ink-2">{note}</p>}
      <div className="mt-3 flex flex-col gap-2.5">
        <InstallButton resource={resource} command={command} variant="primary" />
        {!phone && (
          <Link href="/download" className="btn min-h-12 px-5">
            {t('download')}
          </Link>
        )}
      </div>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-5 text-ink-2">{phone ? t('phoneNote') : t('fallbackNote')}</p>
    </>
  )
}
