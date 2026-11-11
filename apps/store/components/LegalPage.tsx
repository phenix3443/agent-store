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
}

/** Privacy and terms are written in Chinese only; other locales say so instead of showing a machine translation. */
export async function LegalPage({ title, updated, sections }: LegalPageProps) {
  const locale = await getLocale()
  const t = await getTranslations('site.legal')
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(updated))

  return (
    <div className="px-4 pb-20 pt-10 lg:px-10 lg:pt-14">
      <article lang="zh" className="max-w-[68ch]">
        <header className="border-b border-ink pb-6">
          <h1 className="text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">{title}</h1>
          <p lang={locale} className="mt-4 font-mono text-xs text-ink-2">
            <time dateTime={updated}>{t('updated', { date })}</time>
          </p>
          {locale !== 'zh' && (
            <p lang={locale} className="mt-3 text-sm text-ink-2">
              {t('zhOnly')}
            </p>
          )}
        </header>
        {sections.map((s) => (
          <section key={s.title} className="doc-body pt-10">
            <h2 className="mb-3 text-[22px] leading-7 tracking-[-0.01em]">{s.title}</h2>
            {s.body && <p className="text-[15px] leading-[26px]">{s.body}</p>}
            {s.bullets && (
              <ul className="mt-3 border-b border-line">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-3 border-t border-line py-2.5 text-[15px] leading-[26px]">
                    <span aria-hidden className="mt-[13px] h-px w-3 shrink-0 bg-ink" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </div>
  )
}
