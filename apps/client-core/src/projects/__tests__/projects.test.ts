import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { parse as parseToml } from '@iarna/toml'
import type { Item, MCPItem, SkillItem } from '@as/types'
import { EngineImpl } from '../../engine'
import { ItemCatalog } from '../../__tests__/helpers/item-catalog'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const base = {
  id: 'x', name: 'x', description: 'x', version: '1.0.0', tags: [], downloads: 0, status: 'published' as const,
  publisher: { id: 'p', slug: 'p', name: 'p', avatarUrl: '', tier: 'community' as const },
  installHook: { steps: [] }, createdAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'] as Array<'claude' | 'codex'>,
}

const SKILL_MD = '---\nname: review-helper\ndescription: Helps review\n---\nbody\n'
const skill: SkillItem = { ...base, slug: 'review', category: 'skill', contentUrl: 'https://raw.test/review/SKILL.md' }

const keyed: MCPItem = {
  ...base, slug: 'keyed', category: 'mcp', transport: 'stdio', templated: true,
  serverCommand: 'npx -y keyed-mcp', command: 'npx', args: ['-y', 'keyed-mcp'], env: { LOG: 'info' },
  configSchema: {
    type: 'object',
    properties: {
      API_KEY: { type: 'string', 'x-env': 'API_KEY', 'x-secret': true },
      REGION: { type: 'string', 'x-env': 'REGION', default: 'eu' },
      OPTIONAL: { type: 'string', 'x-env': 'OPTIONAL' },
    },
    required: ['API_KEY'],
  },
}

const templatedArg: MCPItem = {
  ...base, slug: 'argy', category: 'mcp', transport: 'stdio', templated: true,
  serverCommand: 'npx -y argy --token {token}', command: 'npx', args: ['-y', 'argy', '--token', '{token}'],
  configSchema: { type: 'object', properties: { token: { type: 'string', 'x-template': true, 'x-secret': true } }, required: ['token'] },
}

const bearer: MCPItem = {
  ...base, slug: 'remote', category: 'mcp', transport: 'http', templated: true, url: 'https://mcp.example.com/mcp',
  configSchema: { type: 'object', properties: { api_key: { type: 'string', 'x-bearer': true, 'x-secret': true, 'x-env': 'REMOTE_API_KEY' } }, required: ['api_key'] },
}

const local: MCPItem = {
  ...base, slug: 'localbin', category: 'mcp', transport: 'stdio', serverCommand: './server', configSchema: {},
  installHook: { steps: [{ type: 'file', url: 'https://x.test/server', dest: 'server' }] },
}

let root: string
let proj: string
let paths: { aasHome: string; claudeConfigDir: string; claudeJsonPath: string; codexConfigDir: string }
let engine: EngineImpl
const origFetch = globalThis.fetch

beforeEach(async () => {
  root = await mkdtemp('/tmp/as-projects-')
  proj = join(root, 'repo')
  await mkdir(join(proj, '.git'), { recursive: true })
  paths = {
    aasHome: join(root, 'as'), claudeConfigDir: join(root, 'claude'),
    claudeJsonPath: join(root, 'claude', '.claude.json'), codexConfigDir: join(root, 'codex'),
  }
  const items: Item[] = [skill, keyed, templatedArg, bearer, local]
  engine = new EngineImpl(paths, 'http://store.test', { catalog: new ItemCatalog(() => items) })
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url) === skill.contentUrl) return new Response(SKILL_MD)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(root, { recursive: true, force: true })
})

const read = (p: string) => readFile(join(proj, p), 'utf-8')
const exists = async (p: string) => { try { await stat(p); return true } catch { return false } }
const trustCodex = async () => {
  await mkdir(paths.codexConfigDir, { recursive: true })
  await writeFile(join(paths.codexConfigDir, 'config.toml'), `[projects."${proj}"]\ntrust_level = "trusted"\n`)
}

// ── Registration ─────────────────────────────────────────────────────────────

test('adding the same directory through a trailing slash or a symlink is refused as already registered', async () => {
  const added = await engine.addProject(proj + '/')
  expect(added).toMatchObject({ path: proj, name: 'repo', exists: true })
  await symlink(proj, join(root, 'alias'))
  await expect(engine.addProject(join(root, 'alias'))).rejects.toMatchObject({ reason: 'already-registered' })
  expect(await engine.listProjects()).toHaveLength(1)
})

test('adding a directory that does not exist fails and creates nothing', async () => {
  await expect(engine.addProject(join(root, 'nope'))).rejects.toMatchObject({ reason: 'missing' })
  expect(await exists(join(root, 'nope'))).toBe(false)
})

test('a registered directory that disappears is listed as missing; relocating keeps its id and installs', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'review', { targets: ['claude'] })
  const moved = join(root, 'moved')
  const { rename } = await import('fs/promises')
  await rename(proj, moved)
  expect((await engine.listProjects())[0].exists).toBe(false)
  const relocated = await engine.relocateProject(p.id, moved)
  expect(relocated).toMatchObject({ id: p.id, path: moved, exists: true })
  const detail = await engine.getProject(moved)
  expect(detail.skills[0]).toMatchObject({ slug: 'review', managed: true })
})

test('removing a project deletes no file', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'review')
  await engine.removeProject(proj)
  expect(await engine.listProjects()).toEqual([])
  expect(await read('.claude/skills/review-helper/SKILL.md')).toBe(SKILL_MD)
  await expect(engine.getProject(proj)).rejects.toMatchObject({ reason: 'project-not-found' })
})

// ── Skills ───────────────────────────────────────────────────────────────────

test('a skill is copied into both agents\' project directories, never linked to the library', async () => {
  const p = await engine.addProject(proj)
  const result = await engine.installToProject(p.id, 'review')
  expect(result.installed.map(i => i.agent)).toEqual(['claude', 'codex'])
  for (const dir of ['.claude/skills/review-helper', '.agents/skills/review-helper']) {
    expect(await read(`${dir}/SKILL.md`)).toBe(SKILL_MD)
    expect((await import('fs/promises')).lstat(join(proj, dir)).then(s => s.isSymbolicLink())).resolves.toBe(false)
    expect(await exists(join(proj, dir, '.agent-store.json'))).toBe(false)
  }
  // Nothing at user level.
  expect(await exists(join(paths.claudeConfigDir, 'skills'))).toBe(false)
  expect(await engine.list()).toEqual([])
  const detail = await engine.getProject(p.id)
  expect(detail.skills).toEqual([expect.objectContaining({ name: 'review-helper', slug: 'review', managed: true, agents: ['claude', 'codex'] })])
})

test('a same-named directory that Agent Store did not write is refused and left alone', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.claude/skills/review-helper'), { recursive: true })
  await writeFile(join(proj, '.claude/skills/review-helper/SKILL.md'), 'mine')
  await expect(engine.installToProject(p.id, 'review')).rejects.toMatchObject({ name: 'ProjectConflictError', reason: 'not-ours', tool: 'claude' })
  expect(await read('.claude/skills/review-helper/SKILL.md')).toBe('mine')
  expect(await exists(join(proj, '.agents/skills/review-helper'))).toBe(false)
})

test('Codex sees another skill with the same frontmatter name: refused', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.agents/skills/other'), { recursive: true })
  await writeFile(join(proj, '.agents/skills/other/SKILL.md'), '---\nname: review-helper\ndescription: d\n---\n')
  await expect(engine.installToProject(p.id, 'review', { targets: ['codex'] })).rejects.toMatchObject({ reason: 'name-clash' })
})

test('project skills not installed by Agent Store are listed read-only', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.claude/skills/team-skill'), { recursive: true })
  await writeFile(join(proj, '.claude/skills/team-skill/SKILL.md'), '---\nname: team-skill\ndescription: d\n---\n')
  const detail = await engine.getProject(p.id)
  expect(detail.skills).toEqual([expect.objectContaining({ name: 'team-skill', managed: false, agents: ['claude'] })])
  await expect(engine.uninstallFromProject(p.id, 'team-skill')).rejects.toMatchObject({ reason: 'not-installed' })
})

test('uninstall removes only our unchanged copy; an edited copy needs --force', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'review')
  await writeFile(join(proj, '.agents/skills/review-helper/extra.md'), 'edit')
  const detail = await engine.getProject(p.id)
  expect(detail.skills[0].locations.find(l => l.agent === 'codex')?.modified).toBe(true)
  await expect(engine.uninstallFromProject(p.id, 'review')).rejects.toMatchObject({ reason: 'modified' })
  expect(await exists(join(proj, '.claude/skills/review-helper'))).toBe(true)
  await engine.uninstallFromProject(p.id, 'review', { targets: ['claude'] })
  expect(await exists(join(proj, '.claude/skills/review-helper'))).toBe(false)
  await engine.uninstallFromProject(p.id, 'review', { force: true })
  expect(await exists(join(proj, '.agents/skills/review-helper'))).toBe(false)
  expect((await engine.getProject(p.id)).skills).toEqual([])
})

// ── MCP ──────────────────────────────────────────────────────────────────────

test('an MCP entry references its key and inlines public defaults; no value is written', async () => {
  const p = await engine.addProject(proj)
  await engine.setProjectEnv(p.id, 'API_KEY', 'sk-secret')
  const result = await engine.installToProject(p.id, 'keyed')
  expect(result.env).toEqual(['API_KEY'])
  const mcpJson = JSON.parse(await read('.mcp.json'))
  expect(mcpJson.mcpServers.keyed).toEqual({
    type: 'stdio', command: 'npx', args: ['-y', 'keyed-mcp'], env: { LOG: 'info', REGION: 'eu', API_KEY: '${API_KEY}' },
  })
  const codex = parseToml(await read('.codex/config.toml')) as { mcp_servers: Record<string, unknown> }
  expect(codex.mcp_servers['keyed']).toEqual({ command: 'npx', args: ['-y', 'keyed-mcp'], env_vars: ['API_KEY'], env: { LOG: 'info', REGION: 'eu' } })
  expect(await read('.mcp.json')).not.toContain('sk-secret')
  expect(await read('.codex/config.toml')).not.toContain('sk-secret')
  const stored = await readFile(join(paths.aasHome, 'project-env.json'), 'utf-8')
  expect(stored).toContain('sk-secret')
  expect((await stat(join(paths.aasHome, 'project-env.json'))).mode & 0o777).toBe(0o600)
  expect(await engine.getProjectEnvValues(proj)).toEqual({ API_KEY: 'sk-secret' })
})

test('the detail reports missing keys, approval, trust and user-level overrides', async () => {
  const p = await engine.addProject(proj)
  await mkdir(paths.claudeConfigDir, { recursive: true })
  await writeFile(paths.claudeJsonPath, JSON.stringify({ mcpServers: { keyed: { type: 'stdio', command: 'old' } } }))
  await engine.installToProject(p.id, 'keyed')
  let detail = await engine.getProject(p.id)
  expect(detail.codexTrusted).toBe(false)
  expect(detail.env).toEqual([{ name: 'API_KEY', stored: false, usedBy: ['keyed'] }])
  const mcp = detail.mcps[0]
  expect(mcp).toMatchObject({ name: 'keyed', slug: 'keyed', managed: true, agents: [], missingEnv: ['API_KEY'] })
  expect(mcp.locations.find(l => l.agent === 'claude')).toMatchObject({ approval: 'pending', active: false, overridesUser: true })
  expect(mcp.locations.find(l => l.agent === 'codex')).toMatchObject({ active: false })

  await writeFile(join(paths.claudeConfigDir, 'settings.json'), JSON.stringify({ enableAllProjectMcpServers: true }))
  await trustCodex()
  await engine.setProjectEnv(p.id, 'API_KEY', 'v')
  detail = await engine.getProject(p.id)
  expect(detail.codexTrusted).toBe(true)
  expect(detail.mcps[0]).toMatchObject({ agents: ['claude', 'codex'], missingEnv: [], overridesUser: true })
})

test('MCP entries Agent Store did not write are listed read-only, a local entry shadows the shared one', async () => {
  const p = await engine.addProject(proj)
  await writeFile(join(proj, '.mcp.json'), JSON.stringify({ mcpServers: { team: { command: 'x', env: { T: '${TEAM_TOKEN}', O: '${OPT:-none}' } } } }))
  await mkdir(paths.claudeConfigDir, { recursive: true })
  await writeFile(paths.claudeJsonPath, JSON.stringify({ projects: { [proj]: { mcpServers: { team: { command: 'mine' } } } } }))
  const [mcp] = (await engine.getProject(p.id)).mcps
  expect(mcp).toMatchObject({ name: 'team', managed: false, agents: ['claude'], missingEnv: ['TEAM_TOKEN'] })
  expect(mcp.locations.map(l => [l.scope, l.active, l.shadowedBy])).toEqual([['local', true, undefined], ['project', false, 'local']])
  // Our entry was replaced by someone else's: a reinstall does not overwrite it.
  await engine.installToProject(p.id, 'keyed', { targets: ['claude'] })
  const json = JSON.parse(await read('.mcp.json'))
  expect(Object.keys(json.mcpServers)).toEqual(['team', 'keyed'])
  json.mcpServers.keyed = { command: 'theirs' }
  await writeFile(join(proj, '.mcp.json'), JSON.stringify(json))
  await expect(engine.installToProject(p.id, 'keyed', { targets: ['claude'] })).rejects.toMatchObject({ reason: 'modified' })
})

test('a same-named MCP entry Agent Store did not write is refused for that file', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.codex'), { recursive: true })
  await writeFile(join(proj, '.codex/config.toml'), '# team\n[mcp_servers.keyed]\ncommand = "theirs"\n')
  await expect(engine.installToProject(p.id, 'keyed')).rejects.toMatchObject({ reason: 'not-ours', tool: 'codex' })
  expect(await exists(join(proj, '.mcp.json'))).toBe(false)
  expect(await read('.codex/config.toml')).toBe('# team\n[mcp_servers.keyed]\ncommand = "theirs"\n')
})

test('the Codex file keeps its other tables and comments; uninstall removes only our table', async () => {
  const p = await engine.addProject(proj)
  await mkdir(join(proj, '.codex'), { recursive: true })
  const before = '# team settings\nmodel = "o3" # pinned\n\n[mcp_servers.other]\ncommand = "a"\n'
  await writeFile(join(proj, '.codex/config.toml'), before)
  await engine.installToProject(p.id, 'keyed', { targets: ['codex'] })
  const text = await read('.codex/config.toml')
  expect(text.startsWith(before)).toBe(true)
  expect(text).toContain('[mcp_servers.keyed]')
  await engine.uninstallFromProject(p.id, 'keyed')
  expect(await read('.codex/config.toml')).toBe(before)
})

test('an edited MCP entry is not removed without --force', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'keyed', { targets: ['claude'] })
  const json = JSON.parse(await read('.mcp.json'))
  json.mcpServers.keyed.args.push('--debug')
  json.other = true
  await writeFile(join(proj, '.mcp.json'), JSON.stringify(json))
  expect((await engine.getProject(p.id)).mcps[0].locations[0].modified).toBe(true)
  await expect(engine.uninstallFromProject(p.id, 'keyed')).rejects.toMatchObject({ reason: 'modified' })
  await engine.uninstallFromProject(p.id, 'keyed', { force: true })
  expect(JSON.parse(await read('.mcp.json'))).toEqual({ mcpServers: {}, other: true })
})

test('a value Codex cannot read from the environment skips Codex, or refuses when Codex was the only target', async () => {
  const p = await engine.addProject(proj)
  const result = await engine.installToProject(p.id, 'argy')
  expect(result.installed.map(i => i.agent)).toEqual(['claude'])
  expect(result.skipped).toEqual([expect.objectContaining({ agent: 'codex', reason: 'codex-reference' })])
  expect(JSON.parse(await read('.mcp.json')).mcpServers.argy.args).toEqual(['-y', 'argy', '--token', '${TOKEN}'])
  expect(await exists(join(proj, '.codex/config.toml'))).toBe(false)
  await engine.uninstallFromProject(p.id, 'argy')
  await expect(engine.installToProject(p.id, 'argy', { targets: ['codex'] })).rejects.toMatchObject({ reason: 'codex-reference' })
})

test('a bearer token becomes a header reference for Claude Code and bearer_token_env_var for Codex', async () => {
  const p = await engine.addProject(proj)
  await engine.installToProject(p.id, 'remote')
  expect(JSON.parse(await read('.mcp.json')).mcpServers.remote).toEqual({
    type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer ${REMOTE_API_KEY}' },
  })
  const codex = parseToml(await read('.codex/config.toml')) as { mcp_servers: Record<string, unknown> }
  expect(codex.mcp_servers['remote']).toEqual({ url: 'https://mcp.example.com/mcp', bearer_token_env_var: 'REMOTE_API_KEY' })
})

test('an MCP server that runs files from Agent Store\'s own directory is not installable into a project', async () => {
  const p = await engine.addProject(proj)
  await expect(engine.installToProject(p.id, 'localbin')).rejects.toMatchObject({ reason: 'not-portable' })
})

test('stored values are rejected with a bad name or a newline, and unset drops them', async () => {
  const p = await engine.addProject(proj)
  await expect(engine.setProjectEnv(p.id, '1BAD', 'v')).rejects.toThrow('Invalid environment variable name')
  await expect(engine.setProjectEnv(p.id, 'GOOD', 'a\nb')).rejects.toThrow('newline')
  await engine.setProjectEnv(p.id, 'GOOD', 'v')
  await engine.unsetProjectEnv(p.id, 'GOOD')
  expect(await engine.getProjectEnvValues(p.id)).toEqual({})
})
