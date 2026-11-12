// Turns an MCP Registry server.json (as /api/resources normalizes it) into the
// launch or connection Agent Store writes into each tool. The registry lists
// packages and remotes in no ranked order; the choice below is ours.
import type { JsonSchema, McpArgument, McpInput, McpKeyValueInput, McpPackage, McpRemote, McpResourceDetail } from '@as/types'

export interface SchemaProperty {
  type: 'string'
  title?: string
  description?: string
  default?: string
  enum?: string[]
  'x-secret'?: boolean
  /** The environment variable this value is passed as. */
  'x-env'?: string
  /** A bearer token: Claude gets `Authorization: Bearer …`, Codex reads it from `x-env`. */
  'x-bearer'?: boolean
  /** Only fills `{key}` placeholders; not passed as an environment variable. */
  'x-template'?: boolean
}

export type McpPlan =
  | { transport: 'stdio'; command: string; args: string[]; env: Record<string, string>; configSchema: JsonSchema; source: string }
  | { transport: 'http' | 'sse'; url: string; headers: Record<string, string>; configSchema: JsonSchema; source: string }

export class McpNotInstallableError extends Error {
  readonly reason = 'no-launcher'
  constructor(readonly resourceId: string, detail: string) {
    super(`${resourceId} can't be installed by Agent Store: ${detail}`)
    this.name = 'McpNotInstallableError'
  }
}

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g
const KEY = /[^A-Za-z0-9_]+/g

const upperSnake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(KEY, '_').replace(/^_+|_+$/g, '').toUpperCase()

class Schema {
  private readonly properties: Record<string, SchemaProperty> = {}
  private readonly required = new Set<string>()

  has(key: string): boolean {
    return key in this.properties
  }

  add(key: string, input: Partial<McpInput>, extra: Partial<SchemaProperty> = {}, required?: boolean): void {
    const prev = this.properties[key]
    this.properties[key] = {
      type: 'string',
      ...(input.description ? { description: input.description } : prev?.description ? { description: prev.description } : {}),
      ...(input.default != null ? { default: input.default } : {}),
      ...(input.choices?.length ? { enum: input.choices } : {}),
      ...(input.isSecret || prev?.['x-secret'] ? { 'x-secret': true } : {}),
      ...extra,
    }
    // A placeholder whose variable has no default needs input, even when the outer input is optional.
    if (required ?? (input.default == null && input.value == null)) this.required.add(key)
  }

  json(): JsonSchema {
    const keys = Object.keys(this.properties)
    if (!keys.length) return { type: 'object' }
    return {
      type: 'object',
      properties: this.properties,
      ...(this.required.size ? { required: keys.filter(k => this.required.has(k)) } : {}),
    }
  }
}

/** Declares every `{name}` in `value` as a template-only config key, from `variables`. */
function templateOf(value: string, variables: Record<string, McpInput>, schema: Schema): string {
  const names = [...new Set([...value.matchAll(PLACEHOLDER)].map(m => m[1]))]
  for (const name of names) {
    const variable = variables[name]
    // A variable with a fixed value is not user input: inline it.
    if (variable?.value != null && !/\{[A-Za-z0-9_]+\}/.test(variable.value)) {
      value = value.split(`{${name}}`).join(variable.value)
      continue
    }
    if (!schema.has(name)) schema.add(name, variable ?? {}, { 'x-template': true }, variable ? variable.default == null : true)
  }
  return value
}

/** Argument list in the order given; optional arguments without a value are left out. */
function argList(list: McpArgument[], schema: Schema): string[] {
  const out: string[] = []
  for (const arg of list) {
    const value = arg.value ?? arg.default
    if (arg.type === 'named') {
      if (!arg.name) continue
      if (value != null) out.push(arg.name, templateOf(value, arg.variables, schema))
      else if (arg.isRequired) {
        const key = (arg.valueHint ?? arg.name).replace(/^-+/, '').replace(KEY, '_')
        schema.add(key, arg, { 'x-template': true, title: arg.name }, true)
        out.push(arg.name, `{${key}}`)
      }
    } else if (value != null) {
      out.push(templateOf(value, arg.variables, schema))
    } else if (arg.isRequired) {
      const key = (arg.valueHint ?? 'arg').replace(KEY, '_')
      schema.add(key, arg, { 'x-template': true }, true)
      out.push(`{${key}}`)
    }
  }
  return out
}

function envOf(vars: McpKeyValueInput[], schema: Schema): Record<string, string> {
  const env: Record<string, string> = {}
  for (const v of vars) {
    if (!v.name) continue
    if (v.value != null) {
      env[v.name] = templateOf(v.value, v.variables, schema)
    } else {
      // Bound by name through x-env; an optional one left empty is not written.
      schema.add(v.name, v, { 'x-env': v.name }, v.isRequired && v.default == null)
    }
  }
  return env
}

/** The launcher the registry's conventions name for a package, or null when there is none we run. */
function launcher(pkg: McpPackage, runtime: string[], env: string[]): string[] | null {
  const hint = pkg.runtimeHint
  const type = pkg.registryType
  if ((type === 'npm' && !hint) || hint === 'npx') {
    return ['npx', '-y', ...runtime, pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier]
  }
  if ((type === 'pypi' && !hint) || hint === 'uvx') {
    return ['uvx', ...runtime, pkg.version ? `${pkg.identifier}==${pkg.version}` : pkg.identifier]
  }
  if ((type === 'oci' && !hint) || hint === 'docker') {
    return ['docker', 'run', '-i', '--rm', ...env.flatMap(name => ['-e', name]), ...runtime, pkg.identifier]
  }
  if (hint && /^[A-Za-z0-9._-]+$/.test(hint)) return [hint, ...runtime, pkg.identifier]
  return null
}

function packagePlan(pkg: McpPackage): McpPlan | null {
  if (pkg.transport.type !== 'stdio') return null
  const schema = new Schema()
  const env = envOf(pkg.environmentVariables, schema)
  const runtime = argList(pkg.runtimeArguments, schema)
  const head = launcher(pkg, runtime, pkg.environmentVariables.map(v => v.name).filter(Boolean))
  if (!head) return null
  const args = [...head.slice(1), ...argList(pkg.packageArguments, schema)]
  return {
    transport: 'stdio', command: head[0], args, env, configSchema: schema.json(),
    source: `${pkg.registryType} ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}`,
  }
}

function remotePlan(remote: McpRemote, slug: string): McpPlan {
  const schema = new Schema()
  const url = templateOf(remote.url, remote.variables, schema)
  const headers: Record<string, string> = {}
  const tokenEnv = (name: string) => `${upperSnake(slug)}_${upperSnake(name)}`
  for (const h of remote.headers) {
    if (!h.name) continue
    if (h.name.toLowerCase() === 'authorization') {
      // Only a bearer token can be passed to Codex (bearer_token_env_var); other schemes stay a header.
      const bearer = h.value?.match(/^Bearer \{([A-Za-z0-9_]+)\}$/i)
      if (bearer) {
        schema.add(bearer[1], h.variables[bearer[1]] ?? h, { 'x-bearer': true, 'x-secret': true, 'x-env': tokenEnv(bearer[1]) }, true)
        continue
      }
      if (h.value == null) {
        schema.add('authorization', h, { 'x-bearer': true, 'x-secret': true, 'x-env': tokenEnv('token'), title: 'Authorization' }, h.isRequired && h.default == null)
        continue
      }
    }
    if (h.value != null) {
      headers[h.name] = templateOf(h.value, h.variables, schema)
    } else {
      const key = h.name.replace(KEY, '_')
      schema.add(key, h, { 'x-template': true, title: h.name }, h.isRequired && h.default == null)
      headers[h.name] = `{${key}}`
    }
  }
  return {
    transport: remote.type === 'sse' ? 'sse' : 'http', url, headers, configSchema: schema.json(),
    source: `${remote.type} ${remote.url}`,
  }
}

/**
 * The first that works of: an npm or PyPI package over stdio, a streamable-http
 * remote, an SSE remote, any other stdio package with a known launcher. Local
 * packages run what the user's machine already has (npx, uvx, docker); remotes
 * need nothing installed.
 */
export function planMcp(r: McpResourceDetail, slug: string): McpPlan {
  const stdio = r.packages.filter(p => p.transport.type === 'stdio')
  for (const pkg of stdio.filter(p => p.registryType === 'npm' || p.registryType === 'pypi')) {
    const plan = packagePlan(pkg)
    if (plan) return plan
  }
  const remote = r.remotes.find(x => x.type === 'streamable-http') ?? r.remotes.find(x => x.type === 'sse')
  if (remote) return remotePlan(remote, slug)
  for (const pkg of stdio) {
    const plan = packagePlan(pkg)
    if (plan) return plan
  }
  const offered = [...r.packages.map(p => `${p.registryType} (${p.transport.type})`), ...r.remotes.map(x => x.type)]
  throw new McpNotInstallableError(r.id, offered.length
    ? `it offers ${offered.join(', ')}, and none of them has a launcher Agent Store knows`
    : 'the registry entry has no package and no remote')
}
