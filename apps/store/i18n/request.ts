import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { resolveLocale } from './config'

export default getRequestConfig(async () => {
  const locale = resolveLocale(cookies().get('locale')?.value)
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
