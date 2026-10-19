import type { InstalledItem } from './engine'

/** Shape of ~/.agent-store/registry.json */
export interface RegistryJson {
  installed: InstalledItem[]
}
