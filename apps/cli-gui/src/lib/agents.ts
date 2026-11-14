import type { ToolTarget } from '@as/types'

export interface AgentMeta {
  id: ToolTarget
  name: string
  mark: string
  /** Default locations from apps/client-core/src/paths.ts; `env` moves them. */
  skills: string
  mcp: string
  mcpKey: string
  env: string
  /** Inside a project (docs/project-scope.md). */
  projectSkills: string
  projectMcp: string
}

export const AGENTS: AgentMeta[] = [
  { id: 'claude', name: 'Claude Code', mark: 'Cc', skills: '~/.claude/skills', mcp: '~/.claude.json', mcpKey: 'mcpServers', env: 'CLAUDE_CONFIG_DIR', projectSkills: '.claude/skills', projectMcp: '.mcp.json' },
  { id: 'codex', name: 'Codex', mark: 'Cx', skills: '~/.codex/skills', mcp: '~/.codex/config.toml', mcpKey: 'mcp_servers', env: 'CODEX_HOME', projectSkills: '.agents/skills', projectMcp: '.codex/config.toml' },
]

export const TARGET_LABEL: Record<ToolTarget, string> = { claude: 'Claude Code', codex: 'Codex' }

export function joinNames(names: string[], locale: string): string {
  return names.join(locale === 'en' ? ', ' : '、')
}
