import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.pricing')
  return { title: t('metaTitle'), description: t('lede') }
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
