import type { ResourceDetail } from '@as/types'
import { getTranslations } from 'next-intl/server'
import { getResourceDoc } from '@/lib/resource-doc'
import { DetailCard } from './ItemDetail'
import { MarkdownContent } from './MarkdownContent'

/** Streams in after the rest of the detail, since it waits on GitHub or npm. */
export async function ItemReadme({ resource }: { resource: ResourceDetail }) {
  const doc = await getResourceDoc(resource)
  if (!doc) return null
  const t = await getTranslations('store.detail')
  return (
    <DetailCard title={t(doc.kind)} note={t('upstreamDoc')}>
      <MarkdownContent>{doc.body}</MarkdownContent>
    </DetailCard>
  )
}

export function ItemReadmeFallback() {
  return (
    <div className="card space-y-3" aria-hidden>
      <span className="sk h-4 w-24" />
      <span className="sk h-4 w-full" />
      <span className="sk h-4 w-4/5" />
    </div>
  )
}
