import { homedir } from 'os'
import { join } from 'path'
import type { AASPaths } from '@as/types'

export function resolvePaths(overrides?: Partial<AASPaths>): Required<AASPaths> {
  const home = homedir()
  return {
    aasHome: overrides?.aasHome ?? process.env['AS_HOME'] ?? join(home, '.agents'),
    claudeConfigDir: overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude'),
    codexConfigDir: overrides?.codexConfigDir ?? process.env['CODEX_CONFIG_DIR'] ?? join(home, '.codex'),
  }
}

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

export function itemDir(
  aasHome: string,
  category: 'provider' | 'skill' | 'mcp',
  slug: string
): string {
  return join(aasHome, CATEGORY_DIR[category], slug)
}
