import Link from 'next/link'
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
    <div className="store-shell px-4 pb-20 lg:px-10">
      <nav aria-label={t('breadcrumb')} className="flex h-14 items-center gap-2 text-sm text-ink-2">
        <Link href="/store" className="link">
          {t('breadcrumb')}
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate text-ink">
          {publisher.name}
        </span>
      </nav>

      <header className="flex items-start gap-5 pb-10 pt-4">
        {publisher.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publisher.avatarUrl} alt="" className="h-16 w-16 shrink-0 border border-line object-cover sm:h-20 sm:w-20" />
        )}
        <div className="min-w-0">
          <h1 className="break-words text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">{publisher.name}</h1>
          <TierLabel tier={publisher.tier} className="mt-2 text-sm text-ink-2" />
          {publisher.bio && <p className="mt-3 max-w-[60ch] text-[15px] leading-6">{publisher.bio}</p>}
        </div>
      </header>

      <h2 className="label border-b border-ink pb-3">{t('items', { count: items.length })}</h2>
      {items.length > 0 ? <ItemTable items={items} /> : <p className="border-b border-line py-10 text-sm text-ink-2">{t('empty')}</p>}
    </div>
  )
}
