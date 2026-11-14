// What never leaves this machine, and the last check before anything is committed.
import { lstat, readdir, readFile } from 'fs/promises'
import { join, relative, sep } from 'path'

/** Credential fields of a provider config.json (readProviderConnection reads all three). */
const PROVIDER_SECRET_KEYS = new Set(['apiKey', 'apiKeys', 'token'])

const SECRET_NAME_PARTS = ['apikey', 'token', 'secret', 'password', 'passwd', 'credential', 'privatekey', 'accesskey', 'authorization', 'bearer', 'cookie', 'session']

type SchemaProp = Record<string, unknown>

function schemaProps(schema: unknown): Record<string, SchemaProp> {
  const props = (schema as { properties?: unknown } | undefined)?.properties
  return props && typeof props === 'object' && !Array.isArray(props) ? props as Record<string, SchemaProp> : {}
}

/**
 * Leaving a harmless value out only means the other device asks for it again; uploading
 * a key cannot be undone. So anything that is marked or named like a secret is kept here.
 */
export function isSecretConfigKey(key: string, prop: SchemaProp | undefined, category: 'mcp' | 'provider'): boolean {
  if (category === 'provider' && PROVIDER_SECRET_KEYS.has(key)) return true
  if (prop && (prop['x-secret'] === true || prop['x-bearer'] === true || prop['writeOnly'] === true || prop['format'] === 'password')) return true
  const name = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return name === 'key' || name.endsWith('key') || SECRET_NAME_PARTS.some(p => name.includes(p))
}

/** `config` without its secret keys, and the values taken out (for the content scan). */
export function splitSecrets(
  config: Record<string, unknown>, schema: unknown, category: 'mcp' | 'provider',
): { shared: Record<string, unknown>; secret: Record<string, unknown> } {
  const props = schemaProps(schema)
  const shared: Record<string, unknown> = {}
  const secret: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    if (isSecretConfigKey(k, props[k], category)) secret[k] = v
    else shared[k] = v
  }
  return { shared, secret }
}

export function secretStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(secretStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(secretStrings)
  return []
}

/** File names inside a skill directory that are never uploaded. */
export function excludedSkillFile(
  rel: string, mode: number, isDir: boolean, checkMode: boolean,
): 'git-dir' | 'secret-name' | 'owner-only' | null {
  const base = rel.split(/[\\/]/).pop() ?? rel
  if (base === '.git') return 'git-dir'
  if (isDir) return null
  if (/^\.env(\..*)?$/i.test(base) || /\.(pem|key|p12|pfx)$/i.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)
    || base === 'auth.json' || base === 'credentials.json' || base === 'project-env.json') return 'secret-name'
  if (checkMode && (mode & 0o044) === 0) return 'owner-only'
  return null
}

export interface KnownSecret {
  value: string
  /** What it is, for the error; never the value itself. */
  source: string
}

export interface SecretFinding {
  /** Path inside the exported tree. */
  file: string
  what: string
}

export class BackupSecretError extends Error {
  readonly reason = 'secret-found'
  constructor(readonly findings: SecretFinding[]) {
    super(`Backup stopped before anything was written: ${findings.slice(0, 5).map(f => `${f.file} contains ${f.what}`).join('; ')}${findings.length > 5 ? ` (and ${findings.length - 5} more)` : ''}. Remove it from that item, or uninstall the item, and try again`)
    this.name = 'BackupSecretError'
  }
}

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'an Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'an OpenAI-style API key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g },
  { name: 'a GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'a GitHub token', re: /\bgithub_pat_[A-Za-z0-9_]{60,}/g },
  { name: 'an AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'a Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: 'a Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
]
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/

// Documentation writes keys as `sk-xxxxxxxx…` or `sk-...`; a real key has many distinct characters.
const looksReal = (s: string) => new Set(s.replace(/^[a-z]+[-_]/i, '')).size >= 10

export const MIN_KNOWN_SECRET_LENGTH = 8

export function scanText(text: string, known: KnownSecret[]): string[] {
  const found = new Set<string>()
  for (const k of known) if (text.includes(k.value)) found.add(k.source)
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) if (looksReal(m[0])) { found.add(p.name); break }
  }
  if (PRIVATE_KEY.test(text)) found.add('a private key')
  return [...found]
}

/** Every file under `root`, checked for known secret values and key formats. */
export async function scanTree(root: string, known: KnownSecret[]): Promise<SecretFinding[]> {
  // latin1 keeps every byte, so an ASCII key is found inside binary files too.
  const usable = known
    .filter(k => k.value.length >= MIN_KNOWN_SECRET_LENGTH)
    .map(k => ({ ...k, value: Buffer.from(k.value, 'utf-8').toString('latin1') }))
  const findings: SecretFinding[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const name of (await readdir(dir)).sort()) {
      const full = join(dir, name)
      const st = await lstat(full)
      if (st.isDirectory()) { await walk(full); continue }
      if (!st.isFile()) continue
      const text = (await readFile(full)).toString('latin1')
      for (const what of scanText(text, usable)) findings.push({ file: relative(root, full).split(sep).join('/'), what })
    }
  }
  await walk(root)
  return findings
}
