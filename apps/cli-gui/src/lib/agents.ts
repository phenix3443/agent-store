import type { ToolTarget } from '@as/types'

export interface AgentMeta {
  id: ToolTarget
  name: string
  mark: string
  /** Where the engine links or copies a skill, by default (CLAUDE_CONFIG_DIR / CODEX_HOME move it). */
  skillsDir: string
  mcpFile: string
  mcpKey: string
}

export const AGENTS: AgentMeta[] = [
  { id: 'claude', name: 'Claude Code', mark: 'C', skillsDir: '~/.claude/skills', mcpFile: '~/.claude.json', mcpKey: 'mcpServers' },
  { id: 'codex', name: 'Codex', mark: 'X', skillsDir: '~/.codex/skills', mcpFile: '~/.codex/config.toml', mcpKey: 'mcp_servers' },
]

export const TARGET_LABEL: Record<ToolTarget, string> = { claude: 'Claude Code', codex: 'Codex' }

export function joinNames(names: string[], locale: string): string {
  return names.join(locale === 'en' ? ', ' : '、')
}
