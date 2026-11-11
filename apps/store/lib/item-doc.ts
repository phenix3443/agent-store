import type { Item } from '@as/types'

export interface ItemDoc {
  kind: 'readme' | 'content'
  body: string
}

/** Skills show their SKILL.md; stdio MCP servers show the npm package README. */
export async function getItemDoc(item: Item): Promise<ItemDoc | null> {
  if (item.category === 'skill' && item.contentUrl) {
    try {
      const res = await fetch(item.contentUrl, { next: { revalidate: 3600 } })
      if (!res.ok) return null
      const body = (await res.text())
        .slice(0, 20000)
        .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
        .trim()
      return body ? { kind: 'content', body } : null
    } catch {
      return null
    }
  }
  if (item.category === 'mcp' && item.transport === 'stdio' && item.serverCommand) {
    const pkg = item.serverCommand.split(/\s+/).find((t) => t !== 'npx' && !t.startsWith('-'))
    if (!pkg) return null
    try {
      const res = await fetch(`https://registry.npmjs.org/${pkg}`, { next: { revalidate: 3600 } })
      if (!res.ok) return null
      const data = (await res.json()) as { readme?: string }
      return typeof data.readme === 'string' && data.readme.trim()
        ? { kind: 'readme', body: data.readme.slice(0, 20000) }
        : null
    } catch {
      return null
    }
  }
  return null
}
