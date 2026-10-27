import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { McpServerConfig } from './mcp'
import { resolveClaudeCli, syncClaudeMcp, type ClaudeMcpCli } from './claude-mcp'
import { atomicWriteFile, readJsonObject } from './safe-file'
import { readProviderConnection } from './provider'
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
}

export const RELAY_AUTH_TOKEN_SENTINEL = 'aas-relay'

interface ClaudeRelayState {
  originalBaseUrl: string | null
  originalAuthToken: string | null
}

async function readSettings(claudeConfigDir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(claudeConfigDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeSettings(claudeConfigDir: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(claudeConfigDir, { recursive: true })
  await writeFile(join(claudeConfigDir, 'settings.json'), JSON.stringify(settings, null, 2))
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
  const settings = await readSettings(claudeConfigDir)

  // Skills are not synced here: Claude sees them through a symlink (engine + skills/claude-link.ts).
  if (category === 'provider') {
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
    await writeSettings(claudeConfigDir, settings)
  }
}

export async function enableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  const existingSnapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  if (!existingSnapshot) {
    await writeRelayState<ClaudeRelayState>(aasHome, 'claude', {
      originalBaseUrl: typeof env['ANTHROPIC_BASE_URL'] === 'string' ? env['ANTHROPIC_BASE_URL'] : null,
      originalAuthToken: typeof env['ANTHROPIC_AUTH_TOKEN'] === 'string' ? env['ANTHROPIC_AUTH_TOKEN'] : null,
    })
  }

  env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${RELAY_PORT}`
  env['ANTHROPIC_AUTH_TOKEN'] = RELAY_AUTH_TOKEN_SENTINEL
  settings['env'] = env
  await writeSettings(claudeConfigDir, settings)
}

export async function disableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const snapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  if (snapshot?.originalBaseUrl != null) env['ANTHROPIC_BASE_URL'] = snapshot.originalBaseUrl
  else delete env['ANTHROPIC_BASE_URL']

  if (snapshot?.originalAuthToken != null) env['ANTHROPIC_AUTH_TOKEN'] = snapshot.originalAuthToken
  else delete env['ANTHROPIC_AUTH_TOKEN']

  if (Object.keys(env).length > 0) settings['env'] = env
  else delete settings['env']

  await writeSettings(claudeConfigDir, settings)
  await clearRelayState(aasHome, 'claude')
}
