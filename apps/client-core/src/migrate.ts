// `aas migrate`: converts skills installed by older Agent Store versions to the
// current layout (docs/global-skills-mcp.md §7, PR7) and gives them per-tool
// deployments (#111). Anything it moves or rewrites is copied into
// ~/.agent-store/backups/migrate-<stamp>/ first. Directories it cannot prove it
// wrote are reported and left alone. Moving from ~/.agents is home-migrate.ts.
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { InstalledItem, Item } from '@as/types'
import { readRegistry, setEnabledFlag } from './registry'
import { itemDir, resolvePaths } from './paths'
import { contentHash, isLegacyInstall, isLoneSkillMd, MARKER, parseFrontmatter, readMarker, type SkillMarker } from './skills/store'
import { standaloneSkillAdapter } from './adapters/skill'
import { SkillDeployRefusedError } from './skills/deploy'
import { SkillConflictError } from './skills/store'
import { retirePackageInstalls } from './migrate-packages'

export interface MigratePaths {
  aasHome: string
  claudeConfigDir: string
  codexConfigDir: string
  /** Defaults the way resolvePaths does for the given claudeConfigDir. */
  claudeJsonPath?: string
}

export interface MigrateStep {
  /** Skill slug, or package id for steps about the retired agent-package prototype. */
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

/** Rewrites a legacy store dir (manifest.json + skill.md) as SKILL.md + marker, in place. */
export async function convertStoreDir(dir: string, entry: InstalledItem): Promise<SkillMarker> {
  const body = await readFile(join(dir, 'skill.md'), 'utf-8')
  const fm = parseFrontmatter(body)
  if (!fm?.name || !fm.description) throw new Error('skill.md frontmatter needs name and description; reinstall it instead: as install ' + entry.slug + ' --force')
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as Item
  // Scratch paths are allocated per call, so nothing that was already next to
  // `dir` (a user's own `probe.as-migrate`, say) is ever touched.
  const scratch = await mkdtemp(join(dirname(dir), `.${basename(dir)}.as-migrate-`))
  let keepScratch = false
  try {
    const stage = join(scratch, 'new')
    await mkdir(stage)
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
    const old = join(scratch, 'old')
    await rename(dir, old)
    try {
      await rename(stage, dir)
    } catch (e) {
      try {
        await rename(old, dir)
      } catch {
        keepScratch = true
        throw new Error(`${dir} could not be put back; the original is at ${old}: ${(e as Error).message}`)
      }
      throw e
    }
    return marker
  } finally {
    if (!keepScratch) await rm(scratch, { recursive: true, force: true })
  }
}

export async function runMigrate(p: MigratePaths, now: Date = new Date()): Promise<MigrateResult> {
  const backupDir = join(p.aasHome, 'backups', `migrate-${now.toISOString().replace(/[:.]/g, '-')}`)
  const steps: MigrateStep[] = []
  const backup = async (from: string, rel: string): Promise<void> => {
    const to = join(backupDir, rel)
    await mkdir(join(to, '..'), { recursive: true, mode: 0o700 })
    await cp(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false })
  }

  const registry = await readRegistry(p.aasHome)
  const skills = standaloneSkillAdapter(resolvePaths({ ...p, claudeJsonPath: p.claudeJsonPath ?? join(p.claudeConfigDir, '.claude.json') }))
  for (const entry of registry.installed.filter(e => e.category === 'skill')) {
    const slug = entry.slug
    const dir = itemDir(p.aasHome, 'skill', slug)
    const step = (result: MigrateStep['result'], message: string) => steps.push({ slug, result, message })
    try {
      let body: string | undefined
      const legacy = await isLegacyInstall(dir, slug)
      if (legacy) {
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

      // Old per-tool copies; each tool gets a deployment of the library copy below.
      for (const [tool, root] of [['claude', p.claudeConfigDir], ['codex', p.codexConfigDir]] as const) {
        const copy = join(root, 'skills', slug)
        if (!(await isRealDir(copy))) continue
        if (!(await isLoneSkillMd(copy, body))) {
          step('skipped', `${copy} differs from the installed skill, so it is treated as the user's and left alone`)
          continue
        }
        await backup(copy, join(tool, slug))
        await rm(copy, { recursive: true })
        step('done', `${copy}: old copy moved to the backup`)
      }

      for (const target of ['claude', 'codex'] as const) {
        if (entry.deployments?.[target]) continue
        // Before markers Codex read every installed skill, whatever the registry said.
        if (entry.enabledFor[target] !== true && !(legacy && target === 'codex')) continue
        try {
          await skills.migrateDeployment(slug, target, dir)
          step('done', `${target}: deployed from ${dir}`)
        } catch (e) {
          if (!(e instanceof SkillDeployRefusedError || e instanceof SkillConflictError)) throw e
          await setEnabledFlag(p.aasHome, slug, target, false)
          step('skipped', `${target}: ${e.message}`)
        }
      }
    } catch (e) {
      step('error', (e as Error).message)
    }
  }

  // Leftovers of the agent-package prototype (migrate-packages.ts).
  const backedUp = new Set<string>()
  const packageSteps = await retirePackageInstalls(
    { ...p, claudeJsonPath: p.claudeJsonPath ?? join(p.claudeConfigDir, '.claude.json') },
    async (path, rel) => {
      if (backedUp.has(rel) || !(await exists(path))) return
      backedUp.add(rel)
      await backup(path, rel)
    },
  )
  steps.push(...packageSteps)
  return { backupDir, steps }
}
