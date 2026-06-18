import type { InstalledItem } from './engine'

export type { InstalledItem }

/** Shape of ~/.agents/registry.json */
export interface RegistryJson {
  installed: InstalledItem[]
}
