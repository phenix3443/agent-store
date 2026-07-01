'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/request'

export function LangSwitcher() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('store.lang')

  function selectLocale(next: SupportedLocale) {
    document.cookie = `locale=${next}; path=/; max-age=31536000`
    router.refresh()
  }

  return (
    <div role="group" aria-label="language" className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1 text-xs">
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => selectLocale(code)}
          aria-current={locale === code}
          className={`rounded-md px-2 py-1 ${
            locale === code ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
          }`}
        >
          {t(code) || (code === DEFAULT_LOCALE ? '中文' : 'English')}
        </button>
      ))}
    </div>
  )
}
