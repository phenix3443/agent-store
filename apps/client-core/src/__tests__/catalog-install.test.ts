// Installing straight from /api/resources data: MCP from an npm package and from
// remotes, a skill from its GitHub files, a built-in provider (#101 acceptance).
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { lstat, mkdtemp, readFile, readlink, rm } from 'fs/promises'
import { join } from 'path'
import { parse as parseToml } from '@iarna/toml'
import { EngineImpl } from '../engine'
import { CodexMcpUnsupportedError } from '../config/codex-mcp'
import {
  emptyInput, mcpResource, npmPackage, providerResource, serveCatalog, skillFiles, skillResource,
} from './helpers/resources'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const SKILL = '---\nname: find-skills\ndescription: Finds skills\n---\nbody\n'
const findSkills = skillResource('vercel-labs/skills/find-skills', { 'SKILL.md': SKILL, 'scripts/run.sh': 'echo hi\n' })
const githubMcp = mcpResource('io.github.github/github-mcp-server', {
  packages: [npmPackage('@modelcontextprotocol/server-github', {
    environmentVariables: [
      { ...emptyInput, name: 'GITHUB_PERSONAL_ACCESS_TOKEN', isRequired: true, isSecret: true, description: 'PAT', variables: {} },
      { ...emptyInput, name: 'GITHUB_HOST', variables: {} },
      { ...emptyInput, name: 'LOG', value: 'info', variables: {} },
    ],
    packageArguments: [{ ...emptyInput, type: 'positional', name: null, value: 'stdio', valueHint: null, isRepeated: false, variables: {} }],
  })],
})
const bearerRemote = mcpResource('com.example/bearer', {
  remotes: [{
    type: 'streamable-http', url: 'https://mcp.example.com/{tenant}/mcp',
    variables: { tenant: { ...emptyInput, default: 'acme' } },
    headers: [{ ...emptyInput, name: 'Authorization', value: 'Bearer {api_key}', isRequired: true, isSecret: true, variables: { api_key: { ...emptyInput, isRequired: true, isSecret: true, description: 'API key' } } }],
  }],
})
const headerRemote = mcpResource('com.example/keyed', {
  remotes: [{ type: 'streamable-http', url: 'https://keyed.example.com/mcp', variables: {}, headers: [{ ...emptyInput, name: 'X-API-Key', isRequired: true, isSecret: true, variables: {} }] }],
})
const sseRemote = mcpResource('com.example/sse-only', { remotes: [{ type: 'sse', url: 'https://sse.example.com/sse', variables: {}, headers: [] }] })
const openrouter = providerResource('openrouter', {
  connection: { baseUrl: 'https://openrouter.ai/api/v1', authType: 'bearer', endpointPath: '/chat/completions', level: 1 },
})

let root: string
let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
let catalog: Parameters<typeof serveCatalog>[0]
const origFetch = globalThis.fetch

beforeEach(async () => {
  root = await mkdtemp('/tmp/as-catalog-install-')
  aasHome = join(root, 'home')
  claudeDir = join(root, 'claude')
  codexDir = join(root, 'codex')
  engine = new EngineImpl({ aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir }, 'http://store.test')
  catalog = [findSkills, githubMcp, bearerRemote, headerRemote, sseRemote, openrouter]
  globalThis.fetch = serveCatalog(catalog, skillFiles(findSkills, { 'SKILL.md': SKILL, 'scripts/run.sh': 'echo hi\n' }))
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(root, { recursive: true, force: true })
})

const claudeJson = async () => JSON.parse(await readFile(join(claudeDir, '.claude.json'), 'utf-8'))
const codexToml = async () => parseToml(await readFile(join(codexDir, 'config.toml'), 'utf-8')) as { mcp_servers: Record<string, unknown> }

test('npm MCP: installs as npx, waits for its required env, then writes both tools', async () => {
  const outcome = await engine.installAndEnable('mcp-registry:io.github.github/github-mcp-server')
  expect(outcome.slug).toBe('github-mcp-server')
  expect(outcome.notEnabled.map(n => n.reason)).toEqual(['needs-config', 'needs-config'])
  const { schema } = await engine.getConfigSchema('github-mcp-server')
  expect(schema).toEqual({
    type: 'object',
    properties: {
      GITHUB_PERSONAL_ACCESS_TOKEN: { type: 'string', description: 'PAT', 'x-secret': true, 'x-env': 'GITHUB_PERSONAL_ACCESS_TOKEN' },
      GITHUB_HOST: { type: 'string', 'x-env': 'GITHUB_HOST' },
    },
    required: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  })
  const entry = (await engine.list()).find(e => e.slug === 'github-mcp-server')!
  expect(entry.resourceId).toBe('mcp-registry:io.github.github/github-mcp-server')

  await engine.setConfig('github-mcp-server', { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1' })
  await engine.enable('github-mcp-server', 'claude')
  await engine.enable('github-mcp-server', 'codex')
  expect((await claudeJson()).mcpServers['github-mcp-server']).toEqual({
    type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github@1.2.3', 'stdio'],
    env: { LOG: 'info', GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1' },
  })
  expect((await codexToml()).mcp_servers['github-mcp-server']).toEqual({
    command: 'npx', args: ['-y', '@modelcontextprotocol/server-github@1.2.3', 'stdio'],
    env: { LOG: 'info', GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1' },
  })
})

test('remote MCP with a bearer header: Claude gets the header, Codex the env var name, url variables default', async () => {
  const outcome = await engine.installAndEnable('mcp-registry:com.example/bearer')
  expect(outcome.notEnabled.map(n => n.reason)).toEqual(['needs-config', 'needs-config'])
  await engine.setConfig('bearer', { api_key: 'k-1' })
  await engine.enable('bearer', 'claude')
  await engine.enable('bearer', 'codex')
  expect((await claudeJson()).mcpServers.bearer).toEqual({ type: 'http', url: 'https://mcp.example.com/acme/mcp', headers: { Authorization: 'Bearer k-1' } })
  expect((await codexToml()).mcp_servers.bearer).toEqual({ url: 'https://mcp.example.com/acme/mcp', bearer_token_env_var: 'BEARER_API_KEY' })
})

test('Codex refuses SSE and non-Authorization headers with a typed error; Claude still gets them', async () => {
  const keyed = await engine.installAndEnable('mcp-registry:com.example/keyed')
  expect(keyed.notEnabled.find(n => n.target === 'codex')?.reason).toBe('needs-config')
  await engine.setConfig('keyed', { X_API_Key: 'k-2' })
  const status = await engine.getTargetStatus('keyed')
  expect(status.find(s => s.target === 'codex')?.blocker?.reason).toBe('unsupported')
  await engine.enable('keyed', 'claude')
  expect((await claudeJson()).mcpServers.keyed.headers).toEqual({ 'X-API-Key': 'k-2' })
  const err = await engine.enable('keyed', 'codex').catch(e => e)
  expect(err).toBeInstanceOf(CodexMcpUnsupportedError)
  expect([err.reason, err.tool]).toEqual(['headers', 'codex'])

  const sse = await engine.installAndEnable('mcp-registry:com.example/sse-only')
  expect(sse.enabled).toEqual(['claude'])
  expect(sse.notEnabled).toEqual([{ target: 'codex', reason: 'unsupported', message: expect.stringContaining('SSE') }])
  expect((await claudeJson()).mcpServers['sse-only']).toEqual({ type: 'sse', url: 'https://sse.example.com/sse' })
  expect((await engine.enable('sse-only', 'codex').catch(e => e)).reason).toBe('sse')
})

test('skill: files fetched at the pinned commit into the library, linked into both tools under its frontmatter name', async () => {
  const outcome = await engine.installAndEnable('skills-find-skills')
  expect(outcome.slug).toBe('skills-find-skills')
  expect(outcome.enabled).toEqual(['claude', 'codex'])
  const lib = join(aasHome, 'skills', 'skills-find-skills')
  expect(await readFile(join(lib, 'SKILL.md'), 'utf-8')).toBe(SKILL)
  expect(await readFile(join(lib, 'scripts', 'run.sh'), 'utf-8')).toBe('echo hi\n')
  const marker = JSON.parse(await readFile(join(lib, '.agent-store.json'), 'utf-8'))
  expect(marker.source).toEqual({ repo: 'vercel-labs/skills', ref: 'c'.repeat(40), resolvedSha: 'c'.repeat(40), path: 'skills/find-skills' })
  expect(marker.runtimeNames).toEqual({ claude: 'find-skills', codex: 'find-skills' })
  for (const dir of [claudeDir, codexDir]) {
    expect((await lstat(join(dir, 'skills', 'find-skills'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(dir, 'skills', 'find-skills'))).toBe(lib)
  }
  const entry = (await engine.list()).find(e => e.slug === 'skills-find-skills')!
  expect(entry.resourceId).toBe('github:vercel-labs/skills/find-skills')
  expect(entry.deployments).toEqual({
    claude: { path: join(claudeDir, 'skills', 'find-skills'), mode: 'symlink', sourceHash: marker.contentHash },
    codex: { path: join(codexDir, 'skills', 'find-skills'), mode: 'symlink', sourceHash: marker.contentHash },
  })
})

test('provider: config.json starts from the built-in connection; enabling waits for the key', async () => {
  const outcome = await engine.installAndEnable('openrouter')
  expect(outcome.notEnabled.map(n => n.reason)).toEqual(['no-key', 'no-key'])
  expect(JSON.parse(await readFile(join(aasHome, 'providers', 'openrouter', 'config.json'), 'utf-8'))).toEqual({
    baseUrl: 'https://openrouter.ai/api/v1', authType: 'bearer', endpointPath: '/chat/completions', level: 1, apiKey: '',
  })
})

test('a second resource with a taken slug gets its long slug; reinstalling by slug keeps the first', async () => {
  const a = mcpResource('io.github.a/dup-mcp', { packages: [npmPackage('a-mcp')] })
  const b = mcpResource('io.github.b/dup-mcp', { packages: [npmPackage('b-mcp')] })
  globalThis.fetch = serveCatalog([a, b])
  expect((await engine.install(a.id)).slug).toBe('dup-mcp')
  expect((await engine.install(b.id)).slug).toBe('mcp-registry-io-github-b-dup-mcp')
  expect((await engine.install('dup-mcp')).slug).toBe('dup-mcp')
  expect((await engine.list()).map(e => [e.slug, e.resourceId])).toEqual([
    ['dup-mcp', a.id], ['mcp-registry-io-github-b-dup-mcp', b.id],
  ])
})

test('update reinstalls from the catalog id when the version changes', async () => {
  await engine.installAndEnable('mcp-registry:com.example/sse-only')
  expect(await engine.checkUpdates()).toEqual([])
  catalog[4] = { ...sseRemote, version: '2.0.0' }
  globalThis.fetch = serveCatalog(catalog)
  expect(await engine.checkUpdates()).toEqual([{ slug: 'sse-only', currentVersion: '1.0.0', latestVersion: '2.0.0' }])
  expect(await engine.update('sse-only')).toEqual([{ slug: 'sse-only', fromVersion: '1.0.0', toVersion: '2.0.0' }])
  expect((await engine.list())[0].version).toBe('2.0.0')
})

test('an MCP with nothing Agent Store can launch is refused before anything is written', async () => {
  const odd = mcpResource('com.example/odd', { packages: [npmPackage('x', { registryType: 'mcpb' })] })
  globalThis.fetch = serveCatalog([odd])
  const err = await engine.install(odd.id).catch(e => e)
  expect(err.name).toBe('McpNotInstallableError')
  expect(await engine.list()).toEqual([])
})
