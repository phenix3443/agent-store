import type { RegistryJson, InstalledItem, UpdateAvailable, Item } from '@as/types'
import type { AASClient } from '@as/sdk'

export async function checkUpdates(
  registry: RegistryJson,
  client: AASClient,
  slugs?: string[]
): Promise<UpdateAvailable[]> {
  const entries = slugs
    ? registry.installed.filter(e => slugs.includes(e.slug))
    : registry.installed

  const updates: UpdateAvailable[] = []
  for (const entry of entries) {
    const result = await client.getItemBySlug(entry.slug)
    if (result.error || !result.data) continue
    if (result.data.version !== entry.version) {
      updates.push({
        slug: entry.slug,
        currentVersion: entry.version,
        latestVersion: result.data.version,
      })
    }
  }
  return updates
}

export async function applyUpdate(
  slug: string,
  client: AASClient,
  entry: InstalledItem
): Promise<{ latestItem: Item; fromVersion: string }> {
  const result = await client.getItemBySlug(slug)
  if (result.error || !result.data) {
    throw new Error(result.error ?? `Item not found: ${slug}`)
  }
  return { latestItem: result.data, fromVersion: entry.version }
}
