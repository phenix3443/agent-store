import type { ResourceDetail } from '@as/types'

export interface ResourceDoc {
  kind: 'readme' | 'content'
  body: string
}

const MAX = 20000

async function text(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit)
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

const GITHUB_REPO = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/

/** Skills show their SKILL.md; MCP servers the npm README, else the GitHub README. */
export async function getResourceDoc(r: ResourceDetail): Promise<ResourceDoc | null> {
  if (r.kind === 'skill') {
    const file = r.files.find((f) => f.path === 'SKILL.md')
    const raw = file ? await text(file.downloadUrl) : null
    const body = raw
      ?.slice(0, MAX)
      .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
      .trim()
    return body ? { kind: 'content', body } : null
  }
  if (r.kind !== 'mcp') return null

  const npm = r.packages.find((p) => p.registryType === 'npm')
  if (npm) {
    const raw = await text(`https://registry.npmjs.org/${npm.identifier.replace('/', '%2F')}`)
    try {
      const readme = raw ? (JSON.parse(raw) as { readme?: string }).readme : undefined
      if (typeof readme === 'string' && readme.trim()) return { kind: 'readme', body: readme.slice(0, MAX) }
    } catch {
      /* fall through to GitHub */
    }
  }
  const gh = r.repository?.url ? GITHUB_REPO.exec(r.repository.url) : null
  if (gh) {
    const dir = r.repository?.subfolder ? `${r.repository.subfolder.replace(/^\/|\/$/g, '')}/` : ''
    const body = await text(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/HEAD/${dir}README.md`)
    if (body?.trim()) return { kind: 'readme', body: body.slice(0, MAX) }
  }
  return null
}
