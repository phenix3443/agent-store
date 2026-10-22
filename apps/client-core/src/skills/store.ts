// The canonical skill store: ~/.agents/skills/<slug>/ holds the whole skill
// directory, and `.agent-store.json` marks the ones Agent Store installed.
// Directories without the marker belong to the user and are never replaced or
// deleted. See docs/global-skills-mcp.md §5.3.
import { createHash } from 'crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rename, rm, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import yaml from 'js-yaml'
import type { Item, SkillItem } from '@as/types'
import { extractSkillDir } from './tar'

export const MARKER = '.agent-store.json'

export interface SkillMarker {
  slug: string
  version: string
  source: { repo: string; ref: string; resolvedSha: string; path: string } | null
  contentHash: string
  /** Claude names a skill by its directory, Codex by its frontmatter `name`. */
  runtimeNames: { claude: string; codex: string }
  /** The store item as installed (what manifest.json holds for other categories). */
  manifest: Item
}

export class SkillConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillConflictError'
  }
}

const SLUG = /^[a-z0-9-]{1,60}$/

export function skillStoreDir(aasHome: string): string {
  return join(aasHome, 'skills')
}

export async function readMarker(dir: string): Promise<SkillMarker | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, MARKER), 'utf-8')) as SkillMarker
  } catch {
    return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

/**
 * A directory written by Agent Store before markers existed: only its
 * manifest.json (same slug), skill.md and the optional config.json.
 */
export async function isLegacyInstall(dir: string, slug: string): Promise<boolean> {
  try {
    const names = await readdir(dir)
    if (!names.every(n => n === 'manifest.json' || n === 'skill.md' || n === 'config.json')) return false
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as { slug?: unknown; category?: unknown }
    return manifest.slug === slug && manifest.category === 'skill'
  } catch {
    return false
  }
}

/** `name`/`description` from SKILL.md frontmatter; undefined when missing or invalid. */
export function parseFrontmatter(text: string): { name?: string; description?: string } | undefined {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?(\n|$)/)
  if (!m) return undefined
  try {
    const data = yaml.load(m[1]) as Record<string, unknown> | null
    if (!data || typeof data !== 'object') return undefined
    return {
      name: typeof data['name'] === 'string' ? data['name'] : undefined,
      description: typeof data['description'] === 'string' ? data['description'] : undefined,
    }
  } catch {
    return undefined
  }
}

/** sha256 over every path and file content (symlinks by target), marker excluded. */
export async function contentHash(dir: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (d: string): Promise<void> => {
    const names = (await readdir(d)).sort()
    for (const name of names) {
      const full = join(d, name)
      const rel = relative(dir, full)
      if (rel === MARKER) continue
      const st = await lstat(full)
      if (st.isSymbolicLink()) hash.update(`L ${rel}\0${await readlink(full)}\0`)
      else if (st.isDirectory()) { hash.update(`D ${rel}\0`); await walk(full) }
      else hash.update(`F ${rel}\0`).update(await readFile(full)).update('\0')
    }
  }
  await walk(dir)
  return hash.digest('hex')
}

function githubApiUrl(): string {
  return (process.env['AS_GITHUB_API_URL'] ?? 'https://api.github.com').replace(/\/+$/, '')
}

function codeloadUrl(): string {
  return (process.env['AS_CODELOAD_URL'] ?? 'https://codeload.github.com').replace(/\/+$/, '')
}

async function resolveRef(repo: string, ref: string): Promise<string> {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref
  const res = await fetch(`${githubApiUrl()}/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`could not resolve ${repo}@${ref}: HTTP ${res.status}`)
  const body = await res.json() as { sha?: unknown }
  if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) throw new Error(`could not resolve ${repo}@${ref}: no commit sha`)
  return body.sha
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Every SKILL.md Codex can see, with its frontmatter name (§5.3 step 4). */
async function codexVisibleNames(roots: string[], slug: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const root of roots) {
    let entries: string[]
    try { entries = await readdir(root) } catch { continue }
    for (const entry of entries) {
      const dir = join(root, entry)
      // Our own slug is skipped in every root: the store copy is what we replace, and
      // <codex>/skills/<slug> is the copy older versions wrote (migrated by `as migrate`).
      if (entry === slug || entry.startsWith('.')) continue
      try {
        const fm = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf-8'))
        if (fm?.name && !names.has(fm.name)) names.set(fm.name, dir)
      } catch { /* not a skill */ }
    }
  }
  return names
}

export interface InstallSkillContext {
  aasHome: string
  /** Codex's own (deprecated) user skill root, also checked for name clashes. */
  codexConfigDir: string
}

export interface InstallSkillOptions {
  /** Replace locally edited content and ignore a Codex name clash. */
  force?: boolean
}

/**
 * Stages the skill's full directory and renames it to ~/.agents/skills/<slug>.
 * A failure before the rename leaves nothing behind.
 */
export async function installSkillContent(
  ctx: InstallSkillContext,
  item: SkillItem,
  options: InstallSkillOptions = {}
): Promise<SkillMarker> {
  if (!SLUG.test(item.slug)) throw new Error(`invalid skill slug ${JSON.stringify(item.slug)}`)
  const store = skillStoreDir(ctx.aasHome)
  const dest = join(store, item.slug)
  const current = await exists(dest)
  const marker = current ? await readMarker(dest) : undefined
  if (current && !marker && !(await isLegacyInstall(dest, item.slug))) {
    throw new SkillConflictError(`${dest} exists and was not installed by Agent Store; move it away first`)
  }
  if (marker && !options.force && (await contentHash(dest)) !== marker.contentHash) {
    throw new SkillConflictError(`${dest} was changed locally since it was installed; pass --force to replace it`)
  }

  await mkdir(store, { recursive: true })
  const stage = await mkdtemp(join(store, `.as-stage-${item.slug}-`))
  try {
    let source: SkillMarker['source'] = null
    if (item.source) {
      const sha = await resolveRef(item.source.repo, item.source.ref)
      const gz = await download(`${codeloadUrl()}/${item.source.repo}/tar.gz/${sha}`)
      await extractSkillDir(gz, item.source.dir, stage)
      source = { repo: item.source.repo, ref: item.source.ref, resolvedSha: sha, path: item.source.dir }
    } else {
      if (!item.contentUrl) throw new Error(`${item.slug} has neither a source nor a contentUrl`)
      await writeFile(join(stage, 'SKILL.md'), await download(item.contentUrl))
    }

    // Exact case: a case-insensitive disk would also open skill.md.
    if (!(await readdir(stage)).includes('SKILL.md')) throw new Error(`${item.slug}: the skill has no SKILL.md`)
    const text = await readFile(join(stage, 'SKILL.md'), 'utf-8')
    const fm = parseFrontmatter(text)
    if (!fm?.name || !fm.description) throw new Error(`${item.slug}: SKILL.md frontmatter needs name and description`)

    if (!options.force) {
      const clash = (await codexVisibleNames([store, join(ctx.codexConfigDir, 'skills')], item.slug)).get(fm.name)
      if (clash) {
        throw new SkillConflictError(`Codex already sees a skill named "${fm.name}" at ${clash}; pass --force to install anyway`)
      }
    }

    const result: SkillMarker = {
      slug: item.slug,
      version: item.version,
      source,
      contentHash: await contentHash(stage),
      runtimeNames: { claude: item.slug, codex: fm.name },
      manifest: item,
    }
    await writeFile(join(stage, MARKER), JSON.stringify(result, null, 2))

    if (current) {
      const old = `${stage}.old`
      await rename(dest, old)
      try {
        await rename(stage, dest)
      } catch (e) {
        await rename(old, dest)
        throw e
      }
      await rm(old, { recursive: true, force: true })
    } else {
      await rename(stage, dest)
    }
    return result
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

/** Removes ~/.agents/skills/<slug> only when it carries our marker and is unchanged (or `force`). */
export async function removeSkillContent(aasHome: string, slug: string, force = false): Promise<void> {
  const dest = join(skillStoreDir(aasHome), slug)
  if (!(await exists(dest))) return
  const marker = await readMarker(dest)
  if (!marker) {
    if (!(await isLegacyInstall(dest, slug))) throw new SkillConflictError(`${dest} was not installed by Agent Store; it is left in place`)
  } else if (!force && (await contentHash(dest)) !== marker.contentHash) {
    throw new SkillConflictError(`${dest} was changed locally since it was installed; pass --force to remove it`)
  }
  await rm(dest, { recursive: true, force: true })
}
