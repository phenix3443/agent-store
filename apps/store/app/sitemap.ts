import type { MetadataRoute } from 'next'
import { getItems } from '@/lib/catalog'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agent-store-alpha.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await getItems({}).catch(() => [])

  const staticRoutes: MetadataRoute.Sitemap = ['', '/store', '/docs', '/pricing'].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))

  const itemRoutes: MetadataRoute.Sitemap = items.map((item) => ({
    url: `${SITE_URL}/store/${item.category}/${item.slug}`,
    lastModified: item.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...itemRoutes]
}
