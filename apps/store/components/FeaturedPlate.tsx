import type { Item } from '@as/types'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { itemHref } from '@/lib/item-href'
import { formatDownloads, leadSentence } from '@/lib/item-meta'
import { PlateMarks } from './PlateMarks'
import { TierLabel } from './TierLabel'

/** One package set as a plate on the landing page. What runs and the install command live in the detail. */
export function FeaturedPlate({ item }: { item: Item }) {
  const t = useTranslations('store')
  const tHome = useTranslations('site.home')

  return (
    <article className="plate bg-plate px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6" aria-labelledby={`plate-${item.slug}`}>
      <PlateMarks />
      <p className="label">{t(`category.${item.category}`)}</p>
      <h3 id={`plate-${item.slug}`} className="mt-3 break-words text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[40px]">
        {item.name}
      </h3>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
        <span className="font-medium text-ink">{item.publisher.name}</span>
        <TierLabel tier={item.publisher.tier} />
        <span aria-hidden>·</span>
        <span>{t('detail.installs', { count: formatDownloads(item.downloads) })}</span>
      </p>
      <p className="mt-4 max-w-[56ch] text-[15px] leading-6">{leadSentence(item.description)}</p>

      <Link href={itemHref(item)} scroll={false} className="btn mt-8 min-h-12 px-5">
        {tHome('plateOpen')}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </article>
  )
}
