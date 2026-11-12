// An in-memory catalog that answers with whatever items the test serves. The adapter
// and policy tests describe items in the manifest format the adapters install from,
// so they skip /api/resources and its mapping; installing from catalog resources is
// covered by catalog-install.test.ts.
import type { CatalogResourceDetail, CatalogSearchResult, Item } from '@as/types'
import type { Catalog, CatalogItem } from '../../catalog'

export class ItemCatalog implements Catalog {
  constructor(private readonly items: () => readonly Item[]) {}

  async resolveItem(ref: string): Promise<CatalogItem> {
    const item = this.items().find(i => i.slug === ref)
    if (!item) throw new Error(`Item not found: ${ref}`)
    return { item, resourceId: null, longSlug: null }
  }

  async search(): Promise<CatalogSearchResult> {
    throw new Error('ItemCatalog has no search')
  }

  async get(): Promise<CatalogResourceDetail> {
    throw new Error('ItemCatalog has no resource detail')
  }
}
