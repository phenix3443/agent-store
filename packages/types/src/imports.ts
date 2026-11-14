import type { ToolTarget } from './engine'

/** What `detectAgents` found for one agent. `detected` is true when either the CLI or the config directory is there. */
export interface AgentDetection {
  agent: ToolTarget
  /** The executable the engine runs (`AS_CLAUDE_BIN` / `AS_CODEX_BIN`, else PATH); null when there is none. */
  binary: string | null
  /** First line of `<binary> --version`; null without a binary or when it fails. */
  version: string | null
  configDir: string
  configDirExists: boolean
  /** `.claude.json` / `config.toml`, where user-level MCP servers live. */
  mcpConfigPath: string
  mcpConfigExists: boolean
  detected: boolean
}

/** Where a skill was found: `agents` is the shared ~/.agents/skills, which Codex also reads. */
export type SkillRoot = 'claude' | 'codex' | 'agents'

export type SkillNotImportable =
  /** The entry is a symlink: the user manages the skill somewhere else. */
  | 'symlink'
  /** A link inside the skill points outside it and would break in the library. */
  | 'external-link'
  /** The directory already carries `.agent-store.json`. */
  | 'has-marker'
  | 'too-large'
  | 'unreadable'

export interface SkillLocation {
  agent: ToolTarget
  root: SkillRoot
  path: string
  /** Set when the entry is a symlink. */
  linkTarget?: string
}

/** A catalog entry with the same name. `exact`: every file matches, so the import is tied to it and can update. */
export interface CatalogMatch {
  id: string
  name: string
  version: string | null
  exact: boolean
}

export interface SkillCandidate {
  kind: 'skill'
  /** `skill:<dir>`, or `skill:<dir>@<root>` when one directory name holds different content in different places. */
  id: string
  dirName: string
  /** Frontmatter `name`; Codex lists the skill under it. */
  name: string | null
  description: string | null
  locations: SkillLocation[]
  contentHash: string | null
  files: number
  importable: boolean
  reason?: SkillNotImportable
  catalog?: CatalogMatch
}

/** An MCP entry with every value that could be a secret left out. */
export interface McpEntrySummary {
  agent: ToolTarget
  /** File it was read from. */
  path: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  /** Values of secret-looking flags replaced by `***`. */
  args?: string[]
  /** Query values and user info replaced by `***`. */
  url?: string
  envNames: string[]
  headerNames: string[]
  /**
   * Keys the agent's CLI cannot write back. Importing keeps them; disabling and enabling again
   * through the CLI would drop them.
   */
  lossyKeys: string[]
}

export interface McpCandidate {
  kind: 'mcp'
  /** `mcp:<name>` */
  id: string
  name: string
  entries: McpEntrySummary[]
  importable: boolean
  catalog?: CatalogMatch
}

export type ImportCandidate = SkillCandidate | McpCandidate

export interface ImportScan {
  agents: AgentDetection[]
  skills: SkillCandidate[]
  mcps: McpCandidate[]
  /** False unless matchCatalog was set and the catalog answered. */
  catalogChecked: boolean
  /** Config files that could not be read; their entries are not listed. The message never quotes the file. */
  problems: Array<{ path: string; message: string }>
}

export interface ImportScanOptions {
  /** Look each candidate's name up in the catalog. Off by default: it sends the names of the user's skills and MCP servers to Agent Store's catalog service. */
  matchCatalog?: boolean
}

export interface ImportedItem {
  kind: 'skill' | 'mcp'
  /** Candidate id it came from. */
  id: string
  /** Its registry slug. */
  slug: string
  agents: ToolTarget[]
  /** Where it was found. */
  paths: string[]
  resourceId?: string
}

export interface ImportRecordSummary {
  importId: string
  createdAt: string
  items: ImportedItem[]
  state: 'applying' | 'applied' | 'undone' | 'rolled-back'
  undoneAt?: string
}

export interface ImportApplyResult {
  importId: string
  items: ImportedItem[]
}

export interface ImportUndoOptions {
  /**
   * Undo even when an imported item changed since: an edited library copy is kept under the import
   * directory instead of being deleted, and a changed MCP entry is left as it is now.
   */
  force?: boolean
}

export interface ImportUndoItem {
  kind: 'skill' | 'mcp'
  slug: string
  /**
   * `bytes`: back as it was before the import (renamed back, or never rewritten);
   * `entry`: an MCP entry removed after the import was written back;
   * `kept-current`: forced, the entry changed since the import and was left as it is;
   * `kept-copy`: forced, the edited library copy was moved to `keptAt` and the original put back.
   */
  result: 'bytes' | 'entry' | 'kept-current' | 'kept-copy'
  paths: string[]
  keptAt?: string
}

export interface ImportUndoResult {
  importId: string
  items: ImportUndoItem[]
}

/** Why an undo was refused; nothing was changed. */
export interface ImportUndoConflict {
  slug: string
  path: string
  reason: 'occupied' | 'modified' | 'changed' | 'backup-missing'
}
