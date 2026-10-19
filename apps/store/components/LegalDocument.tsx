'use client'

import { useLocale } from 'next-intl'

interface LegalSection {
  title: string
  body?: string
  bullets?: string[]
  contact?: boolean
}

export interface LegalDocumentContent {
  title: string
  updatedLabel: string
  updated: string
  sections: LegalSection[]
}

interface LegalDocumentProps {
  chinese: LegalDocumentContent
  english: LegalDocumentContent
  contactEmail: string
}

export function LegalDocument({ chinese, english, contactEmail }: LegalDocumentProps) {
  const document = useLocale() === 'zh' ? chinese : english
  const lang = document === chinese ? 'zh-CN' : 'en'

  return (
    <main className="bg-store-content">
      <article lang={lang} className="mx-auto max-w-[720px] px-6 pb-20 pt-12 sm:px-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-store-text">{document.title}</h1>
        <div className="mt-2.5 text-sm text-store-text-3">
          {document.updatedLabel}: {document.updated}
        </div>
        {document.sections.map((section) => (
          <section key={section.title} className="mt-[34px] border-t border-store-border pt-7">
            <h2 className="mb-3 text-[19px] font-bold tracking-tight text-store-text">{section.title}</h2>
            {section.body && <p className="text-sm leading-[1.75] text-store-text-2">{section.body}</p>}
            {section.bullets && (
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-[1.7] text-store-text-2 marker:text-store-accent">
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {section.contact && (
              <p className="text-sm leading-[1.75] text-store-text-2">
                <a className="text-store-accent underline-offset-4 hover:underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              </p>
            )}
          </section>
        ))}
      </article>
    </main>
  )
}
