'use client'

import type { ResourceSort } from '@as/types'
import * as Dialog from '@radix-ui/react-dialog'
import { SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SORTS } from '@/lib/resource'
import { useStoreQuery } from '@/lib/use-store-query'
import { CATEGORY_VALUES, type CategoryValue } from './CategoryFilter'

/** Category and sort on a phone, where the two button rows do not fit. */
export function FilterSheet({ category, sort, className = '' }: { category: CategoryValue; sort: ResourceSort; className?: string }) {
  const t = useTranslations('store')
  const { setParams } = useStoreQuery()

  return (
    <Dialog.Root>
      <Dialog.Trigger className={`btn ${className}`}>
        <SlidersHorizontal size={16} aria-hidden />
        {t(`categories.${category}`)} · {t(`sort.${sort}`)}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[24px] border-t border-line-strong bg-bg-2 shadow-sheet"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line py-3 pl-5 pr-3">
            <Dialog.Title className="font-bold">{t('filters.title')}</Dialog.Title>
            <Dialog.Close aria-label={t('nav.close')} className="grid h-9 w-9 place-items-center rounded-control text-fg-2 hover:bg-panel-2 hover:text-fg">
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="grid content-start gap-1 overflow-y-auto overscroll-contain px-4 pb-7 pt-3">
            <fieldset>
              <legend className="mb-2 mt-2 text-[13px] font-semibold text-fg-3">{t('filters.category')}</legend>
              {CATEGORY_VALUES.map((value) => (
                <label key={value} data-kind={value === 'all' ? undefined : value} className="radio-row">
                  <input
                    type="radio"
                    name="category"
                    checked={category === value}
                    onChange={() => setParams({ category: value === 'all' ? null : value })}
                  />
                  {t(`categories.${value}`)}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="mb-2 mt-4 text-[13px] font-semibold text-fg-3">{t('sort.label')}</legend>
              {SORTS.map((value) => (
                <label key={value} className="radio-row">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === value}
                    onChange={() => setParams({ sort: value === 'default' ? null : value })}
                  />
                  {t(`sort.${value}`)}
                </label>
              ))}
            </fieldset>
            <Dialog.Close className="btn btn-primary mt-4 w-full">{t('filters.done')}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
