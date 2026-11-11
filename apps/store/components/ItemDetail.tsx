import type { Item, ItemVersion } from '@as/types'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatDownloads } from '@/lib/item-meta'
import { reviewVerdict, runEntries, type RunEntry } from '@/lib/review'
import { InstallPanel } from './InstallPanel'
import { ReviewStamp } from './ReviewStamp'
import { PendingIcon, WarnIcon } from './ReviewStatus'
import { ReviewsSection } from './ReviewsSection'
import { TierLabel } from './TierLabel'

interface ItemDetailProps {
  item: Item
  versions: ItemVersion[]
  /** The package name: a Dialog.Title in the drawer, an h1 on the page. */
  title: React.ReactNode
  /** README section, streamed by the caller so the first screen does not wait on it. */
  readme?: React.ReactNode
}

const RUN_LABEL: Record<RunEntry['kind'], string> = {
  command: 'runCommand',
  connect: 'runConnect',
  file: 'runFile',
  download: 'runDownload',
  config: 'runConfig',
  provider: 'runProvider',
}

const RISK_LABEL: Record<string, string> = { low: 'riskLow', medium: 'riskMedium', high: 'riskHigh' }

export const TITLE_CLASS = 'mt-2.5 break-words text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[40px]'

export function ItemDetail({ item, versions, title, readme }: ItemDetailProps) {
  const t = useTranslations('store')
  const locale = useLocale()
  const verdict = reviewVerdict(item)
  const review = item.review
  const runs = runEntries(item)
  const reviewCount = item.reviewCount ?? 0
  const dateFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })

  const specs: { label: string; value: string }[] = [
    { label: t('detail.version'), value: `v${item.version}` },
    { label: t('detail.compatible'), value: item.compatibleWith.join(', ') },
  ]
  if (item.category === 'mcp') specs.push({ label: t('detail.transport'), value: item.transport })
  if (item.category === 'provider' && item.supportedModels.length > 0)
    specs.push({ label: t('detail.models'), value: item.supportedModels.join(', ') })
  if (item.tags.length > 0) specs.push({ label: t('detail.tags'), value: item.tags.join(', ') })

  return (
    <article className="plate px-5 pb-8 pt-5 sm:px-6 sm:pt-[22px]" data-verdict={verdict}>
      <i className="plate-mark -left-2 -top-2" />
      <i className="plate-mark -right-2 -top-2" />
      <i className="plate-mark -bottom-2 -left-2" />
      <i className="plate-mark -bottom-2 -right-2" />

      <header>
        <p className="label">{t(`category.${item.category}`)}</p>
        {title}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <Link href={`/publisher/${item.publisher.slug}`} className="font-medium text-ink underline decoration-line-strong hover:decoration-ink">
            {item.publisher.name}
          </Link>
          <TierLabel tier={item.publisher.tier} />
          <span aria-hidden>·</span>
          <span>{t('detail.installs', { count: formatDownloads(item.downloads) })}</span>
          {reviewCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{t('detail.rating', { rating: item.rating.toFixed(1), count: reviewCount })}</span>
            </>
          )}
        </p>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-6">{item.description}</p>
      </header>

      <section className="relative mt-7 border-b border-t border-line border-t-ink py-4">
        <h2 className="label">{t('review.title')}</h2>
        <div className={verdict === 'passed' ? 'pr-[104px] sm:pr-[132px]' : ''}>
          <p className="mt-2 flex items-start gap-2 text-base leading-6">
            {verdict === 'flagged' && <span className="mt-0.5"><WarnIcon size={20} /></span>}
            {verdict === 'pending' && <span className="mt-0.5"><PendingIcon size={20} /></span>}
            <span>
              <b className="font-semibold">{t(`review.${verdict}`)}</b>
              {review ? <>{' · '}{review.summary}</> : null}
            </span>
          </p>
          {!review && <p className="mt-1.5 max-w-[52ch] text-sm leading-[22px] text-ink-2">{t('review.pendingBody')}</p>}
          {review && review.concerns?.length > 0 && (
            <ul aria-label={t('review.concerns')} className="mt-2 list-disc space-y-1 pl-5 text-sm leading-[22px] marker:text-ink-2">
              {review.concerns.map((concern) => (
                <li key={concern}>{concern}</li>
              ))}
            </ul>
          )}
          {review && (
            <p className="mt-2 text-[13px] text-ink-2">
              {t('review.automated')}
              {RISK_LABEL[review.risk] ? <> · {t(`review.${RISK_LABEL[review.risk]}`)}</> : null}
              {' · '}
              {t('review.quality', { score: review.quality })}
            </p>
          )}
        </div>
        {verdict === 'passed' && (
          <ReviewStamp
            label={t('review.stampLabel')}
            word={t('review.passed')}
            className="absolute -right-3 -top-9 h-[112px] w-[112px] sm:-right-[18px] sm:-top-11 sm:h-[148px] sm:w-[148px]"
          />
        )}
      </section>

      <section className="mt-6">
        <h2 className="label mb-2">{t('detail.runsTitle')}</h2>
        <ul>
          {runs.map((run, i) => (
            <li
              key={i}
              className="grid min-h-[42px] grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 border-t border-line py-2.5 text-sm last:border-b"
            >
              <span className="text-[13px] text-ink-2">{t(`detail.${RUN_LABEL[run.kind]}`)}</span>
              {run.kind === 'provider' ? (
                <span>{t('detail.providerNote')}</span>
              ) : (
                <span className="break-all font-mono text-[13px] leading-5">
                  {run.dest ? t('detail.downloadTo', { url: run.value ?? '', dest: run.dest }) : run.value}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="label mb-2">{t('detail.installTitle')}</h2>
        <InstallPanel item={item} />
      </section>

      <section className="mt-7">
        <h2 className="label mb-2">{t('detail.specsTitle')}</h2>
        <dl>
          {specs.map((spec) => (
            <div
              key={spec.label}
              className="grid min-h-[42px] grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 border-t border-line py-2.5 text-sm last:border-b"
            >
              <dt className="text-[13px] text-ink-2">{spec.label}</dt>
              <dd className="break-words font-mono text-[13px] leading-5">{spec.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {readme}

      {versions.length > 0 && (
        <section className="mt-9">
          <h2 className="label mb-2">{t('detail.versionsTitle')}</h2>
          <ul>
            {versions.map((v, i) => (
              <li key={v.version} className="flex min-h-[42px] items-center gap-3 border-t border-line text-sm last:border-b">
                <span className="font-mono">v{v.version}</span>
                {i === 0 && <span className="label text-ink">{t('detail.latest')}</span>}
                <time dateTime={v.publishedAt} className="ml-auto font-mono text-[13px] text-ink-2">
                  {dateFormat.format(new Date(v.publishedAt))}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReviewsSection slug={item.slug} rating={item.rating} reviewCount={reviewCount} />
    </article>
  )
}
