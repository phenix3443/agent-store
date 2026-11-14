// What the scan may show of an MCP entry the user wrote. Env and header values never
// leave the entry; arguments and URLs keep their shape with likely secrets masked.
import type { McpEntrySummary, ToolTarget } from '@as/types'
import { codexUnrestorableKeys } from '../config/codex-mcp'

export const MASK = '***'

const SECRET_FLAG = /(key|token|secret|passw(or)?d|auth|credential|bearer|cookie)/i

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function maskUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { return raw.replace(/\?.*$/, `?${MASK}`) }
  if (url.username || url.password) { url.username = MASK; url.password = '' }
  for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, MASK)
  return url.toString().replace(/%2A%2A%2A/g, MASK)
}

/** `--token=x` → `--token=***`; the word after `--api-key` → `***`; URLs lose query values and user info. */
export function maskArgs(args: string[]): string[] {
  const out: string[] = []
  let maskNext = false
  for (const arg of args) {
    if (maskNext) { out.push(MASK); maskNext = false; continue }
    const eq = /^(-{1,2}[^=\s]+)=(.*)$/.exec(arg)
    if (eq) { out.push(SECRET_FLAG.test(eq[1]) ? `${eq[1]}=${MASK}` : `${eq[1]}=${/^[a-z]+:\/\//i.test(eq[2]) ? maskUrl(eq[2]) : eq[2]}`); continue }
    if (/^-{1,2}\S+$/.test(arg) && SECRET_FLAG.test(arg)) { out.push(arg); maskNext = true; continue }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) { out.push(maskUrl(arg)); continue }
    // A bare value that looks like a token (long, no spaces, letters and digits mixed).
    if (arg.length >= 24 && /^[A-Za-z0-9_\-.:+/=]+$/.test(arg) && /\d/.test(arg) && /[A-Za-z]/.test(arg) && !arg.includes('/')) { out.push(MASK); continue }
    out.push(arg)
  }
  return out
}

/** Keys `claude mcp add-json` keeps (docs/global-skills-mcp.md §1.1-6); anything else it drops. */
const CLAUDE_KEYS = new Set(['type', 'command', 'args', 'env', 'url', 'headers', 'headersHelper', 'oauth'])

export function summarizeMcpEntry(agent: ToolTarget, path: string, entry: unknown): McpEntrySummary {
  const e = isObject(entry) ? entry : {}
  const url = typeof e['url'] === 'string' ? e['url'] : undefined
  const type = typeof e['type'] === 'string' ? e['type'] : undefined
  const transport: McpEntrySummary['transport'] = type === 'sse' ? 'sse' : url || type === 'http' ? 'http' : 'stdio'
  const env = isObject(e['env']) ? Object.keys(e['env']) : []
  const headers = isObject(e['headers']) ? Object.keys(e['headers']) : isObject(e['http_headers']) ? Object.keys(e['http_headers']) : []
  if (typeof e['bearer_token_env_var'] === 'string') env.push(e['bearer_token_env_var'])
  const args = Array.isArray(e['args']) ? e['args'].map(String) : undefined
  const lossyKeys = agent === 'codex'
    ? codexUnrestorableKeys(entry)
    : Object.keys(e).filter(k => !CLAUDE_KEYS.has(k)).sort()
  return {
    agent,
    path,
    transport,
    ...(typeof e['command'] === 'string' ? { command: e['command'] } : {}),
    ...(args ? { args: maskArgs(args) } : {}),
    ...(url ? { url: maskUrl(url) } : {}),
    envNames: [...new Set(env)].sort(),
    headerNames: headers.sort(),
    lossyKeys,
  }
}
