import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.notFound')
  return { title: t('metaTitle') }
}

export default async function NotFound() {
  const t = await getTranslations('site.notFound')
  return (
    <div className="px-4 pb-24 pt-16 lg:px-10 lg:pt-24">
      <h1 className="max-w-[14ch] text-[44px] leading-[1.02] tracking-[-0.03em] sm:text-[72px]">{t('title')}</h1>
      <p className="mt-6 max-w-[52ch] text-lg leading-7 text-ink-2">{t('body')}</p>
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink pt-8">
        <Link href="/store" className="btn btn-primary">
          {t('store')}
        </Link>
        <Link href="/" className="btn min-h-12 px-5">
          {t('home')}
        </Link>
      </div>
    </div>
  )
}
