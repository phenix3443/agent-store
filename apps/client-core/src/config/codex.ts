import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { parse, stringify } from '@iarna/toml'
import type { JsonMap } from '@iarna/toml'
import { load } from 'js-yaml'
import type { McpServerConfig } from './mcp'
import { resolveCodexCli, syncCodexMcp, type CodexMcpCli } from './codex-mcp'
import { readProviderConnection } from './provider'
import { atomicWriteFile, ConfigParseError } from './safe-file'
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

const RELAY_PROVIDER_KEY = 'aas-relay'

interface CodexRelayState {
  originalModelProvider: string | null
  originalModelProviders: Record<string, unknown> | null
  originalAuth: Record<string, unknown> | null
  originalPreferredAuthMethod: string | null
}

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

async function writeConfig(codexConfigDir: string, config: Record<string, unknown>): Promise<void> {
  await atomicWriteFile(join(codexConfigDir, 'config.toml'), stringify(config as JsonMap), 0o600)
}

async function readAuth(codexConfigDir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(codexConfigDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeAuth(codexConfigDir: string, auth: Record<string, unknown>): Promise<void> {
  await mkdir(codexConfigDir, { recursive: true })
  if (Object.keys(auth).length === 0) {
    await rm(join(codexConfigDir, 'auth.json'), { force: true })
    return
  }
  await writeFile(join(codexConfigDir, 'auth.json'), JSON.stringify(auth, null, 2))
}

export async function upsertCodexMcpServer(
  codexConfigDir: string,
  slug: string,
  entry: McpServerConfig
): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const mcpServers = (config['mcp_servers'] ?? {}) as Record<string, unknown>
  mcpServers[slug] = entry
  config['mcp_servers'] = mcpServers
  await writeConfig(codexConfigDir, config)
}

export async function removeCodexMcpServer(codexConfigDir: string, slug: string): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const mcpServers = (config['mcp_servers'] ?? {}) as Record<string, unknown>
  delete mcpServers[slug]
  if (Object.keys(mcpServers).length > 0) config['mcp_servers'] = mcpServers
  else delete config['mcp_servers']
  await writeConfig(codexConfigDir, config)
}

interface CodexProviderConfigInput {
  providerKey: string
  name: string
  baseUrl: string
  apiKey: string
  model?: string
  adapter?: string
}

export async function upsertCodexProviderConnection(
  codexConfigDir: string,
  input: CodexProviderConfigInput
): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const auth = await readAuth(codexConfigDir)
  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>

  config['preferred_auth_method'] = 'apikey'
  config['model_provider'] = input.providerKey
  if (input.model) config['model'] = input.model

  const providerConfig: Record<string, unknown> = {
    name: input.name,
    base_url: input.baseUrl,
    wire_api: 'responses',
    requires_openai_auth: false,
  }
  if (input.adapter) providerConfig['adapter'] = input.adapter
  providers[input.providerKey] = providerConfig
  config['model_providers'] = providers

  auth['OPENAI_API_KEY'] = input.apiKey
  await writeConfig(codexConfigDir, config)
  await writeAuth(codexConfigDir, auth)
}

export async function removeCodexProviderConnection(
  codexConfigDir: string,
  providerKey: string
): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const auth = await readAuth(codexConfigDir)
  const isActiveProvider = config['model_provider'] === providerKey
  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>

  if (isActiveProvider) {
    delete config['model_provider']
    if (config['preferred_auth_method'] === 'apikey') delete config['preferred_auth_method']
    delete auth['OPENAI_API_KEY']
  }

  delete providers[providerKey]
  if (Object.keys(providers).length > 0) config['model_providers'] = providers
  else delete config['model_providers']

  await writeConfig(codexConfigDir, config)
  await writeAuth(codexConfigDir, auth)
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

export async function syncItemToCodex(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  codexConfigDir: string,
  action: 'add' | 'remove',
  options: CodexSyncOptions = {}
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)

  if (category === 'mcp') {
    const cli = options.cli === undefined ? resolveCodexCli() : options.cli
    await syncCodexMcp({ aasHome, codexHome: codexConfigDir, itemDir: dir, cli }, slug, action, options)
    return
  }
  // Skills are not synced here: Codex reads them from ~/.agents/skills (engine + skills/store.ts).
  if (category === 'provider') {
    if (action === 'add') {
      const connection = await readProviderConnection(dir)
      if (connection.apiKey && connection.baseUrl) {
        await upsertCodexProviderConnection(codexConfigDir, {
          providerKey: slug,
          name: slug,
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
        })
      }
    } else {
      await removeCodexProviderConnection(codexConfigDir, slug)
    }
  }
}

export async function enableRelayForCodex(aasHome: string, codexConfigDir: string): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const auth = await readAuth(codexConfigDir)

  const existingSnapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  if (!existingSnapshot) {
    await writeRelayState<CodexRelayState>(aasHome, 'codex', {
      originalModelProvider: typeof config['model_provider'] === 'string' ? config['model_provider'] : null,
      originalModelProviders: (config['model_providers'] as Record<string, unknown> | undefined) ?? null,
      originalAuth: Object.keys(auth).length > 0 ? auth : null,
      originalPreferredAuthMethod: typeof config['preferred_auth_method'] === 'string' ? config['preferred_auth_method'] : null,
    })
  }

  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>
  providers[RELAY_PROVIDER_KEY] = {
    name: RELAY_PROVIDER_KEY,
    base_url: `http://127.0.0.1:${RELAY_PORT}`,
    wire_api: 'responses',
    requires_openai_auth: false,
  }
  config['model_providers'] = providers
  config['model_provider'] = RELAY_PROVIDER_KEY
  config['preferred_auth_method'] = 'apikey'

  auth['OPENAI_API_KEY'] = RELAY_PROVIDER_KEY

  await writeConfig(codexConfigDir, config)
  await writeAuth(codexConfigDir, auth)
}

export async function disableRelayForCodex(
  aasHome: string,
  codexConfigDir: string,
  options?: { preserveOfficialAuthOnSwitch?: boolean }
): Promise<void> {
  const snapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  const config = await readConfig(codexConfigDir)

  if (snapshot?.originalModelProvider != null) config['model_provider'] = snapshot.originalModelProvider
  else delete config['model_provider']

  if (snapshot?.originalModelProviders != null) config['model_providers'] = snapshot.originalModelProviders
  else delete config['model_providers']

  if (snapshot?.originalPreferredAuthMethod != null) config['preferred_auth_method'] = snapshot.originalPreferredAuthMethod
  else delete config['preferred_auth_method']

  await writeConfig(codexConfigDir, config)

  if (!options?.preserveOfficialAuthOnSwitch) {
    const restoredAuth = snapshot?.originalAuth ?? {}
    await writeAuth(codexConfigDir, restoredAuth)
  }

  await clearRelayState(aasHome, 'codex')
}
