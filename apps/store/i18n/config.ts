export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

// ja, ko and es were dropped; visitors who picked one keep a cookie for a year, and English serves them better than Chinese.
const RETIRED_LOCALES = ['ja', 'ko', 'es']

export function resolveLocale(raw: string | undefined): SupportedLocale {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')) return raw as SupportedLocale
  return RETIRED_LOCALES.includes(raw ?? '') ? 'en' : DEFAULT_LOCALE
}
