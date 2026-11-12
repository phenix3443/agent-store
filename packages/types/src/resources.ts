import type { JsonSchema } from './items'
import type { ToolTarget } from './engine'

// The aggregated catalog: resources scraped from upstream sites into the store's
// own catalog database, served by GET /api/resources and
// GET /api/resources/<id>. Install data keeps the upstream structure; the API
// never computes install steps, the client decides how to install.

export type ResourceKind = 'skill' | 'mcp' | 'provider'

/** The site a record was scraped from; also the prefix of its id. */
export type ResourceSite = 'mcp-registry' | 'github' | 'builtin'

export interface ResourceAuthor {
  name: string
  url: string | null
}

export interface ResourceOrigin {
  site: ResourceSite
  /** Id on that site: MCP server name, `owner/repo/skillId`, or provider slug. */
  upstreamId: string
  /** Where the record was read from (an API URL or a repo directory). */
  url: string | null
  upstreamVersion: string | null
  /** When the upstream last changed the entry, as far as the sync can tell. */
  upstreamUpdatedAt: string | null
  /** Last sync run that saw this entry upstream. */
  syncedAt: string
  /** Set once the entry disappeared upstream; it is kept so installed copies still resolve. */
  unavailableAt: string | null
  unavailableReason: string | null
}

export interface ResourceSummary {
  /** `<site>:<upstreamId>`, e.g. `mcp-registry:io.github.github/github-mcp-server`. Stable across syncs. */
  id: string
  kind: ResourceKind
  name: string
  description: string | null
  author: ResourceAuthor | null
  version: string | null
  homepageUrl: string | null
  /** skills.sh install count; null where the source has none. */
  installs: number | null
  /**
   * GitHub stars of the repo behind the record: an MCP server's `repository`, a
   * skill's repo (shared by every skill in it). null when there is no GitHub repo,
   * GitHub does not resolve it, or the sync has not checked it yet.
   */
  stars: number | null
  /**
   * MCP: the publisher proved a domain to the registry (a reverse-DNS namespace
   * other than io.github.*). Providers: curated by us. Skills: false.
   */
  verified: boolean
  tags: string[]
  /** MCP: package registry types and remote transports on offer, e.g. ['npm', 'streamable-http']. */
  transports: string[]
  origin: ResourceOrigin
}

/**
 * `default`: installs first, then verified, then most recently updated; for `kind=mcp`
 * GitHub stars first (nulls last), then verified, then updated (the MCP registry has no
 * install counts). `stars` uses that MCP order for any kind. With `q`, name matches rank first.
 */
export type ResourceSort = 'default' | 'installs' | 'stars' | 'updated' | 'name'

export interface ResourceListResponse {
  resources: ResourceSummary[]
  /** Pass back as `offset` for the next page; null on the last page. */
  nextOffset: number | null
}

// ── MCP (official MCP Registry server.json, normalized) ──────────────────────
//
// Field meanings follow server.json
// (https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
// Missing arrays become [], missing booleans false, missing strings null.
//
// `value` may contain `{name}` placeholders resolved from `variables`. A value
// with a placeholder whose variable has no `default` needs user input, even when
// the outer input is not marked required. An input without `value` and
// `default` is user input. `isSecret` marks values to store and show as secrets.

export interface McpInput {
  description: string | null
  isRequired: boolean
  isSecret: boolean
  default: string | null
  value: string | null
  placeholder: string | null
  choices: string[]
  /** 'string' | 'number' | 'boolean' | 'filepath' */
  format: string | null
}

/** An environment variable (package) or an HTTP header (remote). */
export interface McpKeyValueInput extends McpInput {
  name: string
  variables: Record<string, McpInput>
}

export interface McpArgument extends McpInput {
  /** positional: emit the value; named: emit `name` then the value (or `name` alone for a valueless flag). */
  type: 'positional' | 'named'
  /** Flag name including dashes, for named arguments. */
  name: string | null
  valueHint: string | null
  isRepeated: boolean
  variables: Record<string, McpInput>
}

export interface McpTransport {
  /** 'stdio' | 'streamable-http' | 'sse' */
  type: string
  /** streamable-http / sse only; may contain `{name}` placeholders from `variables`. */
  url: string | null
  headers: McpKeyValueInput[]
  variables: Record<string, McpInput>
}

/**
 * A locally run package. The usual launch, per the registry's conventions:
 * - npm:  `npx -y <runtimeArguments> <identifier>@<version> <packageArguments>`
 * - pypi: `uvx <runtimeArguments> <identifier>==<version> <packageArguments>`
 * - oci:  `docker run -i --rm <runtimeArguments> <identifier> <packageArguments>`, with
 *         `-e NAME` per environment variable; the identifier usually carries the tag.
 * `runtimeHint`, when set, names the runtime the author expects instead
 * (seen: npx, uvx, docker, python, node, bunx, dnx).
 */
export interface McpPackage {
  /** 'npm' | 'pypi' | 'oci' | 'nuget' | 'cargo' | 'mcpb' | … */
  registryType: string
  identifier: string
  /** Often null for oci, whose identifier holds the tag. */
  version: string | null
  registryBaseUrl: string | null
  runtimeHint: string | null
  fileSha256: string | null
  /** stdio for almost all packages; streamable-http / sse means the package serves HTTP locally at `url`. */
  transport: McpTransport
  runtimeArguments: McpArgument[]
  packageArguments: McpArgument[]
  environmentVariables: McpKeyValueInput[]
}

export interface McpRemote extends McpTransport {
  /** 'streamable-http' | 'sse' */
  type: string
  url: string
}

export interface McpResourceDetail extends ResourceSummary {
  kind: 'mcp'
  title: string | null
  /** 'active' | 'deprecated' */
  status: string
  statusMessage: string | null
  publishedAt: string | null
  repository: { url: string; source: string | null; subfolder: string | null } | null
  icons: Array<{ src: string; mimeType: string | null; sizes: string[]; theme: string | null }>
  /** Install from one package or connect to one remote; upstream lists them in no ranked order. */
  packages: McpPackage[]
  remotes: McpRemote[]
}

// ── Skill (a GitHub directory holding SKILL.md) ──────────────────────────────

export interface SkillFile {
  /** Relative to the skill directory. */
  path: string
  /** symlink: the blob holds the link target. */
  type: 'file' | 'symlink'
  /** Git file mode, e.g. '100644', '100755', '120000'. */
  mode: string
  size: number
  /** Git blob sha. */
  sha: string
  /** raw.githubusercontent.com URL pinned to `repo.commit`. */
  downloadUrl: string
}

export interface SkillResourceDetail extends ResourceSummary {
  kind: 'skill'
  repo: {
    /** GitHub `owner/repo` */
    fullName: string
    /** Branch the sync followed (the default branch). */
    ref: string
    /** Commit the files below are pinned to. */
    commit: string
    /** Repo-relative directory holding SKILL.md; '' is the repo root. */
    dir: string
    /** Git tree sha of `dir`; changes exactly when the skill's files change. */
    treeSha: string
    /** Browsable URL of the directory at `commit`. */
    url: string
  }
  /** The parsed YAML frontmatter of SKILL.md, as written. */
  frontmatter: Record<string, unknown>
  /** Every file under `repo.dir`, SKILL.md included. Git submodules are left out. */
  files: SkillFile[]
  /** codeload tarball of the whole repo at `repo.commit`; the skill sits under `<top-level dir>/<repo.dir>`. */
  archiveUrl: string
}

// ── Provider (built into the API) ─────────────────────────────────────────────

export interface ProviderConnection {
  baseUrl: string
  /** 'bearer' (Authorization: Bearer) | 'anthropic' (x-api-key) */
  authType: string
  endpointPath?: string
  upstreamProtocol?: string
  level?: number
}

export interface ProviderResourceDetail extends ResourceSummary {
  kind: 'provider'
  compatibleWith: ToolTarget[]
  /** Null for `local`, the client's own relay, which has no upstream endpoint. */
  connection: ProviderConnection | null
  /** What the user fills in (the API key); defaults match `connection`. */
  configSchema: JsonSchema
  supportedModels: string[]
}

export type ResourceDetail = McpResourceDetail | SkillResourceDetail | ProviderResourceDetail
