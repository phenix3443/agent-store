import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPublisherWithItems } from '@/lib/catalog'
import { ItemTable } from '@/components/ItemTable'
import { TierLabel } from '@/components/TierLabel'

interface PublisherPageProps {
  params: Promise<{ name: string }>
}

export default async function PublisherPage({ params }: PublisherPageProps) {
  const { name } = await params
  const result = await getPublisherWithItems(name)
  if (!result) notFound()

  const { publisher, items } = result
  const t = await getTranslations('store.publisher')

  return (
    <div className="px-4 pb-16 pt-8 lg:px-10">
      <div className="mb-8 flex items-center gap-4">
        {publisher.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publisher.avatarUrl} alt="" className="h-14 w-14 border border-line object-cover" />
        )}
        <div>
          <h1 className="text-[28px] leading-8 tracking-[-0.02em]">{publisher.name}</h1>
          <TierLabel tier={publisher.tier} className="mt-1 text-sm text-ink-2" />
          {publisher.bio && <p className="mt-2 max-w-[60ch] text-sm text-ink-2">{publisher.bio}</p>}
        </div>
      </div>

      <h2 className="label border-b border-ink pb-3">{t('items', { count: items.length })}</h2>
      {items.length > 0 ? <ItemTable items={items} /> : <p className="py-10 text-sm text-ink-2">{t('empty')}</p>}
    </div>
  )
}
