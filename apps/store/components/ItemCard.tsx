'use client'

import type { Item } from '@as/types'
import Link from 'next/link'
import { Check, CheckCircle2, Heart } from 'lucide-react'
import { CATEGORY_META, CategoryGlyph, formatDownloads } from '@/lib/item-meta'
import { useClientState } from './ClientStateProvider'

interface ItemCardProps {
  item: Item
}

export function ItemCard({ item }: ItemCardProps) {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  const isFavorite = !!favorites[item.id]
  const isInstalled = !!installed[item.id]
  const cat = CATEGORY_META[item.category]
  const tier = item.publisher.tier

  return (
    <Link
      href={`/store/${item.category}/${item.slug}`}
      className="group flex flex-col rounded-2xl border border-store-border p-[18px] transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-[3px] hover:border-store-border-strong hover:shadow-[0_14px_34px_rgba(0,0,0,0.34)]"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.028), transparent 42%), var(--panel)' }}
    >
      <div className="flex items-start gap-[13px]">
        <div
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px] text-[22px]"
          style={{ background: cat.soft, color: cat.color, boxShadow: `0 6px 18px ${cat.soft}` }}
        >
          <CategoryGlyph category={item.category} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-mono text-[15px] font-bold tracking-tight text-store-text">{item.name}</h3>
            {(tier === 'official' || tier === 'verified') && (
              <CheckCircle2
                size={14}
                className={`shrink-0 ${tier === 'official' ? 'text-store-amber' : 'text-[#58a6f0]'}`}
              />
            )}
          </div>
          <p className="mt-[3px] truncate text-[11.5px] text-store-text-3">{item.publisher.name}</p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-[3px] text-[9.5px] font-bold"
          style={{ background: cat.soft, color: cat.color }}
        >
          {cat.label}
        </span>
      </div>

      <p className="mt-3.5 line-clamp-2 h-[39px] text-[12.5px] leading-[1.55] text-store-text-2">{item.description}</p>

      <div className="mt-4 flex items-center gap-3.5 border-t border-store-border pt-3.5 text-[11.5px]">
        <span className="font-mono text-store-text-3">↓ {formatDownloads(item.downloads)}</span>
        {item.rating > 0 && <span className="font-mono text-store-star">★ {item.rating.toFixed(1)}</span>}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={isFavorite ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.preventDefault()
            toggleFavorite(item.id)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-store-code-bg"
        >
          <Heart size={15} className={isFavorite ? 'fill-store-red text-store-red' : 'text-store-text-3'} />
        </button>
        {isInstalled ? (
          <button
            type="button"
            aria-label="已安装"
            onClick={(e) => {
              e.preventDefault()
              toggleInstalled(item.id)
            }}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-store-green"
          >
            <Check size={13} />
            已装
          </button>
        ) : (
          <button
            type="button"
            aria-label="安装"
            onClick={(e) => {
              e.preventDefault()
              toggleInstalled(item.id)
            }}
            className="rounded-lg border border-store-border-strong bg-store-panel-2 px-3.5 py-1.5 text-[11.5px] font-semibold text-store-text transition-colors hover:border-store-accent hover:bg-store-accent hover:text-white"
          >
            安装
          </button>
        )}
      </div>
    </Link>
  )
}
