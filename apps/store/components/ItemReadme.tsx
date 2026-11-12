import type { ResourceDetail } from '@as/types'
import { getTranslations } from 'next-intl/server'
import { getResourceDoc } from '@/lib/resource-doc'
import { MarkdownContent } from './MarkdownContent'

/** Streams in after the rest of the detail, since it waits on GitHub or npm. */
export async function ItemReadme({ resource }: { resource: ResourceDetail }) {
  const doc = await getResourceDoc(resource)
  if (!doc) return null
  const t = await getTranslations('store.detail')
  return (
    <section className="mt-9">
      <h2 className="label mb-3">{t(doc.kind)}</h2>
      <MarkdownContent>{doc.body}</MarkdownContent>
    </section>
  )
}

export function ItemReadmeFallback() {
  return (
    <div className="mt-9 space-y-3" aria-hidden>
      <div className="h-4 w-24 bg-fill" />
      <div className="h-4 w-full bg-fill" />
      <div className="h-4 w-4/5 bg-fill" />
    </div>
  )
}
