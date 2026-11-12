import { getItems } from '@/lib/catalog'
import type { CategoryCounts } from '@/components/CategoryFilter'
import { ItemTable } from '@/components/ItemTable'
import { ClearFiltersLink, StoreHeading, StoreToolbar } from '@/components/StoreToolbar'

interface StorePageProps {
  searchParams: Promise<{
    category?: string
    q?: string
    sort?: string
    verified?: string
  }>
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const rawCategory = sp.category
  const category =
    rawCategory === 'provider' || rawCategory === 'skill' || rawCategory === 'mcp' ? rawCategory : 'all'

  const sort = sp.sort === 'created' || sp.sort === 'rating' ? sp.sort : 'downloads'
  const verifiedOnly = sp.verified === '1'
  const q = sp.q?.trim() || undefined

  // One request for every category, so the tabs can show how many packages
  // each one holds under the current search and verified filter.
  const matching = (await getItems({ q, sort })).filter(
    (item) => !verifiedOnly || item.publisher.tier !== 'community'
  )
  const counts: CategoryCounts = { all: matching.length, skill: 0, mcp: 0, provider: 0 }
  for (const item of matching) counts[item.category] += 1
  const items = category === 'all' ? matching : matching.filter((item) => item.category === category)
  const filtered = Boolean(q) || verifiedOnly || category !== 'all'

  return (
    <div className="store-shell px-4 pb-16 lg:px-10">
      <StoreHeading />
      <StoreToolbar
        category={category}
        counts={counts}
        sort={sort}
        verifiedOnly={verifiedOnly}
        total={items.length}
        filtered={filtered}
      />
      <ItemTable items={items} emptyAction={<ClearFiltersLink />} />
    </div>
  )
}
