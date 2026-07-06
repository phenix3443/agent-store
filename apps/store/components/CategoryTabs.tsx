'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LayoutGrid } from 'lucide-react'
import { CategoryGlyph } from '@/lib/item-meta'

type Category = 'all' | 'provider' | 'skill' | 'mcp'

interface CategoryTabsProps {
  active: Category
}

const TAB_VALUES: Category[] = ['all', 'provider', 'skill', 'mcp']

export function CategoryTabs({ active }: CategoryTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('store.categories')

  function handleSelect(value: Category) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('category')
    } else {
      params.set('category', value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div role="tablist" className="flex gap-0.5 rounded-[10px] border border-store-border bg-store-panel p-[3px]">
      {TAB_VALUES.map((value) => (
        <button
          key={value}
          role="tab"
          aria-selected={active === value}
          onClick={() => handleSelect(value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === value
              ? 'bg-store-accent text-white'
              : 'text-store-text-2 hover:text-store-text'
          }`}
        >
          <span className="text-[13px]">
            {value === 'all' ? <LayoutGrid size={13} /> : <CategoryGlyph category={value} />}
          </span>
          {t(value)}
        </button>
      ))}
    </div>
  )
}
