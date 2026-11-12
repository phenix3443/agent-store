import { join } from 'path'
import type { McpServerConfig } from './mcp'
import { resolveClaudeCli, syncClaudeMcp, type ClaudeMcpCli } from './claude-mcp'
import { atomicWriteFile, readJsonObject, replaceSecretJsonFile } from './safe-file'
import { readProviderConnection } from './provider'
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'
import { ensureRelayToken, readRelayToken } from '../relay/token'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

// Versions before the relay token wrote this fixed value; disable still recognises it.
const LEGACY_RELAY_AUTH_TOKEN = 'aas-relay'

interface ClaudeRelayState {
  originalBaseUrl: string | null
  originalAuthToken: string | null
}

// settings.json can hold ANTHROPIC_AUTH_TOKEN, so it is written 0600.
async function readSettings(claudeConfigDir: string): Promise<Record<string, unknown>> {
  return (await readJsonObject(join(claudeConfigDir, 'settings.json'))) ?? {}
}

async function writeSettings(aasHome: string, claudeConfigDir: string, settings: Record<string, unknown>): Promise<void> {
  await replaceSecretJsonFile(aasHome, join(claudeConfigDir, 'settings.json'), settings)
}

// Claude Code reads user-scope MCP servers from `.claude.json` (NOT settings.json),
// which may hold other Claude-managed state — so read-merge-write and keep 0600.
// A file that does not parse aborts the write instead of being replaced.
async function readClaudeJson(claudeJsonPath: string): Promise<Record<string, unknown>> {
  return (await readJsonObject(claudeJsonPath)) ?? {}
}

async function writeClaudeJson(claudeJsonPath: string, config: Record<string, unknown>): Promise<void> {
  await atomicWriteFile(claudeJsonPath, JSON.stringify(config, null, 2), 0o600, true)
}

export async function upsertClaudeMcpServer(
  claudeJsonPath: string,
  slug: string,
  entry: McpServerConfig
): Promise<void> {
  const config = await readClaudeJson(claudeJsonPath)
  const mcpServers = (config['mcpServers'] ?? {}) as Record<string, unknown>
  mcpServers[slug] = entry
  config['mcpServers'] = mcpServers
  await writeClaudeJson(claudeJsonPath, config)
}

export async function removeClaudeMcpServer(claudeJsonPath: string, slug: string): Promise<void> {
  const config = await readClaudeJson(claudeJsonPath)
  const mcpServers = (config['mcpServers'] ?? {}) as Record<string, unknown>
  delete mcpServers[slug]
  if (Object.keys(mcpServers).length > 0) config['mcpServers'] = mcpServers
  else delete config['mcpServers']
  await writeClaudeJson(claudeJsonPath, config)
}

export interface ClaudeSyncOptions {
  /** Take over a same-name user entry (MCP only). */
  replace?: boolean
  /** Remove an entry even if it changed outside Agent Store (MCP only). */
  force?: boolean
  /** Run an MCP enable's ownership checks without writing anything. */
  dryRun?: boolean
  /** Injected CLI for tests; defaults to the installed `claude`. */
  cli?: ClaudeMcpCli | null
}

export async function syncItemToClaude(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  claudeConfigDir: string,
  claudeJsonPath: string,
  action: 'add' | 'remove',
  options: ClaudeSyncOptions = {}
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)

  if (category === 'mcp') {
    const cli = options.cli === undefined ? resolveClaudeCli() : options.cli
    await syncClaudeMcp({ aasHome, claudeConfigDir, claudeJsonPath, itemDir: dir, cli }, slug, action, options)
    return
  }

  // Skills are not synced here: Claude sees them through a symlink (engine + skills/claude-link.ts).
  if (category === 'provider') {
    const settings = await readSettings(claudeConfigDir)
    if (action === 'add') {
      const connection = await readProviderConnection(dir)
      if (connection.apiKey) {
        const env = (settings['env'] ?? {}) as Record<string, unknown>
        env['ANTHROPIC_AUTH_TOKEN'] = connection.apiKey
        if (connection.baseUrl) env['ANTHROPIC_BASE_URL'] = connection.baseUrl
        settings['env'] = env
      }
    } else {
      const env = (settings['env'] ?? {}) as Record<string, unknown>
      delete env['ANTHROPIC_AUTH_TOKEN']
      delete env['ANTHROPIC_BASE_URL']
      if (Object.keys(env).length > 0) settings['env'] = env
      else delete settings['env']
    }
    await writeSettings(aasHome, claudeConfigDir, settings)
  }
}

const relayBaseUrl = () => `http://127.0.0.1:${RELAY_PORT}`

export async function enableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const token = ensureRelayToken(aasHome)
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  const existingSnapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  if (!existingSnapshot) {
    const original = (key: string, ours: string[]) =>
      typeof env[key] === 'string' && !ours.includes(env[key] as string) ? env[key] as string : null
    await writeRelayState<ClaudeRelayState>(aasHome, 'claude', {
      originalBaseUrl: original('ANTHROPIC_BASE_URL', [relayBaseUrl()]),
      originalAuthToken: original('ANTHROPIC_AUTH_TOKEN', [token, LEGACY_RELAY_AUTH_TOKEN]),
    })
  }

  env['ANTHROPIC_BASE_URL'] = relayBaseUrl()
  env['ANTHROPIC_AUTH_TOKEN'] = token
  settings['env'] = env
  await writeSettings(aasHome, claudeConfigDir, settings)
}

/** Puts back only the env keys that still hold the relay's values; anything the user changed since stays. */
export async function disableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const snapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>
  const token = readRelayToken(aasHome)

  const restore = (key: string, ours: Array<string | undefined>, original: string | null | undefined) => {
    if (typeof env[key] !== 'string' || !ours.includes(env[key] as string)) return
    if (original != null) env[key] = original
    else delete env[key]
  }
  const baseUrls = [relayBaseUrl()]
  const tokens = [token, LEGACY_RELAY_AUTH_TOKEN]
  // A snapshot taken while a takeover was already in place holds relay values as "originals".
  const notOurs = (value: string | null | undefined, ours: Array<string | undefined>) =>
    value != null && !ours.includes(value) ? value : null
  restore('ANTHROPIC_BASE_URL', baseUrls, notOurs(snapshot?.originalBaseUrl, baseUrls))
  restore('ANTHROPIC_AUTH_TOKEN', tokens, notOurs(snapshot?.originalAuthToken, tokens))

  if (Object.keys(env).length > 0) settings['env'] = env
  else delete settings['env']

  await writeSettings(aasHome, claudeConfigDir, settings)
  await clearRelayState(aasHome, 'claude')
}

/**
 * Rewrites a takeover still in place so it carries the current relay token (older
 * versions wrote a fixed value the relay now refuses). Writes nothing when Claude
 * is not on the relay or already has the token. The existing snapshot is kept.
 */
export async function refreshRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<boolean> {
  if (!(await readRelayState<ClaudeRelayState>(aasHome, 'claude'))) return false
  const env = ((await readSettings(claudeConfigDir))['env'] ?? {}) as Record<string, unknown>
  if (env['ANTHROPIC_BASE_URL'] !== relayBaseUrl()) return false
  if (env['ANTHROPIC_AUTH_TOKEN'] === ensureRelayToken(aasHome)) return false
  await enableRelayForClaude(aasHome, claudeConfigDir)
  return true
}
