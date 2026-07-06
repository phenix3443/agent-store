import { getItems, getFeaturedItems } from '@/lib/catalog'
import { FeaturedCarousel } from '@/components/FeaturedCarousel'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SortSelect } from '@/components/SortSelect'
import { SearchInput } from '@/components/SearchInput'
import { VerifiedToggle } from '@/components/VerifiedToggle'
import { ItemGrid } from '@/components/ItemGrid'
import { PublishModalTrigger } from '@/components/PublishModalTrigger'

interface StorePageProps {
  searchParams: {
    category?: string
    q?: string
    sort?: string
    verified?: string
  }
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const rawCategory = searchParams.category
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp'
      ? rawCategory
      : null

  const sort =
    searchParams.sort === 'created' || searchParams.sort === 'rating'
      ? searchParams.sort
      : 'downloads'

  const verifiedOnly = searchParams.verified === '1'

  const allItems = await getItems({ category, q: searchParams.q, sort })
  const items = verifiedOnly
    ? allItems.filter((item) => item.publisher.tier !== 'community')
    : allItems
  const featured = await getFeaturedItems()

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PublishModalTrigger />
      <FeaturedCarousel items={featured} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SortSelect active={sort} />
        <div className="flex flex-wrap items-center gap-2.5">
          <CategoryTabs active={category ?? 'all'} />
          <VerifiedToggle active={verifiedOnly} />
          <SearchInput defaultValue={searchParams.q} />
        </div>
      </div>

      <ItemGrid items={items} />
    </div>
  )
}
