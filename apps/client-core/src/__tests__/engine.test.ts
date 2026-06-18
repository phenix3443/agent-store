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
