import type { ResourceDetail, ResourceListResponse, ResourceSummary } from './resources'
import type { Item } from './items'

const SLUG = /^[a-z0-9-]{1,128}$/

function slugify(raw: string): string | null {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128)
  return SLUG.test(slug) ? slug : null
}

/**
 * The local name of a catalog resource: its directory under ~/.agent-store, its
 * registry key and what `aas install <slug>` accepts. It matches the slugs the old
 * /api/items catalog used for the packages both catalogs hold, so existing installs
 * keep their names (providers: the slug; skills: `<repo>-<name>`; MCP: the last
 * segment of the server name). Null when nothing usable is left.
 */
export function resourceSlug(r: Pick<ResourceSummary, 'kind' | 'origin'>): string | null {
  const id = r.origin.upstreamId
  let raw = id
  if (r.kind === 'skill') {
    const parts = id.split('/')
    raw = parts.length >= 3 ? `${parts[1]}-${parts.slice(2).join('/')}` : id
  } else if (r.kind === 'mcp') {
    raw = id.split('/').pop() ?? id
  }
  return slugify(raw)
}

/**
 * The slug used when `resourceSlug` is already taken by another resource: the
 * whole id, so two MCP servers both called `playwright-mcp` can be installed side
 * by side.
 */
export function resourceLongSlug(r: Pick<ResourceSummary, 'id'>): string | null {
  return slugify(r.id)
}

/** A catalog row as the clients see it: the API's summary plus the local slug. */
export type CatalogResource = ResourceSummary & { slug: string | null }

export type CatalogResourceDetail = ResourceDetail & {
  slug: string | null
  /** What installing it would write, as the client builds it (the install preview); absent when it can't be installed. */
  install?: Item
  /** Why it can't be installed, when `install` is absent. */
  installError?: string
}

export interface CatalogSearchResult extends ResourceListResponse {
  resources: CatalogResource[]
  /** True when the API could not be reached and the rows come from the last cached page. */
  offline: boolean
}
