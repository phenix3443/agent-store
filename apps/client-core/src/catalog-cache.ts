import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Item } from '@as/types'

export interface CatalogCache {
  items: Item[]
  fetchedAt: string
}

export function catalogCachePath(aasHome: string): string {
  return join(aasHome, 'catalog-cache.json')
}

export async function readCatalogCache(aasHome: string): Promise<CatalogCache | null> {
  try {
    const raw = await readFile(catalogCachePath(aasHome), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<CatalogCache>
    if (!Array.isArray(parsed.items)) return null
    return parsed as CatalogCache
  } catch {
    return null
  }
}

export async function writeCatalogCache(aasHome: string, items: Item[]): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  const cache: CatalogCache = { items, fetchedAt: new Date().toISOString() }
  await writeFile(catalogCachePath(aasHome), JSON.stringify(cache, null, 2))
}
