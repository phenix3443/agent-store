'use client'

import type { Item } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslations } from 'next-intl'
import { FavoriteButton } from './FavoriteButton'
import { noticeInUse } from './InstallNotice'
import { itemHref } from '@/lib/item-href'

interface DetailDrawerProps {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function DetailDrawer({ item, open, onOpenChange, children }: DetailDrawerProps) {
  const t = useTranslations('store')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* From lg up the list stays readable beside the drawer, so the overlay only catches clicks. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim lg:bg-transparent" />
        <Dialog.Content
          data-item-drawer
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            // The install notice is a toast outside the drawer; using it must not close the drawer.
            if (noticeInUse()) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            // Radix would hand focus back to whatever was focused when the drawer
            // mounted; after an intercepted navigation that is not reliably the row.
            const row = document.querySelector<HTMLElement>(`[data-item-link="${CSS.escape(item.slug)}"]`)
            if (row) {
              event.preventDefault()
              row.focus()
            }
          }}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-ink bg-plate sm:max-w-[520px] sm:border-l lg:top-[72px]"
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line pl-5 pr-3 sm:pl-6">
            <span className="label min-w-0 truncate whitespace-nowrap">
              {t('detail.breadcrumb')} / {t(`category.${item.category}`)}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <FavoriteButton itemId={item.id} />
              {/* A plain anchor: a full load skips the intercepting route and renders the page. */}
              <a
                href={itemHref(item)}
                aria-label={t('detail.expand')}
                className="flex h-8 min-w-8 items-center justify-center gap-1.5 whitespace-nowrap px-2 text-[13px] hover:bg-sel"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                  <path d="M7.5 1.5h4v4M11.5 1.5 7 6M5.5 11.5h-4v-4M1.5 11.5 6 7" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span className="hidden sm:inline">{t('detail.expand')}</span>
              </a>
              <Dialog.Close aria-label={t('detail.close')} className="grid h-8 w-8 place-items-center hover:bg-sel">
                <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                  <path d="m1.5 1.5 10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </Dialog.Close>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-[22px] sm:px-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
