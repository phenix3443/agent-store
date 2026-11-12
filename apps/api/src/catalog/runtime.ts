import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CatalogReader } from './reader'
import { CatalogUpdater } from './updater'

/** The catalog the API serves; empty until a catalog.db is opened. */
export const catalogReader = new CatalogReader()

/**
 * CATALOG_URL: where the published catalog.db is downloaded from (unset: only
 * CATALOG_PATH is served, never refreshed). CATALOG_PATH: the local copy.
 * CATALOG_REFRESH_SECONDS: how often to look for a new version.
 */
export function startCatalog(env: Record<string, string | undefined> = process.env): CatalogUpdater | null {
  const path = env['CATALOG_PATH'] || join(tmpdir(), 'agent-store', 'catalog.db')
  const url = env['CATALOG_URL']
  if (!url) {
    try {
      catalogReader.open(path)
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', message: 'no CATALOG_URL and no readable CATALOG_PATH', path, error: String(e) }))
    }
    return null
  }
  const updater = new CatalogUpdater({ reader: catalogReader, url, path })
  updater.start(Math.max(Number(env['CATALOG_REFRESH_SECONDS'] ?? '300'), 30) * 1000)
  return updater
}
