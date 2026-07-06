'use client'

import type { Item } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check, Copy, Download, Heart, User, X } from 'lucide-react'
import { CATEGORY_META, CategoryGlyph, TIER_META, formatDownloads } from '@/lib/item-meta'
import { useClientState } from './ClientStateProvider'

interface DetailDrawerProps {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Tab = 'readme' | 'reviews' | 'versions'

const TABS: { key: Tab; label: string }[] = [
  { key: 'readme', label: '概览' },
  { key: 'reviews', label: '评价' },
  { key: 'versions', label: '版本' },
]

function metaStat(item: Item): { value: string; label: string } {
  if (item.category === 'provider') return { value: String(item.supportedModels.length), label: '模型' }
  if (item.category === 'mcp') return { value: item.transport, label: '传输' }
  return { value: String(item.compatibleWith.length), label: '兼容' }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function DetailDrawer({ item, open, onOpenChange }: DetailDrawerProps) {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  const isFavorite = !!favorites[item.id]
  const isInstalled = !!installed[item.id]
  const cat = CATEGORY_META[item.category]
  const tier = TIER_META[item.publisher.tier]
  const meta = metaStat(item)
  const installCmd = `agent-store add ${item.slug}`

  const [tab, setTab] = useState<Tab>('readme')
  const [actionsOpen, setActionsOpen] = useState(false)

  function copyCmd() {
    navigator.clipboard?.writeText(installCmd)
    setActionsOpen(false)
  }

  // ⌘K opens/closes the action panel; other shortcuts fire while it is open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault()
        setActionsOpen((v) => !v)
        return
      }
      if (!actionsOpen) return
      if ((e.metaKey || e.ctrlKey) && k === 'f') {
        e.preventDefault()
        toggleFavorite(item.id)
      } else if ((e.metaKey || e.ctrlKey) && k === 'c') {
        e.preventDefault()
        copyCmd()
      } else if (k === 'enter' && !isInstalled) {
        e.preventDefault()
        toggleInstalled(item.id)
        setActionsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, actionsOpen, isInstalled, item.id])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            if (actionsOpen) {
              e.preventDefault()
              setActionsOpen(false)
            }
          }}
          className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-store-border-strong bg-store-win p-6"
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-[26px]"
              style={{ background: cat.soft, color: cat.color }}
            >
              <CategoryGlyph category={item.category} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Dialog.Title className="truncate font-mono text-lg font-bold text-store-text">{item.name}</Dialog.Title>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{ background: tier.soft, color: tier.color }}
                >
                  {tier.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-store-text-2">
                {item.publisher.name} · <span style={{ color: cat.color }}>{cat.label}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label={isFavorite ? '取消收藏' : '收藏'}
              onClick={() => toggleFavorite(item.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-store-border hover:bg-store-panel"
            >
              <Heart size={16} className={isFavorite ? 'fill-store-red text-store-red' : 'text-store-text-3'} />
            </button>
            <Dialog.Close
              aria-label="关闭"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-store-border text-store-text-3 hover:bg-store-panel"
            >
              <X size={15} />
            </Dialog.Close>
          </div>

          <div className="my-[18px] flex items-center gap-2.5 rounded-[10px] border border-store-border bg-store-term-bg px-3.5 py-3">
            <span className="font-mono text-[13px] text-store-green">$</span>
            <span className="flex-1 truncate font-mono text-[13px] text-[#e6e6ea]">{installCmd}</span>
            <button type="button" aria-label="复制安装命令" onClick={copyCmd} className="shrink-0 text-store-text-2 hover:text-store-text">
              <Copy size={15} />
            </button>
          </div>

          <div className="mb-[18px] grid grid-cols-4 gap-2.5">
            <div className="rounded-[10px] border border-store-border bg-store-panel px-2.5 py-3">
              <div className="font-mono text-[15px] font-bold text-store-text">{formatDownloads(item.downloads)}</div>
              <div className="mt-0.5 text-[10px] text-store-text-3">下载</div>
            </div>
            <div className="rounded-[10px] border border-store-border bg-store-panel px-2.5 py-3">
              <div className="font-mono text-[15px] font-bold text-store-star">★ {item.rating.toFixed(1)}</div>
              <div className="mt-0.5 text-[10px] text-store-text-3">评分</div>
            </div>
            <div className="rounded-[10px] border border-store-border bg-store-panel px-2.5 py-3">
              <div className="font-mono text-[15px] font-bold text-store-text">v{item.version}</div>
              <div className="mt-0.5 text-[10px] text-store-text-3">版本</div>
            </div>
            <div className="rounded-[10px] border border-store-border bg-store-panel px-2.5 py-3">
              <div className="truncate font-mono text-[15px] font-bold text-store-text">{meta.value}</div>
              <div className="mt-0.5 text-[10px] text-store-text-3">{meta.label}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleInstalled(item.id)}
            className={`mb-3 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${
              isInstalled
                ? 'border border-store-green bg-store-green-soft text-store-green'
                : 'bg-store-accent text-white shadow-[0_6px_18px_var(--accent-soft)] hover:brightness-110'
            }`}
          >
            {isInstalled ? (
              <>
                <Check size={16} />
                已安装到 CLI 客户端
              </>
            ) : (
              <>
                <Download size={16} />
                安装到 CLI 客户端
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            className="mb-[22px] flex h-10 items-center justify-center gap-2 rounded-xl border border-store-border-strong text-store-text-2 hover:bg-store-panel hover:text-store-text"
          >
            <span className="text-[13px] font-semibold">操作</span>
            <span className="rounded-[5px] bg-store-panel-2 px-1.5 py-px font-mono text-[11px] text-store-text-3">⌘K</span>
          </button>

          {/* tabs */}
          <div className="mb-4 flex gap-1 rounded-[10px] bg-store-panel p-1">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`flex-1 rounded-[7px] py-[7px] text-center text-[12.5px] font-semibold ${
                  tab === tb.key ? 'bg-store-win text-store-text' : 'text-store-text-3'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'readme' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-store-text-2">{item.description}</p>
              {item.category === 'provider' && (
                <div className="text-sm">
                  <p className="mb-1 font-medium text-store-text">支持的模型</p>
                  <p className="text-store-text-2">{item.supportedModels.join(' · ')}</p>
                </div>
              )}
              {item.category === 'mcp' && (
                <div className="text-sm">
                  <p className="mb-1 font-medium text-store-text">传输方式</p>
                  <p className="text-store-text-2">
                    {item.transport}
                    {item.transport === 'stdio' ? ` · ${item.serverCommand}` : ` · ${item.url}`}
                  </p>
                </div>
              )}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((t) => (
                    <span key={t} className="rounded-md bg-store-code-bg px-2.5 py-1 font-mono text-xs text-store-text-2">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-store-border bg-store-panel px-4 py-8 text-center">
              <div className="font-mono text-3xl font-bold text-store-star">★ {item.rating.toFixed(1)}</div>
              <div className="text-xs text-store-text-3">基于 {formatDownloads(item.downloads)} 次安装的综合评分</div>
            </div>
          )}

          {tab === 'versions' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg border border-store-border bg-store-panel px-3.5 py-3">
                <span className="font-mono text-sm font-bold text-store-text">v{item.version}</span>
                <span className="rounded bg-store-accent-soft px-2 py-0.5 text-[10px] font-bold text-store-accent">最新</span>
              </div>
              <div className="text-xs text-store-text-3">更新于 {formatDate(item.updatedAt)}</div>
            </div>
          )}
        </Dialog.Content>

        {/* ===== Action Panel (⌘K) ===== */}
        {actionsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-end bg-black/35 p-6"
            onClick={() => setActionsOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-[300px] overflow-hidden rounded-[14px] border border-store-border-strong bg-store-win shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-center gap-2 border-b border-store-border px-3.5 py-[11px]">
                <div
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[13px]"
                  style={{ background: cat.soft, color: cat.color }}
                >
                  <CategoryGlyph category={item.category} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[12.5px] font-bold text-store-text">{item.name}</div>
                </div>
                <span className="text-[10px] text-store-text-3">操作</span>
              </div>
              <div className="p-1.5">
                {isInstalled ? (
                  <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 opacity-55">
                    <Check size={15} className="text-store-green" />
                    <span className="flex-1 text-[12.5px] font-semibold text-store-text-2">已安装</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      toggleInstalled(item.id)
                      setActionsOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-store-accent-soft"
                  >
                    <Download size={15} className="text-store-accent" />
                    <span className="flex-1 text-left text-[12.5px] font-semibold text-store-text">安装</span>
                    <span className="font-mono text-[10.5px] text-store-text-3">↵</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-store-panel-2"
                >
                  <Heart size={15} className={isFavorite ? 'fill-store-red text-store-red' : 'text-store-text-2'} />
                  <span className="flex-1 text-left text-[12.5px] font-semibold text-store-text">
                    {isFavorite ? '取消收藏' : '加入收藏'}
                  </span>
                  <span className="font-mono text-[10.5px] text-store-text-3">⌘F</span>
                </button>
                <button
                  type="button"
                  onClick={copyCmd}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-store-panel-2"
                >
                  <Copy size={15} className="text-store-text-2" />
                  <span className="flex-1 text-left text-[12.5px] font-semibold text-store-text">复制安装命令</span>
                  <span className="font-mono text-[10.5px] text-store-text-3">⌘C</span>
                </button>
                <Link
                  href={`/publisher/${item.publisher.slug}`}
                  onClick={() => setActionsOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-store-panel-2"
                >
                  <User size={15} className="text-store-text-2" />
                  <span className="flex-1 text-left text-[12.5px] font-semibold text-store-text">查看作者主页</span>
                </Link>
              </div>
              <div className="flex items-center gap-3 border-t border-store-border px-3.5 py-2.5 font-mono text-[10.5px] text-store-text-3">
                <span>↑↓ 选择</span>
                <span>↵ 执行</span>
                <span className="ml-auto">esc 关闭</span>
              </div>
            </div>
          </div>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  )
}
