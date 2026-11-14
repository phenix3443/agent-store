import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DisableOptions, EnableOptions, InstalledItem, MCPItem, ToolTarget } from '@as/types'
import { postInstall } from '../installer/mcp'
import { buildMcpServerSpec, McpConfigMissingError } from '../config/mcp'
import { readMcpTargets } from '../config/mcp-targets'
import { syncMcpToClaude } from '../config/claude'
import { syncMcpToCodex } from '../config/codex'
import { CodexMcpUnsupportedError, findCodexCli, toCodexEntry } from '../config/codex-mcp'
import { findClaudeCli } from '../config/claude-mcp'
import { cliFallbackNote } from '../config/cli-runner'
import { ItemDirAdapter, TARGETS } from './item-dir'
import type { AdapterContext } from './types'

/** MCP servers: one entry per tool, written under the ownership rules in config/mcp-ownership.ts. */
export class McpAdapter extends ItemDirAdapter {
  constructor(ctx: AdapterContext) {
    super(ctx, 'mcp')
  }

  protected postInstall(dir: string): Promise<void> {
    return postInstall(dir)
  }

  // An enable that stopped between the tool write and the registry update leaves only the record.
  protected async enabledTargets(entry: InstalledItem): Promise<ToolTarget[]> {
    const recorded = Object.keys(await readMcpTargets(this.dir(entry.slug)))
    return TARGETS.filter(t => entry.enabledFor[t] || recorded.includes(t))
  }

  async blocker(entry: InstalledItem, target: ToolTarget) {
    const dir = this.dir(entry.slug)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
    // Codex has no SSE: no config value can change that, so it is not reported as needing config.
    if (target === 'codex' && manifest.transport === 'sse') {
      return { reason: 'unsupported' as const, message: new CodexMcpUnsupportedError(entry.slug, 'Codex does not support SSE MCP servers', 'sse').message }
    }
    let config: Record<string, unknown> = {}
    try { config = JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) } catch { /* not configured */ }
    try {
      const spec = buildMcpServerSpec(manifest, dir, config)
      if (target === 'codex') toCodexEntry(entry.slug, spec)
    } catch (e) {
      if (e instanceof McpConfigMissingError) return { reason: 'needs-config' as const, message: e.message }
      if (e instanceof CodexMcpUnsupportedError) return { reason: 'unsupported' as const, message: e.message }
      throw e
    }
    return undefined
  }

  enable(entry: InstalledItem, target: ToolTarget, options: EnableOptions): Promise<void> {
    return this.sync(entry.slug, target, 'add', options)
  }

  resync(entry: InstalledItem, target: ToolTarget, options: { dryRun?: boolean } = {}): Promise<void> {
    return this.sync(entry.slug, target, 'add', options)
  }

  disable(entry: InstalledItem, target: ToolTarget, options: DisableOptions): Promise<void> {
    return this.sync(entry.slug, target, 'remove', options)
  }

  private async sync(
    slug: string, target: ToolTarget, action: 'add' | 'remove',
    options: EnableOptions & DisableOptions & { dryRun?: boolean },
  ): Promise<void> {
    const { aasHome, claudeConfigDir, claudeJsonPath, codexConfigDir } = this.ctx.paths
    if (target === 'claude') await syncMcpToClaude(slug, aasHome, claudeConfigDir, claudeJsonPath, action, options)
    else await syncMcpToCodex(slug, aasHome, codexConfigDir, action, options)
  }
}

/** Set when an MCP enable for `target` edited the tool's config file because its CLI is a shim that can't be run safely. */
export function mcpCliFallbackNote(target: ToolTarget, paths: { claudeJsonPath: string; codexConfigDir: string }): string | undefined {
  return target === 'claude'
    ? cliFallbackNote('Claude Code', paths.claudeJsonPath, findClaudeCli())
    : cliFallbackNote('Codex', join(paths.codexConfigDir, 'config.toml'), findCodexCli())
}
