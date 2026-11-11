import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import lockfile from 'proper-lockfile'
import type { RegistryJson, InstalledItem } from '@as/types'
import { atomicWriteFile, ConfigParseError } from '../config/safe-file'

function registryPath(aasHome: string): string {
  return join(aasHome, 'registry.json')
}

/** Empty when registry.json does not exist; throws ConfigParseError when it does not parse. */
export async function readRegistry(aasHome: string): Promise<RegistryJson> {
  const path = registryPath(aasHome)
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { installed: [] }
    throw e
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new ConfigParseError(path, (e as Error).message)
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as RegistryJson).installed)) {
    throw new ConfigParseError(path, 'no "installed" list')
  }
  return parsed as RegistryJson
}

/**
 * Read-modify-write under a cross-process lock (`registry.json.lock`). The desktop
 * app spawns a CLI process per action, so every write must go through here and
 * `mutate` must start from the registry it is given, not from an earlier read.
 * Keep `mutate` short: other processes wait on the lock while it runs.
 */
export async function updateRegistry(
  aasHome: string,
  mutate: (registry: RegistryJson) => RegistryJson | Promise<RegistryJson>
): Promise<RegistryJson> {
  await mkdir(aasHome, { recursive: true })
  const path = registryPath(aasHome)
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(path, {
      realpath: false,
      lockfilePath: `${path}.lock`,
      retries: { retries: 100, factor: 1.2, minTimeout: 20, maxTimeout: 500 },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOCKED') {
      throw new Error(`${path} is locked by another Agent Store process; try again`)
    }
    throw e
  }
  try {
    const next = await mutate(await readRegistry(aasHome))
    await atomicWriteFile(path, JSON.stringify(next, null, 2))
    return next
  } finally {
    await release()
  }
}

export async function writeRegistry(aasHome: string, registry: RegistryJson): Promise<void> {
  await updateRegistry(aasHome, () => registry)
}

/** Applies `patch` to the current entry for `slug`; a no-op when it is gone. */
export async function patchEntry(
  aasHome: string,
  slug: string,
  patch: (entry: InstalledItem) => InstalledItem
): Promise<void> {
  await updateRegistry(aasHome, registry => {
    const entry = findEntry(registry, slug)
    return entry ? upsertEntry(registry, patch(entry)) : registry
  })
}

export function findEntry(registry: RegistryJson, slug: string): InstalledItem | undefined {
  return registry.installed.find(e => e.slug === slug)
}

export function upsertEntry(registry: RegistryJson, entry: InstalledItem): RegistryJson {
  const idx = registry.installed.findIndex(e => e.slug === entry.slug)
  const installed = [...registry.installed]
  if (idx === -1) {
    installed.push(entry)
  } else {
    installed[idx] = entry
  }
  return { installed }
}

export function removeEntry(registry: RegistryJson, slug: string): RegistryJson {
  return { installed: registry.installed.filter(e => e.slug !== slug) }
}
