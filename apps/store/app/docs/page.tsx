import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { formatPrice } from '@as/types'

interface DocSection {
  id: string
  title: string
  body: string
  bullets?: string[]
  code?: string
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.docs')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

const PRICES: Record<string, string> = {
  monthly: formatPrice('monthly'),
  yearly: formatPrice('yearly'),
  lifetime: formatPrice('lifetime'),
}

// Message arrays come back raw, so prices are filled in here.
const fill = (text: string) => text.replace(/\{(monthly|yearly|lifetime)\}/g, (_, key: string) => PRICES[key] ?? key)

export default async function DocsPage() {
  const t = await getTranslations('site.docs')
  const sections = t.raw('sections') as DocSection[]

  const toc = (
    <ol>
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="block py-1.5 text-sm leading-5 text-ink-2 transition-colors hover:text-ink">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <div className="px-4 pb-24 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:px-10">
      <nav aria-label={t('toc')} className="hidden lg:block">
        <div className="sticky top-[72px] border-r border-line pr-6 pt-14">
          <p className="label mb-3">{t('toc')}</p>
          {toc}
        </div>
      </nav>

      <article className="min-w-0 pt-10 lg:pt-14">
        <header className="border-b border-ink pb-8">
          <h1 className="max-w-[16ch] text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">{t('title')}</h1>
          <p className="mt-5 max-w-[52ch] text-lg leading-7 text-ink-2">{t('lede')}</p>
        </header>

        <details className="border-b border-line lg:hidden">
          <summary className="label flex min-h-12 cursor-pointer items-center">{t('toc')}</summary>
          <div className="pb-3">{toc}</div>
        </details>

        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="doc-body scroll-mt-24 pt-12">
            <h2 id={`${s.id}-title`} className="mb-4 text-[28px] leading-8 tracking-[-0.015em]">
              {s.title}
            </h2>
            <p>{fill(s.body)}</p>
            {s.bullets && (
              <ul className="mt-4 border-b border-line">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-3 border-t border-line py-2.5 text-[15px] leading-[26px]">
                    <span aria-hidden className="mt-[13px] h-px w-3 shrink-0 bg-ink" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{fill(b)}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.code && (
              <pre className="mt-5 overflow-x-auto border border-ink bg-plate px-4 py-3.5 font-mono text-[13px] leading-6">
                <code>{s.code}</code>
              </pre>
            )}
          </section>
        ))}
      </article>
    </div>
  )
}
