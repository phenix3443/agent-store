'use client'

import { useRouter } from 'next/navigation'
import { getPublisherBySlug, getPublisherItems } from '@/lib/mock/items'
import { PublisherDrawer } from '@/components/PublisherDrawer'

interface InterceptedPublisherProps {
  params: { name: string }
}

export default function InterceptedPublisherDrawer({ params }: InterceptedPublisherProps) {
  const router = useRouter()
  const publisher = getPublisherBySlug(params.name)

  if (!publisher) return null

  return (
    <PublisherDrawer
      publisher={publisher}
      items={getPublisherItems(params.name)}
      open
      onOpenChange={(open) => {
        if (!open) router.back()
      }}
    />
  )
}
