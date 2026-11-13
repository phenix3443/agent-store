import type { ExternalSite } from '@as/types'
import type { KyInstance } from 'ky'

/** One search hit on a skill directory, keyed the way discovery.db keys listings. */
export interface ExternalFind {
  source: ExternalSite
  listingId: string
  /** github:<owner/repo>/<skill>, clawhub:<owner>/<slug> or skillhub:<namespace>/<slug>. */
  skillKey: string
  name: string
  description: string | null
  author: string | null
  /** The listing on its site. */
  url: string
  githubRepo: string | null
}

/** Keyword search on one directory. The query is the only thing a site is ever sent. */
export interface SearchSource {
  name: ExternalSite
  /** Hosts a listing URL of this site may be on; anything else is dropped. */
  hosts: string[]
  /** Our own ceiling on lookups, at or below what the site allows. */
  budget: { perMinute: number; perDay: number }
  search(http: KyInstance, q: string, limit: number): Promise<ExternalFind[]>
}

const SKILL_KEY = /^(github:[\w.-]+\/[\w.-]+|clawhub:[^\s/:]+|skillhub:[^\s/:]+)\/[^/\u0000-\u001f]{1,200}$/
const LISTING_ID = /^[^\s\u0000-\u001f]{1,300}$/

const clean = (v: string | null, max: number): string | null => {
  const s = v?.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

/**
 * A find with the fields a record needs and a listing URL on its own site, text
 * trimmed to stored sizes; null when the site sent something else.
 */
export function checkFind(source: SearchSource, f: ExternalFind): ExternalFind | null {
  const name = clean(f.name, 200)
  if (!name || !SKILL_KEY.test(f.skillKey) || !LISTING_ID.test(f.listingId)) return null
  let url: URL
  try {
    url = new URL(f.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !source.hosts.includes(url.hostname)) return null
  return {
    source: source.name,
    listingId: f.listingId,
    skillKey: f.skillKey,
    name,
    description: clean(f.description, 500),
    author: clean(f.author, 100),
    url: url.toString(),
    githubRepo: f.githubRepo,
  }
}
