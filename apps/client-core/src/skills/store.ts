// The skill library: ~/.agent-store/skills/<slug>/ holds the whole skill
// directory, and `.agent-store.json` marks the ones Agent Store installed. No
// tool reads the library; each tool sees a skill through its own deployment
// (deploy.ts, adapters/skill.ts). Directories without the marker belong to the
// user and are never replaced or deleted (issue #111).
import { createHash } from 'crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rename, rm, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import yaml from 'js-yaml'
import type { Item, SkillFile, SkillItem } from '@as/types'
import { assertSafeSlug } from '../paths'
import { extractSkillDir, writeSkillEntries, type SkillEntry } from './tar'

export const MARKER = '.agent-store.json'

export interface SkillMarker {
  slug: string
  version: string
  source: { repo: string; ref: string; resolvedSha: string; path: string } | null
  contentHash: string
  /**
   * Claude names a skill by its directory, Codex by its frontmatter `name`.
   * `claude` is the directory name deployments use in every tool.
   */
  runtimeNames: { claude: string; codex: string }
  /** The store item as installed (what manifest.json holds for other categories). */
  manifest: Item
}

/**
 * `modified`: the library copy was edited since install; `not-ours`: a directory
 * without our marker sits where the skill goes; `name-clash`: Codex already sees
 * another skill with this name.
 */
export class SkillConflictError extends Error {
  constructor(message: string, readonly reason: 'modified' | 'not-ours' | 'name-clash' = 'modified') {
    super(message)
    this.name = 'SkillConflictError'
  }
}

const DIR_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/** The directory name a skill is deployed under: its frontmatter name, so both tools call it the same, else the slug. */
export function deployDirName(slug: string, frontmatterName: string | undefined): string {
  return frontmatterName && DIR_NAME.test(frontmatterName) ? frontmatterName : slug
}

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

/** Every SKILL.md Codex can see, with its frontmatter name (§5.3 step 4), apart from `skip`. */
export async function codexVisibleNames(roots: string[], skip: Set<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const root of roots) {
    let entries: string[]
    try { entries = await readdir(root) } catch { continue }
    for (const entry of entries) {
      const dir = join(root, entry)
      if (skip.has(dir) || entry.startsWith('.')) continue
      try {
        const fm = parseFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf-8'))
        if (fm?.name && !names.has(fm.name)) names.set(fm.name, dir)
      } catch { /* not a skill */ }
    }
  }
  return names
}

/** True when `dir` holds nothing but a SKILL.md whose text is exactly `body` (an old-layout copy). */
export async function isLoneSkillMd(dir: string, body: string): Promise<boolean> {
  try {
    const names = await readdir(dir)
    return names.length === 1 && names[0] === 'SKILL.md' && (await readFile(join(dir, 'SKILL.md'), 'utf-8')) === body
  } catch {
    return false
  }
}

export interface InstallSkillContext {
  aasHome: string
}

export interface InstallSkillOptions {
  /** Replace locally edited content. */
  force?: boolean
}

const MAX_FILES = 2000
const FETCH_CONCURRENCY = 8

/** Downloads the catalog's file list (pinned raw URLs) instead of the whole repo tarball. */
async function fetchFiles(files: SkillFile[], dest: string): Promise<void> {
  if (files.length > MAX_FILES) throw new Error(`the skill has ${files.length} files, over the ${MAX_FILES} limit`)
  const entries: SkillEntry[] = new Array(files.length)
  let next = 0
  const worker = async () => {
    while (next < files.length) {
      const i = next++
      const f = files[i]
      if (!/^https:\/\//.test(f.downloadUrl)) throw new Error(`${f.path}: download URL must be https`)
      const data = await download(f.downloadUrl)
      entries[i] = f.type === 'symlink'
        ? { rel: f.path, type: 'symlink', mode: 0o777, linkname: Buffer.from(data).toString('utf-8'), data: new Uint8Array() }
        : { rel: f.path, type: 'file', mode: f.mode === '100755' ? 0o755 : 0o644, linkname: '', data }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, files.length) }, worker))
  await writeSkillEntries(entries, dest, 'skill files')
}

/**
 * Downloads the skill's whole directory into `dest` (an empty directory) and checks
 * it is a skill: SKILL.md with a frontmatter name and description.
 */
export async function fetchSkillInto(item: SkillItem, dest: string): Promise<{ source: SkillMarker['source']; frontmatter: { name: string; description: string } }> {
  let source: SkillMarker['source'] = null
  if (item.source && item.files?.length && /^[0-9a-f]{40}$/.test(item.source.ref)) {
    await fetchFiles(item.files, dest)
    source = { repo: item.source.repo, ref: item.source.ref, resolvedSha: item.source.ref, path: item.source.dir }
  } else if (item.source) {
    const sha = await resolveRef(item.source.repo, item.source.ref)
    const gz = await download(`${codeloadUrl()}/${item.source.repo}/tar.gz/${sha}`)
    await extractSkillDir(gz, item.source.dir, dest)
    source = { repo: item.source.repo, ref: item.source.ref, resolvedSha: sha, path: item.source.dir }
  } else {
    if (!item.contentUrl) throw new Error(`${item.slug} has neither a source nor a contentUrl`)
    await writeFile(join(dest, 'SKILL.md'), await download(item.contentUrl))
  }
  // Exact case: a case-insensitive disk would also open skill.md.
  if (!(await readdir(dest)).includes('SKILL.md')) throw new Error(`${item.slug}: the skill has no SKILL.md`)
  const fm = parseFrontmatter(await readFile(join(dest, 'SKILL.md'), 'utf-8'))
  if (!fm?.name || !fm.description) throw new Error(`${item.slug}: SKILL.md frontmatter needs name and description`)
  return { source, frontmatter: { name: fm.name, description: fm.description } }
}

/**
 * Stages the skill's full directory and renames it to ~/.agent-store/skills/<slug>.
 * A failure before the rename leaves nothing behind.
 */
export async function installSkillContent(
  ctx: InstallSkillContext,
  item: SkillItem,
  options: InstallSkillOptions = {}
): Promise<SkillMarker> {
  assertSafeSlug(item.slug)
  const store = skillStoreDir(ctx.aasHome)
  const dest = join(store, item.slug)
  const current = await exists(dest)
  const marker = current ? await readMarker(dest) : undefined
  if (current && !marker && !(await isLegacyInstall(dest, item.slug))) {
    throw new SkillConflictError(`${dest} exists and was not installed by Agent Store; move it away first`, 'not-ours')
  }
  if (marker && !options.force && (await contentHash(dest)) !== marker.contentHash) {
    throw new SkillConflictError(`${dest} was changed locally since it was installed; pass --force to replace it`, 'modified')
  }

  await mkdir(store, { recursive: true })
  const stage = await mkdtemp(join(store, `.as-stage-${item.slug}-`))
  try {
    const { source, frontmatter: fm } = await fetchSkillInto(item, stage)

    const result: SkillMarker = {
      slug: item.slug,
      version: item.version,
      source,
      contentHash: await contentHash(stage),
      // A reinstall keeps the directory name the skill is already deployed under.
      runtimeNames: { claude: marker?.runtimeNames.claude ?? deployDirName(item.slug, fm.name), codex: fm.name },
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

/** Removes ~/.agent-store/skills/<slug> only when it carries our marker and is unchanged (or `force`). */
export async function removeSkillContent(aasHome: string, slug: string, force = false): Promise<void> {
  const dest = join(skillStoreDir(aasHome), slug)
  if (!(await exists(dest))) return
  const marker = await readMarker(dest)
  if (!marker) {
    if (!(await isLegacyInstall(dest, slug))) throw new SkillConflictError(`${dest} was not installed by Agent Store; it is left in place`, 'not-ours')
  } else if (!force && (await contentHash(dest)) !== marker.contentHash) {
    throw new SkillConflictError(`${dest} was changed locally since it was installed; pass --force to remove it`, 'modified')
  }
  await rm(dest, { recursive: true, force: true })
}
