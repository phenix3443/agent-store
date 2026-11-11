import { Suspense } from 'react'
import { getItemBySlug, getItemVersions } from '@/lib/catalog'
import { DrawerTitle } from '@/components/DrawerTitle'
import { InterceptedDetail } from '@/components/InterceptedDetail'
import { ItemDetail, TITLE_CLASS } from '@/components/ItemDetail'
import { ItemReadme, ItemReadmeFallback } from '@/components/ItemReadme'

interface InterceptedDetailProps {
  params: Promise<{ category: string; slug: string }>
}

export default async function InterceptedDetailDrawer({ params }: InterceptedDetailProps) {
  const { slug } = await params
  const [item, versions] = await Promise.all([getItemBySlug(slug), getItemVersions(slug)])

  if (!item) return null

  return (
    <InterceptedDetail item={item}>
      <ItemDetail
        item={item}
        versions={versions}
        title={<DrawerTitle className={TITLE_CLASS}>{item.name}</DrawerTitle>}
        readme={
          <Suspense fallback={<ItemReadmeFallback />}>
            <ItemReadme item={item} />
          </Suspense>
        }
      />
    </InterceptedDetail>
  )
}
