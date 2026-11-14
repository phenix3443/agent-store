import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import { parse, patch, stringify } from '@decimalturn/toml-patch'
import { load } from 'js-yaml'
import { itemDir } from '../paths'
import { resolveCodexCli, syncCodexMcp, type CodexMcpCli } from './codex-mcp'
import { atomicWriteFile, backupFile, ConfigParseError, readJsonObject, replaceSecretJsonFile } from './safe-file'
import { ensureRelayToken, RELAY_TOKEN_HEADER } from '../relay/token'
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'

const RELAY_PROVIDER_KEY = 'aas-relay'

interface CodexRelayState {
  originalModelProvider: string | null
  // Written by versions that also took over auth.json and preferred_auth_method.
  originalAuth?: Record<string, unknown> | null
  originalPreferredAuthMethod?: string | null
}

// What those versions wrote into auth.json / config.toml.
const LEGACY_RELAY_API_KEY = RELAY_PROVIDER_KEY
const LEGACY_RELAY_AUTH_METHOD = 'apikey'

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function normalizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const legacyMcpServers = readRecord(config['mcpServers'])
  if (!legacyMcpServers) return config

  const normalized = { ...config }
  const mcpServers = readRecord(config['mcp_servers']) ?? {}
  normalized['mcp_servers'] = { ...legacyMcpServers, ...mcpServers }
  delete normalized['mcpServers']
  return normalized
}

async function readConfig(codexConfigDir: string): Promise<Record<string, unknown>> {
  const tomlPath = join(codexConfigDir, 'config.toml')
  let raw: string | undefined
  try {
    raw = await readFile(tomlPath, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (raw !== undefined) {
    // A config.toml that does not parse must never be overwritten with a partial view.
    try {
      return normalizeConfig((parse(raw) as unknown as Record<string, unknown>) ?? {})
    } catch (e) {
      throw new ConfigParseError(tomlPath, (e as Error).message)
    }
  }
  try {
    const parsed = load(await readFile(join(codexConfigDir, 'config.yaml'), 'utf-8'))
    return parsed && typeof parsed === 'object'
      ? normalizeConfig(parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// Patching the existing text instead of re-serialising keeps the user's comments and layout.
async function writeConfig(codexConfigDir: string, config: Record<string, unknown>): Promise<void> {
  const tomlPath = join(codexConfigDir, 'config.toml')
  let existing: string | undefined
  try {
    existing = await readFile(tomlPath, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await atomicWriteFile(tomlPath, existing === undefined ? stringify(config) : patch(existing, config), 0o600)
}

async function readAuth(codexConfigDir: string): Promise<Record<string, unknown>> {
  return (await readJsonObject(join(codexConfigDir, 'auth.json'))) ?? {}
}

/** Backs up the previous auth.json when `aasHome` is given. */
async function writeAuth(codexConfigDir: string, auth: Record<string, unknown>, aasHome?: string): Promise<void> {
  const path = join(codexConfigDir, 'auth.json')
  if (Object.keys(auth).length === 0) {
    if (aasHome) await backupFile(aasHome, path)
    await rm(path, { force: true })
    return
  }
  await replaceSecretJsonFile(aasHome, path, auth)
}

/** Removes one `[mcp_servers.<name>]` table as-is; only `as migrate` uses it, for entries it proved it wrote. */
export async function removeCodexMcpServer(codexConfigDir: string, name: string): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const mcpServers = (config['mcp_servers'] ?? {}) as Record<string, unknown>
  delete mcpServers[name]
  if (Object.keys(mcpServers).length > 0) config['mcp_servers'] = mcpServers
  else delete config['mcp_servers']
  await writeConfig(codexConfigDir, config)
}

export interface CodexSyncOptions {
  /** Take over a same-name user entry (MCP only). */
  replace?: boolean
  /** Remove an entry even if it changed outside Agent Store (MCP only). */
  force?: boolean
  /** Run an MCP enable's ownership checks without writing anything. */
  dryRun?: boolean
  /** Injected CLI for tests; defaults to the installed `codex`. */
  cli?: CodexMcpCli | null
}

export async function syncMcpToCodex(
  slug: string,
  aasHome: string,
  codexConfigDir: string,
  action: 'add' | 'remove',
  options: CodexSyncOptions = {}
): Promise<void> {
  const cli = options.cli === undefined ? resolveCodexCli() : options.cli
  await syncCodexMcp({ aasHome, codexHome: codexConfigDir, itemDir: itemDir(aasHome, 'mcp', slug), cli }, slug, action, options)
}

export async function enableRelayForCodex(aasHome: string, codexConfigDir: string): Promise<void> {
  const token = ensureRelayToken(aasHome)
  const config = await readConfig(codexConfigDir)

  const existingSnapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  if (!existingSnapshot) {
    const current = config['model_provider']
    await writeRelayState<CodexRelayState>(aasHome, 'codex', {
      originalModelProvider: typeof current === 'string' && current !== RELAY_PROVIDER_KEY ? current : null,
    })
  }

  // The relay provider needs no OpenAI login (requires_openai_auth = false), so
  // auth.json is left alone; the token travels in a static request header.
  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>
  providers[RELAY_PROVIDER_KEY] = {
    name: RELAY_PROVIDER_KEY,
    base_url: `http://127.0.0.1:${RELAY_PORT}`,
    wire_api: 'responses',
    requires_openai_auth: false,
    http_headers: { [RELAY_TOKEN_HEADER]: token },
  }
  config['model_providers'] = providers
  config['model_provider'] = RELAY_PROVIDER_KEY

  await writeConfig(codexConfigDir, config)
}

/**
 * Undoes only what the relay owns: its own provider entry, and model_provider while
 * it still points at that entry. Providers, logins and tokens that changed while the
 * relay was on stay as they are now.
 */
export async function disableRelayForCodex(aasHome: string, codexConfigDir: string): Promise<void> {
  const snapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  const config = await readConfig(codexConfigDir)

  // A snapshot taken while a takeover was already in place holds relay values as "originals".
  if (config['model_provider'] === RELAY_PROVIDER_KEY) {
    const original = snapshot?.originalModelProvider
    if (original != null && original !== RELAY_PROVIDER_KEY) config['model_provider'] = original
    else delete config['model_provider']
  }

  const providers = config['model_providers'] as Record<string, unknown> | undefined
  if (providers) {
    delete providers[RELAY_PROVIDER_KEY]
    if (Object.keys(providers).length === 0) delete config['model_providers']
  }

  if (snapshot && 'originalPreferredAuthMethod' in snapshot && config['preferred_auth_method'] === LEGACY_RELAY_AUTH_METHOD) {
    if (snapshot.originalPreferredAuthMethod != null) config['preferred_auth_method'] = snapshot.originalPreferredAuthMethod
    else delete config['preferred_auth_method']
  }

  await writeConfig(codexConfigDir, config)

  if (snapshot && 'originalAuth' in snapshot) {
    const auth = await readAuth(codexConfigDir)
    if (auth['OPENAI_API_KEY'] === LEGACY_RELAY_API_KEY) {
      const original = snapshot.originalAuth?.['OPENAI_API_KEY']
      if (original !== undefined && original !== LEGACY_RELAY_API_KEY) auth['OPENAI_API_KEY'] = original
      else delete auth['OPENAI_API_KEY']
      await writeAuth(codexConfigDir, auth, aasHome)
    }
  }

  await clearRelayState(aasHome, 'codex')
}

/** Whether Codex's config sends its requests to the relay right now. */
export async function codexUsesRelay(codexConfigDir: string): Promise<boolean> {
  return (await readConfig(codexConfigDir))['model_provider'] === RELAY_PROVIDER_KEY
}

/**
 * Rewrites a takeover still in place so it carries the current relay token (older
 * versions sent none). Writes nothing when Codex is not on the relay or already
 * sends the token. The existing snapshot is kept.
 */
export async function refreshRelayForCodex(aasHome: string, codexConfigDir: string): Promise<boolean> {
  if (!(await readRelayState<CodexRelayState>(aasHome, 'codex'))) return false
  const config = await readConfig(codexConfigDir)
  if (config['model_provider'] !== RELAY_PROVIDER_KEY) return false
  const relayProvider = readRecord(readRecord(config['model_providers'])?.[RELAY_PROVIDER_KEY])
  if (readRecord(relayProvider?.['http_headers'])?.[RELAY_TOKEN_HEADER] === ensureRelayToken(aasHome)) return false
  await enableRelayForCodex(aasHome, codexConfigDir)
  return true
}
