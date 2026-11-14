// This machine's Agent Store state, written in the backup layout without secrets.
import { lstat, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { BackupExcludedFile, BackupLocalOnly, InstalledItem, Paths } from '@as/types'
import { itemDir } from '../paths'
import { readRegistry } from '../registry/index'
import { excludedSkillFile, secretStrings, splitSecrets, type KnownSecret } from './secrets'
import {
  copyEntries, filesDir, FORMAT, FORMAT_FILE, itemKey, itemPath, listTree, stableJson, TARGETS,
  type ItemFile, type StateFile, type TreeEntry,
} from './layout'

export const DEFAULT_MAX_ITEM_BYTES = 100 * 1024 * 1024

export class BackupExportError extends Error {
  readonly reason = 'export-failed'
  constructor(readonly key: string, detail: string) {
    super(`${key} cannot be backed up: ${detail}; run aas doctor`)
    this.name = 'BackupExportError'
  }
}

/** A target the backup wants enabled that this machine could not enable yet. */
export interface WantedTarget {
  key: string
  target: 'claude' | 'codex'
}

export interface ExportOptions {
  maxItemBytes: number
  /** Exported as enabled, so a device waiting for a key never uploads a disable nobody chose. */
  wanted: WantedTarget[]
  /** Backup token, kept out of the tree like any other secret. */
  extraSecrets: KnownSecret[]
}

export interface ExportResult {
  keys: string[]
  known: KnownSecret[]
  localOnly: BackupLocalOnly[]
  excludedFiles: BackupExcludedFile[]
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

async function readText(path: string): Promise<string | undefined> {
  try { return (await readFile(path, 'utf-8')).trim() } catch { return undefined }
}

export function stateOf(entry: InstalledItem, wanted: WantedTarget[]): StateFile {
  const key = itemKey(entry.category, entry.slug)
  const enabledFor: StateFile['enabledFor'] = {}
  for (const t of TARGETS) {
    if (!entry.compatibleWith.includes(t)) continue
    enabledFor[t] = entry.enabledFor[t] === true || wanted.some(w => w.key === key && w.target === t)
  }
  return { enabledFor }
}

/** Values on this machine that must never appear in the backup, wherever they sit. */
async function machineSecrets(paths: Required<Paths>): Promise<KnownSecret[]> {
  const known: KnownSecret[] = []
  const relay = await readText(join(paths.aasHome, 'relay-token'))
  if (relay) known.push({ value: relay, source: 'the local relay token' })
  try {
    const env = await readJsonFile(join(paths.aasHome, 'project-env.json'))
    for (const v of secretStrings(env)) known.push({ value: v, source: 'a stored project variable' })
  } catch { /* unreadable: nothing to compare with */ }
  return known
}

/** Writes the export into the empty directory `dir`. */
export async function exportLocal(paths: Required<Paths>, dir: string, options: ExportOptions): Promise<ExportResult> {
  const registry = await readRegistry(paths.aasHome)
  const result: ExportResult = { keys: [], known: [...options.extraSecrets, ...(await machineSecrets(paths))], localOnly: [], excludedFiles: [] }
  await writeFile(join(dir, FORMAT_FILE), stableJson(FORMAT))
  for (const entry of registry.installed) {
    const key = itemKey(entry.category, entry.slug)
    const root = join(dir, itemPath(key))
    const item: ItemFile = {
      slug: entry.slug,
      category: entry.category,
      version: entry.version,
      compatibleWith: [...entry.compatibleWith].sort(),
      ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
      ...(entry.parentSlug ? { parentSlug: entry.parentSlug } : {}),
    }
    const source = itemDir(paths.aasHome, entry.category, entry.slug)
    await mkdir(join(root, 'content'), { recursive: true })
    if (entry.category === 'skill') {
      let entries: TreeEntry[]
      try {
        // Under a umask of 077 every file is owner-only, SKILL.md included; modes then say nothing.
        // Windows reports 0666 for everything.
        const skillMd = await lstat(join(source, 'SKILL.md')).catch(() => null)
        const checkMode = process.platform !== 'win32' && skillMd !== null && (skillMd.mode & 0o044) !== 0
        entries = await listTree(source, (rel, mode, isDir) => {
          const why = excludedSkillFile(rel, mode, isDir, checkMode)
          if (why) result.excludedFiles.push({ key, category: 'skill', slug: entry.slug, file: rel, reason: why })
          return why !== null
        })
      } catch (e) {
        throw new BackupExportError(key, `${source} is missing or unreadable (${(e as Error).message})`)
      }
      const bytes = entries.reduce((n, e) => n + e.size, 0)
      if (bytes > options.maxItemBytes) {
        item.localOnly = 'too-large'
        result.localOnly.push({ key, category: 'skill', slug: entry.slug, reason: 'too-large', bytes })
      } else {
        await copyEntries(source, filesDir(dir, key), entries)
      }
    } else {
      const manifest = await readJsonFile(join(source, 'manifest.json')).catch(e => {
        throw new BackupExportError(key, `its manifest.json does not parse (${(e as Error).message})`)
      })
      if (!manifest) throw new BackupExportError(key, `${join(source, 'manifest.json')} is missing`)
      if ((manifest as { localEntries?: unknown }).localEntries) {
        item.localOnly = 'imported-mcp'
        result.localOnly.push({ key, category: entry.category, slug: entry.slug, reason: 'imported-mcp' })
        await writeFile(join(root, 'content', 'item.json'), stableJson(item))
        await writeFile(join(root, 'state.json'), stableJson(stateOf(entry, options.wanted)))
        result.keys.push(key)
        continue
      }
      const config = (await readJsonFile(join(source, 'config.json')).catch(() => undefined) ?? {}) as Record<string, unknown>
      const { shared, secret } = splitSecrets(config, (manifest as { configSchema?: unknown }).configSchema, entry.category)
      for (const [k, v] of Object.entries(secret)) {
        for (const s of secretStrings(v)) result.known.push({ value: s, source: `the ${k} value of ${key}` })
      }
      item.manifest = manifest as ItemFile['manifest']
      item.config = shared
    }
    await writeFile(join(root, 'content', 'item.json'), stableJson(item))
    await writeFile(join(root, 'state.json'), stableJson(stateOf(entry, options.wanted)))
    result.keys.push(key)
  }
  return result
}
