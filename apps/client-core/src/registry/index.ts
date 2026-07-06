import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { RegistryJson, InstalledItem } from '@as/types'

export async function readRegistry(aasHome: string): Promise<RegistryJson> {
  try {
    const raw = await readFile(join(aasHome, 'registry.json'), 'utf-8')
    return JSON.parse(raw) as RegistryJson
  } catch {
    return { installed: [] }
  }
}

export async function writeRegistry(aasHome: string, registry: RegistryJson): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  await writeFile(join(aasHome, 'registry.json'), JSON.stringify(registry, null, 2))
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
