// Shared by kinds whose files come from the catalog's install hook into
// ~/.agents/<kind>/<slug> (manifest.json, config.json, fetched files).
import { cp, readFile, rename, rm } from 'fs/promises'
import { join } from 'path'
import type { DisableOptions, EnableBlocker, EnableOptions, InstalledItem, Item, ToolTarget } from '@as/types'
import { itemDir, type Category } from '../paths'
import { runHook, writeManifest } from '../installer/hook-runner'
import type { AdapterContext, Installed, KindAdapter } from './types'

export const TARGETS: ToolTarget[] = ['claude', 'codex']

export abstract class ItemDirAdapter implements KindAdapter {
  readonly enabledByInstall = false

  constructor(protected readonly ctx: AdapterContext, private readonly category: Category) {}

  protected dir(slug: string): string {
    return itemDir(this.ctx.paths.aasHome, this.category, slug)
  }

  /** Runs after the hook, before manifest.json is written. */
  protected abstract postInstall(dir: string): Promise<void>
  /** Tools to take the item off at uninstall: what was actually enabled, not what the catalog says. */
  protected async enabledTargets(entry: InstalledItem): Promise<ToolTarget[]> {
    return TARGETS.filter(t => entry.enabledFor[t])
  }

  abstract enable(entry: InstalledItem, target: ToolTarget, options: EnableOptions): Promise<void>
  abstract resync(entry: InstalledItem, target: ToolTarget, options?: { dryRun?: boolean }): Promise<void>
  abstract disable(entry: InstalledItem, target: ToolTarget, options: DisableOptions): Promise<void>
  abstract blocker(entry: InstalledItem, target: ToolTarget): Promise<{ reason: EnableBlocker; message: string } | undefined>

  async install(slug: string, item: Item): Promise<Installed> {
    const dir = this.dir(slug)
    await runHook(item.installHook.steps, dir)
    await this.postInstall(dir)
    await writeManifest(dir, item)
    return {}
  }

  async update(entry: InstalledItem, item: Item): Promise<void> {
    const dir = this.dir(entry.slug)
    const backup = `${dir}.update-backup`
    await rm(backup, { recursive: true, force: true })
    await cp(dir, backup, { recursive: true })
    const targets = TARGETS.filter(t => entry.enabledFor[t])
    const synced: ToolTarget[] = []
    try {
      await runHook(item.installHook.steps, dir)
      await this.postInstall(dir)
      await writeManifest(dir, item)
      // Every tool is checked before any is written, so one refusing leaves all of them as they were.
      for (const target of targets) await this.resync(entry, target, { dryRun: true })
      for (const target of targets) {
        await this.resync(entry, target)
        synced.push(target)
      }
    } catch (e) {
      await rm(dir, { recursive: true, force: true })
      await rename(backup, dir)
      const stuck: string[] = []
      for (const target of synced) {
        try {
          await this.resync(entry, target)
        } catch (restoreError) {
          stuck.push(`${target} (${(restoreError as Error).message})`)
        }
      }
      if (stuck.length) throw new Error(`${(e as Error).message}; these tools still have the new version: ${stuck.join('; ')}. Run \`as sync\` to retry`)
      throw e
    }
    await rm(backup, { recursive: true, force: true })
  }

  async uninstall(entry: InstalledItem, options: DisableOptions): Promise<void> {
    for (const target of await this.enabledTargets(entry)) {
      await this.disable(entry, target, options)
      await this.ctx.setEnabled(entry.slug, target, false)
    }
    await rm(this.dir(entry.slug), { recursive: true, force: true })
  }

  async readManifest(entry: InstalledItem): Promise<Item> {
    return JSON.parse(await readFile(join(this.dir(entry.slug), 'manifest.json'), 'utf-8')) as Item
  }
}
