import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DisableOptions, InstalledItem, InstallOptions, Item, SkillItem, ToolTarget } from '@as/types'
import { itemDir } from '../paths'
import { installSkillContent, readMarker, removeSkillContent } from '../skills/store'
import { hasClaudeSkillLink, linkClaudeSkill, unlinkClaudeSkill } from '../skills/claude-link'
import type { AdapterContext, Installed, KindAdapter } from './types'

export class CodexSkillDisableUnsupported extends Error {
  constructor(slug: string) {
    super(`Codex reads every skill in ~/.agents/skills; there is no per-skill disable for Codex yet. Uninstall to remove ${slug} from Codex: as uninstall ${slug}`)
    this.name = 'CodexSkillDisableUnsupported'
  }
}

/**
 * Skills live once in ~/.agents/skills/<slug> (docs/global-skills-mcp.md §5.3). Codex
 * reads that directory itself, so a skill is on for Codex as soon as it is installed;
 * Claude Code sees it through a symlink, which is all that enable/disable touch.
 */
export class SkillAdapter implements KindAdapter {
  readonly enabledByInstall = true

  constructor(private readonly ctx: AdapterContext) {}

  private dir(slug: string): string {
    return itemDir(this.ctx.paths.aasHome, 'skill', slug)
  }

  private get storeContext() {
    return { aasHome: this.ctx.paths.aasHome, codexConfigDir: this.ctx.paths.codexConfigDir }
  }

  // §5.4: content → registry {codex: true, claude: false} → Claude symlink → claude: true,
  // so a failed symlink leaves the registry truthful.
  async install(slug: string, item: Item, options: InstallOptions): Promise<Installed> {
    // The store directory is named after the catalog's slug and the registry entry after the requested one.
    if (item.slug !== slug) throw new Error(`The store returned ${JSON.stringify(item.slug)} for ${slug}; nothing was installed`)
    if (options.target === 'claude') {
      throw new Error(
        `skills can't be installed for Claude only: they live in ~/.agents/skills, which Codex reads too. ` +
        `Run a plain "as install ${slug}", or "as install ${slug} --target codex" and later "as enable ${slug} --for claude"`
      )
    }
    if (!item.compatibleWith.includes('codex')) {
      throw new Error(`${slug} is not declared Codex-compatible, and ~/.agents/skills is shared with Codex; it can't be installed`)
    }
    await installSkillContent(this.storeContext, item as SkillItem, { force: options.force })

    const content = this.dir(slug)
    const claudeLinked = await hasClaudeSkillLink(this.ctx.paths.claudeConfigDir, slug, content)
    const linkClaude = options.target !== 'codex' && item.compatibleWith.includes('claude') && !claudeLinked
    return {
      enabledFor: { codex: true, claude: claudeLinked },
      afterRegistered: linkClaude
        ? async () => {
            try {
              await linkClaudeSkill(this.ctx.paths.claudeConfigDir, slug, content)
            } catch (e) {
              throw new Error(`installed for Codex, but the Claude symlink step failed: ${e instanceof Error ? e.message : String(e)}`)
            }
            await this.ctx.setEnabled(slug, 'claude', true)
          }
        : undefined,
    }
  }

  // The whole directory is replaced; local edits make this fail (needs install --force).
  // Claude's symlink points at the directory, so no tool needs a resync.
  async update(_entry: InstalledItem, item: Item): Promise<void> {
    await installSkillContent(this.storeContext, item as SkillItem)
  }

  // Our Claude symlink, then the content (only with our marker); the engine removes the entry.
  async uninstall(entry: InstalledItem, options: DisableOptions): Promise<void> {
    await unlinkClaudeSkill(this.ctx.paths.claudeConfigDir, entry.slug, this.dir(entry.slug))
    if (entry.enabledFor['claude']) await this.ctx.setEnabled(entry.slug, 'claude', false)
    await removeSkillContent(this.ctx.paths.aasHome, entry.slug, options.force)
  }

  async blocker() {
    return undefined
  }

  enable(entry: InstalledItem, target: ToolTarget): Promise<void> {
    return this.resync(entry, target)
  }

  async resync(entry: InstalledItem, target: ToolTarget, options: { dryRun?: boolean } = {}): Promise<void> {
    if (options.dryRun) return
    const content = this.dir(entry.slug)
    if (!(await readMarker(content))) {
      throw new Error(`${content} is missing or was not installed by Agent Store; reinstall with: as install ${entry.slug}`)
    }
    // Codex reads ~/.agents/skills natively: enabling is a no-op once the content is there.
    if (target === 'claude') await linkClaudeSkill(this.ctx.paths.claudeConfigDir, entry.slug, content)
  }

  async disable(entry: InstalledItem, target: ToolTarget): Promise<void> {
    if (target === 'codex') throw new CodexSkillDisableUnsupported(entry.slug)
    await unlinkClaudeSkill(this.ctx.paths.claudeConfigDir, entry.slug, this.dir(entry.slug))
  }

  async readManifest(entry: InstalledItem): Promise<Item> {
    const dir = this.dir(entry.slug)
    const marker = await readMarker(dir)
    if (marker) return marker.manifest
    return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as Item
  }
}
