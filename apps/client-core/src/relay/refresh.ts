import { refreshRelayForClaude } from '../config/claude'
import { refreshRelayForCodex } from '../config/codex'

export interface RelayTakeoverPaths {
  aasHome: string
  claudeConfigDir: string
  codexConfigDir: string
}

/**
 * Brings Claude Code / Codex configs that point at the relay up to the current
 * token, so a takeover made by an older version keeps working after an upgrade.
 * Idempotent; reports which tools were rewritten.
 */
export async function refreshRelayTakeover(paths: RelayTakeoverPaths): Promise<{ claude: boolean; codex: boolean }> {
  const claude = await refreshRelayForClaude(paths.aasHome, paths.claudeConfigDir)
  const codex = await refreshRelayForCodex(paths.aasHome, paths.codexConfigDir)
  return { claude, codex }
}
