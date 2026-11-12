import type { Category } from './detailContent'

/** Release and dev builds register different schemes; the OS only delivers the one this build owns. */
const SCHEMES = new Set(['agent-store:', 'agent-store-dev:'])
const CATEGORIES: readonly Category[] = ['provider', 'skill', 'mcp']
// Same shape the registry enforces on package slugs.
const SLUG = /^[a-z0-9-]{1,128}$/
// A catalog id: `<site>:<upstream id>`, printable, no spaces.
const ID = /^(mcp-registry|github|builtin):[A-Za-z0-9._~@/-]{1,300}$/

export type InvalidReason = 'malformed' | 'scheme' | 'action' | 'slug' | 'category'

export type DeepLinkRoute =
  | { kind: 'auth-callback' }
  /** `ref` is the catalog id when the link has one (web store links since #121), else the slug. */
  | { kind: 'install'; ref: string; slug?: string; category?: Category }
  | { kind: 'invalid'; reason: InvalidReason }

/**
 * Decides what an incoming deep link is for. An install route carries only the
 * catalog id or slug (and an optional category to cross-check against the
 * catalog): any other parameter is dropped here so nothing a web page puts in the
 * link can reach the install flow.
 */
export function routeDeepLink(raw: string): DeepLinkRoute {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { kind: 'invalid', reason: 'malformed' }
  }
  if (!SCHEMES.has(url.protocol)) return { kind: 'invalid', reason: 'scheme' }
  if (url.pathname !== '' && url.pathname !== '/') return { kind: 'invalid', reason: 'action' }

  if (url.hostname === 'auth-callback') return { kind: 'auth-callback' }
  if (url.hostname !== 'install') return { kind: 'invalid', reason: 'action' }

  const id = url.searchParams.get('id')
  const slugParam = url.searchParams.get('slug')
  const slug = slugParam !== null && SLUG.test(slugParam) ? slugParam : undefined
  let ref: string
  if (id !== null && ID.test(id)) ref = id
  else if (id === null && slug) ref = slug
  else return { kind: 'invalid', reason: 'slug' }

  const category = url.searchParams.get('category')
  const base = { kind: 'install' as const, ref, ...(slug ? { slug } : {}) }
  if (category === null) return base
  if (!(CATEGORIES as readonly string[]).includes(category)) return { kind: 'invalid', reason: 'category' }
  return { ...base, category: category as Category }
}
