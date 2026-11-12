import type { CatalogSource } from '../types'
import { githubSkillsSource } from './github-skills'
import { mcpRegistrySource } from './mcp-registry'
import { builtinProvidersSource } from './providers'

/** Every source the sync runs, in order. A new site is one more entry here. */
export function defaultSources(): CatalogSource[] {
  return [builtinProvidersSource(), mcpRegistrySource(), githubSkillsSource()]
}
