'use client'

import type { Publisher, Item } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { itemHref } from './ItemTable'
import { TierLabel } from './TierLabel'

interface PublisherDrawerProps {
  publisher: Publisher
  items: Item[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PublisherDrawer({ publisher, items, open, onOpenChange }: PublisherDrawerProps) {
  const t = useTranslations('store')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[45] bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-[45] flex w-full flex-col overflow-y-auto border-ink bg-plate p-6 sm:max-w-[520px] sm:border-l"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[28px] leading-8 tracking-[-0.02em]">{publisher.name}</Dialog.Title>
              <TierLabel tier={publisher.tier} className="mt-1.5 text-sm text-ink-2" />
            </div>
            <Dialog.Close aria-label={t('publisher.close')} className="grid h-8 w-8 shrink-0 place-items-center hover:bg-sel">
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
                <path d="m1.5 1.5 10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </Dialog.Close>
          </div>

          {publisher.bio && <p className="mt-4 max-w-[60ch] text-sm leading-[22px]">{publisher.bio}</p>}

          <h2 className="label mb-2 mt-7">{t('publisher.items', { count: items.length })}</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id} className="border-t border-line last:border-b">
                <Link href={itemHref(item)} className="flex min-h-11 items-center gap-3 px-1 hover:bg-sel">
                  <span className="label w-14 shrink-0">{t(`category.${item.category}`)}</span>
                  <span className="truncate font-mono text-sm">{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
