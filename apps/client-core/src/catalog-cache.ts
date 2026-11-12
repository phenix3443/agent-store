import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CatalogResource } from '@as/types'

/** The first page of each catalog tab, kept so the store still lists something while the API is down. */
export interface CatalogCache {
  pages: Record<string, { resources: CatalogResource[]; fetchedAt: string }>
}

export function catalogCachePath(aasHome: string): string {
  return join(aasHome, 'catalog-cache.json')
}

async function readAll(aasHome: string): Promise<CatalogCache> {
  try {
    const parsed = JSON.parse(await readFile(catalogCachePath(aasHome), 'utf-8')) as Partial<CatalogCache>
    // A cache from before /api/resources holds `items` and no pages; it is ignored.
    if (parsed.pages && typeof parsed.pages === 'object') return { pages: parsed.pages }
  } catch { /* missing or unreadable */ }
  return { pages: {} }
}

export async function readCatalogCache(aasHome: string, page: string): Promise<CatalogResource[] | null> {
  const resources = (await readAll(aasHome)).pages[page]?.resources
  return Array.isArray(resources) ? resources : null
}

export async function writeCatalogCache(aasHome: string, page: string, resources: CatalogResource[]): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  const cache = await readAll(aasHome)
  cache.pages[page] = { resources, fetchedAt: new Date().toISOString() }
  await writeFile(catalogCachePath(aasHome), JSON.stringify(cache, null, 2))
}
