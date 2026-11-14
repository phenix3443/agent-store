import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

export interface LegalSection {
  title: string
  body?: string
  bullets?: string[]
}

interface LegalPageProps {
  title: string
  /** ISO date of the last revision. */
  updated: string
  sections: LegalSection[]
  /** The other legal page, linked at the bottom. */
  other: 'privacy' | 'terms'
}

/** Privacy and terms are written in Chinese only; other locales say so instead of showing a machine translation. */
export async function LegalPage({ title, updated, sections, other }: LegalPageProps) {
  const locale = await getLocale()
  const t = await getTranslations('site.legal')
  const tf = await getTranslations('site.footer')
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(updated))

  return (
    <section className="page-hero">
      <article lang="zh" className="narrow legal">
        <h1 className="h1">{title}</h1>
        <p lang={locale} className="cap">
          <time dateTime={updated}>{t('updated', { date })}</time>
        </p>
        {locale !== 'zh' && (
          <p lang={locale} className="!mt-3 text-sm text-fg-2">
            {t('zhOnly')}
          </p>
        )}
        {sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.body && <p>{s.body}</p>}
            {s.bullets && (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p lang={locale} className="legal-links">
          <Link href="/" className="link">
            {t('home')}
          </Link>
          <Link href={`/${other}`} className="link">
            {tf(other)}
          </Link>
        </p>
      </article>
    </section>
  )
}
