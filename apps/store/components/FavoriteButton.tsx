'use client'

import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useClientState } from './ClientStateProvider'

export function FavoriteButton({ itemId }: { itemId: string }) {
  const t = useTranslations('store.detail')
  const { favorites, toggleFavorite } = useClientState()
  const on = !!favorites[itemId]
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleFavorite(itemId)}
      className="flex h-8 items-center gap-1.5 px-2 text-[13px] hover:bg-sel"
    >
      <Heart size={14} aria-hidden className={on ? 'fill-current' : ''} />
      {on ? t('unfavorite') : t('favorite')}
    </button>
  )
}
