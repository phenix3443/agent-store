import type { DiscoverySource } from '../discovery'
import type { CatalogSource } from '../types'
import type { SearchSource } from '../search-sources'
import { clawhubSearch, clawhubSource } from './clawhub'
import { githubSkillsSource } from './github-skills'
import { mcpRegistrySource } from './mcp-registry'
import { builtinProvidersSource } from './providers'
import { skillhubSearch, skillhubSource } from './skillhub'
import { skillsmpSearch } from './skillsmp'
import { skillsShSource } from './skills-sh'

/** Every source the sync runs, in order. A new site is one more entry here. */
export function defaultSources(): CatalogSource[] {
  return [builtinProvidersSource(), mcpRegistrySource(), githubSkillsSource()]
}

/** Skill directories read for discovery and popularity before the catalog sources run. */
export function defaultDiscoverySources(): DiscoverySource[] {
  return [skillsShSource(), clawhubSource(), skillhubSource()]
}

/**
 * Directories with a keyword search their terms let us call, by name. skills.sh is
 * absent: its robots.txt disallows /api/ and /search.
 */
export function searchSources(env: { SKILLSMP_API_KEY?: string | undefined } = {}): Record<string, SearchSource> {
  return {
    clawhub: clawhubSearch(),
    skillhub: skillhubSearch(),
    skillsmp: skillsmpSearch(env.SKILLSMP_API_KEY ? { apiKey: env.SKILLSMP_API_KEY } : {}),
  }
}
