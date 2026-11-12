import type { CatalogResource, CatalogResourceDetail, InstalledItem, Item, ResourceSort } from '@as/types'
import type { ListFilter } from '../state/AppState'

export const STORE_BASE = 'https://agent-store-test.panghuli.tech'

/** `/store/<kind>/<id>` on the web store; each '/'-separated part of the id is one path segment. */
export function storePageUrl(kind: string, id: string): string {
  const path = id.split('/').map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ':')).join('/')
  return `${STORE_BASE}/store/${kind}/${path}`
}

/** Compact counts (4.3M, 142.0K); the catalog has no install count for most entries, shown as —. */
export function formatInstalls(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** The registry entry a catalog row was installed as: by catalog id, or by slug for installs from before /api/resources. */
export function installedEntryFor(
  r: Pick<CatalogResource, 'id' | 'slug' | 'kind'>,
  installed: Pick<InstalledItem, 'slug' | 'category' | 'resourceId'>[]
): Pick<InstalledItem, 'slug' | 'category' | 'resourceId'> | undefined {
  return (
    installed.find((e) => e.resourceId === r.id) ??
    installed.find((e) => !e.resourceId && e.slug === r.slug && e.category === r.kind)
  )
}

/** Server-side sort for a discovery filter; `featured` is the verified rows of the default order. */
export function sortForFilter(filter: ListFilter): ResourceSort {
  if (filter === 'popular') return 'installs'
  if (filter === 'recent') return 'updated'
  return 'default'
}

/** The built-in `local` relay is everyone's first setup step, so it is pinned to the top. */
export function pinLocalFirst<T extends { id: string }>(rows: T[]): T[] {
  const idx = rows.findIndex((r) => r.id === 'builtin:local')
  if (idx <= 0) return rows
  return [rows[idx], ...rows.slice(0, idx), ...rows.slice(idx + 1)]
}

/**
 * The item a catalog entry installs as, for the detail views: the engine's
 * install preview, or the entry's own fields when it can't be installed.
 */
export function resourceItem(r: CatalogResourceDetail): Item {
  if (r.install) return r.install
  const when = r.origin.upstreamUpdatedAt ?? r.origin.syncedAt
  const author = r.author?.name ?? r.origin.site
  return {
    id: r.id,
    resourceId: r.id,
    slug: r.slug ?? r.id,
    name: r.name,
    description: r.description ?? '',
    category: r.kind,
    version: r.version ?? '',
    publisher: { id: author, slug: author, name: author, avatarUrl: '', tier: r.verified ? 'verified' : 'community' },
    compatibleWith: ['claude', 'codex'],
    tags: r.tags,
    downloads: r.installs ?? 0,
    status: 'published',
    installHook: { steps: [] },
    createdAt: when,
    updatedAt: when,
    configSchema: {},
    supportedModels: [],
  } as Item
}

/** `v1.2.0` for semver-like versions; a skill's tree hash is shown as it is. */
export function formatVersion(version: string | null | undefined): string {
  if (!version) return '—'
  return /^\d+(\.\d+)+/.test(version) ? `v${version}` : version
}
