import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { syncMcpToCodex } from '../codex'
import type { MCPItem } from '@as/types'
import { parse } from '@iarna/toml'

// Unit tests use the safe file-edit path, not the installed codex CLI.
process.env['AS_CODEX_BIN'] = ''

let aasHome: string
let codexDir: string

const publisher = { id: 'p1', slug: 'test', name: 'Test', avatarUrl: '', tier: 'community' as const }
const baseItem = {
  id: 'i1', name: 'Test', description: '',
  version: '1.0.0', publisher, compatibleWith: ['codex' as const], tags: [],
  downloads: 0, rating: 0, status: 'published' as const, createdAt: '', updatedAt: '',
  installHook: { steps: [] },
}

const mcpManifest: MCPItem = {
  ...baseItem, slug: 'test-mcp', category: 'mcp',
  transport: 'stdio', serverCommand: './server', configSchema: {},
}

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-test-home-')
  codexDir = await mkdtemp('/tmp/as-test-codex-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

async function setupItem(category: string, slug: string, manifest: object, config?: object) {
  const dir = join(aasHome, `${category}s`, slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
  if (config !== undefined) {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

async function readConfig(dir: string): Promise<Record<string, unknown>> {
  return parse(await readFile(join(dir, 'config.toml'), 'utf-8')) as unknown as Record<string, unknown>
}

test('mcp add writes mcpServers to codex config', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  const entry = (config.mcp_servers as Record<string, unknown>)['test-mcp'] as Record<string, unknown>
  // Codex fields only: no Claude `type`/`headers`.
  expect(entry).toEqual({ command: join(aasHome, 'mcps', 'test-mcp', 'server') })
})

test('mcp remove deletes mcpServers entry', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'add')
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'remove')
  const config = await readConfig(codexDir)
  expect((config.mcp_servers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('mcp remove with the item directory gone needs --force', async () => {
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'add')
  // Without targets.json or a manifest nothing proves the entry is ours.
  await rm(join(aasHome, 'mcps', 'test-mcp'), { recursive: true, force: true })
  await expect(syncMcpToCodex('test-mcp', aasHome, codexDir, 'remove')).rejects.toThrow('outside Agent Store')
  await expect(
    syncMcpToCodex('test-mcp', aasHome, codexDir, 'remove', { force: true })
  ).resolves.toBeUndefined()
  const config = await readConfig(codexDir)
  expect((config.mcp_servers as Record<string, unknown>)?.['test-mcp']).toBeUndefined()
})

test('mcp add preserves existing config keys', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'model = "codex-mini"\n')
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'add')
  const config = await readConfig(codexDir)
  expect(config.model).toBe('codex-mini')
  expect((config.mcp_servers as Record<string, unknown>)['test-mcp']).toBeDefined()
})

test('mcp add leaves the rest of config.toml as written, comments included', async () => {
  const before = '# my settings\nmodel = "o3" # inline\n\n[mcpServers.legacy]\ncommand = "keep"\n'
  await writeFile(join(codexDir, 'config.toml'), before)
  await setupItem('mcp', 'test-mcp', mcpManifest)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'add')
  const text = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(text.startsWith(before)).toBe(true)
  await syncMcpToCodex('test-mcp', aasHome, codexDir, 'remove')
  expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toBe(before)
})

