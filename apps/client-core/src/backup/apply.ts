// Makes this machine's copy of one item match a backup tree, through the engine so
// every tool write follows the same ownership rules as a manual install.
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  BackupChangeAction, CatalogResourceDetail, CatalogSearchResult, Engine, InstalledItem, Item, Paths,
} from '@as/types'
import type { Catalog, CatalogItem } from '../catalog'
import { itemDir } from '../paths'
import { findEntry, patchEntry, readRegistry, updateRegistry, upsertEntry } from '../registry/index'
import { writeManifest } from '../installer/hook-runner'
import { isLegacyInstall, MARKER, readMarker, skillStoreDir, type SkillMarker } from '../skills/store'
import { copyEntries, filesDir, itemPath, listTree, parseKey, readItemFile, readStateFile, stableJson, TARGETS, type ItemFile } from './layout'
import { splitSecrets } from './secrets'
import type { BlockedTarget } from './state'

/** Install and update read the manifest from the backup, not from the store. */
class BackupItemCatalog implements Catalog {
  constructor(private readonly item: Item) {}
  async resolveItem(): Promise<CatalogItem> {
    // No resourceId: install would otherwise reuse whichever local slug already has it.
    return { item: this.item, resourceId: null, longSlug: null }
  }
  async search(): Promise<CatalogSearchResult> { throw new Error('not available while restoring from a backup') }
  async get(): Promise<CatalogResourceDetail> { throw new Error('not available while restoring from a backup') }
}

export interface ApplyContext {
  paths: Required<Paths>
  engine: Engine
  engineFor: (catalog: Catalog) => Engine
}

export interface ApplyOutcome {
  actions: BackupChangeAction[]
  blocked: BlockedTarget[]
  /** Too large on the device that has it; nothing to install here. */
  notRestorable?: boolean
}

export class BackupApplyError extends Error {
  readonly reason = 'apply-failed'
  constructor(message: string) {
    super(message)
    this.name = 'BackupApplyError'
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}

async function readConfig(dir: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown> } catch { return {} }
}

/** Stages `src` and swaps it in as the library directory of `slug`; a directory that is not ours is refused. */
export async function writeSkillLibrary(aasHome: string, slug: string, src: string, rewrite?: (m: SkillMarker) => SkillMarker): Promise<void> {
  const store = skillStoreDir(aasHome)
  const dest = join(store, slug)
  if (await exists(dest) && !(await readMarker(dest)) && !(await isLegacyInstall(dest, slug))) {
    throw new BackupApplyError(`${dest} exists and was not installed by Agent Store; move it away first`)
  }
  await mkdir(store, { recursive: true })
  const stage = await mkdtemp(join(store, `.as-stage-${slug}-`))
  try {
    await copyEntries(src, stage, await listTree(src, () => false))
    const marker = await readMarker(stage)
    if (!marker) throw new BackupApplyError(`the backup of skill ${slug} has no ${MARKER}`)
    if (rewrite) await writeFile(join(stage, MARKER), JSON.stringify(rewrite(marker), null, 2))
    if (await exists(dest)) {
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
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

async function registerSkill(aasHome: string, slug: string, item: ItemFile, keep: InstalledItem | undefined): Promise<void> {
  const now = new Date().toISOString()
  await updateRegistry(aasHome, r => upsertEntry(r, {
    slug,
    category: 'skill',
    version: item.version,
    installedAt: keep?.installedAt ?? now,
    updatedAt: now,
    compatibleWith: item.compatibleWith,
    enabledFor: keep?.enabledFor ?? {},
    ...(item.resourceId ? { resourceId: item.resourceId } : {}),
    ...(keep?.deployments ? { deployments: keep.deployments } : {}),
  }))
}

/** Installs or updates a provider or MCP server from the backup's manifest; this machine's secret values stay. */
async function applyItemDir(ctx: ApplyContext, slug: string, item: ItemFile, local: InstalledItem | undefined, asCopy: boolean): Promise<BackupChangeAction | null> {
  if (!item.manifest) throw new BackupApplyError(`the backup of ${item.category}/${item.slug} has no manifest`)
  const manifest = { ...item.manifest, slug } as Item
  const source = ctx.engineFor(new BackupItemCatalog(manifest))
  const dir = itemDir(ctx.paths.aasHome, item.category, slug)
  let action: BackupChangeAction | null = null
  if (!local) {
    await source.install(slug)
    action = 'installed'
  } else if (local.version !== item.version && !local.parentSlug) {
    await source.update(slug)
    action = 'updated'
  } else {
    let current: unknown
    try { current = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) } catch { /* rewritten below */ }
    if (stableJson(current) !== stableJson(manifest)) {
      await writeManifest(dir, manifest)
      action = 'updated'
    }
  }
  await patchEntry(ctx.paths.aasHome, slug, e => {
    const { resourceId: _r, parentSlug: _p, ...rest } = e
    return {
      ...rest,
      version: item.version,
      compatibleWith: item.compatibleWith,
      ...(item.resourceId && !asCopy ? { resourceId: item.resourceId } : {}),
      ...(item.parentSlug ? { parentSlug: item.parentSlug } : {}),
    }
  })
  const localConfig = await readConfig(dir)
  const { secret } = splitSecrets(localConfig, (manifest as { configSchema?: unknown }).configSchema, item.category as 'mcp' | 'provider')
  const merged = { ...(item.config ?? {}), ...secret }
  if (stableJson(merged) !== stableJson(localConfig) || action === 'updated') {
    await ctx.engine.setConfig(slug, merged)
    action ??= 'updated'
  }
  return action
}

/**
 * Makes item `key` match the tree in `root` (absent there means uninstall here).
 * `parts` says what differs; a new item is always written whole.
 */
export async function applyItem(ctx: ApplyContext, root: string, key: string, parts: { content: boolean; state: boolean }): Promise<ApplyOutcome> {
  const { category, slug } = parseKey(key)
  const outcome: ApplyOutcome = { actions: [], blocked: [] }
  let local = findEntry(await readRegistry(ctx.paths.aasHome), slug)
  if (local && local.category !== category) {
    throw new BackupApplyError(`${slug} is installed here as a ${local.category}, the backup has a ${category}; uninstall one of them`)
  }
  if (!(await exists(join(root, itemPath(key), 'content', 'item.json')))) {
    if (local) {
      await ctx.engine.uninstall(slug, { force: category === 'skill' })
      outcome.actions.push('removed')
    }
    return outcome
  }
  const item = await readItemFile(root, key)
  const state = await readStateFile(root, key)
  if (item.localOnly && !local) return { ...outcome, notRestorable: true }

  let contentWritten = false
  if ((!local || parts.content) && !item.localOnly) {
    if (category === 'skill') {
      await writeSkillLibrary(ctx.paths.aasHome, slug, filesDir(root, key))
      await registerSkill(ctx.paths.aasHome, slug, item, local)
      outcome.actions.push(local ? 'updated' : 'installed')
    } else {
      const action = await applyItemDir(ctx, slug, item, local, false)
      if (action) outcome.actions.push(action)
    }
    contentWritten = true
  }

  local = findEntry(await readRegistry(ctx.paths.aasHome), slug)
  if (!local) throw new BackupApplyError(`${key} was not registered after it was written`)
  for (const target of TARGETS) {
    if (!local.compatibleWith.includes(target)) continue
    const want = state.enabledFor[target] === true
    const have = local.enabledFor[target] === true
    if (want && !have) {
      const blocker = (await ctx.engine.getTargetStatus(slug)).find(s => s.target === target)?.blocker
      if (blocker) {
        const reason = blocker.reason === 'no-key' || blocker.reason === 'needs-config' ? blocker.reason : 'error'
        outcome.blocked.push({ key, category, slug, target, reason, message: blocker.message })
        continue
      }
      try {
        await ctx.engine.enable(slug, target)
        outcome.actions.push('enabled')
      } catch (e) {
        outcome.blocked.push({ key, category, slug, target, reason: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    } else if (!want && have) {
      await ctx.engine.disable(slug, target)
      outcome.actions.push('disabled')
    } else if (want && have && contentWritten && category === 'skill') {
      // A copy deployment does not follow the library; deploying again refreshes it.
      await ctx.engine.enable(slug, target)
    }
  }
  return outcome
}

/** Installs the version of `key` in `root` under `newSlug`, not enabled anywhere. */
export async function installCopy(ctx: ApplyContext, root: string, key: string, newSlug: string): Promise<void> {
  const item = await readItemFile(root, key)
  if (item.localOnly) throw new BackupApplyError(`${key} is kept on its own device only (${item.localOnly}); there is no remote copy to keep`)
  if (item.category === 'skill') {
    await writeSkillLibrary(ctx.paths.aasHome, newSlug, filesDir(root, key), m => ({
      ...m, slug: newSlug, runtimeNames: { ...m.runtimeNames, claude: newSlug }, manifest: { ...m.manifest, slug: newSlug },
    }))
    await registerSkill(ctx.paths.aasHome, newSlug, { ...item, slug: newSlug, resourceId: undefined }, undefined)
  } else {
    await applyItemDir(ctx, newSlug, { ...item, slug: newSlug }, undefined, true)
  }
}
