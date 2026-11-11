import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getItemBySlug, getItemVersions } from '@/lib/catalog'
import { FavoriteButton } from '@/components/FavoriteButton'
import { ItemDetail, TITLE_CLASS } from '@/components/ItemDetail'
import { ItemReadme, ItemReadmeFallback } from '@/components/ItemReadme'

interface ItemDetailPageProps {
  params: Promise<{ category: string; slug: string }>
}

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const item = await getItemBySlug(slug)
  const t = await getTranslations('store')
  if (!item) return { title: t('detail.notFound') }
  const desc = item.description.slice(0, 160)
  return {
    title: `${item.name} — ${t(`category.${item.category}`)}`,
    description: desc,
    alternates: { canonical: `/store/${item.category}/${item.slug}` },
    openGraph: { type: 'article', title: item.name, description: desc },
  }
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { category, slug } = await params
  const item = await getItemBySlug(slug)

  if (!item || item.category !== category) notFound()

  const [versions, t] = await Promise.all([getItemVersions(slug), getTranslations('store')])

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 sm:px-6">
      <div className="flex h-14 items-center justify-between">
        <nav aria-label={t('detail.breadcrumb')} className="label">
          <Link href="/store" className="underline decoration-line-strong hover:text-ink hover:decoration-ink">
            {t('detail.breadcrumb')}
          </Link>{' '}
          /{' '}
          <Link
            href={`/store?category=${item.category}`}
            className="underline decoration-line-strong hover:text-ink hover:decoration-ink"
          >
            {t(`category.${item.category}`)}
          </Link>
        </nav>
        <FavoriteButton itemId={item.id} />
      </div>
      <div className="mt-2 border border-line bg-plate">
        <ItemDetail
          item={item}
          versions={versions}
          title={<h1 className={TITLE_CLASS}>{item.name}</h1>}
          readme={
            <Suspense fallback={<ItemReadmeFallback />}>
              <ItemReadme item={item} />
            </Suspense>
          }
        />
      </div>
    </div>
  )
}
