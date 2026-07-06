import { notFound } from 'next/navigation'
import { getItemBySlug } from '@/lib/catalog'
import { Badge } from '@/components/Badge'

interface ItemDetailPageProps {
  params: { category: string; slug: string }
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const item = await getItemBySlug(params.slug)

  if (!item || item.category !== params.category) notFound()

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <main className="py-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-store-border bg-store-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.icon} alt={item.name} className="h-12 w-12 object-contain" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-store-text">{item.name}</h1>
              <span className="text-store-text-3">v{item.version}</span>
              <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
            </div>
            <p className="mt-1 text-store-text-2">{item.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded-md border border-store-border bg-store-panel px-2 py-0.5 text-xs text-store-text-3">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <p className="mb-2 text-sm font-medium text-store-text">Install</p>
          <code className="block rounded-lg border border-store-border bg-store-content px-3 py-2 font-mono text-xs text-store-text">
            agent-store add {item.slug}
          </code>
        </div>
      </main>
    </div>
  )
}
