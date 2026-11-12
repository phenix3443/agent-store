import { useTranslations } from 'next-intl'
import { Screenshot } from './Screenshot'
import { SHOTS } from './shots'

const FEATURES = ['skill', 'mcp', 'relay', 'usage'] as const

export function FeatureGrid() {
  const t = useTranslations('site.home.features')

  return (
    <ul className="mt-10 grid gap-x-12 gap-y-14 md:grid-cols-2">
      {FEATURES.map((key) => (
        <li key={key} className="min-w-0">
          <Screenshot shot={SHOTS[key]} alt={t(`${key}.alt`)} sizes="(min-width: 768px) 50vw, 100vw" />
          <h3 className="mt-5 text-[22px] leading-7">{t(`${key}.title`)}</h3>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-6 text-ink-2">{t(`${key}.body`)}</p>
        </li>
      ))}
    </ul>
  )
}
