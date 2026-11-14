import type { ExternalListing, ExternalSite, ResourceDetail, ResourceSummary } from '@as/types'
import { and, asc, desc, eq, gt, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Database } from '../db/client'
import { foundListings, foundRepos, foundResources, searchLookups } from '../db/schema'
import { decodeDetail, encodeDetail } from './detail-codec'
import type { ExternalFind } from './search-sources'
import type { CatalogRecord } from './types'

/** Listings not seen and repos not named for this long are dropped; the catalog sync has had them for months. */
const LISTING_RETENTION_DAYS = 180
/**
 * A scanned skill is served until the published catalog holds it. One that is still
 * absent after this long was not accepted by the sync (or left its repo) and is dropped.
 */
const RESOURCE_RETENTION_DAYS = 14

export interface FoundResource {
  skillKey: string
  summary: ResourceSummary
}

export interface FoundListing extends ExternalListing {
  githubRepo: string | null
}

export interface FoundExport {
  generatedAt: string
  listings: Array<{
    source: string
    listingId: string
    skillKey: string
    name: string
    url: string
    githubRepo: string | null
    firstSeenAt: string
  }>
  /** lastAttemptAt and lastStatus: the API's latest scan of the repo; null when it never scanned it. */
  repos: Array<{ fullName: string; source: string; firstSeenAt: string; lastAttemptAt: string | null; lastStatus: string | null }>
}

export interface StoredLookup {
  status: 'found' | 'none'
  partial: boolean
  skillKeys: string[]
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

function summaryOf(r: CatalogRecord, stamp: string): ResourceSummary {
  return {
    id: `${r.site}:${r.upstreamId}`,
    kind: r.kind,
    name: r.name,
    description: r.description,
    author: r.author,
    version: r.version,
    homepageUrl: r.homepageUrl,
    installs: r.installs,
    stars: null,
    verified: r.verified,
    tags: r.tags,
    transports: r.transports,
    origin: {
      site: r.site,
      upstreamId: r.upstreamId,
      url: r.sourceUrl,
      upstreamVersion: r.upstreamVersion,
      upstreamUpdatedAt: r.upstreamUpdatedAt ?? stamp,
      syncedAt: stamp,
      unavailableAt: null,
      unavailableReason: null,
    },
  }
}

/**
 * What search lookups found, in app.db: it outlives restarts and catalog.db downloads,
 * and the catalog sync reads it through `export()` so finds reach the published catalog.
 */
export class FoundStore {
  constructor(private readonly db: Database) {}

  /** Records every listing a lookup saw and queues the GitHub repos they name. */
  saveFinds(finds: ExternalFind[], stamp: string): void {
    if (finds.length === 0) return
    this.db.transaction(
      (tx) => {
        for (const f of finds) {
          tx.insert(foundListings)
            .values({ ...f, firstSeenAt: stamp, lastSeenAt: stamp })
            .onConflictDoUpdate({
              target: [foundListings.source, foundListings.listingId],
              set: { skillKey: f.skillKey, name: f.name, description: f.description, author: f.author, url: f.url, githubRepo: f.githubRepo, lastSeenAt: stamp },
            })
            .run()
          if (f.githubRepo) {
            tx.insert(foundRepos).values({ fullName: f.githubRepo, source: f.source, firstSeenAt: stamp }).onConflictDoNothing().run()
          }
        }
      },
      { behavior: 'immediate' },
    )
  }

  /** Of `repos`, those never scanned by the API or last tried before `before`. */
  reposDue(repos: string[], before: string): string[] {
    if (repos.length === 0) return []
    const rows = this.db.select({ fullName: foundRepos.fullName, lastAttemptAt: foundRepos.lastAttemptAt })
      .from(foundRepos).where(inArray(foundRepos.fullName, repos)).all()
    const tried = new Map(rows.map((r) => [r.fullName, r.lastAttemptAt]))
    return repos.filter((r) => {
      const at = tried.get(r)
      return at === undefined || at === null || at < before
    })
  }

  markRepo(fullName: string, status: string, stamp: string): void {
    this.db.insert(foundRepos)
      .values({ fullName, source: 'search', firstSeenAt: stamp, lastAttemptAt: stamp, lastStatus: status })
      .onConflictDoUpdate({ target: foundRepos.fullName, set: { lastAttemptAt: stamp, lastStatus: status } })
      .run()
  }

  /**
   * Stores the skills a scan of one repo read. A scan of the whole repo replaces what was
   * held for it; a scan of some of its skills (`replace: false`) replaces only those.
   */
  saveResources(repo: string, records: CatalogRecord[], stamp: string, options: { replace: boolean } = { replace: true }): void {
    const skills = records.filter((r) => r.kind === 'skill')
    this.db.transaction(
      (tx) => {
        if (options.replace) tx.delete(foundResources).where(eq(foundResources.githubRepo, repo)).run()
        else if (skills.length) tx.delete(foundResources).where(inArray(foundResources.id, skills.map((r) => summaryOf(r, stamp).id))).run()
        for (const r of skills) {
          const summary = summaryOf(r, stamp)
          tx.insert(foundResources)
            .values({
              id: summary.id,
              skillKey: `github:${repo}/${r.name.toLowerCase()}`,
              githubRepo: repo,
              name: r.name,
              description: r.description,
              summary: JSON.stringify(summary),
              detail: encodeDetail(r.kind, r.detail),
              validatedAt: stamp,
            })
            .onConflictDoNothing()
            .run()
        }
      },
      { behavior: 'immediate' },
    )
  }

  dropResources(ids: string[]): void {
    if (ids.length) this.db.delete(foundResources).where(inArray(foundResources.id, ids)).run()
  }

  resource(id: string): ResourceDetail | null {
    const row = this.db.select({ summary: foundResources.summary, detail: foundResources.detail })
      .from(foundResources).where(eq(foundResources.id, id)).get()
    if (!row) return null
    return { ...(JSON.parse(row.summary) as ResourceSummary), ...decodeDetail('skill', row.detail) } as ResourceDetail
  }

  /** Stored finds for these keys plus those whose name or description holds every term. */
  find(skillKeys: string[], terms: string[], limit: number): { resources: FoundResource[]; listings: FoundListing[] } {
    const where = (key: AnySQLiteColumn, name: AnySQLiteColumn, description: AnySQLiteColumn): SQL => {
      const byKey = skillKeys.length ? inArray(key, skillKeys) : undefined
      const byText = terms.length
        ? and(...terms.map((t) => {
            const p = `%${likeEscape(t)}%`
            return sql`(${name} LIKE ${p} ESCAPE '\\' OR ${description} LIKE ${p} ESCAPE '\\')`
          }))
        : undefined
      return (byKey && byText ? or(byKey, byText) : (byKey ?? byText)) ?? sql`0`
    }
    const resources = this.db.select({ skillKey: foundResources.skillKey, summary: foundResources.summary })
      .from(foundResources)
      .where(where(foundResources.skillKey, foundResources.name, foundResources.description))
      .orderBy(asc(foundResources.id)).limit(limit).all()
    const listings = this.db.select().from(foundListings)
      .where(where(foundListings.skillKey, foundListings.name, foundListings.description))
      .orderBy(asc(foundListings.source), asc(foundListings.listingId)).limit(limit * 3).all()
    return {
      resources: resources.map((r) => ({ skillKey: r.skillKey, summary: JSON.parse(r.summary) as ResourceSummary })),
      listings: listings.map((l) => ({
        key: l.skillKey, site: l.source as ExternalSite, name: l.name, description: l.description, author: l.author, url: l.url, githubRepo: l.githubRepo,
      })),
    }
  }

  /** A finished lookup that has not expired. */
  lookup(key: string, now: string): StoredLookup | null {
    const row = this.db.select().from(searchLookups).where(and(eq(searchLookups.key, key), gt(searchLookups.expiresAt, now))).get()
    if (!row) return null
    return { status: row.status as StoredLookup['status'], partial: row.partial, skillKeys: JSON.parse(row.skillKeys) as string[] }
  }

  saveLookup(key: string, result: StoredLookup, stamp: string, expiresAt: string): void {
    const values = { status: result.status, partial: result.partial, skillKeys: JSON.stringify(result.skillKeys), checkedAt: stamp, expiresAt }
    this.db.insert(searchLookups).values({ key, ...values }).onConflictDoUpdate({ target: searchLookups.key, set: values }).run()
  }

  /** Listings and repos for the catalog sync, newest first. No query text is stored, so none leaves. */
  export(now: string, limit = 5000): FoundExport {
    const listings = this.db.select({
      source: foundListings.source, listingId: foundListings.listingId, skillKey: foundListings.skillKey, name: foundListings.name,
      url: foundListings.url, githubRepo: foundListings.githubRepo, firstSeenAt: foundListings.firstSeenAt,
    }).from(foundListings).orderBy(desc(foundListings.lastSeenAt), asc(foundListings.source), asc(foundListings.listingId)).limit(limit).all()
    const repos = this.db.select({
      fullName: foundRepos.fullName, source: foundRepos.source, firstSeenAt: foundRepos.firstSeenAt,
      lastAttemptAt: foundRepos.lastAttemptAt, lastStatus: foundRepos.lastStatus,
    })
      .from(foundRepos).orderBy(desc(foundRepos.firstSeenAt), asc(foundRepos.fullName)).limit(limit).all()
    return { generatedAt: now, listings, repos }
  }

  prune(now: Date): void {
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
    this.db.transaction(
      (tx) => {
        tx.delete(searchLookups).where(lt(searchLookups.expiresAt, now.toISOString())).run()
        tx.delete(foundResources).where(lt(foundResources.validatedAt, ago(RESOURCE_RETENTION_DAYS))).run()
        tx.delete(foundListings).where(lt(foundListings.lastSeenAt, ago(LISTING_RETENTION_DAYS))).run()
        tx.delete(foundRepos).where(lt(foundRepos.firstSeenAt, ago(LISTING_RETENTION_DAYS))).run()
      },
      { behavior: 'immediate' },
    )
  }
}
