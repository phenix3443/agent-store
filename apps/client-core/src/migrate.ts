// `as migrate`: converts skills installed by older Agent Store versions to the
// current layout (docs/global-skills-mcp.md §7, PR7). Anything it moves or
// rewrites is copied into ~/.agents/agent-store/backups/migrate-<stamp>/ first.
// Directories it cannot prove it wrote are reported and left alone.
import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { InstalledItem, Item } from '@as/types'
import { readRegistry, upsertEntry, writeRegistry } from './registry'
import { itemDir } from './paths'
import { contentHash, isLegacyInstall, MARKER, parseFrontmatter, readMarker, type SkillMarker } from './skills/store'
import { linkClaudeSkill } from './skills/claude-link'
import { AgentPackageEngine } from './agent-package-engine'

export interface MigratePaths {
  aasHome: string
  claudeConfigDir: string
  codexConfigDir: string
  /** Defaults the way resolvePaths does for the given claudeConfigDir. */
  claudeJsonPath?: string
}

export interface MigrateStep {
  /** Skill slug, or package id for package-engine steps. */
  slug: string
  /** done: changed; skipped: left alone and why; error: this slug stopped here. */
  result: 'done' | 'skipped' | 'error'
  message: string
}

export interface MigrateResult {
  /** Only created when something was backed up. */
  backupDir: string
  steps: MigrateStep[]
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function isRealDir(path: string): Promise<boolean> {
  try { const st = await lstat(path); return st.isDirectory() && !st.isSymbolicLink() } catch { return false }
}

/** A copy older versions wrote into a tool dir: exactly one SKILL.md equal to `body`. */
async function isOldCopy(dir: string, body: string): Promise<boolean> {
  try {
    const names = await readdir(dir)
    return names.length === 1 && names[0] === 'SKILL.md' && (await readFile(join(dir, 'SKILL.md'), 'utf-8')) === body
  } catch {
    return false
  }
}

/** Rewrites a legacy store dir (manifest.json + skill.md) as SKILL.md + marker, in place. */
async function convertStoreDir(dir: string, entry: InstalledItem): Promise<SkillMarker> {
  const body = await readFile(join(dir, 'skill.md'), 'utf-8')
  const fm = parseFrontmatter(body)
  if (!fm?.name || !fm.description) throw new Error('skill.md frontmatter needs name and description; reinstall it instead: as install ' + entry.slug + ' --force')
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as Item
  const stage = `${dir}.as-migrate`
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage)
  try {
    await writeFile(join(stage, 'SKILL.md'), body)
    const marker: SkillMarker = {
      slug: entry.slug,
      version: typeof manifest.version === 'string' ? manifest.version : entry.version,
      source: null,
      contentHash: await contentHash(stage),
      runtimeNames: { claude: entry.slug, codex: fm.name },
      manifest,
    }
    await writeFile(join(stage, MARKER), JSON.stringify(marker, null, 2))
    const old = `${dir}.as-old`
    await rename(dir, old)
    try {
      await rename(stage, dir)
    } catch (e) {
      await rename(old, dir)
      throw e
    }
    await rm(old, { recursive: true, force: true })
    return marker
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

export async function runMigrate(p: MigratePaths, now: Date = new Date()): Promise<MigrateResult> {
  const backupDir = join(p.aasHome, 'agent-store', 'backups', `migrate-${now.toISOString().replace(/[:.]/g, '-')}`)
  const steps: MigrateStep[] = []
  const backup = async (from: string, rel: string): Promise<void> => {
    const to = join(backupDir, rel)
    await mkdir(join(to, '..'), { recursive: true, mode: 0o700 })
    await cp(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false })
  }

  let registry = await readRegistry(p.aasHome)
  for (const entry of registry.installed.filter(e => e.category === 'skill')) {
    const slug = entry.slug
    const dir = itemDir(p.aasHome, 'skill', slug)
    const step = (result: MigrateStep['result'], message: string) => steps.push({ slug, result, message })
    try {
      let body: string | undefined
      if (await isLegacyInstall(dir, slug)) {
        body = await readFile(join(dir, 'skill.md'), 'utf-8')
        await backup(dir, join('store', slug))
        await convertStoreDir(dir, entry)
        step('done', `${dir}: converted to SKILL.md + ${MARKER}`)
      } else {
        const marker = await readMarker(dir)
        if (marker?.slug !== slug) {
          step('skipped', `${dir} is neither the old nor the current layout; left alone`)
          continue
        }
        body = await readFile(join(dir, 'SKILL.md'), 'utf-8')
      }

      // Old per-tool copies. Codex now reads the store; Claude gets the symlink back below.
      for (const [tool, root] of [['claude', p.claudeConfigDir], ['codex', p.codexConfigDir]] as const) {
        const copy = join(root, 'skills', slug)
        if (!(await isRealDir(copy))) continue
        if (!(await isOldCopy(copy, body))) {
          step('skipped', `${copy} differs from the installed skill, so it is treated as the user's and left alone`)
          continue
        }
        await backup(copy, join(tool, slug))
        await rm(copy, { recursive: true })
        step('done', `${copy}: old copy moved to the backup`)
      }

      if (entry.enabledFor.claude === true) {
        await linkClaudeSkill(p.claudeConfigDir, slug, dir)
      }
      if (entry.enabledFor.codex !== true) {
        // Codex reads the store directly, so the registry has to say so (§5.4).
        registry = upsertEntry(registry, { ...entry, enabledFor: { ...entry.enabledFor, codex: true } })
        await writeRegistry(p.aasHome, registry)
        step('done', 'registry: enabledFor.codex set to true; Codex reads ~/.agents/skills directly')
      }
    } catch (e) {
      step('error', (e as Error).message)
    }
  }

  // Package-engine components still under <publisher>.<name>#<id> (§2.1).
  const backedUp = new Set<string>()
  const engine = new AgentPackageEngine({
    aasHome: p.aasHome, claudeConfigDir: p.claudeConfigDir, codexConfigDir: p.codexConfigDir,
    ...(p.claudeJsonPath ? { claudeJsonPath: p.claudeJsonPath } : {}),
  })
  const renamed = await engine.migrateLegacyNames(async (path, rel) => {
    if (backedUp.has(rel) || !(await exists(path))) return
    backedUp.add(rel)
    await backup(path, rel)
  })
  for (const s of renamed) steps.push({ slug: s.packageId, result: s.result, message: s.message })
  return { backupDir, steps }
}
