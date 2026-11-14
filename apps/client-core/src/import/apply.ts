// Taking over the user's own skills and MCP entries, and putting them back (issue #193).
//
// Skills move into the library and are deployed back where they were: the library copy
// is made first and checked against the scanned hash, then the original is renamed into
// ~/.agent-store/imports/<id>/ (untouched, it is the undo) and a link to the library takes
// its place. MCP entries stay in the agent configs as they are; only the ownership
// records (manifest.json with the entries, targets.json, registry) are added.
//
// import.json is written before anything moves and after every step, so a failed apply
// is rolled back from it and an interrupted one is finished by `aas import undo`.
import { randomBytes } from 'crypto'
import { cp, lstat, mkdir, readdir, readFile, rename, rm } from 'fs/promises'
import { basename, join } from 'path'
import lockfile from 'proper-lockfile'
import type {
  ImportApplyResult, ImportedItem, ImportRecordSummary, ImportUndoConflict, ImportUndoItem, ImportUndoOptions,
  ImportUndoResult, InstalledItem, Item, MCPItem, Publisher, SkillItem, ToolTarget,
} from '@as/types'
import type { Catalog } from '../catalog'
import { assertSafeSlug, itemDir } from '../paths'
import { findEntry, readRegistry, removeEntry, setDeploymentRecord, updateRegistry, upsertEntry } from '../registry/index'
import { contentHash, MARKER, readMarker, skillStoreDir, type SkillMarker } from '../skills/store'
import { classifyTarget, deploySkillDir, NO_CLOBBER, preferredMode, removeClassified } from '../skills/deploy'
import { writeMcpTargets } from '../config/mcp-targets'
import { mcpEntriesEqual } from '../config/mcp-compare'
import { atomicWriteSecretFile } from '../config/safe-file'
import { readClaudeMcpEntry, writeClaudeMcpEntryFile } from '../config/claude-mcp'
import { editCodexMcpTable, readCodexMcpEntry } from '../config/codex-mcp'
import { scanForImport, type FoundMcp, type FoundSkill, type ImportPaths } from './scan'
import { maskArgs, maskUrl } from './redact'

export class ImportCandidateError extends Error {
  constructor(message: string, readonly reason: 'unknown' | 'not-importable') {
    super(message)
    this.name = 'ImportCandidateError'
  }
}

/** The undo would destroy something the import did not put there; nothing was changed. */
export class ImportUndoConflictError extends Error {
  readonly reason = 'conflict'
  constructor(readonly importId: string, readonly conflicts: ImportUndoConflict[]) {
    super(`Import ${importId} was not undone; nothing was changed: ${conflicts.map(c => `${c.slug} (${c.path}: ${c.reason})`).join('; ')}. ` +
      `"modified" and "changed" can be overridden with --force, which keeps the newer copy or entry`)
    this.name = 'ImportUndoConflictError'
  }
}

export class ImportNotFoundError extends Error {
  readonly reason = 'not-found'
  constructor(id?: string) {
    super(id ? `No import ${id}` : 'Nothing to undo: no import is in place')
    this.name = 'ImportNotFoundError'
  }
}

interface SkillLocationRecord {
  agent: ToolTarget
  path: string
  /** Where the original sits while imported. */
  backup: string
  moved: boolean
  restored?: boolean
}

interface SkillImportRecord {
  kind: 'skill'
  id: string
  slug: string
  contentHash: string
  resourceId?: string
  libraryDone: boolean
  registryDone: boolean
  locations: SkillLocationRecord[]
  undone?: boolean
}

interface McpImportRecord {
  kind: 'mcp'
  id: string
  slug: string
  name: string
  /** Each agent's entry exactly as it was. Secret: the record is 0600. */
  entries: Partial<Record<ToolTarget, unknown>>
  paths: Partial<Record<ToolTarget, string>>
  done: boolean
  restored?: Partial<Record<ToolTarget, boolean>>
  undone?: boolean
}

export interface ImportRecord {
  importId: string
  createdAt: string
  state: ImportRecordSummary['state']
  undoneAt?: string
  /** Copies of the agent config files taken before the import, deleted on undo (they hold secrets). */
  configBackups: Array<{ path: string; backup: string }>
  items: Array<SkillImportRecord | McpImportRecord>
}

export const LOCAL_PUBLISHER: Publisher = { id: 'local', slug: 'local', name: 'Local', avatarUrl: '', tier: 'community' }

const importsDir = (aasHome: string) => join(aasHome, 'imports')
const recordPath = (aasHome: string, id: string) => join(importsDir(aasHome), id, 'import.json')

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function saveRecord(aasHome: string, record: ImportRecord): Promise<void> {
  await atomicWriteSecretFile(recordPath(aasHome, record.importId), JSON.stringify(record, null, 2) + '\n')
}

export async function readImportRecord(aasHome: string, id: string): Promise<ImportRecord> {
  try {
    return JSON.parse(await readFile(recordPath(aasHome, id), 'utf-8')) as ImportRecord
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ImportNotFoundError(id)
    throw e
  }
}

export async function listImportRecords(aasHome: string): Promise<ImportRecord[]> {
  let ids: string[]
  try { ids = await readdir(importsDir(aasHome)) } catch { return [] }
  const out: ImportRecord[] = []
  for (const id of ids.sort()) {
    try { out.push(await readImportRecord(aasHome, id)) } catch { /* not an import */ }
  }
  return out
}

function toItem(r: SkillImportRecord | McpImportRecord): ImportedItem {
  if (r.kind === 'skill') {
    return { kind: 'skill', id: r.id, slug: r.slug, agents: [...new Set(r.locations.map(l => l.agent))], paths: r.locations.map(l => l.path), ...(r.resourceId ? { resourceId: r.resourceId } : {}) }
  }
  return { kind: 'mcp', id: r.id, slug: r.slug, agents: Object.keys(r.entries) as ToolTarget[], paths: [...new Set(Object.values(r.paths) as string[])] }
}

export function summarize(r: ImportRecord): ImportRecordSummary {
  return { importId: r.importId, createdAt: r.createdAt, state: r.state, items: r.items.map(toItem), ...(r.undoneAt ? { undoneAt: r.undoneAt } : {}) }
}

async function withImportLock<T>(aasHome: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(aasHome, { recursive: true })
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(join(aasHome, 'imports'), { realpath: false, lockfilePath: join(aasHome, 'imports.lock'), retries: { retries: 20, minTimeout: 50, maxTimeout: 500 } })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOCKED') throw new Error('Another Agent Store process is importing or undoing an import; try again')
    throw e
  }
  try { return await fn() } finally { await release() }
}

/** Rename, or copy-check-delete across filesystems; the result has the same content either way. */
async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
    return
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
  }
  await cp(from, to, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true, force: false })
  if ((await contentHash(to)) !== (await contentHash(from))) {
    await rm(to, { recursive: true, force: true })
    throw new Error(`Copying ${from} to ${to} did not reproduce it; nothing was moved`)
  }
  await rm(from, { recursive: true })
}

function safeSlug(raw: string, taken: Set<string>): string {
  let base = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 120)
  if (!base) base = 'imported'
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  assertSafeSlug(slug)
  taken.add(slug)
  return slug
}

async function takenSlugs(p: ImportPaths): Promise<Set<string>> {
  const taken = new Set((await readRegistry(p.aasHome)).installed.map(e => e.slug))
  for (const dir of [skillStoreDir(p.aasHome), join(p.aasHome, 'mcps')]) {
    try { for (const name of await readdir(dir)) taken.add(name) } catch { /* none yet */ }
  }
  return taken
}

function localSkillItem(slug: string, f: FoundSkill, version: string, resourceId: string | undefined, now: string): SkillItem {
  return {
    id: resourceId ?? `local:${slug}`, slug, name: f.name ?? f.dirName, description: f.description ?? '', category: 'skill', version,
    publisher: LOCAL_PUBLISHER, compatibleWith: ['claude', 'codex'], tags: [], downloads: 0, status: 'published',
    installHook: { steps: [] }, createdAt: now, updatedAt: now, contentUrl: '', ...(resourceId ? { resourceId } : {}),
  }
}

function localMcpItem(slug: string, f: FoundMcp, now: string): MCPItem {
  const entries = Object.fromEntries((Object.entries(f.entries) as Array<[ToolTarget, { entry: unknown }]>).map(([t, e]) => [t, e.entry]))
  const first = Object.values(entries)[0] as Record<string, unknown>
  const url = typeof first['url'] === 'string' ? first['url'] : undefined
  const base = {
    id: `local:${slug}`, slug, name: f.name, description: '', category: 'mcp' as const, version: 'local', publisher: LOCAL_PUBLISHER,
    compatibleWith: Object.keys(entries) as ToolTarget[], tags: [], downloads: 0, status: 'published' as const,
    installHook: { steps: [] }, createdAt: now, updatedAt: now, configSchema: {}, localEntries: entries,
    ...(f.name !== slug ? { entryName: f.name } : {}),
  }
  // `url` and `serverCommand` are only shown by `info`, never run: localEntries is what gets written.
  if (url) return { ...base, transport: first['type'] === 'sse' ? 'sse' : 'http', url: maskUrl(url) }
  const argv = [String(first['command'] ?? ''), ...maskArgs(Array.isArray(first['args']) ? first['args'].map(String) : [])]
  return { ...base, transport: 'stdio', serverCommand: argv.join(' ') }
}

async function backupConfig(dir: string, path: string, out: ImportRecord['configBackups']): Promise<void> {
  if (out.some(b => b.path === path) || !(await exists(path))) return
  const backup = join(dir, 'config', `${out.length}-${basename(path)}`)
  await mkdir(join(dir, 'config'), { recursive: true, mode: 0o700 })
  await atomicWriteSecretFile(backup, await readFile(path, 'utf-8'))
  out.push({ path, backup })
}

/** Takes over the scanned candidates `ids`. Rolls everything back and rethrows if any step fails. */
export async function applyImport(p: ImportPaths, ids: string[], catalog?: Catalog, options: { offline?: boolean } = {}): Promise<ImportApplyResult> {
  if (!ids.length) throw new ImportCandidateError('Nothing selected to import', 'unknown')
  return withImportLock(p.aasHome, async () => {
    const scan = await scanForImport(p, catalog, options)
    const skills = ids.filter(id => id.startsWith('skill:')).map(id => {
      const s = scan.skills.find(x => x.candidate.id === id)
      if (!s) throw new ImportCandidateError(`${id} is not among what a scan finds now; scan again`, 'unknown')
      if (!s.candidate.importable) throw new ImportCandidateError(`${id} cannot be imported (${s.candidate.reason})`, 'not-importable')
      return s
    })
    const mcps = ids.filter(id => id.startsWith('mcp:')).map(id => {
      const m = scan.mcps.find(x => x.candidate.id === id)
      if (!m) throw new ImportCandidateError(`${id} is not among what a scan finds now; scan again`, 'unknown')
      return m
    })
    const unknown = ids.filter(id => !id.startsWith('skill:') && !id.startsWith('mcp:'))
    if (unknown.length) throw new ImportCandidateError(`Unknown candidate ids: ${unknown.join(', ')}`, 'unknown')

    const now = new Date().toISOString()
    const importId = `${now.replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
    const dir = join(importsDir(p.aasHome), importId)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const taken = await takenSlugs(p)
    const record: ImportRecord = { importId, createdAt: now, state: 'applying', configBackups: [], items: [] }
    for (const [i, s] of skills.entries()) {
      record.items.push({
        kind: 'skill', id: s.candidate.id, slug: safeSlug(s.candidate.dirName, taken), contentHash: s.candidate.contentHash!,
        ...(s.candidate.catalog?.exact ? { resourceId: s.candidate.catalog.id } : {}),
        libraryDone: false, registryDone: false,
        locations: s.members.map((m, j) => ({ agent: m.agent, path: m.path, backup: join(dir, 'skills', `${i}-${j}-${m.dirName}`), moved: false })),
      })
    }
    for (const m of mcps) {
      const entries = Object.fromEntries((Object.entries(m.found.entries) as Array<[ToolTarget, { entry: unknown }]>).map(([t, e]) => [t, e.entry]))
      const paths = Object.fromEntries((Object.entries(m.found.entries) as Array<[ToolTarget, { path: string }]>).map(([t, e]) => [t, e.path]))
      record.items.push({ kind: 'mcp', id: m.candidate.id, slug: safeSlug(m.found.name, taken), name: m.found.name, entries, paths, done: false })
      for (const path of Object.values(paths)) await backupConfig(dir, path, record.configBackups)
    }
    await saveRecord(p.aasHome, record)

    try {
      for (const [i, item] of record.items.entries()) {
        if (item.kind === 'skill') {
          const s = skills[i]
          await applySkill(p, record, item, s.members[0], s.candidate.catalog?.exact ? s.candidate.catalog.version ?? 'local' : 'local', now)
        } else {
          await applyMcp(p, record, item, mcps[i - skills.length].found, now)
        }
      }
    } catch (e) {
      try {
        await undoRecord(p, record, { force: false })
        record.state = 'rolled-back'
        await saveRecord(p.aasHome, record)
      } catch (rollbackError) {
        throw new Error(`Import failed (${(e as Error).message}) and could not be rolled back (${(rollbackError as Error).message}); run: aas import undo ${importId}`)
      }
      throw e
    }
    record.state = 'applied'
    await saveRecord(p.aasHome, record)
    return { importId, items: record.items.map(toItem) }
  })
}

async function applySkill(p: ImportPaths, record: ImportRecord, item: SkillImportRecord, first: FoundSkill, version: string, now: string): Promise<void> {
  const library = skillStoreDir(p.aasHome)
  const dest = join(library, item.slug)
  await mkdir(library, { recursive: true })
  const stage = join(library, `.as-import-${item.slug}-${randomBytes(3).toString('hex')}`)
  try {
    await cp(first.path, stage, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true, force: false })
    if ((await contentHash(stage)) !== item.contentHash) throw new Error(`${first.path} changed while it was being imported; nothing was moved, scan again`)
    const marker: SkillMarker = {
      slug: item.slug, version, source: null, contentHash: item.contentHash,
      runtimeNames: { claude: first.dirName, codex: first.name ?? first.dirName },
      manifest: localSkillItem(item.slug, first, version, item.resourceId, now) as Item,
    }
    await atomicWriteSecretFile(join(stage, MARKER), JSON.stringify(marker, null, 2))
    await rename(stage, dest)
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
  item.libraryDone = true
  await saveRecord(p.aasHome, record)

  await updateRegistry(p.aasHome, r => upsertEntry(r, {
    slug: item.slug, category: 'skill', version, installedAt: now, updatedAt: now, compatibleWith: ['claude', 'codex'], enabledFor: {},
    imported: { importId: record.importId, at: now }, ...(item.resourceId ? { resourceId: item.resourceId } : {}),
  }))
  item.registryDone = true
  await saveRecord(p.aasHome, record)

  for (const loc of item.locations) {
    await mkdir(join(loc.backup, '..'), { recursive: true, mode: 0o700 })
    await move(loc.path, loc.backup)
    loc.moved = true
    await saveRecord(p.aasHome, record)
    const mode = await deploySkillDir(dest, loc.path, preferredMode(), NO_CLOBBER, loc.agent, item.slug)
    await setDeploymentRecord(p.aasHome, item.slug, loc.agent, { path: loc.path, mode, sourceHash: item.contentHash })
  }
}

async function applyMcp(p: ImportPaths, record: ImportRecord, item: McpImportRecord, found: FoundMcp, now: string): Promise<void> {
  const dir = itemDir(p.aasHome, 'mcp', item.slug)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await atomicWriteSecretFile(join(dir, 'manifest.json'), JSON.stringify(localMcpItem(item.slug, found, now), null, 2))
  const agents = Object.keys(item.entries) as ToolTarget[]
  await writeMcpTargets(dir, Object.fromEntries(agents.map(a => [a, { name: item.name, written: item.entries[a], previous: null }])))
  await updateRegistry(p.aasHome, r => upsertEntry(r, {
    slug: item.slug, category: 'mcp', version: 'local', installedAt: now, updatedAt: now, compatibleWith: agents,
    enabledFor: Object.fromEntries(agents.map(a => [a, true])), imported: { importId: record.importId, at: now },
  }))
  item.done = true
  await saveRecord(p.aasHome, record)
}

// ── Undo ─────────────────────────────────────────────────────────────────────

async function readEntry(p: ImportPaths, agent: ToolTarget, name: string): Promise<unknown> {
  return agent === 'claude'
    ? readClaudeMcpEntry({ claudeConfigDir: p.claudeConfigDir, claudeJsonPath: p.claudeJsonPath }, name)
    : readCodexMcpEntry({ codexHome: p.codexConfigDir }, name)
}

async function writeEntry(p: ImportPaths, agent: ToolTarget, path: string, name: string, entry: unknown): Promise<void> {
  if (agent === 'claude') await writeClaudeMcpEntryFile(p.aasHome, path, name, entry)
  else await editCodexMcpTable(p.aasHome, path, name, entry as Record<string, unknown>)
}

function ourEntry(registryEntry: InstalledItem | undefined, importId: string): boolean {
  return registryEntry?.imported?.importId === importId
}

interface SkillPlan { item: SkillImportRecord; clear: Array<{ loc: SkillLocationRecord; state: Awaited<ReturnType<typeof classifyTarget>> }>; modified: boolean }

async function planSkill(p: ImportPaths, record: ImportRecord, item: SkillImportRecord, force: boolean, conflicts: ImportUndoConflict[]): Promise<SkillPlan> {
  const lib = join(skillStoreDir(p.aasHome), item.slug)
  const entry = findEntry(await readRegistry(p.aasHome), item.slug)
  const plan: SkillPlan = { item, clear: [], modified: false }
  for (const loc of item.locations) {
    if (!loc.moved || loc.restored) continue
    if (!(await exists(loc.backup))) { conflicts.push({ slug: item.slug, path: loc.backup, reason: 'backup-missing' }); continue }
    const state = await classifyTarget(loc.path, lib)
    const deployment = ourEntry(entry, record.importId) ? entry!.deployments?.[loc.agent] : undefined
    const ourCopy = state === 'real-dir' && deployment?.mode === 'copy' && deployment.path === loc.path &&
      (await contentHash(loc.path).catch(() => '')) === deployment.sourceHash
    if (state === 'absent' || state === 'link-to-source' || ourCopy) plan.clear.push({ loc, state })
    else conflicts.push({ slug: item.slug, path: loc.path, reason: 'occupied' })
  }
  if (item.libraryDone && (await exists(lib))) {
    const marker = await readMarker(lib)
    plan.modified = marker?.slug !== item.slug || (await contentHash(lib).catch(() => '')) !== item.contentHash
    if (plan.modified && !force) conflicts.push({ slug: item.slug, path: lib, reason: 'modified' })
  }
  return plan
}

async function undoSkill(p: ImportPaths, record: ImportRecord, plan: SkillPlan, dir: string): Promise<ImportUndoItem> {
  const { item } = plan
  const lib = join(skillStoreDir(p.aasHome), item.slug)
  for (const { loc, state } of plan.clear) {
    await removeClassified(loc.path, state)
    await move(loc.backup, loc.path)
    loc.restored = true
    await saveRecord(p.aasHome, record)
  }
  if (item.registryDone) {
    await updateRegistry(p.aasHome, r => ourEntry(findEntry(r, item.slug), record.importId) ? removeEntry(r, item.slug) : r)
  }
  let keptAt: string | undefined
  if (item.libraryDone && (await exists(lib))) {
    if (plan.modified) {
      keptAt = join(dir, 'kept', item.slug)
      await mkdir(join(dir, 'kept'), { recursive: true, mode: 0o700 })
      await move(lib, keptAt)
    } else {
      await rm(lib, { recursive: true })
    }
  }
  item.undone = true
  await saveRecord(p.aasHome, record)
  return { kind: 'skill', slug: item.slug, result: keptAt ? 'kept-copy' : 'bytes', paths: item.locations.filter(l => l.moved).map(l => l.path), ...(keptAt ? { keptAt } : {}) }
}

interface McpPlan { item: McpImportRecord; restore: ToolTarget[]; keep: ToolTarget[] }

async function planMcp(p: ImportPaths, item: McpImportRecord, force: boolean, conflicts: ImportUndoConflict[]): Promise<McpPlan> {
  const plan: McpPlan = { item, restore: [], keep: [] }
  if (!item.done) return plan
  for (const agent of Object.keys(item.entries) as ToolTarget[]) {
    if (item.restored?.[agent]) continue
    const current = await readEntry(p, agent, item.name)
    if (current === undefined) plan.restore.push(agent)
    else if (!mcpEntriesEqual(agent, current, item.entries[agent])) {
      if (force) plan.keep.push(agent)
      else conflicts.push({ slug: item.slug, path: item.paths[agent]!, reason: 'changed' })
    }
  }
  return plan
}

async function undoMcp(p: ImportPaths, record: ImportRecord, plan: McpPlan): Promise<ImportUndoItem> {
  const { item } = plan
  for (const agent of plan.restore) {
    await writeEntry(p, agent, item.paths[agent]!, item.name, item.entries[agent])
    item.restored = { ...item.restored, [agent]: true }
    await saveRecord(p.aasHome, record)
  }
  await updateRegistry(p.aasHome, r => ourEntry(findEntry(r, item.slug), record.importId) ? removeEntry(r, item.slug) : r)
  const dir = itemDir(p.aasHome, 'mcp', item.slug)
  const manifest = await readFile(join(dir, 'manifest.json'), 'utf-8').then(t => JSON.parse(t) as MCPItem).catch(() => undefined)
  if ((await exists(dir)) && (!manifest || manifest.id === `local:${item.slug}`)) await rm(dir, { recursive: true })
  item.undone = true
  await saveRecord(p.aasHome, record)
  return {
    kind: 'mcp', slug: item.slug, paths: [...new Set(Object.values(item.paths) as string[])],
    result: plan.keep.length ? 'kept-current' : plan.restore.length ? 'entry' : 'bytes',
  }
}

/**
 * Checks every item first and changes nothing when one would destroy what the import
 * did not put there; then puts each back. Every step is recorded, so a run that stops
 * part way is finished by the next.
 */
async function undoRecord(p: ImportPaths, record: ImportRecord, options: ImportUndoOptions): Promise<ImportUndoItem[]> {
  const force = options.force === true
  const conflicts: ImportUndoConflict[] = []
  const dir = join(importsDir(p.aasHome), record.importId)
  const skillPlans: SkillPlan[] = []
  const mcpPlans: McpPlan[] = []
  for (const item of record.items) {
    if (item.undone) continue
    if (item.kind === 'skill') skillPlans.push(await planSkill(p, record, item, force, conflicts))
    else mcpPlans.push(await planMcp(p, item, force, conflicts))
  }
  if (conflicts.length) throw new ImportUndoConflictError(record.importId, conflicts)
  const out: ImportUndoItem[] = []
  // MCP entries first: writing one back is the only step that can be refused by the file's shape.
  for (const plan of mcpPlans) out.push(await undoMcp(p, record, plan))
  for (const plan of skillPlans) out.push(await undoSkill(p, record, plan, dir))
  for (const b of record.configBackups) await rm(b.backup, { force: true })
  record.configBackups = []
  return out
}

export async function undoImport(p: ImportPaths, importId?: string, options: ImportUndoOptions = {}): Promise<ImportUndoResult> {
  return withImportLock(p.aasHome, async () => {
    let record: ImportRecord | undefined
    if (importId) record = await readImportRecord(p.aasHome, importId)
    else record = (await listImportRecords(p.aasHome)).filter(r => r.state === 'applied' || r.state === 'applying').pop()
    if (!record || record.state === 'undone' || record.state === 'rolled-back') throw new ImportNotFoundError(importId)
    const items = await undoRecord(p, record, options)
    record.state = 'undone'
    record.undoneAt = new Date().toISOString()
    await saveRecord(p.aasHome, record)
    return { importId: record.importId, items }
  })
}
