import type { CatalogResource, Project, ProjectDetail, ProjectMcp, ProjectSummary, ToolTarget } from '@as/types'
import { installedEntryFor } from './catalog'

/** A path inside the project shown relative to it; anything else (~/.claude.json) as is. */
export function relPath(project: Pick<Project, 'path'>, abs: string): string {
  if (abs === project.path) return '.'
  for (const sep of ['/', '\\']) {
    if (abs.startsWith(project.path + sep)) return abs.slice(project.path.length + 1)
  }
  return abs
}

/** Codex ignores the project's MCP entries, and the project has some for it. */
export function codexUntrusted(d: ProjectDetail): boolean {
  return d.exists && !d.codexTrusted && d.mcps.some((m) => m.locations.some((l) => l.agent === 'codex' && l.scope === 'project'))
}

/** What to add to ~/.codex/config.toml: a TOML basic-string key, so `\` and `"` are escaped. */
export function trustSnippet(path: string): string {
  return `[projects."${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]\ntrust_level = "trusted"`
}

export function itemCount(d: Pick<ProjectDetail, 'skills' | 'mcps'>): number {
  return d.skills.length + d.mcps.length
}

/** Required variables of the project's MCP servers with no value stored on this machine. */
export function missingKeys(d: Pick<ProjectDetail, 'mcps'>): string[] {
  return [...new Set(d.mcps.flatMap((m) => m.missingEnv))]
}

export type EnvState = 'stored' | 'missing' | 'optional'

export function envState(d: Pick<ProjectDetail, 'mcps'>, v: { name: string; stored: boolean }): EnvState {
  if (v.stored) return 'stored'
  return d.mcps.some((m) => m.missingEnv.includes(v.name)) ? 'missing' : 'optional'
}

/** Every variable an MCP entry reads, across its locations. */
export function mcpEnv(m: ProjectMcp): string[] {
  return [...new Set(m.locations.flatMap((l) => l.env))]
}

/** The agents an item was written for in the project, in display order. */
export function writtenFor(locations: { agent: ToolTarget; managed: boolean }[]): ToolTarget[] {
  return (['claude', 'codex'] as const).filter((a) => locations.some((l) => l.agent === a && l.managed))
}

/** Agent Store already installed this catalog entry into the project, as its records say. */
export function projectHas(summary: ProjectSummary | undefined, resource: Pick<CatalogResource, 'id' | 'slug' | 'kind'> | undefined): boolean {
  if (!summary || !resource) return false
  return !!installedEntryFor(resource, summary.installed.map((i) => ({ slug: i.slug, category: i.kind, resourceId: i.resourceId })))
}
