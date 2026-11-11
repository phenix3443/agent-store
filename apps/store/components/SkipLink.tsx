import { useTranslations } from 'next-intl'

export function SkipLink() {
  const t = useTranslations('store.nav')
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-ink focus:px-4 focus:py-3 focus:text-sm focus:text-on-ink"
    >
      {t('skip')}
    </a>
  )
}
