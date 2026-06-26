import { readFile, writeFile, mkdir, copyFile, unlink, rm } from 'fs/promises'
import { join } from 'path'
import { parse, stringify } from '@iarna/toml'
import type { JsonMap } from '@iarna/toml'
import { load } from 'js-yaml'
import type { MCPItem } from '@aas/types'
import { buildLegacyMcpServerConfig, type McpServerConfig } from './mcp'
import { readProviderConnection } from './provider'

const CATEGORY_DIR: Record<string, string> = {
  provider: 'providers',
  skill: 'skills',
  mcp: 'mcps',
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
  try {
    const raw = await readFile(join(codexConfigDir, 'config.toml'), 'utf-8')
    return normalizeConfig((parse(raw) as unknown as Record<string, unknown>) ?? {})
  } catch {
    try {
      const raw = await readFile(join(codexConfigDir, 'config.yaml'), 'utf-8')
      const parsed = load(raw)
      return parsed && typeof parsed === 'object'
        ? normalizeConfig(parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
}

async function writeConfig(codexConfigDir: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(codexConfigDir, { recursive: true })
  await writeFile(join(codexConfigDir, 'config.toml'), stringify(config as JsonMap))
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

export async function getCodexAppliedProviderConnection(
  codexConfigDir: string
): Promise<{ apiKey?: string; baseUrl?: string; providerKey?: string }> {
  const config = await readConfig(codexConfigDir)
  const auth = await readAuth(codexConfigDir)
  const providerKey = typeof config['model_provider'] === 'string' ? config['model_provider'] : undefined
  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>
  const provider = providerKey ? (providers[providerKey] as Record<string, unknown> | undefined) : undefined
  return {
    providerKey,
    apiKey: typeof auth['OPENAI_API_KEY'] === 'string' ? auth['OPENAI_API_KEY'] : undefined,
    baseUrl: provider && typeof provider['base_url'] === 'string' ? provider['base_url'] : undefined,
  }
}

export async function syncItemToCodex(
  slug: string,
  category: 'provider' | 'skill' | 'mcp',
  aasHome: string,
  codexConfigDir: string,
  action: 'add' | 'remove'
): Promise<void> {
  const dir = join(aasHome, CATEGORY_DIR[category], slug)
  const config = await readConfig(codexConfigDir)

  if (category === 'mcp') {
    if (action === 'add') {
      const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as MCPItem
      await upsertCodexMcpServer(codexConfigDir, slug, buildLegacyMcpServerConfig(manifest, dir))
    } else {
      await removeCodexMcpServer(codexConfigDir, slug)
    }
  } else if (category === 'skill') {
    const skillsDir = join(codexConfigDir, 'skills')
    const destPath = join(skillsDir, `${slug}.md`)
    if (action === 'add') {
      await mkdir(skillsDir, { recursive: true })
      await copyFile(join(dir, 'skill.md'), destPath)
    } else {
      try { await unlink(destPath) } catch { /* already absent */ }
    }
  } else if (category === 'provider') {
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
