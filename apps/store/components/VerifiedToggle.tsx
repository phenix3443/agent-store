'use client'

import * as Switch from '@radix-ui/react-switch'
import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { useStoreQuery } from '@/lib/use-store-query'

export function VerifiedToggle({ active }: { active: boolean }) {
  const t = useTranslations('store.filters')
  const { setParams } = useStoreQuery()
  const id = useId()

  return (
    <div className="flex min-h-8 items-center gap-2">
      <Switch.Root
        id={id}
        checked={active}
        onCheckedChange={(next) => setParams({ verified: next ? '1' : null })}
        className="relative h-6 w-10 shrink-0 rounded-full border border-ink transition-colors data-[state=checked]:bg-ink"
      >
        <Switch.Thumb className="block h-3.5 w-3.5 translate-x-[4px] rounded-full bg-ink transition-transform data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-on-ink" />
      </Switch.Root>
      <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-sm">
        {t('verifiedOnly')}
      </label>
    </div>
  )
}
