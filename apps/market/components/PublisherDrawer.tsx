'use client'

import type { Publisher, Item } from '@aas/types'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import Link from 'next/link'
import { Badge } from './Badge'

interface PublisherDrawerProps {
  publisher: Publisher
  items: Item[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PublisherDrawer({ publisher, items, open, onOpenChange }: PublisherDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[45] bg-black/50" />
        <Dialog.Content className="fixed right-0 top-0 z-[45] flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-store-border bg-store-content p-6">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-store-text">{publisher.name}</Dialog.Title>
              <Badge variant={publisher.tier}>{publisher.tier}</Badge>
            </div>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          {publisher.bio && (
            <Dialog.Description className="text-sm text-store-text-2">{publisher.bio}</Dialog.Description>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-store-text">{items.length} 个已发布资源</p>
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/store/${item.category}/${item.slug}`}
                className="rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text hover:border-store-border-strong"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
