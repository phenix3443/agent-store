'use client'

import type { ResourceSummary } from '@as/types'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { usePhone } from '@/lib/use-phone'
import { CopyCommandButton } from './CopyCommandButton'
import { FavoriteButton } from './Favorites'
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
    <section data-kind={resource.kind} className="card install-card">
      <div className="flex items-center gap-2.5">
        <InstallButton resource={resource} command={command} variant="primary" className="min-w-0 flex-1" />
        <FavoriteButton id={resource.id} name={resource.name} size="panel" />
      </div>
      {command && <p className="mt-2.5 text-[12.5px] text-fg-3">{phone ? t('phoneNote') : t('note')}</p>}
      <div className="mb-2.5 mt-[18px] flex min-h-[30px] items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-fg-2">{t('commandTitle')}</h3>
        {/* On a phone the primary button above is already the copy action. */}
        {command && !phone && (
          <CopyCommandButton
            command={command}
            name={resource.name}
            className="!min-h-[30px] !rounded-lg !px-2.5 text-[12.5px] !font-semibold"
          />
        )}
      </div>
      {command ? (
        <>
          {/* Wraps rather than scrolls: a hidden scrollbar cut the slug off mid-word. */}
          <div className="code-block">
            <pre>
              <code>{command}</code>
            </pre>
          </div>
          <p className="mt-2.5 text-[12.5px] text-fg-3">{note}</p>
        </>
      ) : (
        <p className="text-sm text-fg-2">{t('noCommand')}</p>
      )}
      {!phone && (
        <Link href="/download" className="link mt-4 inline-block text-[13.5px] text-fg-2">
          {t('download')}
        </Link>
      )}
    </section>
  )
}
