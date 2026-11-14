'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BigLogo } from '@/components/BigLogo'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('site.error')
  return (
    <section className="page-hero py-[clamp(80px,14vh,160px)] text-center">
      <div className="narrow grid justify-items-center gap-3">
        <BigLogo />
        <h1 className="h2 mt-2">{t('title')}</h1>
        <p className="lede">{t('body')}</p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            {t('retry')}
          </button>
          <Link href="/" className="btn min-h-11">
            {t('home')}
          </Link>
        </p>
      </div>
    </section>
  )
}
