'use client'

import { useRouter } from 'next/navigation'
import { getItemBySlug } from '@/lib/mock/items'
import { DetailDrawer } from '@/components/DetailDrawer'

interface InterceptedDetailProps {
  params: { category: string; slug: string }
}

export default function InterceptedDetailDrawer({ params }: InterceptedDetailProps) {
  const router = useRouter()
  const item = getItemBySlug(params.slug)

  if (!item) return null

  return (
    <DetailDrawer
      item={item}
      open
      onOpenChange={(open) => {
        if (!open) router.back()
      }}
    />
  )
}
