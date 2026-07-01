import { notFound } from 'next/navigation'
import { getPublisherBySlug, getPublisherItems } from '@/lib/mock/items'
import { ItemCard } from '@/components/ItemCard'
import { Badge } from '@/components/Badge'
import { Header } from '@/components/Header'

interface PublisherPageProps {
  params: { name: string }
}

export default function PublisherPage({ params }: PublisherPageProps) {
  const publisher = getPublisherBySlug(params.name)
  if (!publisher) notFound()

  const items = getPublisherItems(params.name)

  return (
    <>
      <Header />
      <main className="py-8">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-store-border bg-store-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publisher.avatarUrl} alt={publisher.name} className="h-12 w-12 rounded-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-store-text">{publisher.name}</h1>
              <Badge variant={publisher.tier}>{publisher.tier}</Badge>
            </div>
            {publisher.bio && <p className="mt-1 text-sm text-store-text-2">{publisher.bio}</p>}
          </div>
        </div>

        <h2 className="mb-4 text-lg font-medium text-store-text">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </h2>

        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-store-border bg-store-panel">
            <p className="text-store-text-3">No published items yet.</p>
          </div>
        )}
      </main>
    </>
  )
}
