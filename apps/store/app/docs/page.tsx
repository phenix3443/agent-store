import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CreditCard, Download, Search, Terminal, Waypoints } from 'lucide-react'
import { ABOUT_SECTION, ARTICLES, type ArticleId, type DocSection } from '@/lib/docs'
import { DocsHashRedirect } from '@/components/docs/DocsHashRedirect'

const ICONS: Record<ArticleId, typeof Download> = {
  install: Download,
  browse: Search,
  relay: Waypoints,
  cli: Terminal,
  plans: CreditCard,
}
const KINDS = ['skill', 'mcp', 'provider'] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.docs')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function DocsPage() {
  const t = await getTranslations('site.docs')
  const about = (t.raw('sections') as DocSection[]).find((s) => s.id === ABOUT_SECTION)

  return (
    <>
      <DocsHashRedirect />
      <section className="page-hero">
        <div className="wrap">
          <h1 className="h1">
            {t('title')}
            <span className="dim">{t('dim')}</span>
          </h1>
        </div>
      </section>

      <section>
        <div className="wrap doc-cards">
          {ARTICLES.map(({ id, kind }) => {
            const Icon = ICONS[id]
            return (
              <Link key={id} href={`/docs/${id}`} data-kind={kind} className="card doc-card">
                <span className="tile">
                  <Icon size={20} aria-hidden />
                </span>
                <h2>{t(`articles.${id}.title`)}</h2>
                <p>{t(`articles.${id}.card`)}</p>
                <span className="link">{t('read')}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {about && (
        <section className="section-tight">
          <div className="wrap split !items-start">
            <div>
              <h2 className="h2">{about.title}</h2>
              <p className="mt-4 text-fg-2">{about.body}</p>
            </div>
            <ul className="facts">
              {about.bullets?.map((b, i) => {
                const kind = KINDS[i]
                return (
                  <li key={b} data-kind={kind}>
                    <span>
                      {b}{' '}
                      {kind && (
                        <Link href={`/store?category=${kind}`} className="link whitespace-nowrap text-sm">
                          {t(`see.${kind}`)}
                        </Link>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}
    </>
  )
}
