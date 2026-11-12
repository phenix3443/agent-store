import type { MetadataRoute } from 'next'
import { listResources } from '@/lib/catalog'
import { resourceHref } from '@/lib/resource'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://agent-store-alpha.vercel.app'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The catalog holds ~68k records; the sitemap lists the top page in the store's default order.
  const page = await listResources({ kind: null, q: '', sort: 'default' }, 0, 100).catch(() => null)
  const resources = page?.ok ? page.resources : []

  const staticRoutes: MetadataRoute.Sitemap = ['', '/store', '/docs', '/pricing'].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))

  const resourceRoutes: MetadataRoute.Sitemap = resources.map((r) => ({
    url: `${SITE_URL}${resourceHref(r)}`,
    lastModified: r.origin.upstreamUpdatedAt ?? r.origin.syncedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...resourceRoutes]
}
