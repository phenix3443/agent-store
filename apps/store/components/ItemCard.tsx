'use client'

import type { Item } from '@aas/types'
import Link from 'next/link'
import { Heart, Star } from 'lucide-react'
import { Badge } from './Badge'
import { useClientState } from './ClientStateProvider'

interface ItemCardProps {
  item: Item
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ItemCard({ item }: ItemCardProps) {
  const { favorites, toggleFavorite, installed, toggleInstalled } = useClientState()
  const isFavorite = !!favorites[item.id]
  const isInstalled = !!installed[item.id]

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-store-border bg-store-panel p-4 transition-colors hover:border-store-border-strong">
      <button
        type="button"
        aria-label={isFavorite ? '取消收藏' : '收藏'}
        onClick={(e) => {
          e.preventDefault()
          toggleFavorite(item.id)
        }}
        className="absolute right-3 top-3 z-10"
      >
        <Heart size={16} className={isFavorite ? 'fill-store-red text-store-red' : 'text-store-text-3'} />
      </button>

      <Link href={`/store/${item.category}/${item.slug}`} className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-store-border bg-store-panel-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.icon} alt={item.name} className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h3 className="truncate text-sm font-medium text-store-text">{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant={item.publisher.tier}>{item.publisher.tier}</Badge>
              <Badge variant={item.category}>{item.category}</Badge>
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-xs text-store-text-2">{item.description}</p>

        <div className="flex items-center gap-1 text-xs text-store-amber">
          <Star size={12} className="fill-store-amber" />
          {item.rating.toFixed(1)}
        </div>

        <div className="flex items-center justify-between text-xs text-store-text-3">
          <span>{item.compatibleWith.join(' · ')}</span>
          <span>{formatDownloads(item.downloads)} installs</span>
        </div>
      </Link>

      <button
        type="button"
        aria-label={isInstalled ? '已安装' : '安装'}
        onClick={() => toggleInstalled(item.id)}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
          isInstalled
            ? 'bg-store-green/10 text-store-green'
            : 'bg-store-accent text-white hover:opacity-90'
        }`}
      >
        {isInstalled ? '已安装' : '安装'}
      </button>
    </div>
  )
}
