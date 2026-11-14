import { Suspense } from 'react'
import { getResource } from '@/lib/catalog'
import { idFromSegments } from '@/lib/resource'
import { DrawerTitle } from '@/components/DrawerTitle'
import { InterceptedDetail } from '@/components/InterceptedDetail'
import { DRAWER_TITLE_CLASS, ItemDetail } from '@/components/ItemDetail'
import { ItemReadme, ItemReadmeFallback } from '@/components/ItemReadme'

interface InterceptedDetailProps {
  params: Promise<{ category: string; id: string[] }>
}

export default async function InterceptedDetailDrawer({ params }: InterceptedDetailProps) {
  const { id: segments } = await params
  const id = idFromSegments(segments)
  // A failed read leaves the drawer closed; the list underneath stays usable.
  const resource = id.includes(':') ? await getResource(id).catch(() => null) : null

  if (!resource) return null

  return (
    <InterceptedDetail resource={{ id: resource.id, kind: resource.kind }}>
      <ItemDetail
        resource={resource}
        layout="drawer"
        title={<DrawerTitle className={DRAWER_TITLE_CLASS}>{resource.name}</DrawerTitle>}
        readme={
          <Suspense fallback={<ItemReadmeFallback />}>
            <ItemReadme resource={resource} />
          </Suspense>
        }
      />
    </InterceptedDetail>
  )
}
