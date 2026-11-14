// The backup repository's layout (schema 1) and the local files next to it.
import { chmod, copyFile, lstat, mkdir, readdir, readFile, readlink, symlink } from 'fs/promises'
import { join } from 'path'
import type { BackupItemCategory, Item, ToolTarget } from '@as/types'

export const FORMAT_FILE = 'agent-store-backup.json'
export const FORMAT = { format: 'agent-store-backup', schema: 1 } as const
export const TARGETS: ToolTarget[] = ['claude', 'codex']
export const CATEGORIES: BackupItemCategory[] = ['mcp', 'provider', 'skill']

/** content/item.json */
export interface ItemFile {
  slug: string
  category: BackupItemCategory
  version: string
  compatibleWith: ToolTarget[]
  resourceId?: string
  parentSlug?: string
  /** mcp, provider: manifest.json as installed. */
  manifest?: Item
  /** mcp, provider: config.json without secret keys. */
  config?: Record<string, unknown>
  /** Skills over the size limit: no files, the device that has them keeps them. */
  localOnly?: 'too-large'
}

/** state.json */
export interface StateFile {
  enabledFor: Partial<Record<ToolTarget, boolean>>
}

export const itemKey = (category: BackupItemCategory, slug: string) => `${category}/${slug}`

export function parseKey(key: string): { category: BackupItemCategory; slug: string } {
  const [category, slug] = key.split('/') as [BackupItemCategory, string]
  return { category, slug }
}

export const itemPath = (key: string) => `items/${key}`

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])]))
  }
  return value
}

/** Equal state gives equal bytes on every device, so git sees no change. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n'
}

export async function readItemFile(root: string, key: string): Promise<ItemFile> {
  return JSON.parse(await readFile(join(root, itemPath(key), 'content', 'item.json'), 'utf-8')) as ItemFile
}

export async function readStateFile(root: string, key: string): Promise<StateFile> {
  return JSON.parse(await readFile(join(root, itemPath(key), 'state.json'), 'utf-8')) as StateFile
}

export const filesDir = (root: string, key: string) => join(root, itemPath(key), 'content', 'files')

export interface TreeEntry {
  rel: string
  kind: 'file' | 'dir' | 'symlink'
  mode: number
  size: number
}

/** Every entry under `dir`, parents first, skipping what `skip` names (and everything below it). */
export async function listTree(dir: string, skip: (rel: string, mode: number, isDir: boolean) => boolean): Promise<TreeEntry[]> {
  const out: TreeEntry[] = []
  const walk = async (rel: string): Promise<void> => {
    for (const name of (await readdir(join(dir, rel))).sort()) {
      const r = rel ? `${rel}/${name}` : name
      const st = await lstat(join(dir, r))
      const kind = st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : null
      if (!kind || skip(r, st.mode, kind === 'dir')) continue
      out.push({ rel: r, kind, mode: st.mode & 0o777, size: kind === 'file' ? st.size : 0 })
      if (kind === 'dir') await walk(r)
    }
  }
  await walk('')
  return out
}

/** Copies `entries` (from listTree) of `src` into `dest`, links as links and executable bits kept. */
export async function copyEntries(src: string, dest: string, entries: TreeEntry[]): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const e of entries) {
    const to = join(dest, e.rel)
    if (e.kind === 'dir') await mkdir(to, { recursive: true })
    else if (e.kind === 'symlink') await symlink(await readlink(join(src, e.rel)), to)
    else {
      await copyFile(join(src, e.rel), to)
      await chmod(to, e.mode & 0o111 ? 0o755 : 0o644)
    }
  }
}
