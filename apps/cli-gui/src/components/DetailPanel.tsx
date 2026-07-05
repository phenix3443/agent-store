import { useEffect, useState } from 'react'
import { Copy, Heart } from 'lucide-react'
import type { InstalledItem } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
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
  ratingOf,
  reviewCountOf,
  starGlyphs,
  reviewsFor,
  genVersions,
  buildReadme,
  installCmdOf,
} from '../lib/detailContent'

type Tab = 'overview' | 'reviews' | 'versions'

export function DetailPanel() {
  const { favoriteSlugs, toggleFavorite, bumpInstalledVersion, editingConfigSlug, setEditingConfigSlug } =
    useAppState()
  const { appendLine } = useTerminalLog()
  const detail = useSelectedDetail()
  const [tab, setTab] = useState<Tab>('overview')
  const [childCount, setChildCount] = useState(0)

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
        从左侧选择一个资源查看详情
      </div>
    )
  }

  async function install() {
    if (!detail || detail.installed) return
    appendLine(`$ aas install ${detail.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [detail.slug])
      appendLine(`✓ 已安装 ${detail.slug} ${result.version}`, 'green')
      bumpInstalledVersion()
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
  }

  const isFavorite = favoriteSlugs.has(detail.slug)
  const type = TYPE_META[detail.category]
  const tier = TIER_META[detail.publisher.tier] ?? TIER_META.community
  const status = STATUS_META[statusOf(detail)]
  const rating = ratingOf(detail)
  const reviews = reviewCountOf(detail)
  const readme = buildReadme(detail, detail.description)
  const reviewList = reviewsFor(detail.slug)
  const versions = genVersions(detail.version)

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
              <span className="text-store-amber">
                ★ {rating.toFixed(1)} ({reviews})
              </span>
              <span className={`font-semibold ${type.textClass}`}>{type.label}</span>
            </div>
            <p className="mt-3 max-w-[620px] text-sm leading-relaxed text-store-text-2">{detail.description}</p>
            <div className="mt-4 flex items-center gap-2">
              {detail.installed ? (
                <span className="flex items-center gap-1.5 rounded-lg border border-store-green bg-store-green-soft px-3 py-1.5 text-xs font-semibold text-store-green">
                  ✓ 已安装
                </span>
              ) : (
                <button
                  type="button"
                  onClick={install}
                  className="rounded-lg bg-store-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  安装
                </button>
              )}
              <button
                type="button"
                aria-label={isFavorite ? '取消收藏' : '收藏'}
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
                已有 {childCount} 份配置 · 在左侧列表展开该条目即可管理
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-store-border bg-black px-3 py-2.5 font-mono text-xs text-store-text-2">
          <span className="text-store-green">$</span>
          <span className="flex-1">{installCmdOf(detail.slug)}</span>
          <button
            type="button"
            aria-label="复制安装命令"
            onClick={() => navigator.clipboard?.writeText(installCmdOf(detail.slug))}
            className="text-store-text-3 hover:text-store-text"
          >
            <Copy size={12} />
          </button>
        </div>

        <div className="mt-5 flex gap-5 border-b border-store-border text-sm">
          {(
            [
              { key: 'overview', label: '概览' },
              { key: 'reviews', label: '评价' },
              { key: 'versions', label: '版本' },
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
                  <div key={i} className="rounded-lg border border-store-border bg-black px-3.5 py-3 font-mono text-xs text-store-text-2">
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
            <div className="flex items-center gap-4 rounded-xl border border-store-border bg-store-panel px-4 py-4">
              <div className="text-center">
                <div className="font-mono text-2xl font-extrabold leading-none text-store-text">
                  {rating.toFixed(1)}
                </div>
                <div className="mt-1 text-[11px] text-store-amber">{starGlyphs(rating)}</div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-store-text-2">{reviews} 条评价</div>
                <div className="mt-0.5 text-[11px] text-store-text-3">来自使用过该资源的开发者</div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-store-border-strong px-3.5 py-2 text-xs font-semibold text-store-text hover:border-store-accent hover:text-store-accent"
              >
                写评价
              </button>
            </div>
            {reviewList.map((r, i) => (
              <div key={i} className="rounded-xl border border-store-border bg-store-panel px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: r.avatarBg }}
                  >
                    {r.initial}
                  </div>
                  <span className="font-mono text-xs font-semibold text-store-text">{r.u}</span>
                  <span className="text-[11px] text-store-amber">{r.stars}</span>
                  <div className="flex-1" />
                  <span className="text-[10.5px] text-store-text-3">{r.d}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-store-text-2">{r.t}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'versions' && (
          <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-lg border border-store-border">
            {versions.map((v, i) => (
              <div key={i} className="flex items-center gap-3 bg-store-panel px-3.5 py-3">
                <span className="font-mono text-xs font-semibold text-store-text">{v.ver}</span>
                {v.latest && (
                  <span className="rounded bg-store-green-soft px-1.5 py-0.5 text-[9.5px] font-bold text-store-green">
                    latest
                  </span>
                )}
                <span className="flex-1 text-xs text-store-text-2">{v.note}</span>
                <span className="font-mono text-[11px] text-store-text-3">{v.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <InfoSidebar detail={detail} />
    </div>
  )
}
