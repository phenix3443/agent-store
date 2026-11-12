import type { Octokit } from '@octokit/rest'
import type { SkillFile, SkillResourceDetail, ResourceSummary } from '@as/types'
import matter from 'gray-matter'
import pMap from 'p-map'
import { rawUrl } from '../detail-codec'
import { getText, isRecord, str } from '../http'
import { addSkip, type CatalogRecord, type CatalogSource, type SourceRun } from '../types'
import { discoverFromSkillsSh, type SkillsShDiscovery } from './skills-sh'

/** Repos scanned on every run, before any discovered through skills.sh. */
export const SKILL_REPOS = [
  'anthropics/skills',
  'obra/superpowers',
  'vercel-labs/agent-skills',
  // Sources of the skills the old hand-maintained registry listed.
  'affaan-m/ECC',
  'multica-ai/andrej-karpathy-skills',
]

// Container directories, in the order vercel-labs/skills searches them
// (docs/creating-skills.md, "Skill Discovery"). The repo root comes first.
const CONTAINERS = [
  'skills/', 'skills/.curated/', 'skills/.experimental/', 'skills/.system/', '.aider-desk/skills/',
  '.agents/skills/', 'data/skills/', '.autohand/skills/', '.augment/skills/', '.bob/skills/', '.claude/skills/',
  '.codeartsdoer/skills/', '.codebuddy/skills/', '.codemaker/skills/', '.codestudio/skills/', '.commandcode/skills/',
  '.continue/skills/', '.cortex/skills/', '.crush/skills/', '.devin/skills/', 'agent/skills/', '.forge/skills/',
  '.goose/skills/', '.grok/skills/', '.hermes/skills/', '.inferencesh/skills/', '.jazz/skills/', '.junie/skills/',
  '.iflow/skills/', '.kimchi/skills/', '.kiro/skills/', '.kode/skills/', '.lingma/skills/', '.mcpjam/skills/',
  '.minimax/skills/', '.vibe/skills/', '.moxby/skills/', '.mux/skills/', '.openhands/skills/', '.ona/skills/',
  '.posit/assistant/skills/', '.qoder/skills/', '.qwen/skills/', '.reasonix/skills/', '.rovodev/skills/', '.roo/skills/',
  '.tabnine/agent/skills/', '.terramind/skills/', '.tinycloud/skills/', '.trae/skills/', '.windsurf/skills/',
  '.zcode/skills/', '.zencoder/skills/', '.neovate/skills/', '.pochi/skills/', '.adal/skills/',
]
const MAX_DEPTH = 3
const MAX_SKILLS_PER_REPO = 500

export interface TreeEntry {
  path: string
  mode: string
  type: string
  sha: string
  size?: number
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * Skill directories in discovery order: the root, then each container walked
 * up to three levels deep, a SKILL.md shadowing any below it. With none there,
 * every SKILL.md in the repo counts. Directories, not names, are returned.
 */
export function findSkillDirs(entries: TreeEntry[]): string[] {
  const dirs = new Set(entries.filter((e) => e.type === 'blob' && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md'))).map((e) => parentOf(e.path)))
  const shadowed = (dir: string, stopAt: string) => {
    for (let d = parentOf(dir); d.length > stopAt.length; d = parentOf(d)) if (dirs.has(d)) return true
    return false
  }
  const found: string[] = []
  const seen = new Set<string>()
  const add = (d: string) => { if (!seen.has(d)) { seen.add(d); found.push(d) } }
  if (dirs.has('')) add('')
  for (const container of CONTAINERS) {
    const root = container.slice(0, -1)
    for (const dir of [...dirs].sort()) {
      if (!dir.startsWith(container)) continue
      const depth = dir.slice(container.length).split('/').length
      if (depth <= MAX_DEPTH && !shadowed(dir, root)) add(dir)
    }
  }
  if (found.length > 0) return found
  return [...dirs].filter((d) => !d.split('/').some((s) => s === 'node_modules') && !shadowed(d, '')).sort()
}

export function parseSkillMd(text: string): Record<string, unknown> | null {
  try {
    const data = matter(text).data
    return isRecord(data) ? (JSON.parse(JSON.stringify(data)) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function isRateLimit(e: unknown): boolean {
  if (!isRecord(e) || typeof e['status'] !== 'number') return false
  const headers = isRecord(e['response']) && isRecord(e['response']['headers']) ? e['response']['headers'] : {}
  return e['status'] === 429 || (e['status'] === 403 && (headers['x-ratelimit-remaining'] === '0' || /rate limit/i.test(String(e['message']))))
}

export interface RepoScan {
  /** Lowercase `owner/repo`; the reconcile scope. */
  scope: string
  records: CatalogRecord[]
  skipped: Record<string, number>
}

/** Reads one repo at its default branch head and turns each skill directory into a record. */
export async function scanRepo(
  github: Octokit,
  fetchImpl: typeof fetch,
  fullName: string,
  installs: SkillsShDiscovery['installs'],
): Promise<RepoScan> {
  const [owner, repo] = fullName.split('/') as [string, string]
  const scope = fullName.toLowerCase()
  const skipped: Record<string, number> = {}
  const { data: sha } = await github.request('GET /repos/{owner}/{repo}/commits/{ref}', {
    owner, repo, ref: 'HEAD', mediaType: { format: 'sha' },
  })
  const commit = { sha: String(sha).trim() }
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error(`${fullName}: could not resolve HEAD`)
  const { data: tree } = await github.git.getTree({ owner, repo, tree_sha: commit.sha, recursive: 'true' })
  if (tree.truncated) throw new Error(`${fullName}: git tree is truncated (too large to scan)`)
  const entries = tree.tree as TreeEntry[]
  const treeShaOf = new Map(entries.filter((e) => e.type === 'tree').map((e) => [e.path, e.sha]))
  treeShaOf.set('', tree.sha)

  let dirs = findSkillDirs(entries)
  if (dirs.length > MAX_SKILLS_PER_REPO) {
    skipped['repo has too many skills'] = dirs.length - MAX_SKILLS_PER_REPO
    dirs = dirs.slice(0, MAX_SKILLS_PER_REPO)
  }
  const raw = (path: string) => rawUrl(fullName, commit.sha, path)
  const parsed = await pMap(
    dirs,
    async (dir) => {
      try {
        return { dir, fm: parseSkillMd(await getText(fetchImpl, raw(dir ? `${dir}/SKILL.md` : 'SKILL.md'), `${fullName} SKILL.md`)) }
      } catch {
        return { dir, fm: undefined }
      }
    },
    { concurrency: 8 },
  )

  const records: CatalogRecord[] = []
  const names = new Set<string>()
  for (const { dir, fm } of parsed) {
    if (fm === undefined) { addSkip(skipped, 'SKILL.md could not be downloaded'); continue }
    const name = fm ? str(fm['name']) : null
    const description = fm ? str(fm['description']) : null
    if (!fm || !name || !description) { addSkip(skipped, 'SKILL.md frontmatter lacks name or description'); continue }
    const internal = isRecord(fm['metadata']) ? fm['metadata']['internal'] : undefined
    if (internal === true || internal === 'true' || internal === '1') { addSkip(skipped, 'marked internal'); continue }
    if (names.has(name)) { addSkip(skipped, 'duplicate skill name in repo'); continue }
    names.add(name)

    const prefix = dir ? `${dir}/` : ''
    const files: SkillFile[] = entries
      .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
      .map((e) => ({
        path: e.path.slice(prefix.length),
        type: e.mode === '120000' ? 'symlink' : 'file',
        mode: e.mode,
        size: e.size ?? 0,
        sha: e.sha,
        downloadUrl: raw(e.path),
      }))
    const treeSha = treeShaOf.get(dir) ?? tree.sha
    const basename = dir.split('/').pop() ?? ''
    const installCount = installs.get(`${scope}/${name.toLowerCase()}`) ?? (basename ? installs.get(`${scope}/${basename.toLowerCase()}`) : undefined)
    const detail: Omit<SkillResourceDetail, keyof ResourceSummary> = {
      repo: {
        fullName,
        ref: 'HEAD',
        commit: commit.sha,
        dir,
        treeSha,
        url: `https://github.com/${fullName}/tree/${commit.sha}${dir ? `/${dir}` : ''}`,
      },
      frontmatter: fm,
      files,
      archiveUrl: `https://codeload.github.com/${fullName}/tar.gz/${commit.sha}`,
    }
    const tags = Array.isArray(fm['tags']) ? fm['tags'].filter((t): t is string => typeof t === 'string') : []
    records.push({
      kind: 'skill',
      site: 'github',
      upstreamId: `${scope}/${name}`,
      name,
      description,
      author: { name: owner, url: `https://github.com/${owner}` },
      version: treeSha.slice(0, 12),
      homepageUrl: `https://github.com/${fullName}`,
      installs: installCount ?? null,
      verified: false,
      tags,
      transports: [],
      sourceUrl: `https://github.com/${fullName}/tree/HEAD${dir ? `/${dir}` : ''}`,
      upstreamVersion: treeSha,
      upstreamUpdatedAt: null,
      scope,
      detail,
    })
  }
  return { scope, records, skipped }
}

export function githubSkillsSource(options: { repos?: string[]; maxRepos?: number; skillsSh?: Parameters<typeof discoverFromSkillsSh>[1] } = {}): CatalogSource {
  return {
    name: 'github-skills',
    site: 'github',
    kind: 'skill',
    async run(ctx): Promise<SourceRun> {
      const run: SourceRun = { records: [], removed: [], skipped: {}, errors: [], coverage: { mode: 'scoped', scopes: [] } }
      const discovery = await discoverFromSkillsSh(ctx.fetch, options.skillsSh)
      run.errors.push(...discovery.errors.map((e) => `skills.sh: ${e}`))
      ctx.log(`github-skills: skills.sh found ${discovery.repos.size} repos`)

      const order = new Map<string, string>()
      const add = (full: string) => { if (!order.has(full.toLowerCase())) order.set(full.toLowerCase(), full) }
      ;(options.repos ?? SKILL_REPOS).forEach(add)
      ctx.state.knownScopes.forEach(add)
      ;[...discovery.repos.values()].sort((a, b) => b.installs - a.installs).forEach((r) => add(r.fullName))
      const maxRepos = options.maxRepos ?? 200
      const repos = [...order.values()]
      if (repos.length > maxRepos) run.skipped['repo over the per-run repo cap'] = repos.length - maxRepos

      let rateLimited = false
      const scopes: string[] = []
      await pMap(
        repos.slice(0, maxRepos),
        async (fullName) => {
          if (rateLimited) { addSkip(run.skipped, 'repo not scanned: GitHub rate limit'); return }
          try {
            const scan = await scanRepo(ctx.github, ctx.fetch, fullName, discovery.installs)
            run.records.push(...scan.records)
            for (const [k, v] of Object.entries(scan.skipped)) run.skipped[k] = (run.skipped[k] ?? 0) + v
            scopes.push(scan.scope)
          } catch (e) {
            if (isRateLimit(e)) {
              rateLimited = true
              addSkip(run.skipped, 'repo not scanned: GitHub rate limit')
            } else if (isRecord(e) && (e['status'] === 404 || e['status'] === 451)) {
              // Gone or blocked: everything it held is unavailable now.
              scopes.push(fullName.toLowerCase())
              run.errors.push(`${fullName}: repository not found`)
            } else {
              run.errors.push(`${fullName}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
        },
        { concurrency: 4 },
      )
      if (rateLimited) run.errors.push('GitHub rate limit reached; the remaining repos keep their previous data')
      run.coverage = { mode: 'scoped', scopes }
      return run
    },
  }
}
