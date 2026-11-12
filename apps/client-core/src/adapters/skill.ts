import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DisableOptions, EnableOptions, InstalledItem, InstallOptions, Item, Paths, SkillDeployment, SkillItem, ToolTarget } from '@as/types'
import { itemDir, legacyAasHome } from '../paths'
import { findEntry, readRegistry, setDeploymentRecord, setEnabledFlag } from '../registry/index'
import { codexVisibleNames, deployDirName, installSkillContent, readMarker, removeSkillContent, SkillConflictError, type SkillMarker } from '../skills/store'
import {
  authorize, classifyTarget, deploySkillDir, isCurrent, NO_CLOBBER, preferredMode, recorded, removeRecordedDeployment,
  SkillDeployRefusedError, USER_CONFIRMED, type ReplacePolicy,
} from '../skills/deploy'
import { TARGETS } from './item-dir'
import type { AdapterContext, Installed, KindAdapter } from './types'

/**
 * Skills live once in the library, ~/.agent-store/skills/<slug>, which no tool
 * reads. Each tool gets its own deployment, a link (or a copy where links fail)
 * in its own skills directory, recorded in the registry entry (issue #111):
 *   Claude Code: $CLAUDE_CONFIG_DIR/skills/<dir>
 *   Codex:       $CODEX_HOME/skills/<dir>, not the shared ~/.agents/skills, so
 *                enabling for Codex does not leak to other tools reading that root.
 * `<dir>` is the frontmatter name when it is a safe directory name, so both tools
 * call the skill the same.
 */
export class SkillAdapter implements KindAdapter {
  readonly enabledByInstall = true

  constructor(private readonly ctx: AdapterContext) {}

  private dir(slug: string): string {
    return itemDir(this.ctx.paths.aasHome, 'skill', slug)
  }

  private toolSkillsDir(target: ToolTarget): string {
    return join(target === 'claude' ? this.ctx.paths.claudeConfigDir : this.ctx.paths.codexConfigDir, 'skills')
  }

  private async record(slug: string, target: ToolTarget): Promise<SkillDeployment | undefined> {
    return findEntry(await readRegistry(this.ctx.paths.aasHome), slug)?.deployments?.[target]
  }

  private async marker(slug: string): Promise<SkillMarker> {
    const marker = await readMarker(this.dir(slug))
    if (!marker) {
      throw new SkillConflictError(`${this.dir(slug)} is missing or was not installed by Agent Store; reinstall with: aas install ${slug}`, 'not-ours')
    }
    return marker
  }

  /** Where `slug` goes for `target`: the recorded path, else `<tool skills dir>/<dir>`. */
  private async targetPath(slug: string, target: ToolTarget, marker: SkillMarker): Promise<string> {
    return (await this.record(slug, target))?.path
      ?? join(this.toolSkillsDir(target), deployDirName(slug, marker.runtimeNames.claude))
  }

  private policy(record: SkillDeployment | undefined, force: boolean | undefined): ReplacePolicy {
    return force ? USER_CONFIRMED : record ? recorded(record.mode) : NO_CLOBBER
  }

  /** Codex finds skills by frontmatter name in its own root and in ~/.agents/skills; another one with ours would shadow it. */
  private async checkCodexName(slug: string, marker: SkillMarker, target: string): Promise<void> {
    const roots = [this.toolSkillsDir('codex'), join(legacyAasHome(), 'skills')]
    const clash = (await codexVisibleNames(roots, new Set([target]))).get(marker.runtimeNames.codex)
    if (clash) {
      throw new SkillConflictError(`Codex already sees a skill named "${marker.runtimeNames.codex}" at ${clash}; pass --force to deploy ${slug} anyway`, 'name-clash')
    }
  }

  /** Deploys the library copy for one tool and records it; with `dryRun`, only checks it would be allowed. */
  private async deploy(slug: string, target: ToolTarget, options: { force?: boolean; dryRun?: boolean } = {}): Promise<void> {
    const marker = await this.marker(slug)
    const source = this.dir(slug)
    const record = await this.record(slug, target)
    const path = await this.targetPath(slug, target, marker)
    const mode = record?.mode === 'copy' ? 'copy' : preferredMode()
    if (await isCurrent(source, record, mode, marker.contentHash)) return
    const policy = this.policy(record, options.force)
    if (target === 'codex' && !options.force) await this.checkCodexName(slug, marker, path)
    if (options.dryRun) {
      const state = await classifyTarget(path, source)
      if (!(mode === 'symlink' && state === 'link-to-source')) authorize(path, state, policy, target, slug)
      return
    }
    const used = await deploySkillDir(source, path, mode, policy, target, slug)
    await this.ctx.setDeployment(slug, target, { path, mode: used, sourceHash: marker.contentHash })
  }

  /**
   * Records a deployment for a skill installed before deployment records existed.
   * A link at the tool path that points at `oldSource` (where the library used to
   * be) is ours and is replaced; anything else is refused as usual.
   */
  async migrateDeployment(slug: string, target: ToolTarget, oldSource: string): Promise<void> {
    if (await this.record(slug, target)) return
    const marker = await this.marker(slug)
    const path = join(this.toolSkillsDir(target), deployDirName(slug, marker.runtimeNames.claude))
    const ours = (await classifyTarget(path, oldSource)) === 'link-to-source'
    if (target === 'codex') await this.checkCodexName(slug, marker, path)
    const used = await deploySkillDir(this.dir(slug), path, preferredMode(), ours ? recorded('symlink') : NO_CLOBBER, target, slug)
    await this.ctx.setDeployment(slug, target, { path, mode: used, sourceHash: marker.contentHash })
  }

  /** Removes the tool's deployment while it still matches its record (or with `force`), then drops the record. */
  private async undeploy(slug: string, target: ToolTarget, force = false): Promise<void> {
    const record = await this.record(slug, target)
    if (!record) {
      // Older installs linked Claude without a record; that link is provably ours when it points at the library.
      const marker = await readMarker(this.dir(slug))
      if (marker) {
        const path = join(this.toolSkillsDir(target), marker.runtimeNames.claude)
        if ((await classifyTarget(path, this.dir(slug))) === 'link-to-source') {
          await removeRecordedDeployment({ path, mode: 'symlink', sourceHash: marker.contentHash })
        }
      }
      return
    }
    const { removed, state } = await removeRecordedDeployment(record, force)
    if (!removed) throw new SkillDeployRefusedError(record.path, state, 'record-mismatch', target, slug)
    await this.ctx.setDeployment(slug, target, null)
  }

  async install(slug: string, item: Item, options: InstallOptions): Promise<Installed> {
    // The library directory is named after the slug the engine picked.
    if (item.slug !== slug) throw new Error(`The catalog returned ${JSON.stringify(item.slug)} for ${slug}; nothing was installed`)
    if (options.target && !item.compatibleWith.includes(options.target)) {
      throw new Error(`${slug} does not support ${options.target}; nothing was installed`)
    }
    await installSkillContent({ aasHome: this.ctx.paths.aasHome }, item as SkillItem, { force: options.force })
    const targets = options.target ? [options.target] : TARGETS.filter(t => item.compatibleWith.includes(t))
    return {
      afterRegistered: async () => {
        // Every tool is tried; the first refusal is thrown afterwards with its class and fields intact.
        let first: unknown
        for (const target of targets) {
          try {
            await this.deploy(slug, target, { force: options.force })
          } catch (e) {
            if (e instanceof Error) e.message = `Installed ${slug}, but deploying it to ${target} failed: ${e.message}`
            first ??= e
          }
        }
        if (first) throw first
      },
    }
  }

  // The library directory is replaced; local edits make this fail (needs install --force).
  // Links follow the library, so only copy deployments need writing again.
  async update(entry: InstalledItem, item: Item): Promise<void> {
    await installSkillContent({ aasHome: this.ctx.paths.aasHome }, item as SkillItem)
    for (const target of TARGETS) {
      if ((await this.record(entry.slug, target))?.mode === 'copy') await this.deploy(entry.slug, target)
    }
  }

  async uninstall(entry: InstalledItem, options: DisableOptions): Promise<void> {
    const current = findEntry(await readRegistry(this.ctx.paths.aasHome), entry.slug) ?? entry
    for (const target of TARGETS) {
      if (current.deployments?.[target] || current.enabledFor[target]) {
        await this.undeploy(entry.slug, target, options.force)
        if (current.enabledFor[target]) await this.ctx.setEnabled(entry.slug, target, false)
      }
    }
    await removeSkillContent(this.ctx.paths.aasHome, entry.slug, options.force)
  }

  async blocker() {
    return undefined
  }

  async enable(entry: InstalledItem, target: ToolTarget, options: EnableOptions = {}): Promise<void> {
    await this.deploy(entry.slug, target, { force: options.force })
  }

  async resync(entry: InstalledItem, target: ToolTarget, options: { dryRun?: boolean } = {}): Promise<void> {
    await this.deploy(entry.slug, target, { dryRun: options.dryRun })
  }

  async disable(entry: InstalledItem, target: ToolTarget, options: DisableOptions = {}): Promise<void> {
    await this.undeploy(entry.slug, target, options.force)
  }

  async readManifest(entry: InstalledItem): Promise<Item> {
    const dir = this.dir(entry.slug)
    const marker = await readMarker(dir)
    if (marker) return marker.manifest
    return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as Item
  }
}

/** The skill adapter on its own, for migrate: records go straight to the registry. */
export function standaloneSkillAdapter(paths: Required<Paths>): SkillAdapter {
  return new SkillAdapter({
    paths,
    setEnabled: (slug, target, enabled) => setEnabledFlag(paths.aasHome, slug, target, enabled),
    setDeployment: (slug, target, record) => setDeploymentRecord(paths.aasHome, slug, target, record),
  })
}
