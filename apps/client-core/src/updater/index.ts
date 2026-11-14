import type { RegistryJson, UpdateAvailable } from '@as/types'
import type { Catalog, CatalogItem } from '../catalog'
import { isLocalEntry } from '../registry/index'

/** What an installed entry updates from: its catalog id, or its slug for installs from before /api/resources. */
export function latestFor(catalog: Catalog, entry: RegistryJson['installed'][number]): Promise<CatalogItem> {
  return catalog.resolveItem(entry.resourceId ?? entry.slug, { kind: entry.category })
}

export async function checkUpdates(
  registry: RegistryJson,
  catalog: Catalog,
  slugs?: string[]
): Promise<UpdateAvailable[]> {
  const entries = slugs
    ? registry.installed.filter(e => slugs.includes(e.slug))
    : registry.installed

  const updates: UpdateAvailable[] = []
  for (const entry of entries) {
    // Duplicated providers and imported local items have no catalog entry of their own.
    if (entry.parentSlug || isLocalEntry(entry)) continue
    let latest: CatalogItem
    try {
      latest = await latestFor(catalog, entry)
    } catch {
      continue
    }
    if (latest.item.version !== entry.version) {
      updates.push({ slug: entry.slug, currentVersion: entry.version, latestVersion: latest.item.version })
    }
  }
  return updates
}
