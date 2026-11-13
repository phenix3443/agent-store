import type { DiscoverySource } from '../discovery'
import type { CatalogSource } from '../types'
import { clawhubSource } from './clawhub'
import { githubSkillsSource } from './github-skills'
import { mcpRegistrySource } from './mcp-registry'
import { builtinProvidersSource } from './providers'
import { skillhubSource } from './skillhub'
import { skillsShSource } from './skills-sh'

/** Every source the sync runs, in order. A new site is one more entry here. */
export function defaultSources(): CatalogSource[] {
  return [builtinProvidersSource(), mcpRegistrySource(), githubSkillsSource()]
}

/** Skill directories read for discovery and popularity before the catalog sources run. */
export function defaultDiscoverySources(): DiscoverySource[] {
  return [skillsShSource(), clawhubSource(), skillhubSource()]
}
