import type { Octokit } from '@octokit/rest'
import type {
  McpResourceDetail,
  ProviderResourceDetail,
  ResourceAuthor,
  ResourceKind,
  ResourceSite,
  ResourceSummary,
  SkillResourceDetail,
} from '@as/types'

type KindFields<T extends ResourceSummary> = Omit<T, keyof ResourceSummary>

/** The kind-specific part of a detail, stored as JSON next to the common columns. */
export type ResourceDetailFields =
  | KindFields<McpResourceDetail>
  | KindFields<SkillResourceDetail>
  | KindFields<ProviderResourceDetail>

/** One upstream entry, normalized, as a source hands it to the sync. */
export interface CatalogRecord {
  kind: ResourceKind
  site: ResourceSite
  upstreamId: string
  name: string
  description: string | null
  author: ResourceAuthor | null
  version: string | null
  homepageUrl: string | null
  /** null keeps the count from the previous run. */
  installs: number | null
  verified: boolean
  tags: string[]
  transports: string[]
  sourceUrl: string | null
  upstreamVersion: string | null
  upstreamUpdatedAt: string | null
  /** Unit a partial run covers completely (a skill repo); null when the source only runs whole. */
  scope: string | null
  detail: ResourceDetailFields
}

/**
 * What a run saw of the upstream, which decides what may be marked unavailable:
 * full: everything this source owns; scoped: only rows in these scopes;
 * incremental: only `removed`.
 */
export type Coverage = { mode: 'full' } | { mode: 'scoped'; scopes: string[] } | { mode: 'incremental' }

export interface SourceRun {
  records: CatalogRecord[]
  /** Entries the upstream reports as gone or no longer installable. */
  removed: Array<{ upstreamId: string; reason: string }>
  coverage: Coverage
  skipped: Record<string, number>
  /** Partial failures the run worked around. */
  errors: string[]
  /** Saved and handed back as `state.watermark` next run. */
  watermark?: string | null
  /** Scopes the run tried, with how it went; rate-limited ones are left out so they stay due. */
  attempted?: Array<{ repo: string; status: string }>
}

export interface SourceContext {
  fetch: typeof fetch
  github: Octokit
  now: Date
  /** Ignore the watermark and list everything. */
  full: boolean
  state: {
    watermark: string | null
    /** Scopes of rows this source wrote before, so a run can revisit them. */
    knownScopes: string[]
  }
  /** Skill repos picked from the discovery queue for this run, and skills.sh install counts. */
  skills?: { repos: string[]; installs: Map<string, number> }
  log: (message: string) => void
}

/** One upstream site. Adding a site (Smithery, Glama, …) is one more module implementing this. */
export interface CatalogSource {
  /** Stable key; rows remember which source wrote them. */
  name: string
  site: ResourceSite
  kind: ResourceKind
  run(ctx: SourceContext): Promise<SourceRun>
}

export function addSkip(skipped: Record<string, number>, reason: string): void {
  skipped[reason] = (skipped[reason] ?? 0) + 1
}
