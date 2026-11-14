'use client'

import type { ResourceSummary } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import { Maximize2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { noticeInUse } from './InstallNotice'
import { resourceHref } from '@/lib/resource'

interface DetailDrawerProps {
  resource: Pick<ResourceSummary, 'id' | 'kind'>
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function DetailDrawer({ resource, open, onOpenChange, children }: DetailDrawerProps) {
  const t = useTranslations('store')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* From lg up the list stays readable beside the drawer, so the overlay only catches clicks. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim lg:bg-transparent" />
        <Dialog.Content
          data-item-drawer
          data-kind={resource.kind}
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            // The install notice is a toast outside the drawer; using it must not close the drawer.
            if (noticeInUse()) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            // Radix would hand focus back to whatever was focused when the drawer
            // mounted; after an intercepted navigation that is not reliably the row.
            const row = document.querySelector<HTMLElement>(`[data-item-link="${CSS.escape(resource.id)}"]`)
            if (row) {
              event.preventDefault()
              row.focus()
            }
          }}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg-2 shadow-sheet sm:inset-y-2.5 sm:left-auto sm:right-2.5 sm:w-[min(520px,calc(100%-20px))] sm:rounded-[24px] sm:border sm:border-line-strong lg:top-[82px]"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-3 pl-4 pr-3">
            {/* A plain anchor: a full load skips the intercepting route and renders the page. */}
            <a href={resourceHref(resource)} className="btn">
              <Maximize2 size={14} aria-hidden />
              {t('detail.expand')}
            </a>
            <Dialog.Close
              aria-label={t('detail.close')}
              className="grid h-[34px] w-[34px] place-items-center rounded-control text-fg-2 hover:bg-panel-2 hover:text-fg"
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-7 pt-5 sm:px-[22px]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
