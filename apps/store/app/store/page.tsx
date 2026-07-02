import { getItems, getFeaturedItems } from '@/lib/mock/items'
import { Header } from '@/components/Header'
import { FeaturedCarousel } from '@/components/FeaturedCarousel'
import { CategoryTabs } from '@/components/CategoryTabs'
import { SortSelect } from '@/components/SortSelect'
import { SearchInput } from '@/components/SearchInput'
import { ItemGrid } from '@/components/ItemGrid'
import { PublishModalTrigger } from '@/components/PublishModalTrigger'

interface StorePageProps {
  searchParams: {
    category?: string
    q?: string
    sort?: string
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

  const items = getItems({ category, q: searchParams.q, sort })
  const featured = getFeaturedItems()

  return (
    <>
      <Header />
      <PublishModalTrigger />
      <main className="flex flex-col gap-6 py-8">
        <FeaturedCarousel items={featured} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryTabs active={category ?? 'all'} />
          <div className="flex items-center gap-3">
            <SearchInput defaultValue={searchParams.q} />
            <SortSelect active={sort} />
          </div>
        </div>

        <ItemGrid items={items} />
      </main>
    </>
  )
}
