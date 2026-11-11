'use client'

import type { Item } from '@as/types'
import { useTranslations } from 'next-intl'
import { installCommand } from '@/lib/review'
import { usePhone } from '@/lib/use-phone'
import { CopyCommandButton } from './CopyCommandButton'
import { InstallButton } from './InstallButton'

export function InstallPanel({ item }: { item: Pick<Item, 'slug' | 'category' | 'name'> }) {
  const t = useTranslations('store.install')
  const phone = usePhone()
  const command = installCommand(item)

  return (
    <>
      <div className="flex min-h-12 items-center gap-2 border border-ink bg-paper pl-3.5 pr-2 font-mono text-sm">
        <span aria-hidden className="select-none self-start py-3 leading-6 text-ink-2">$</span>
        {/* Wraps rather than scrolls: a hidden scrollbar cut the slug off mid-word. */}
        <code className="min-w-0 flex-1 py-3 leading-6 [overflow-wrap:anywhere]">{command}</code>
        {/* On a phone the primary button below is already the copy action. */}
        {!phone && <CopyCommandButton command={command} name={item.name} className="shrink-0" />}
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">
        <InstallButton item={item} variant="primary" />
        {!phone && (
          <>
            {/* A route handler that redirects to the release assets, not a page. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/download/latest" className="btn min-h-12 px-5">
              {t('download')}
            </a>
          </>
        )}
      </div>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-5 text-ink-2">{phone ? t('phoneNote') : t('fallbackNote')}</p>
    </>
  )
}
