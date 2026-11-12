import type { Item } from '@as/types'

// Compact download formatting matching the design (e.g. 142k, 1.2M).
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const sentences = new Intl.Segmenter(undefined, { granularity: 'sentence' })

// Registry descriptions are the publisher's own text, often a skill's trigger
// instructions cut at a fixed length. Listings show the first whole sentence so
// a summary never ends mid-word; the full text stays on the detail page.
export function leadSentence(text: string): string {
  const first = sentences.segment(text.trim())[Symbol.iterator]().next().value
  return (first?.segment ?? text).trim()
}

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\//
// MCP registry names are `<reverse-DNS namespace>/<server>`, e.g. `io.github.owner/name`.
const MCP_NAMESPACE = /^((?:[a-z0-9-]+\.)+[a-z0-9-]+)\/[^/]+$/i

/**
 * Where the author lives upstream: the GitHub owner for skills and
 * `io.github.*` MCP servers, the namespace's domain for other MCP servers.
 * Null when the item does not say, rather than a guess.
 */
export function authorHref(item: Item): string | null {
  if (item.category === 'skill') {
    const owner = item.source?.repo.split('/')[0] ?? RAW_GITHUB.exec(item.contentUrl)?.[1]
    return owner && GITHUB_OWNER.test(owner) ? `https://github.com/${owner}` : null
  }
  if (item.category === 'mcp') {
    const namespace = MCP_NAMESPACE.exec(item.name)?.[1]
    if (!namespace) return null
    const labels = namespace.split('.')
    if (labels[0] === 'io' && labels[1] === 'github' && labels.length === 3) {
      return GITHUB_OWNER.test(labels[2]!) ? `https://github.com/${labels[2]}` : null
    }
    return `https://${labels.reverse().join('.')}`
  }
  return null
}
