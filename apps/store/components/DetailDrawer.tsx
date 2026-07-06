'use client'

import type { Item } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Badge } from './Badge'

interface DetailDrawerProps {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DetailDrawer({ item, open, onOpenChange }: DetailDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-store-border bg-store-content p-6">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-store-text">{item.name}</Dialog.Title>
              <div className="mt-1 flex gap-1">
                <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
                <Badge variant={item.category}>{item.category}</Badge>
              </div>
            </div>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-store-text-2">
            {item.description}
          </Dialog.Description>

          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-md border border-store-border px-2 py-0.5 text-xs text-store-text-3">
                {tag}
              </span>
            ))}
          </div>

          {item.category === 'provider' && (
            <div className="text-sm">
              <p className="mb-1 font-medium text-store-text">支持的模型</p>
              <p className="text-store-text-2">{item.supportedModels.join(' · ')}</p>
            </div>
          )}

          {item.category === 'mcp' && (
            <div className="text-sm">
              <p className="mb-1 font-medium text-store-text">传输方式</p>
              <p className="text-store-text-2">
                {item.transport}
                {item.transport === 'stdio' ? ` · ${item.serverCommand}` : ` · ${item.url}`}
              </p>
            </div>
          )}

          <code className="mt-auto block rounded-lg border border-store-border bg-store-panel px-3 py-2 font-mono text-xs text-store-text">
            aas install {item.slug}
          </code>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
