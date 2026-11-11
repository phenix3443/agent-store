'use client'

import * as Dialog from '@radix-ui/react-dialog'

export function DrawerTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <Dialog.Title className={className}>{children}</Dialog.Title>
}
