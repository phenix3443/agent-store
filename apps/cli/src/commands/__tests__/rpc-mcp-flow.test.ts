// The desktop client drives the engine only through `aas __rpc`. This walks an MCP that
// needs config through the whole desktop flow on a real engine and checks that uninstall
// leaves the registry, the ownership records and both tool configs byte-identical.
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { EngineImpl } from '@as/client-core'
import { runRpc } from '../rpc'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

// Catalog rows as GET /api/resources/<id> returns them: two npm MCP servers, one needing a token.
function mcpResource(name: string, env: Array<{ name: string; isRequired: boolean }> = []) {
  const input = { description: null, isRequired: false, isSecret: false, default: null, value: null, placeholder: null, choices: [], format: null }
  return {
    id: `mcp-registry:io.example/${name}`, kind: 'mcp', name, description: `${name} server`, author: { name: 'io.example', url: null },
    version: '1.0.0', homepageUrl: null, installs: null, verified: false, tags: [], transports: ['npm'],
    origin: { site: 'mcp-registry', upstreamId: `io.example/${name}`, url: null, upstreamVersion: '1.0.0', upstreamUpdatedAt: null, syncedAt: '', unavailableAt: null, unavailableReason: null },
    title: null, status: 'active', statusMessage: null, publishedAt: null, repository: null, icons: [], remotes: [],
    packages: [{
      registryType: 'npm', identifier: `@example/${name}-server`, version: '1.0.0', registryBaseUrl: null, runtimeHint: null, fileSha256: null,
      transport: { type: 'stdio', url: null, headers: [], variables: {} }, runtimeArguments: [], packageArguments: [],
      environmentVariables: env.map(e => ({ ...input, ...e, isSecret: true, variables: {} })),
    }],
  }
}
const tokenMcp = mcpResource('token-mcp', [{ name: 'TOKEN', isRequired: true }])
const otherMcp = mcpResource('other-mcp')

function serve(resources: Array<ReturnType<typeof mcpResource>>) {
  globalThis.fetch = (async (input: string) => {
    const url = new URL(String(input))
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    if (url.pathname === '/api/resources') {
      const q = url.searchParams.get('q') ?? ''
      return json({ resources: resources.filter(r => r.name.includes(q)), nextOffset: null })
    }
    const id = decodeURIComponent(url.pathname.replace('/api/resources/', ''))
    const r = resources.find(x => x.id === id)
    return r ? json({ resource: r }) : json({ error: 'Not found' }, 404)
  }) as typeof fetch
}

let root: string
let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
const origFetch = globalThis.fetch

beforeEach(async () => {
  root = await mkdtemp('/tmp/as-rpc-flow-')
  aasHome = join(root, 'agents')
  claudeDir = join(root, 'claude')
  codexDir = join(root, 'codex')
  for (const d of [aasHome, claudeDir, codexDir]) await mkdir(d, { recursive: true })
  engine = new EngineImpl({ aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir }, 'http://localhost:3000')
  serve([tokenMcp, otherMcp])
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(root, { recursive: true, force: true })
})

async function rpc<T>(method: string, ...args: unknown[]): Promise<{ ok: boolean; data?: T; error?: string; code?: string }> {
  const lines: string[] = []
  await runRpc(engine, [method, JSON.stringify(args)], s => lines.push(s))
  return JSON.parse(lines[0])
}

async function snapshot() {
  const read = (p: string) => (existsSync(p) ? readFile(p) : Promise.resolve(null))
  return {
    registry: await read(join(aasHome, 'registry.json')),
    claude: await read(join(claudeDir, '.claude.json')),
    codex: await read(join(codexDir, 'config.toml')),
    mcps: existsSync(join(aasHome, 'mcps')) ? (await readdir(join(aasHome, 'mcps'))).sort() : [],
    otherTargets: await read(join(aasHome, 'mcps', 'other-mcp', 'targets.json')),
  }
}

test('desktop flow: install an MCP that needs config, configure, enable Claude, disable Codex, uninstall — everything back byte for byte', async () => {
  // The user's own config, written the way each tool writes it.
  await writeFile(join(claudeDir, '.claude.json'), JSON.stringify({
    numStartups: 3,
    mcpServers: { mine: { type: 'stdio', command: 'my-server', args: [] } },
    projects: {},
  }, null, 2))
  await writeFile(join(codexDir, 'config.toml'), [
    '# my codex config',
    'model = "gpt-5"',
    '',
    '[mcp_servers.mine]',
    'command = "my-server"',
    '',
  ].join('\n'))
  // Another item already installed and enabled, so the registry and records are not empty.
  expect((await rpc('installAndEnable', 'other-mcp')).ok).toBe(true)
  const before = await snapshot()

  // 1. Install: registered, but enabled nowhere until it is configured.
  const installed = await rpc<{ enabled: string[]; notEnabled: Array<{ target: string; reason: string }> }>('installAndEnable', 'token-mcp')
  expect(installed.ok).toBe(true)
  expect(installed.data!.enabled).toEqual([])
  expect(installed.data!.notEnabled.map(n => n.reason)).toEqual(['needs-config', 'needs-config'])
  const blocked = await rpc('enable', 'token-mcp', 'claude')
  expect(blocked).toMatchObject({ ok: false, code: 'McpConfigMissingError' })

  // 2. Configure.
  const schema = await rpc<{ schema: { required: string[] } }>('getConfigSchema', 'token-mcp')
  expect(schema.data!.schema.required).toEqual(['TOKEN'])
  expect((await rpc('setConfig', 'token-mcp', { TOKEN: 'secret-1' })).ok).toBe(true)
  const status = await rpc<Array<{ target: string; blocker?: unknown }>>('getTargetStatus', 'token-mcp')
  expect(status.data!.every(s => !s.blocker)).toBe(true)

  // 3. Enable for Claude (and Codex, so that 4. has something to turn off).
  expect((await rpc('enable', 'token-mcp', 'claude')).ok).toBe(true)
  expect((await rpc('enable', 'token-mcp', 'codex')).ok).toBe(true)
  const claudeCfg = JSON.parse(await readFile(join(claudeDir, '.claude.json'), 'utf-8'))
  expect(claudeCfg.mcpServers['token-mcp']).toEqual({ type: 'stdio', command: 'npx', args: ['-y', '@example/token-mcp-server@1.0.0'], env: { TOKEN: 'secret-1' } })
  expect(claudeCfg.mcpServers.mine).toBeDefined()
  expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toContain('[mcp_servers.token-mcp]')

  // 4. Disable for Codex: its config is exactly the user's again.
  expect((await rpc('disable', 'token-mcp', 'codex')).ok).toBe(true)
  expect(await readFile(join(codexDir, 'config.toml'))).toEqual(before.codex!)
  const afterDisable = await rpc<Array<{ target: string; enabled: boolean }>>('getTargetStatus', 'token-mcp')
  expect(afterDisable.data!.map(s => [s.target, s.enabled])).toEqual([['claude', true], ['codex', false]])

  // 5. Uninstall while still enabled for Claude.
  expect((await rpc('uninstall', 'token-mcp')).ok).toBe(true)

  const after = await snapshot()
  expect(after.registry).toEqual(before.registry)
  expect(after.claude).toEqual(before.claude)
  expect(after.codex).toEqual(before.codex)
  expect(after.mcps).toEqual(before.mcps)
  expect(after.otherTargets).toEqual(before.otherTargets)
})

test('rpc errors carry the error class so the desktop client can offer --force', async () => {
  await rpc('installAndEnable', 'other-mcp')
  const path = join(claudeDir, '.claude.json')
  const cfg = JSON.parse(await readFile(path, 'utf-8'))
  cfg.mcpServers['other-mcp'].args = ['edited']
  await writeFile(path, JSON.stringify(cfg, null, 2))

  expect(await rpc('uninstall', 'other-mcp')).toMatchObject({ ok: false, code: 'McpChangedOutsideError' })
  expect((await rpc('uninstall', 'other-mcp', { force: true })).ok).toBe(true)
  expect(JSON.parse(await readFile(path, 'utf-8')).mcpServers?.['other-mcp']).toBeUndefined()
})

test('rpc errors carry the engine reason and tool, also when installAndEnable wraps them', async () => {
  serve([mcpResource('conflict-mcp')])
  await writeFile(join(claudeDir, '.claude.json'), JSON.stringify({ mcpServers: { 'conflict-mcp': { type: 'stdio', command: 'mine', args: [] } } }, null, 2))
  const res = await rpc('installAndEnable', 'mcp-registry:io.example/conflict-mcp')
  expect(res).toMatchObject({ ok: false, code: 'McpConflictError', tool: 'claude' })
  expect(res.error).toContain('Installed conflict-mcp')
})
