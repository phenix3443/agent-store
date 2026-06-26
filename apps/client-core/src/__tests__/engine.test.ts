import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { AASEngineImpl } from '../engine'
import type { MCPItem, ProviderItem, SkillItem } from '@aas/types'

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: 'desc', readmeUrl: 'https://r.com', icon: 'https://i.com',
  version: '1.0.0', publisher, compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  installHook: { steps: [] },
}

const mcpItem: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: { type: 'object' },
}

const remoteMcpItem: MCPItem = {
  ...baseItem, slug: 'remote-mcp', category: 'mcp',
  transport: 'http', url: 'https://mcp.example.com', headers: { Authorization: 'Bearer token' },
  configSchema: { type: 'object' },
}

const providerItem: ProviderItem = {
  ...baseItem, slug: 'test-provider', category: 'provider',
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } },
  supportedModels: ['gpt-4o'],
}

const skillItem: SkillItem = {
  ...baseItem, slug: 'test-skill', category: 'skill', contentUrl: 'https://s.com',
  installHook: { steps: [] },
}

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: AASEngineImpl
const origFetch = globalThis.fetch

function mockFetch(items: Record<string, unknown>) {
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    for (const [pattern, body] of Object.entries(items)) {
      if (u.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unmocked URL: ${u}`)
  }) as typeof fetch
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-test-home-')
  claudeDir = await mkdtemp('/tmp/aas-test-claude-')
  codexDir = await mkdtemp('/tmp/aas-test-codex-')
  engine = new AASEngineImpl(
    { aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir },
    'http://localhost:3000'
  )
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

test('install mcp: creates item dir, manifest, registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  const result = await engine.install('test-mcp')
  expect(result.slug).toBe('test-mcp')
  expect(result.version).toBe('1.0.0')
  const manifest = JSON.parse(
    await readFile(join(aasHome, 'mcps', 'test-mcp', 'manifest.json'), 'utf-8')
  )
  expect(manifest.slug).toBe('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].slug).toBe('test-mcp')
  expect(reg.installed[0].enabledFor).toEqual({})
})

test('install throws when market returns error', async () => {
  mockFetch({ '/api/items/unknown': { error: 'not found' } })
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })) as unknown as typeof fetch
  await expect(engine.install('unknown')).rejects.toThrow()
})

test('enable mcp: writes mcpServers to claude settings', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(true)
})

test('enable mcp: writes mcp server to codex config', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'codex')
  const config = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(config).toContain('[mcp_servers.test-mcp]')
  expect(config).toContain('type = "stdio"')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.codex).toBe(true)
})

test('enable remote mcp: writes remote entry to claude and codex configs', async () => {
  mockFetch({ '/api/items/remote-mcp': { item: remoteMcpItem } })
  await engine.install('remote-mcp')
  await engine.enable('remote-mcp', 'claude')
  await engine.enable('remote-mcp', 'codex')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['remote-mcp']).toEqual({
    type: 'http',
    url: 'https://mcp.example.com',
    headers: { Authorization: 'Bearer token' },
  })

  const config = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(config).toContain('[mcp_servers.remote-mcp]')
  expect(config).toContain('type = "http"')
  expect(config).toContain('url = "https://mcp.example.com"')
})

test('disable mcp: removes mcpServers entry and sets enabledFor false', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  await engine.disable('test-mcp', 'claude')
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeUndefined()
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor.claude).toBe(false)
})

test('uninstall: removes item dir and registry entry', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.uninstall('test-mcp')
  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed).toHaveLength(0)
  const { access } = await import('fs/promises')
  await expect(access(join(aasHome, 'mcps', 'test-mcp'))).rejects.toThrow()
})

test('list returns all installed items', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const items = await engine.list()
  expect(items).toHaveLength(1)
  expect(items[0].slug).toBe('test-mcp')
})

test('list filters by category', async () => {
  mockFetch({
    '/api/items/test-mcp': { item: mcpItem },
    '/api/items/test-provider': { item: providerItem },
  })
  await engine.install('test-mcp')
  await engine.install('test-provider')
  const mcps = await engine.list({ category: 'mcp' })
  expect(mcps).toHaveLength(1)
  expect(mcps[0].slug).toBe('test-mcp')
})

test('info returns ItemDetail with manifest data', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  const detail = await engine.info('test-mcp')
  expect(detail.slug).toBe('test-mcp')
  expect(detail.name).toBe('Test')
  expect(detail.serverCommand).toBe('./server')
})

test('info returns remote MCP detail fields', async () => {
  mockFetch({ '/api/items/remote-mcp': { item: remoteMcpItem } })
  await engine.install('remote-mcp')
  const detail = await engine.info('remote-mcp')
  expect(detail.slug).toBe('remote-mcp')
  expect(detail.transport).toBe('http')
  expect(detail.url).toBe('https://mcp.example.com')
  expect(detail.headers).toEqual({ Authorization: 'Bearer token' })
  expect(detail.serverCommand).toBeUndefined()
})

test('getConfigSchema returns schema and current values', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const { schema, current } = await engine.getConfigSchema('test-provider')
  expect(schema).toEqual(providerItem.configSchema)
  expect(current.apiKey).toBe('sk-test')
})

test('setConfig writes config.json', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.setConfig('test-provider', { apiKey: 'sk-test' })
  const config = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider', 'config.json'), 'utf-8')
  )
  expect(config.apiKey).toBe('sk-test')
})

test('enabling a provider disables other providers for the same target', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', {
    apiKey: 'sk-1',
    baseUrl: 'https://api.one.example/v1',
  })
  await engine.setConfig('test-provider-2', {
    apiKey: 'sk-2',
    baseUrl: 'https://api.two.example/v1',
  })

  await engine.enable('test-provider', 'claude')
  await engine.enable('test-provider-2', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-2')
  expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.two.example/v1')

  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  const first = reg.installed.find((item: { slug: string }) => item.slug === 'test-provider')
  const second = reg.installed.find((item: { slug: string }) => item.slug === 'test-provider-2')
  expect(first.enabledFor.claude).toBe(false)
  expect(second.enabledFor.claude).toBe(true)
})

test('list reflects actual active provider from Claude config', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', {
    apiKey: 'sk-1',
    baseUrl: 'https://api.one.example/v1',
  })
  await engine.setConfig('test-provider-2', {
    apiKey: 'sk-2',
    baseUrl: 'https://api.two.example/v1',
  })
  await engine.enable('test-provider', 'claude')

  await writeFile(
    join(claudeDir, 'settings.json'),
    JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://api.two.example/v1',
        ANTHROPIC_AUTH_TOKEN: 'sk-2',
      },
    })
  )

  const items = await engine.list()
  const first = items.find(item => item.slug === 'test-provider')
  const second = items.find(item => item.slug === 'test-provider-2')
  expect(first?.enabledFor.claude).toBe(false)
  expect(second?.enabledFor.claude).toBe(true)
})

test('info reflects actual active provider from Codex config', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
    compatibleWith: ['codex'],
  }
  const firstCodexProvider: ProviderItem = {
    ...providerItem,
    compatibleWith: ['codex'],
  }
  mockFetch({
    '/api/items/test-provider': { item: firstCodexProvider },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', {
    apiKey: 'shared-key',
    baseUrl: 'https://api.shared.example/v1',
  })
  await engine.setConfig('test-provider-2', {
    apiKey: 'shared-key',
    baseUrl: 'https://api.shared.example/v1',
  })
  await engine.enable('test-provider', 'codex')

  await writeFile(
    join(codexDir, 'config.toml'),
    'model_provider = "test-provider-2"\npreferred_auth_method = "apikey"\n' +
      '[model_providers.test-provider-2]\n' +
      'name = "test-provider-2"\n' +
      'base_url = "https://api.shared.example/v1"\n' +
      'wire_api = "responses"\n' +
      'requires_openai_auth = false\n'
  )
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'shared-key' }))

  const list = await engine.list()
  const detail = await engine.info('test-provider-2')
  const other = await engine.info('test-provider')
  expect(list.find(item => item.slug === 'test-provider-2')?.enabledFor.codex).toBe(true)
  expect(list.find(item => item.slug === 'test-provider')?.enabledFor.codex).toBe(false)
  expect(detail.enabledFor.codex).toBe(true)
  expect(other.enabledFor.codex).toBe(false)
})

test('sync adds all enabled items to target configs', async () => {
  mockFetch({ '/api/items/test-mcp': { item: mcpItem } })
  await engine.install('test-mcp')
  await engine.enable('test-mcp', 'claude')
  // Clear settings to verify sync rewrites
  await writeFile(join(claudeDir, 'settings.json'), '{}')
  const result = await engine.sync(['claude'])
  expect(result.errors).toHaveLength(0)
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.mcpServers?.['test-mcp']).toBeDefined()
})

test('checkUpdates returns empty when registry is empty', async () => {
  const updates = await engine.checkUpdates()
  expect(updates).toHaveLength(0)
})

test('enable throws for unknown slug', async () => {
  await expect(engine.enable('nonexistent', 'claude')).rejects.toThrow('not installed')
})

test('uninstall throws for unknown slug', async () => {
  await expect(engine.uninstall('nonexistent')).rejects.toThrow('not installed')
})

test('info throws for unknown slug', async () => {
  await expect(engine.info('nonexistent')).rejects.toThrow('not installed')
})

// suppress unused variable warning for skillItem
void skillItem
