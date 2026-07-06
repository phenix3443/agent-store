'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Sort = 'downloads' | 'created' | 'rating'

interface SortSelectProps {
  active: Sort
}

const OPTIONS: { value: Sort; key: 'all' | 'new' | 'popular' | 'rating' }[] = [
  { value: 'downloads', key: 'all' },
  { value: 'created', key: 'new' },
  { value: 'downloads', key: 'popular' },
  { value: 'rating', key: 'rating' },
]

export function SortSelect({ active }: SortSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.sort')

  function handleSelect(value: Sort) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-0.5 rounded-[10px] border border-store-border bg-store-panel p-[3px]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => handleSelect(opt.value)}
          aria-pressed={active === opt.value}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === opt.value
              ? 'bg-store-accent text-white'
              : 'text-store-text-2 hover:text-store-text'
          }`}
        >
          {t(opt.key)}
        </button>
      ))}
    </div>
  )
}
