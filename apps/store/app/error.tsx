'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('site.error')
  return (
    <div className="px-4 pb-24 pt-16 lg:px-10 lg:pt-24">
      <h1 className="max-w-[14ch] text-[44px] leading-[1.02] tracking-[-0.03em] sm:text-[72px]">{t('title')}</h1>
      <p className="mt-6 max-w-[52ch] text-lg leading-7 text-ink-2">{t('body')}</p>
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink pt-8">
        <button type="button" onClick={reset} className="btn btn-primary">
          {t('retry')}
        </button>
        <Link href="/" className="btn min-h-12 px-5">
          {t('home')}
        </Link>
      </div>
    </div>
  )
}
