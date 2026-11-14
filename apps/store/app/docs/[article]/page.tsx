import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ARTICLES, fillPrices, type DocSection } from '@/lib/docs'
import { ArticleToc } from '@/components/docs/ArticleToc'
import { CodeBlock } from '@/components/docs/CodeBlock'

type Params = Promise<{ article: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { article } = await params
  const t = await getTranslations('site.docs')
  if (!ARTICLES.some((a) => a.id === article)) return {}
  return { title: `${t(`articles.${article}.title`)} · ${t('metaTitle')}`, description: t(`articles.${article}.lede`) }
}

export default async function DocArticlePage({ params }: { params: Params }) {
  const { article } = await params
  const index = ARTICLES.findIndex((a) => a.id === article)
  if (index < 0) notFound()
  const t = await getTranslations('site.docs')
  const all = t.raw('sections') as DocSection[]
  const sections = ARTICLES[index].sections
    .map((id) => all.find((s) => s.id === id))
    .filter((s): s is DocSection => !!s)
  const prev = ARTICLES[index - 1]
  const next = ARTICLES[index + 1]
  const title = t(`articles.${article}.title`)
  const many = sections.length > 1

  return (
    <section className="page-hero !pt-[clamp(40px,6vw,72px)]">
      <div className="wrap">
        <nav aria-label={t('crumb')} className="crumb">
          <Link href="/docs">{t('title')}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <div className="art-layout">
          <nav aria-label={t('nav')} className="art-nav">
            {ARTICLES.map(({ id }) => (
              <Link key={id} href={`/docs/${id}`} aria-current={id === article ? 'page' : undefined}>
                {t(`articles.${id}.title`)}
              </Link>
            ))}
          </nav>

          <article className="doc-art">
            <h1>{title}</h1>
            <p className="lede">{t(`articles.${article}.lede`)}</p>
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={many ? `${s.id}-title` : undefined}>
                {many && <h2 id={`${s.id}-title`}>{s.title}</h2>}
                <p>{fillPrices(s.body)}</p>
                {s.bullets && (
                  <ul>
                    {s.bullets.map((b) => (
                      <li key={b}>{fillPrices(b)}</li>
                    ))}
                  </ul>
                )}
                {s.code && <CodeBlock code={s.code} label={s.title} />}
              </section>
            ))}
            {(prev || next) && (
              <nav aria-label={t('prevNext')} className="prevnext">
                {prev && (
                  <Link href={`/docs/${prev.id}`}>
                    <small>{t('prev')}</small>
                    <b>{t(`articles.${prev.id}.title`)}</b>
                  </Link>
                )}
                {next && (
                  <Link href={`/docs/${next.id}`} className="next">
                    <small>{t('next')}</small>
                    <b>{t(`articles.${next.id}.title`)}</b>
                  </Link>
                )}
              </nav>
            )}
          </article>

          {many && <ArticleToc label={t('toc')} items={sections.map((s) => ({ id: s.id, title: s.title }))} />}
        </div>
      </div>
    </section>
  )
}
