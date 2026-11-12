// Serves item manifests through the test's fetch mock at `/api/items/<slug>`.
// The adapter and policy tests predate /api/resources and describe items in the
// manifest format the adapters install from; this keeps them about that layer.
// Installing from catalog resources is covered by catalog-install.test.ts.
import type { CatalogResourceDetail, CatalogSearchResult, Item } from '@as/types'
import type { Catalog, CatalogItem } from '../../catalog'

export class ItemCatalog implements Catalog {
  constructor(private readonly baseUrl = 'http://localhost:3000') {}

  async resolveItem(ref: string): Promise<CatalogItem> {
    const res = await fetch(`${this.baseUrl}/api/items/${encodeURIComponent(ref)}`)
    const json = await res.json().catch(() => ({})) as { item?: Item; error?: string }
    if (!res.ok || !json.item) throw new Error(json.error ?? `Item not found: ${ref}`)
    return { item: json.item, resourceId: null, longSlug: null }
  }

  async search(): Promise<CatalogSearchResult> {
    throw new Error('ItemCatalog has no search')
  }

  async get(): Promise<CatalogResourceDetail> {
    throw new Error('ItemCatalog has no resource detail')
  }
}
