import type { ToolTarget } from './engine'

/** A project directory Agent Store manages; `id` stays the same when the directory is moved. */
export interface Project {
  id: string
  /** Canonical absolute path: symlinks resolved, no trailing slash. */
  path: string
  name: string
  addedAt: string
  /** False when the directory is gone; nothing is created for it. */
  exists: boolean
}

export interface AddProjectOptions {
  /** Defaults to the directory's base name. */
  name?: string
}

/** One place an agent reads a project skill from. */
export interface ProjectSkillLocation {
  agent: ToolTarget
  /** Directory holding SKILL.md. */
  path: string
  /** Agent Store installed it into this project. */
  managed: boolean
  /** Managed, but the files differ from what Agent Store copied. */
  modified: boolean
}

export interface ProjectSkill {
  kind: 'skill'
  /** The name the agent uses: the directory for Claude Code, the frontmatter `name` for Codex. */
  name: string
  description?: string
  /** Set when Agent Store installed it. */
  slug?: string
  version?: string
  managed: boolean
  /** Agents that load it in this project. */
  agents: ToolTarget[]
  locations: ProjectSkillLocation[]
}

/**
 * `project`: committed with the repository (`.mcp.json`, `.codex/config.toml`).
 * `local`: Claude Code's private entry for this directory in `~/.claude.json`; read-only here.
 */
export type ProjectMcpScope = 'project' | 'local'

/** Claude Code asks before it starts a server from `.mcp.json`; read from its settings files. */
export type ClaudeMcpApproval = 'approved' | 'rejected' | 'pending'

export interface ProjectMcpLocation {
  agent: ToolTarget
  scope: ProjectMcpScope
  /** The file the entry is in. */
  file: string
  managed: boolean
  /** Managed, but the entry differs from what Agent Store wrote. */
  modified: boolean
  /** The agent uses this entry now: approved (Claude Code), trusted project (Codex), not shadowed. */
  active: boolean
  /** Claude Code `.mcp.json` entries only. */
  approval?: ClaudeMcpApproval
  /** A Claude Code local-scope entry of the same name wins over this one. */
  shadowedBy?: 'local'
  /**
   * A user-level entry of the same name exists and this one takes precedence in this
   * project. Claude Code uses the project entry instead; Codex merges the two tables
   * key by key, so user keys the project entry leaves out (env, cwd) still apply.
   */
  overridesUser: boolean
  /** Environment variables the entry reads its values from. */
  env: string[]
  /** Of `env`, the required ones Agent Store has no value for on this machine. */
  missingEnv: string[]
}

export interface ProjectMcp {
  kind: 'mcp'
  name: string
  slug?: string
  version?: string
  managed: boolean
  agents: ToolTarget[]
  overridesUser: boolean
  missingEnv: string[]
  locations: ProjectMcpLocation[]
}

export interface ProjectEnvVar {
  name: string
  /** A value is stored in Agent Store's state directory on this machine. */
  stored: boolean
  /** MCP servers in this project that read it. */
  usedBy: string[]
}

export interface ProjectDetail extends Project {
  /** Codex only reads `.codex/config.toml` of a project the user trusted in `~/.codex/config.toml`. */
  codexTrusted: boolean
  skills: ProjectSkill[]
  mcps: ProjectMcp[]
  env: ProjectEnvVar[]
}

export interface ProjectSummary extends Project {
  /** Skills and MCP servers the agents use there, installed by Agent Store or not; null when the directory is gone or unreadable. */
  skills: number | null
  mcps: number | null
  /** What Agent Store installed there, from its own records (also known when the directory is gone). */
  installed: Array<{ kind: 'skill' | 'mcp'; slug: string; resourceId?: string; name: string }>
}

export interface ProjectInstallOptions {
  /** Defaults to every agent the item supports. */
  targets?: ToolTarget[]
  /** Replace a copy Agent Store installed earlier even if it was edited since. */
  force?: boolean
}

export interface ProjectInstallResult {
  projectId: string
  slug: string
  kind: 'skill' | 'mcp'
  version: string
  /** The skill or MCP server name the agents see. */
  name: string
  installed: Array<{ agent: ToolTarget; file: string }>
  /** Agents left out, and why (e.g. Codex cannot express a templated argument). */
  skipped: Array<{ agent: ToolTarget; reason: string; message: string }>
  /** Variables the MCP entries reference; values are set with setProjectEnv. */
  env: string[]
  /** Codex will ignore the project's `.codex/config.toml` until the user trusts the project. */
  codexTrusted: boolean
}

export interface ProjectUninstallOptions {
  targets?: ToolTarget[]
  /** Remove what Agent Store installed even if it was edited since. */
  force?: boolean
}

export interface ProjectUninstallResult {
  removed: Array<{ agent: ToolTarget; file: string }>
}
