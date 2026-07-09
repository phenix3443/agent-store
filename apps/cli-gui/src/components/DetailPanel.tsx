import { useEffect, useState } from 'react'
import { Copy, Heart } from 'lucide-react'
import type { InstalledItem, PackageReview, UserReview, ItemVersion } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { useT } from '../i18n'
import { useTerminalLog } from '../state/TerminalLog'
import { useSelectedDetail } from '../lib/useSelectedDetail'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import { InfoSidebar } from './InfoSidebar'
import { CategoryIcon } from './CategoryIcon'
import {
  TYPE_META,
  TIER_META,
  STATUS_META,
  statusOf,
  buildReadme,
  installCmdOf,
} from '../lib/detailContent'

type Tab = 'overview' | 'reviews' | 'versions'

const RISK_META: Record<string, { labelKey: string; cls: string }> = {
  low: { labelKey: 'riskLow', cls: 'text-store-green bg-store-green-soft' },
  medium: { labelKey: 'riskMedium', cls: 'text-store-amber bg-store-amber-soft' },
  high: { labelKey: 'riskHigh', cls: 'text-store-red border border-store-red' },
}

export function DetailPanel() {
  const { favoriteSlugs, toggleFavorite, bumpInstalledVersion, editingConfigSlug, setEditingConfigSlug } =
    useAppState()
  const { appendLine } = useTerminalLog()
  const detail = useSelectedDetail()
  const t = useT()
  const [tab, setTab] = useState<Tab>('overview')
  const [childCount, setChildCount] = useState(0)
  const [userReviews, setUserReviews] = useState<UserReview[]>([])
  const [versions, setVersions] = useState<ItemVersion[]>([])

  useEffect(() => {
    if (!detail) return
    callRpc<UserReview[]>('getReviews', [detail.slug])
      .then((r) => setUserReviews(r ?? []))
      .catch(() => setUserReviews([]))
    callRpc<ItemVersion[]>('getVersions', [detail.slug])
      .then((v) => setVersions(v ?? []))
      .catch(() => setVersions([]))
  }, [detail])

  useEffect(() => {
    if (!detail || detail.category !== 'provider' || !detail.installed) {
      setChildCount(0)
      return
    }
    callRpc<InstalledItem[]>('list').then((items) => {
      setChildCount(items.filter((i) => i.parentSlug === detail.slug).length)
    })
  }, [detail])

  if (editingConfigSlug) {
    return <ProviderConfigPanel slug={editingConfigSlug} onClose={() => setEditingConfigSlug(null)} />
  }

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-store-text-2">
        {t('detail.selectHint')}
      </div>
    )
  }

  async function install() {
    if (!detail || detail.installed) return
    appendLine(`$ aas install ${detail.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [detail.slug])
      appendLine(`✓ ${t('detail.installedPrefix')} ${detail.slug} ${result.version}`, 'green')
      bumpInstalledVersion()
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
  }

  const isFavorite = favoriteSlugs.has(detail.slug)
  const type = TYPE_META[detail.category]
  const tier = TIER_META[detail.publisher.tier] ?? TIER_META.community
  const status = STATUS_META[statusOf(detail)]
  const readme = buildReadme(detail, detail.description)
  const review: PackageReview | undefined = 'review' in detail ? detail.review : undefined

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start gap-5 border-b border-store-border pb-5">
          <CategoryIcon category={detail.category} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl font-bold text-store-text">{detail.name}</h2>
              {detail.publisher.tier !== 'community' && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tier.textClass} ${tier.bgClass}`}>
                  {tier.label}
                </span>
              )}
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.textClass} ${status.borderClass}`}
              >
                {status.label}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-store-text-2">
              <span className="font-semibold">{detail.publisher.name}</span>
              <span className="text-store-border-strong">|</span>
              <span className="text-store-text-3">↓ {detail.downloads}</span>
              {review && <span className="text-store-amber">{t('detail.quality')} {review.quality}/5</span>}
              <span className={`font-semibold ${type.textClass}`}>{type.label}</span>
            </div>
            <p className="mt-3 max-w-[620px] text-sm leading-relaxed text-store-text-2">{detail.description}</p>
            <div className="mt-4 flex items-center gap-2">
              {detail.installed ? (
                <span className="flex items-center gap-1.5 rounded-lg border border-store-green bg-store-green-soft px-3 py-1.5 text-xs font-semibold text-store-green">
                  ✓ {t('common.installed')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={install}
                  className="rounded-lg bg-store-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  {t('common.install')}
                </button>
              )}
              <button
                type="button"
                aria-label={isFavorite ? t('detail.unfavorite') : t('detail.favorite')}
                onClick={() => toggleFavorite(detail.slug)}
                className={`rounded-lg border px-2 py-1.5 ${
                  isFavorite ? 'border-store-red text-store-red' : 'border-store-border-strong text-store-text-2'
                }`}
              >
                <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            {childCount > 0 && (
              <p className="mt-2 text-xs text-store-text-2">
                {childCount} {t('detail.configCountSuffix')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-store-border bg-store-term-bg px-3 py-2.5 font-mono text-xs text-store-text-2">
          <span className="text-store-green">$</span>
          <span className="flex-1">{installCmdOf(detail.slug)}</span>
          <button
            type="button"
            aria-label={t('detail.copyCmd')}
            onClick={() => navigator.clipboard?.writeText(installCmdOf(detail.slug))}
            className="text-store-text-3 hover:text-store-text"
          >
            <Copy size={12} />
          </button>
        </div>

        <div className="mt-5 flex gap-5 border-b border-store-border text-sm">
          {(
            [
              { key: 'overview', label: t('nav.overview') },
              { key: 'reviews', label: t('detail.tabReview') },
              { key: 'versions', label: t('detail.tabVersion') },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pb-2.5 font-semibold ${tab === t.key ? 'border-b-2 border-store-accent text-store-text' : 'text-store-text-3'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="mt-5 flex flex-col gap-3">
            {readme.map((block, i) => {
              if (block.type === 'h') {
                return (
                  <h3 key={i} className="mt-1 border-b border-store-border pb-2 text-[15px] font-bold text-store-text">
                    {block.text}
                  </h3>
                )
              }
              if (block.type === 'p') {
                return (
                  <p key={i} className="text-sm leading-relaxed text-store-text-2">
                    {block.text}
                  </p>
                )
              }
              if (block.type === 'code') {
                return (
                  <div key={i} className="rounded-lg border border-store-border bg-store-term-bg px-3.5 py-3 font-mono text-xs text-store-text-2">
                    {block.text}
                  </div>
                )
              }
              return (
                <div key={i} className="flex gap-2 text-sm leading-relaxed text-store-text-2">
                  <span className={type.textClass}>▹</span>
                  <span>{block.text}</span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'reviews' && (
          <div className="mt-5 flex flex-col gap-3">
            {review ? (
              <>
                <div className="flex items-center gap-4 rounded-xl border border-store-border bg-store-panel px-4 py-4">
                  <div className="text-center">
                    <div className="font-mono text-2xl font-extrabold leading-none text-store-text">{review.quality}/5</div>
                    <div className="mt-1 text-[11px] text-store-text-3">{t('detail.qualityScore')}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${(RISK_META[review.risk] ?? RISK_META.medium).cls}`}
                    >
                      {t(`detail.${(RISK_META[review.risk] ?? RISK_META.medium).labelKey}`)}
                    </span>
                    <p className="mt-2 text-xs leading-relaxed text-store-text-2">{review.summary}</p>
                  </div>
                </div>
                {review.concerns.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-xl border border-store-border bg-store-panel px-4 py-3.5">
                    <p className="text-xs font-semibold text-store-text-2">{t('detail.reviewPoints')}</p>
                    {review.concerns.map((c, i) => (
                      <div key={i} className="flex gap-2 text-xs leading-relaxed text-store-text-2">
                        <span className="text-store-amber">⚠</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-store-text-3">{t('detail.autoReviewNote')}</p>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-store-border bg-store-panel px-4 py-8 text-center text-sm text-store-text-3">
                {t('detail.noReview')}
              </div>
            )}

            {userReviews.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-xs font-semibold text-store-text-2">{t('detail.userReviews')}（{userReviews.length}）</p>
                {userReviews.map((r, i) => (
                  <div key={i} className="rounded-xl border border-store-border bg-store-panel px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-store-text">{r.authorName ?? t('detail.anon')}</span>
                      <span className="text-[11px] text-store-amber">{'★'.repeat(r.rating)}</span>
                      <span className="ml-auto text-[10.5px] text-store-text-3">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {r.body && <p className="mt-1.5 text-xs leading-relaxed text-store-text-2">{r.body}</p>}
                  </div>
                ))}
                <p className="text-[11px] text-store-text-3">{t('detail.reviewOnWeb')}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'versions' && (
          <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-lg border border-store-border">
            {(versions.length > 0 ? versions : [{ version: detail.version, publishedAt: '' }]).map((v, i) => (
              <div key={v.version} className="flex items-center gap-3 bg-store-panel px-3.5 py-3">
                <span className="font-mono text-xs font-semibold text-store-text">v{v.version}</span>
                {i === 0 && (
                  <span className="rounded bg-store-green-soft px-1.5 py-0.5 text-[9.5px] font-bold text-store-green">
                    latest
                  </span>
                )}
                <span className="flex-1 text-xs text-store-text-2">{i === 0 ? t('detail.currentVersion') : ''}</span>
                {v.publishedAt && (
                  <span className="font-mono text-[11px] text-store-text-3">
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <InfoSidebar detail={detail} />
    </div>
  )
}
