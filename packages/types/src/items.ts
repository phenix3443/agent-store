import type { Publisher } from './publisher'
import type { ToolTarget } from './engine'
import type { SkillFile } from './resources'

export type JsonSchema = Record<string, unknown>

export interface InstallHook {
  steps: Array<
    | { type: 'config'; patch: Record<string, unknown> }
    | { type: 'file'; url: string; dest: string }
  >
}

export interface BaseItem {
  id: string
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  publisher: Publisher
  compatibleWith: ToolTarget[]
  tags: string[]
  downloads: number
  status: 'published' | 'pending' | 'rejected'
  installHook: InstallHook
  createdAt: string
  updatedAt: string
  /** Catalog id (`mcp-registry:…`, `github:…`, `builtin:…`) for items built from /api/resources. */
  resourceId?: string
}

export interface ProviderItem extends BaseItem {
  category: 'provider'
  configSchema: JsonSchema
  supportedModels: string[]
}

/** Where a skill's full directory lives: a repo-relative directory at a ref. */
export interface SkillSource {
  /** GitHub `owner/name` */
  repo: string
  /** Branch, tag or commit */
  ref: string
  /** Repo-relative directory holding SKILL.md; '' is the repo root */
  dir: string
}

export interface SkillItem extends BaseItem {
  category: 'skill'
  /** Download URL for the installable skill file (distinct from readmeUrl) */
  contentUrl: string
  /** The skill's whole directory, when the registry knows it */
  source?: SkillSource
  /** Every file of that directory at `source.ref`, from the catalog; fetched one by one instead of the repo tarball. */
  files?: SkillFile[]
}

interface BaseMCPItem extends BaseItem {
  category: 'mcp'
  configSchema: JsonSchema
  /**
   * `{key}` in `args`, `env` values and `headers` values is replaced by the config
   * value (or the schema default) of `key`. Items built from the catalog set it;
   * without it only the url is templated.
   */
  templated?: boolean
}

export interface StdioMCPItem extends BaseMCPItem {
  transport: 'stdio'
  /** Runtime command to start the MCP server AFTER install (e.g. "./server", "node server.js") */
  serverCommand: string
  /** Structured argv; when set, used as given instead of splitting serverCommand */
  command?: string
  args?: string[]
  /** Fixed environment, written next to the values bound from config. */
  env?: Record<string, string>
}

export interface RemoteMCPItem extends BaseMCPItem {
  transport: 'sse' | 'http'
  /** Remote MCP endpoint for http / sse transports */
  url: string
  /** Optional static headers for remote MCP transports */
  headers?: Record<string, string>
}

export type MCPItem = StdioMCPItem | RemoteMCPItem

export type Item = ProviderItem | SkillItem | MCPItem
