import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const SUPPORTED_LOCALES = ['zh', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

export function resolveLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const locale = resolveLocale(cookies().get('locale')?.value)
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
