import type { Metadata } from 'next'
import { getCollections } from '@/lib/collections'
import { ItemTable } from '@/components/ItemTable'

export const metadata: Metadata = {
  title: '合集',
  description: '精选的技能、MCP 服务器与供应商合集，帮你快速找到值得安装的。',
  alternates: { canonical: '/collections' },
}

export default async function CollectionsPage() {
  const collections = await getCollections()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-2xl font-semibold text-store-text">合集</h1>
      <p className="mb-8 text-sm text-store-text-3">精选分组，帮你快速找到值得装的。</p>

      <div className="flex flex-col gap-10">
        {collections.map(({ collection, items }) => (
          <section key={collection.slug}>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-store-text">{collection.title}</h2>
              <p className="text-sm text-store-text-3">{collection.description}</p>
            </div>
            <ItemTable items={items} />
          </section>
        ))}
      </div>
    </div>
  )
}
