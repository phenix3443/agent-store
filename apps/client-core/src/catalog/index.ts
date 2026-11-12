// The aggregated catalog (/api/resources) as the engine uses it: search, detail,
// and resolving what the user typed (an id, a slug or a name) to one resource.
import {
  resourceLongSlug, resourceSlug,
  type CatalogResource, type CatalogResourceDetail, type CatalogSearchResult, type Item,
  type ResourceKind, type ResourceSummary, type SearchOptions,
} from '@as/types'
import type { StoreClient } from '@as/sdk'
import { readCatalogCache, writeCatalogCache } from '../catalog-cache'
import { toItem } from './to-item'

export { toItem } from './to-item'
export { planMcp, McpNotInstallableError } from './mcp-plan'

export class ResourceNotFoundError extends Error {
  readonly reason = 'not-found'
  constructor(readonly ref: string) {
    super(`Not in the catalog: ${ref}. Search with: aas search <words>`)
    this.name = 'ResourceNotFoundError'
  }
}

export class AmbiguousResourceError extends Error {
  readonly reason = 'ambiguous'
  constructor(readonly ref: string, readonly candidates: string[]) {
    super(`${ref} matches several catalog entries; install one by id: ${candidates.map(c => `aas install ${c}`).join(' | ')}`)
    this.name = 'AmbiguousResourceError'
  }
}

export class CatalogUnavailableError extends Error {
  readonly reason = 'unavailable'
  constructor(detail: string) {
    super(`The catalog could not be reached (${detail}); nothing was changed`)
    this.name = 'CatalogUnavailableError'
  }
}

/** What install and update need: the manifest the adapters install from, and where it came from. */
export interface CatalogItem {
  item: Item
  resourceId: string | null
  /** Used when `item.slug` is already taken by another resource. */
  longSlug: string | null
}

export interface Catalog {
  search(query: string, options?: SearchOptions): Promise<CatalogSearchResult>
  get(ref: string, options?: { kind?: ResourceKind }): Promise<CatalogResourceDetail>
  resolveItem(ref: string, options?: { kind?: ResourceKind }): Promise<CatalogItem>
}

const withSlug = <T extends Pick<ResourceSummary, 'kind' | 'origin'>>(r: T): T & { slug: string | null } => ({ ...r, slug: resourceSlug(r) })

function matchesLocally(r: CatalogResource, q: string): boolean {
  const needle = q.toLowerCase()
  return [r.name, r.description ?? '', r.id, ...r.tags].some(s => s.toLowerCase().includes(needle))
}

export class ResourceCatalog implements Catalog {
  constructor(private readonly client: StoreClient, private readonly aasHome: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<CatalogSearchResult> {
    const q = query.trim()
    const result = await this.client.listResources({ q, kind: options.category, sort: options.sort, limit: options.limit, offset: options.offset })
    if (result.data !== null) {
      const resources = result.data.resources.map(withSlug)
      if (!q && !options.offset) await writeCatalogCache(this.aasHome, options.category ?? 'all', resources).catch(() => undefined)
      return { resources, nextOffset: result.data.nextOffset, offline: false }
    }
    // API down: the last first page we saw, searched locally. No throw, so browsing still works.
    const cached = await readCatalogCache(this.aasHome, options.category ?? 'all')
    const rows = (cached ?? []).filter(r => !q || matchesLocally(r, q))
    return { resources: options.offset ? [] : rows, nextOffset: null, offline: true }
  }

  async get(ref: string, options: { kind?: ResourceKind } = {}): Promise<CatalogResourceDetail> {
    const id = ref.includes(':') ? ref : (await this.findBySlug(ref, options.kind)).id
    const result = await this.client.getResource(id)
    if (result.data === null) {
      if (result.status === 404) throw new ResourceNotFoundError(ref)
      throw new CatalogUnavailableError(result.error)
    }
    if (options.kind && result.data.kind !== options.kind) throw new ResourceNotFoundError(ref)
    return withSlug(result.data)
  }

  async resolveItem(ref: string, options: { kind?: ResourceKind } = {}): Promise<CatalogItem> {
    const detail = await this.get(ref, options)
    const slug = detail.slug ?? resourceLongSlug(detail)
    if (!slug) throw new ResourceNotFoundError(ref)
    return { item: toItem(detail, slug), resourceId: detail.id, longSlug: resourceLongSlug(detail) }
  }

  /**
   * A slug like `skills-find-skills` is not something the search index knows, so
   * it is searched as typed and then without its leading words (`find-skills`),
   * and a hit counts only when its slug (or, on the first query, its name) is
   * exactly what was typed.
   */
  private async findBySlug(ref: string, kind?: ResourceKind): Promise<ResourceSummary> {
    const words = ref.split('-')
    const queries = [ref, ...words.slice(1, 4).map((_, i) => words.slice(i + 1).join('-'))].filter(Boolean)
    for (const [i, q] of queries.entries()) {
      const result = await this.client.listResources({ q, kind, limit: 100 })
      if (result.data === null) throw new CatalogUnavailableError(result.error)
      const rows = result.data.resources
      let hits = rows.filter(r => resourceSlug(r) === ref || resourceLongSlug(r) === ref)
      if (!hits.length && i === 0) hits = rows.filter(r => r.name.toLowerCase() === ref.toLowerCase())
      if (hits.length === 1) return hits[0]
      if (hits.length > 1) {
        const verified = hits.filter(r => r.verified)
        if (verified.length === 1) return verified[0]
        throw new AmbiguousResourceError(ref, hits.map(r => r.id))
      }
    }
    throw new ResourceNotFoundError(ref)
  }
}
