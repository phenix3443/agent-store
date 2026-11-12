import type { InstalledItem, ToolTarget } from '@as/types'
import { postInstall } from '../installer/provider'
import { readProviderConnection } from '../config/provider'
import { enableRelayForClaude, disableRelayForClaude } from '../config/claude'
import { enableRelayForCodex, disableRelayForCodex } from '../config/codex'
import { getRelayDaemonStatus } from '../relay/daemon-status'
import { readRegistry } from '../registry/index'
import { ItemDirAdapter } from './item-dir'
import type { AdapterContext } from './types'

export class ProviderNotReadyError extends Error {
  constructor(message: string, readonly reason: 'no-key' | 'relay-not-running') {
    super(message)
    this.name = 'ProviderNotReadyError'
  }
}

/**
 * Providers never put their key into a tool: enabling points the tool at the local
 * relay, which picks the provider. So every enabled provider shares one takeover per
 * tool, and it is only undone when the last of them goes.
 */
export class ProviderAdapter extends ItemDirAdapter {
  constructor(ctx: AdapterContext) {
    super(ctx, 'provider')
  }

  protected postInstall(dir: string): Promise<void> {
    return postInstall(dir)
  }

  async blocker(entry: InstalledItem) {
    if (await this.hasKey(entry.slug)) return undefined
    return { reason: 'no-key' as const, message: `${entry.slug} has no API key configured; run: aas config ${entry.slug}` }
  }

  // A key and a running relay must both exist before anything is written.
  async enable(entry: InstalledItem, target: ToolTarget): Promise<void> {
    const slug = entry.slug
    if (!(await this.hasKey(slug))) {
      throw new ProviderNotReadyError(`${slug} has no API key configured; run: aas config ${slug}`, 'no-key')
    }
    await this.ensureRelay()
    await this.takeOver(target)
  }

  async resync(_entry: InstalledItem, target: ToolTarget, options: { dryRun?: boolean } = {}): Promise<void> {
    if (!options.dryRun) await this.takeOver(target)
  }

  async disable(entry: InstalledItem, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.ctx.paths.aasHome)
    const otherEnabled = registry.installed.some(item =>
      item.slug !== entry.slug &&
      item.category === 'provider' &&
      item.compatibleWith.includes(target) &&
      item.enabledFor[target] === true)
    if (otherEnabled) return
    const { aasHome, claudeConfigDir, codexConfigDir } = this.ctx.paths
    if (target === 'claude') await disableRelayForClaude(aasHome, claudeConfigDir)
    else await disableRelayForCodex(aasHome, codexConfigDir)
  }

  private async takeOver(target: ToolTarget): Promise<void> {
    const { aasHome, claudeConfigDir, codexConfigDir } = this.ctx.paths
    if (target === 'claude') await enableRelayForClaude(aasHome, claudeConfigDir)
    else await enableRelayForCodex(aasHome, codexConfigDir)
  }

  private async hasKey(slug: string): Promise<boolean> {
    const connection = await readProviderConnection(this.dir(slug))
    return Boolean(connection.apiKey || connection.apiKeys?.length)
  }

  private async ensureRelay(): Promise<void> {
    const { aasHome } = this.ctx.paths
    if ((await getRelayDaemonStatus(aasHome)).running) return
    let startError = ''
    if (this.ctx.startRelay) {
      try {
        await this.ctx.startRelay()
      } catch (e) {
        startError = ` (${e instanceof Error ? e.message : String(e)})`
      }
      if ((await getRelayDaemonStatus(aasHome)).running) return
    }
    throw new ProviderNotReadyError(
      `the local relay is not running${this.ctx.startRelay ? ' and could not be started' + startError : ''}; start it with: aas relay start`,
      'relay-not-running'
    )
  }
}
