import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getResource } from '@/lib/catalog'
import { idFromSegments, KINDS, resourceHref } from '@/lib/resource'
import { FavoriteButton } from '@/components/FavoriteButton'
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
    <div className="mx-auto max-w-[760px] px-4 pb-20 sm:px-6">
      <div className="flex h-14 items-center justify-between">
        <nav aria-label={t('detail.breadcrumb')} className="label">
          <Link href="/store" className="underline decoration-line-strong hover:text-ink hover:decoration-ink">
            {t('detail.breadcrumb')}
          </Link>{' '}
          /{' '}
          <Link
            href={`/store?category=${resource.kind}`}
            className="underline decoration-line-strong hover:text-ink hover:decoration-ink"
          >
            {t(`category.${resource.kind}`)}
          </Link>
        </nav>
        <FavoriteButton itemId={resource.id} />
      </div>
      <div className="mt-2 border border-line bg-plate">
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
    </div>
  )
}
