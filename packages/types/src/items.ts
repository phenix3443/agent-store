import type { Publisher } from './publisher'
import type { ToolTarget } from './engine'

export type JsonSchema = Record<string, unknown>

export interface InstallHook {
  steps: Array<
    | { type: 'script'; command: string }
    | { type: 'config'; patch: Record<string, unknown> }
    | { type: 'file'; url: string; dest: string }
  >
}

/** A published version of a package, for the version-history timeline. */
export interface ItemVersion {
  version: string
  publishedAt: string
}

/** A user-submitted review of a package (distinct from the automated PackageReview). */
export interface UserReview {
  authorName: string | null
  rating: number
  body: string | null
  updatedAt: string
}

/** Automated quality + safety review of a package (from the registry review CI). */
export interface PackageReview {
  tier: string
  quality: number
  risk: 'low' | 'medium' | 'high' | string
  summary: string
  concerns: string[]
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
  /** Average user rating (1-5), 0 when there are no reviews yet. */
  rating: number
  /** Number of user reviews. Absent on items built outside the API. */
  reviewCount?: number
  status: 'published' | 'pending' | 'rejected'
  installHook: InstallHook
  /** Automated review verdict, when the registry has reviewed this package. */
  review?: PackageReview
  createdAt: string
  updatedAt: string
}

export interface ProviderItem extends BaseItem {
  category: 'provider'
  configSchema: JsonSchema
  supportedModels: string[]
}

export interface SkillItem extends BaseItem {
  category: 'skill'
  /** Download URL for the installable skill file (distinct from readmeUrl) */
  contentUrl: string
}

interface BaseMCPItem extends BaseItem {
  category: 'mcp'
  configSchema: JsonSchema
}

export interface StdioMCPItem extends BaseMCPItem {
  transport: 'stdio'
  /** Runtime command to start the MCP server AFTER install (e.g. "./server", "node server.js") */
  serverCommand: string
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
