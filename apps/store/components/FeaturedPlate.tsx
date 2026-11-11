import type { Item } from '@as/types'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { itemHref } from '@/lib/item-href'
import { formatDownloads } from '@/lib/item-meta'
import { installCommand, reviewVerdict, runEntries } from '@/lib/review'
import { CopyCommandButton } from './CopyCommandButton'
import { PlateMarks } from './PlateMarks'
import { ReviewStamp } from './ReviewStamp'
import { PendingIcon, WarnIcon } from './ReviewStatus'
import { TierLabel } from './TierLabel'

/** One package set as a plate: the review verdict and the install command on a single sheet. */
export function FeaturedPlate({ item }: { item: Item }) {
  const t = useTranslations('store')
  const tHome = useTranslations('site.home')
  const verdict = reviewVerdict(item)
  const command = installCommand(item)
  const run = runEntries(item).find((entry) => entry.kind !== 'provider' && entry.value)

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
      <p className="mt-3 max-w-[56ch] text-[15px] leading-6">{item.description}</p>

      <section className="relative mt-10 border-b border-t border-line border-t-ink py-4">
        <h4 className="label">{t('review.title')}</h4>
        <p className={`mt-2 flex items-start gap-2 text-[15px] leading-6 ${verdict === 'passed' ? 'pr-[104px] sm:pr-[124px]' : ''}`}>
          {verdict === 'flagged' && <span className="mt-0.5"><WarnIcon size={20} /></span>}
          {verdict === 'pending' && <span className="mt-0.5"><PendingIcon size={20} /></span>}
          <span>
            <b className="font-semibold">{t(`review.${verdict}`)}</b>
            {item.review ? <>{' · '}{item.review.summary}</> : <>{' · '}{t('review.pendingBody')}</>}
          </span>
        </p>
        {verdict === 'passed' && (
          <ReviewStamp
            label={t('review.stampLabel')}
            word={t('review.passed')}
            className="absolute -right-2 -top-7 h-[104px] w-[104px] sm:-right-4 sm:-top-8 sm:h-[124px] sm:w-[124px]"
          />
        )}
      </section>

      {run?.value && (
        <section className="mt-5">
          <h4 className="label mb-2">{t('detail.runsTitle')}</h4>
          <p className="break-all border-b border-t border-line py-2.5 font-mono text-[13px] leading-5">{run.value}</p>
        </section>
      )}

      <section className="mt-5">
        <h4 className="label mb-2">{t('detail.installTitle')}</h4>
        <div className="flex min-h-12 items-center gap-2 border border-ink bg-paper pl-3.5 pr-2 font-mono text-sm">
          <span aria-hidden className="select-none self-start py-3 leading-6 text-ink-2">$</span>
          <code className="min-w-0 flex-1 py-3 leading-6 [overflow-wrap:anywhere]">{command}</code>
          <CopyCommandButton command={command} name={item.name} className="shrink-0" />
        </div>
      </section>

      <Link href={itemHref(item)} scroll={false} className="link mt-5 inline-block text-sm">
        {tHome('plateOpen')}
      </Link>
    </article>
  )
}
