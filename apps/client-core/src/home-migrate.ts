// Moves Agent Store's own state from ~/.agents (a convention directory other
// tools read; Codex reads ~/.agents/skills) to ~/.agent-store (owner decision on
// #111). Runs once, at the start of every `aas` command and desktop action, like
// the relay refresh (#89).
//
// 1. Copy what is ours into a staging directory next to the new home, back up
//    the tool configs we are about to rewrite, and rename the staging directory
//    to ~/.agent-store. The rename is the commit point: a failure before it
//    leaves ~/.agents as it was, and the next run starts over.
// 2. Give every skill per-tool deployments of its new library copy (replacing
//    the Claude links into ~/.agents/skills and adding a Codex link, since
//    Codex used to read every installed skill), and rewrite MCP entries whose
//    command points into the old item directory.
// 3. Remove the originals that were copied. Directories without our marker and
//    anything else in ~/.agents are never touched.
// `.home-migration.json` in the new home records progress, so a run that stops
// in step 2 or 3 is finished by the next one.
import { cp, lstat, mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import lockfile from 'proper-lockfile'
import type { InstalledItem, Paths, ToolTarget } from '@as/types'
import { readRegistry, setDeploymentRecord, setEnabledFlag } from './registry/index'
import { isLegacyInstall, readMarker, SkillConflictError } from './skills/store'
import { SkillDeployRefusedError } from './skills/deploy'
import { standaloneSkillAdapter } from './adapters/skill'
import { McpAdapter } from './adapters/mcp'
import { readMcpTargets } from './config/mcp-targets'
import { convertStoreDir, type MigrateStep } from './migrate'

export interface HomeMigrationPaths {
  /** ~/.agents */
  from: string
  /** ~/.agent-store */
  to: string
  claudeConfigDir: string
  claudeJsonPath: string
  codexConfigDir: string
}

export interface HomeMigrationResult {
  steps: MigrateStep[]
  /** A relay daemon started from the old home was stopped; the caller should start it again. */
  relayStopped: boolean
}

const STATE = '.home-migration.json'

/** Top-level files and directories that are Agent Store's own (besides skills, which are checked one by one). */
const OWNED = [
  'registry.json', 'mcps', 'providers', 'relay-token', 'relay-state', 'relay.pid', 'relay-configs.json',
  'usage.db', 'usage.db-wal', 'usage.db-shm', 'budget.json', 'entitlement.json', 'exports',
]

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function copy(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false, preserveTimestamps: true })
}

async function readState(to: string): Promise<{ phase: string; from: string } | null> {
  try { return JSON.parse(await readFile(join(to, STATE), 'utf-8')) } catch { return null }
}

/** Skills in the old store that are provably ours: a marker for this slug, or the pre-marker layout. */
async function ownedSkills(from: string, registry: { installed: InstalledItem[] }): Promise<string[]> {
  const out: string[] = []
  for (const entry of registry.installed.filter(e => e.category === 'skill')) {
    const dir = join(from, 'skills', entry.slug)
    if ((await readMarker(dir))?.slug === entry.slug || (await isLegacyInstall(dir, entry.slug))) out.push(entry.slug)
  }
  return out
}

/** Whether a migration from `from` should run (or resume) now. */
export async function homeMigrationPending(p: Pick<HomeMigrationPaths, 'from' | 'to'>): Promise<boolean> {
  if (p.from === p.to) return false
  const state = await readState(p.to)
  if (state) return state.phase !== 'done'
  return (await exists(join(p.from, 'registry.json'))) && !(await exists(p.to))
}

/**
 * The desktop client starts several `aas` processes at once, so the run holds a
 * lock next to the new home and checks again once it has it: the others wait,
 * then find nothing left to do.
 */
export async function migrateHome(p: HomeMigrationPaths, now: Date = new Date()): Promise<HomeMigrationResult | null> {
  if (!(await homeMigrationPending(p))) return null
  await mkdir(dirname(p.to), { recursive: true })
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(p.to, {
      realpath: false,
      lockfilePath: `${p.to}.migrate.lock`,
      retries: { retries: 60, factor: 1.2, minTimeout: 50, maxTimeout: 1000 },
    })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOCKED') throw new Error(`another Agent Store process is moving ${p.from} to ${p.to}; try again`)
    throw e
  }
  try {
    if (!(await homeMigrationPending(p))) return null
    return await migrateLocked(p, now)
  } finally {
    await release()
  }
}

async function migrateLocked(p: HomeMigrationPaths, now: Date): Promise<HomeMigrationResult> {
  const steps: MigrateStep[] = []
  const step = (slug: string, result: MigrateStep['result'], message: string) => steps.push({ slug, result, message })
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  let relayStopped = false

  // ── 1. copy, back up, commit ───────────────────────────────────────────────
  if (!(await readState(p.to))) {
    const oldRegistry = await readRegistry(p.from)
    const skills = await ownedSkills(p.from, oldRegistry)
    const parent = dirname(p.to)
    for (const name of await readdir(parent).catch(() => [] as string[])) {
      if (name.startsWith(`${basename(p.to)}.migrating-`)) await rm(join(parent, name), { recursive: true, force: true })
    }
    const stage = join(parent, `${basename(p.to)}.migrating-${process.pid}`)
    await mkdir(stage, { recursive: true, mode: 0o700 })
    try {
      // Old backups first: the backups of this run go into the same directory.
      if (await exists(join(p.from, 'agent-store', 'backups'))) await copy(join(p.from, 'agent-store', 'backups'), join(stage, 'backups'))
      const backups = join(stage, 'backups', `home-migrate-${stamp}`)
      for (const file of [p.claudeJsonPath, join(p.claudeConfigDir, 'settings.json'), join(p.codexConfigDir, 'config.toml'), join(p.from, 'registry.json')]) {
        if (await exists(file)) await copy(file, join(backups, file.replace(/^\/+/, '').replace(/[\\/:]+/g, '_')))
      }
      for (const name of OWNED) {
        if (await exists(join(p.from, name))) await copy(join(p.from, name), join(stage, name))
      }
      for (const slug of skills) await copy(join(p.from, 'skills', slug), join(stage, 'skills', slug))
      await writeFile(join(stage, STATE), JSON.stringify({ phase: 'copied', from: p.from, skills, startedAt: now.toISOString() }, null, 2))
      await rename(stage, p.to)
    } catch (e) {
      await rm(stage, { recursive: true, force: true })
      throw e
    }
    step('home', 'done', `copied Agent Store's files from ${p.from} to ${p.to}; tool configs backed up in ${join(p.to, 'backups', `home-migrate-${stamp}`)}`)
  }

  const state = JSON.parse(await readFile(join(p.to, STATE), 'utf-8')) as { phase: string; skills?: string[]; startedAt?: string }
  const paths: Required<Paths> = { aasHome: p.to, claudeConfigDir: p.claudeConfigDir, claudeJsonPath: p.claudeJsonPath, codexConfigDir: p.codexConfigDir }
  const registry = await readRegistry(p.to)

  // ── 2. deployments and tool entries ────────────────────────────────────────
  const skillAdapter = standaloneSkillAdapter(paths)
  for (const entry of registry.installed.filter(e => e.category === 'skill')) {
    const slug = entry.slug
    const dir = join(p.to, 'skills', slug)
    try {
      if (await isLegacyInstall(dir, slug)) {
        await convertStoreDir(dir, entry)
        step(slug, 'done', `${dir}: converted to SKILL.md + marker`)
      }
      if (!(await readMarker(dir))) continue
      for (const target of ['claude', 'codex'] as ToolTarget[]) {
        if (entry.deployments?.[target]) continue
        // Codex read ~/.agents/skills itself, so every installed skill was on for it.
        if (target === 'claude' && entry.enabledFor.claude !== true) continue
        try {
          await skillAdapter.migrateDeployment(slug, target, join(p.from, 'skills', slug))
          step(slug, 'done', `${target}: deployed from ${dir}`)
        } catch (e) {
          if (!(e instanceof SkillDeployRefusedError || e instanceof SkillConflictError)) throw e
          await setEnabledFlag(p.to, slug, target, false)
          step(slug, 'skipped', `${target}: ${e.message}`)
        }
      }
    } catch (e) {
      step(slug, 'error', (e as Error).message)
    }
  }

  const mcp = new McpAdapter({
    paths,
    setEnabled: (slug, target, enabled) => setEnabledFlag(p.to, slug, target, enabled),
    setDeployment: (slug, target, record) => setDeploymentRecord(p.to, slug, target, record),
  })
  for (const entry of registry.installed.filter(e => e.category === 'mcp')) {
    const recorded = Object.keys(await readMcpTargets(join(p.to, 'mcps', entry.slug)).catch(() => ({})))
    for (const target of ['claude', 'codex'] as ToolTarget[]) {
      if (!entry.enabledFor[target] && !recorded.includes(target)) continue
      try {
        // Rebuilt from the new item directory; the ownership rules refuse an entry the user changed.
        await mcp.resync(entry, target)
        step(entry.slug, 'done', `${target}: MCP entry checked against ${join(p.to, 'mcps', entry.slug)}`)
      } catch (e) {
        step(entry.slug, 'error', `${target}: ${(e as Error).message}`)
      }
    }
  }

  // A relay started from the old home reads the old files; it is restarted from the new one.
  try {
    const pid = Number((await readFile(join(p.from, 'relay.pid'), 'utf-8')).trim())
    if (pid > 0) {
      process.kill(pid, 0)
      process.kill(pid, 'SIGTERM')
      relayStopped = true
      step('relay', 'done', `stopped the relay started from ${p.from} (pid ${pid})`)
    }
  } catch { /* not running */ }

  // ── 3. remove the originals ────────────────────────────────────────────────
  for (const name of [...OWNED, 'registry.json.lock']) await rm(join(p.from, name), { recursive: true, force: true })
  await rm(join(p.from, 'agent-store', 'backups'), { recursive: true, force: true })
  await rmdir(join(p.from, 'agent-store')).catch(() => undefined)
  for (const slug of state.skills ?? []) {
    const old = join(p.from, 'skills', slug)
    // Only what is still ours: a marker for this slug, or the pre-marker layout.
    if ((await readMarker(old))?.slug === slug || (await isLegacyInstall(old, slug))) await rm(old, { recursive: true, force: true })
  }
  await rm(join(p.from, 'catalog-cache.json'), { force: true })

  await writeFile(join(p.to, STATE), JSON.stringify({ ...state, phase: 'done', finishedAt: new Date().toISOString() }, null, 2))
  return { steps, relayStopped }
}
