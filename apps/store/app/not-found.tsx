import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Search } from 'lucide-react'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.notFound')
  return { title: t('metaTitle') }
}

export default async function NotFound() {
  const t = await getTranslations('site.notFound')
  return (
    <section className="page-hero py-[clamp(80px,14vh,160px)] text-center">
      <div className="narrow">
        <p aria-hidden className="text-grad font-mono text-[clamp(72px,16vw,160px)] font-semibold leading-none">
          404
        </p>
        <h1 className="h2 mb-3 mt-2.5">{t('title')}</h1>
        <p className="lede mx-auto">{t('body')}</p>
        <form role="search" action="/store" className="searchbar mx-auto mt-7 max-w-[560px] text-left">
          <Search size={20} aria-hidden />
          <input type="search" name="q" aria-label={t('search')} placeholder={t('search')} autoComplete="off" />
          <button type="submit" className="btn btn-primary btn-sm">
            {t('submit')}
          </button>
        </form>
        <p className="mt-[22px] flex flex-wrap justify-center gap-[18px]">
          <Link href="/store" className="link text-fg-2">
            {t('store')}
          </Link>
          <Link href="/" className="link text-fg-2">
            {t('home')}
          </Link>
        </p>
      </div>
    </section>
  )
}
