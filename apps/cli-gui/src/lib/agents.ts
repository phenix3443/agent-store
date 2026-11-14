import type { AgentApp } from '../state/AppState'

/** Default locations from apps/client-core/src/paths.ts; each env var moves them. */
export const AGENTS: { id: AgentApp; name: string; mark: string; skills: string; mcp: string; env: string }[] = [
  { id: 'claude', name: 'Claude Code', mark: 'Cc', skills: '~/.claude/skills', mcp: '~/.claude.json', env: 'CLAUDE_CONFIG_DIR' },
  { id: 'codex', name: 'Codex', mark: 'Cx', skills: '~/.codex/skills', mcp: '~/.codex/config.toml', env: 'CODEX_HOME' },
]
