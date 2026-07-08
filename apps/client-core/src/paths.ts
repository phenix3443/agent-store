import { homedir } from 'os'
import { join } from 'path'
import type { Paths } from '@as/types'

export function resolvePaths(overrides?: Partial<Paths>): Required<Paths> {
  const home = homedir()
  // Claude Code keeps user-scope MCP servers in `.claude.json`, which sits at
  // $CLAUDE_CONFIG_DIR/.claude.json when that dir is set, otherwise $HOME/.claude.json.
  const claudeDirSet = overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR']
  return {
    aasHome: overrides?.aasHome ?? process.env['AS_HOME'] ?? join(home, '.agents'),
    claudeConfigDir: overrides?.claudeConfigDir ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(home, '.claude'),
    claudeJsonPath: overrides?.claudeJsonPath ?? join(claudeDirSet ?? home, '.claude.json'),
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
