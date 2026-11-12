// Install → enable → disable → uninstall for every kind × tool must leave the
// registry, ownership records and every tool config exactly as they were (#76 step 5).
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import { EngineImpl } from '../engine'
import type { MCPItem, ProviderItem, SkillItem, ToolTarget } from '@as/types'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const base = {
  id: 'i1', name: 'Test', description: 'desc', version: '1.0.0', publisher,
  compatibleWith: ['claude' as const, 'codex' as const],
  tags: [], downloads: 0, rating: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z',
  installHook: { steps: [] },
}
const mcp: MCPItem = {
  ...base, slug: 'rt-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx rt-server --stdio',
  configSchema: { type: 'object', properties: { token: { type: 'string', 'x-env': 'RT_TOKEN' } }, required: ['token'] },
}
const provider: ProviderItem = {
  ...base, slug: 'rt-provider', category: 'provider',
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' } } }, supportedModels: [],
  installHook: { steps: [{ type: 'config', patch: { baseUrl: 'https://llm.example.com', apiKey: '' } }] },
}
const SKILL_MD = '---\nname: rt-skill\ndescription: round trip\n---\nbody\n'
const skill: SkillItem = { ...base, slug: 'rt-skill', category: 'skill', contentUrl: 'https://s.example.com/SKILL.md' }

const json = (v: unknown) => JSON.stringify(v, null, 2)

// What a user already has before Agent Store touches anything. JSON files are in the
// 2-space layout the engine writes; other layouts come back reformatted (see the PR).
const USER_REGISTRY = {
  installed: [{
    slug: 'other-skill', category: 'skill', version: '0.1.0', installedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', compatibleWith: ['claude', 'codex'], enabledFor: { codex: true },
  }],
}
const USER_SETTINGS = { theme: 'dark', env: { ANTHROPIC_BASE_URL: 'https://my-gateway.example', ANTHROPIC_AUTH_TOKEN: 'sk-user', FOO: 'bar' } }
const USER_CLAUDE_JSON = { numStartups: 3, mcpServers: { mine: { type: 'stdio', command: 'my-server', args: [] } } }
const USER_CONFIG_TOML = [
  '# my codex config',
  'model = "gpt-5"',
  'model_provider = "my-gateway"',
  '',
  '[model_providers.my-gateway]',
  'name = "My gateway"  # keep this comment',
  'base_url = "https://my-gateway.example/v1"',
  '',
  '[mcp_servers.mine]',
  'command = "my-server"',
  '',
].join('\n')
const USER_AUTH = { OPENAI_API_KEY: 'sk-codex-user', tokens: { access_token: 'a1', refresh_token: 'r1' } }

let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
const origFetch = globalThis.fetch

function serve() {
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    for (const item of [mcp, provider, skill]) {
      if (u.includes(`/api/items/${item.slug}`)) {
        return new Response(JSON.stringify({ item }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
    }
    if (u === skill.contentUrl) return new Response(SKILL_MD, { status: 200 })
    if (u.includes('/install')) return new Response('{}', { status: 200 })
    throw new Error(`Unmocked URL: ${u}`)
  }) as typeof fetch
}

beforeEach(async () => {
  const root = await mkdtemp('/tmp/as-roundtrip-')
  aasHome = join(root, 'agents')
  claudeDir = join(root, 'claude')
  codexDir = join(root, 'codex')
  await mkdir(join(aasHome, 'skills', 'my-own-skill'), { recursive: true })
  await writeFile(join(aasHome, 'skills', 'my-own-skill', 'SKILL.md'), '---\nname: mine\ndescription: m\n---\n')
  await writeFile(join(aasHome, 'registry.json'), json(USER_REGISTRY))
  await mkdir(join(claudeDir, 'skills', 'user-skill'), { recursive: true })
  await writeFile(join(claudeDir, 'skills', 'user-skill', 'SKILL.md'), 'user skill\n')
  await writeFile(join(claudeDir, 'settings.json'), json(USER_SETTINGS), { mode: 0o600 })
  await writeFile(join(claudeDir, '.claude.json'), json(USER_CLAUDE_JSON), { mode: 0o600 })
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'config.toml'), USER_CONFIG_TOML, { mode: 0o600 })
  await writeFile(join(codexDir, 'auth.json'), json(USER_AUTH), { mode: 0o600 })
  serve()
  engine = new EngineImpl(
    { aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir },
    'http://localhost:3000',
    { startRelay: async () => { await writeFile(join(aasHome, 'relay.pid'), String(process.pid)) } },
  )
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(join(aasHome, '..'), { recursive: true, force: true })
})

// Left behind on purpose: backups of every config write, the relay token and pid
// (shared by all providers). Empty per-kind parent directories are not listed either.
const IGNORED = [/^agents\/agent-store\/backups(\/|$)/, /^agents\/relay-token$/, /^agents\/relay\.pid$/]

/** Every file and symlink under the test root with its mode and bytes. */
async function snapshot(): Promise<Record<string, string>> {
  const root = join(aasHome, '..')
  const out: Record<string, string> = {}
  async function walk(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const path = join(dir, name)
      const rel = relative(root, path)
      if (IGNORED.some(re => re.test(rel))) continue
      const st = await lstat(path)
      if (st.isSymbolicLink()) out[rel] = `link -> ${await readlink(path)}`
      else if (st.isDirectory()) await walk(path)
      else out[rel] = `${(st.mode & 0o777).toString(8)} ${(await readFile(path)).toString('utf-8')}`
    }
  }
  await walk(root)
  return out
}

async function expectUnchangedSince(before: Record<string, string>) {
  expect(await snapshot()).toEqual(before)
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'))

// ── one round trip per kind × tool ──────────────────────────────────────────

for (const target of ['claude', 'codex'] as ToolTarget[]) {
  test(`mcp × ${target}: install → config → enable → disable → uninstall leaves every file byte-identical`, async () => {
    const before = await snapshot()
    await engine.install('rt-mcp')
    await engine.setConfig('rt-mcp', { token: 't0k' })
    await engine.enable('rt-mcp', target)
    const enabled = target === 'claude'
      ? JSON.stringify((await readJson(join(claudeDir, '.claude.json'))).mcpServers['rt-mcp'])
      : await readFile(join(codexDir, 'config.toml'), 'utf-8')
    expect(enabled).toContain('t0k')
    await engine.disable('rt-mcp', target)
    await engine.uninstall('rt-mcp')
    await expectUnchangedSince(before)
  })

  test(`provider × ${target}: install → key → enable → disable → uninstall leaves every file byte-identical`, async () => {
    const before = await snapshot()
    await engine.install('rt-provider')
    await engine.setConfig('rt-provider', { baseUrl: 'https://llm.example.com', apiKey: 'sk-provider' })
    await engine.enable('rt-provider', target)
    if (target === 'claude') {
      expect((await readJson(join(claudeDir, 'settings.json'))).env.ANTHROPIC_BASE_URL).toStartWith('http://127.0.0.1:')
    } else {
      expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toContain('model_provider = "aas-relay"')
    }
    await engine.disable('rt-provider', target)
    await engine.uninstall('rt-provider')
    await expectUnchangedSince(before)
  })
}

test('skill × claude: install → enable → disable → uninstall leaves every file byte-identical', async () => {
  const before = await snapshot()
  await engine.install('rt-skill')
  await engine.enable('rt-skill', 'claude')
  expect((await lstat(join(claudeDir, 'skills', 'rt-skill'))).isSymbolicLink()).toBe(true)
  await engine.disable('rt-skill', 'claude')
  expect(await readdir(join(claudeDir, 'skills'))).toEqual(['user-skill'])
  await engine.uninstall('rt-skill')
  await expectUnchangedSince(before)
})

test('skill × codex: install → enable → (disable is refused) → uninstall leaves every file byte-identical', async () => {
  const before = await snapshot()
  await engine.install('rt-skill', { target: 'codex' })
  await engine.enable('rt-skill', 'codex')
  expect(await readFile(join(aasHome, 'skills', 'rt-skill', 'SKILL.md'), 'utf-8')).toBe(SKILL_MD)
  // Codex reads every skill in ~/.agents/skills; there is no per-skill switch to turn off.
  const err = await engine.disable('rt-skill', 'codex').catch(e => e)
  expect(err?.name).toBe('CodexSkillDisableUnsupported')
  await engine.uninstall('rt-skill')
  await expectUnchangedSince(before)
})

// ── the user edits tool configs while the item is enabled ───────────────────

test('mcp × claude: entries and keys the user adds while enabled survive disable and uninstall', async () => {
  await engine.install('rt-mcp')
  await engine.setConfig('rt-mcp', { token: 't0k' })
  await engine.enable('rt-mcp', 'claude')
  const cfg = await readJson(join(claudeDir, '.claude.json'))
  cfg.numStartups = 4
  cfg.mcpServers['added-later'] = { type: 'http', url: 'https://later.example' }
  await writeFile(join(claudeDir, '.claude.json'), json(cfg))

  await engine.disable('rt-mcp', 'claude')
  await engine.uninstall('rt-mcp')
  expect(await readFile(join(claudeDir, '.claude.json'), 'utf-8')).toBe(json({
    numStartups: 4,
    mcpServers: { ...USER_CLAUDE_JSON.mcpServers, 'added-later': { type: 'http', url: 'https://later.example' } },
  }))
})

test('mcp × codex: a table and comment the user appends while enabled survive, byte for byte', async () => {
  await engine.install('rt-mcp')
  await engine.setConfig('rt-mcp', { token: 't0k' })
  await engine.enable('rt-mcp', 'codex')
  const appended = '\n# added while enabled\n[mcp_servers.later]\ncommand = "later"\n'
  await writeFile(join(codexDir, 'config.toml'), (await readFile(join(codexDir, 'config.toml'), 'utf-8')) + appended)

  await engine.uninstall('rt-mcp')
  const text = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  expect(text).not.toContain('rt-mcp')
  expect(text).toBe(USER_CONFIG_TOML + appended)
})

test('provider × claude: env keys the user adds while enabled are kept', async () => {
  await engine.install('rt-provider')
  await engine.setConfig('rt-provider', { apiKey: 'sk-provider' })
  await engine.enable('rt-provider', 'claude')
  const settings = await readJson(join(claudeDir, 'settings.json'))
  settings.env.EXTRA = '1'
  settings.model = 'opus'
  await writeFile(join(claudeDir, 'settings.json'), json(settings))

  await engine.uninstall('rt-provider')
  expect(await readFile(join(claudeDir, 'settings.json'), 'utf-8')).toBe(json({
    ...USER_SETTINGS, env: { ...USER_SETTINGS.env, EXTRA: '1' }, model: 'opus',
  }))
})

test('provider × claude: a base URL the user changed while enabled is not put back', async () => {
  await engine.install('rt-provider')
  await engine.setConfig('rt-provider', { apiKey: 'sk-provider' })
  await engine.enable('rt-provider', 'claude')
  const settings = await readJson(join(claudeDir, 'settings.json'))
  settings.env.ANTHROPIC_BASE_URL = 'https://switched-by-hand.example'
  await writeFile(join(claudeDir, 'settings.json'), json(settings))

  await engine.disable('rt-provider', 'claude')
  const env = (await readJson(join(claudeDir, 'settings.json'))).env
  expect(env.ANTHROPIC_BASE_URL).toBe('https://switched-by-hand.example')
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-user')
})

test('provider × codex: a provider the user adds and refreshed login tokens survive', async () => {
  await engine.install('rt-provider')
  await engine.setConfig('rt-provider', { apiKey: 'sk-provider' })
  await engine.enable('rt-provider', 'codex')
  const refreshed = { ...USER_AUTH, tokens: { access_token: 'a2', refresh_token: 'r2' } }
  await writeFile(join(codexDir, 'auth.json'), json(refreshed))
  const appended = '\n[model_providers.added-later]\nname = "later"\nbase_url = "https://later.example"\n'
  await writeFile(join(codexDir, 'config.toml'), (await readFile(join(codexDir, 'config.toml'), 'utf-8')) + appended)

  await engine.uninstall('rt-provider')
  expect(await readFile(join(codexDir, 'auth.json'), 'utf-8')).toBe(json(refreshed))
  expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toBe(USER_CONFIG_TOML + appended)
})

test('skill × claude: skills the user adds or edits elsewhere are left alone', async () => {
  await engine.install('rt-skill')
  await mkdir(join(claudeDir, 'skills', 'added-later'))
  await writeFile(join(claudeDir, 'skills', 'added-later', 'SKILL.md'), 'later\n')
  await writeFile(join(aasHome, 'skills', 'my-own-skill', 'notes.md'), 'mine\n')

  await engine.uninstall('rt-skill')
  expect((await readdir(join(claudeDir, 'skills'))).sort()).toEqual(['added-later', 'user-skill'])
  expect((await readdir(join(aasHome, 'skills'))).sort()).toEqual(['my-own-skill'])
  expect(await readFile(join(aasHome, 'skills', 'my-own-skill', 'notes.md'), 'utf-8')).toBe('mine\n')
  expect(await readJson(join(aasHome, 'registry.json'))).toEqual(USER_REGISTRY)
})
