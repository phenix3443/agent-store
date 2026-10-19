import { mkdir, rename, stat } from 'fs/promises'
import { join } from 'path'

const LEGACY_ENTRIES = [
  'registry.json', 'catalog-cache.json', 'entitlement.json', 'packages-registry.json',
  'usage.db', 'usage.db-wal', 'usage.db-shm', 'budget.json', 'relay.pid', 'relay-configs.json',
  'providers', 'mcps', 'packages', 'relay-state', 'exports',
]

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

/** Move Agent Store state from the former shared home without touching skills. */
export async function migrateLegacyHome(legacyHome: string, storeHome: string): Promise<void> {
  if (legacyHome === storeHome || !await exists(legacyHome)) return
  for (const entry of LEGACY_ENTRIES) {
    const source = join(legacyHome, entry)
    const target = join(storeHome, entry)
    if (!await exists(source) || await exists(target)) continue
    await mkdir(storeHome, { recursive: true })
    await rename(source, target)
  }
}
