'use client'

import type { ResourceSummary } from '@as/types'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DetailDrawer } from './DetailDrawer'

export function InterceptedDetail({
  resource,
  children,
}: {
  resource: Pick<ResourceSummary, 'id' | 'kind'>
  children: React.ReactNode
}) {
  const router = useRouter()
  // Closing through state (not just unmounting on navigation) lets Radix run
  // its close sequence, which is what returns focus to the row.
  const [open, setOpen] = useState(true)

  return (
    <DetailDrawer
      resource={resource}
      open={open}
      onOpenChange={(next) => {
        if (next) return
        setOpen(false)
        router.back()
      }}
    >
      {children}
    </DetailDrawer>
  )
}
