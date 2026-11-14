import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getResource } from '@/lib/catalog'
import { idFromSegments, KINDS, resourceHref } from '@/lib/resource'
import { ItemDetail, TITLE_CLASS } from '@/components/ItemDetail'
import { ItemReadme, ItemReadmeFallback } from '@/components/ItemReadme'
import type { ResourceKind } from '@as/types'

interface ResourcePageProps {
  params: Promise<{ category: string; id: string[] }>
}

/** Ids always hold a ':' (`<site>:<upstreamId>`); a bare slug is a link from the old catalog. */
async function resolve(params: ResourcePageProps['params']) {
  const { category, id: segments } = await params
  const id = idFromSegments(segments)
  return { category, id, legacy: !id.includes(':') }
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { id, legacy } = await resolve(params)
  const t = await getTranslations('store')
  const resource = legacy ? null : await getResource(id).catch(() => null)
  if (!resource) return { title: t('detail.notFound') }
  const desc = (resource.description ?? '').slice(0, 160)
  return {
    title: `${resource.name} — ${t(`category.${resource.kind}`)}`,
    description: desc,
    alternates: { canonical: resourceHref(resource) },
    openGraph: { type: 'article', title: resource.name, description: desc },
  }
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { category, id, legacy } = await resolve(params)
  if (legacy) {
    const kind = KINDS.includes(category as ResourceKind) ? `category=${category}&` : ''
    redirect(`/store?${kind}q=${encodeURIComponent(id)}`)
  }

  const resource = await getResource(id)
  if (!resource) notFound()
  if (resource.kind !== category) redirect(resourceHref(resource))

  const t = await getTranslations('store')

  return (
    <div className="mx-auto w-[min(1160px,calc(100%-2*clamp(16px,4vw,32px)))] pb-4 pt-[clamp(40px,6vw,80px)]">
      <nav aria-label={t('detail.breadcrumbLabel')} className="mb-7 flex min-w-0 gap-2 text-sm text-fg-3">
        <Link href="/store" className="shrink-0 hover:text-fg">
          {t('detail.breadcrumb')}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/store?category=${resource.kind}`} className="shrink-0 hover:text-fg">
          {t(`categories.${resource.kind}`)}
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="min-w-0 truncate">
          {resource.name}
        </span>
      </nav>
      <ItemDetail
        resource={resource}
        title={<h1 className={TITLE_CLASS}>{resource.name}</h1>}
        readme={
          <Suspense fallback={<ItemReadmeFallback />}>
            <ItemReadme resource={resource} />
          </Suspense>
        }
      />
    </div>
  )
}
