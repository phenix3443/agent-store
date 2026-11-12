import { test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, readdirSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { InstalledItem } from '@as/types'
import { runMigrate, type MigratePaths } from '../migrate'
import { runDoctor } from '../doctor'
import { MARKER, readMarker } from '../skills/store'
import { parse as parseToml } from '@iarna/toml'

const BODY = '---\nname: old-name\ndescription: d\n---\nbody\n'
const NOW = new Date('2026-10-22T00:00:00Z')

let root: string
let p: MigratePaths

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-migrate-'))
  p = { aasHome: join(root, 'agents'), claudeConfigDir: join(root, 'claude'), codexConfigDir: join(root, 'codex') }
  mkdirSync(p.aasHome, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function entry(slug: string, enabledFor: InstalledItem['enabledFor']): InstalledItem {
  return { slug, category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'], enabledFor }
}

function registry(...items: InstalledItem[]) {
  writeFileSync(join(p.aasHome, 'registry.json'), JSON.stringify({ installed: items }))
}

function file(path: string, body: string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body)
}

/** What Agent Store wrote before markers: manifest.json + skill.md, and SKILL.md copies in each tool dir. */
function oldInstall(slug: string, body = BODY) {
  file(join(p.aasHome, 'skills', slug, 'manifest.json'), JSON.stringify({ slug, category: 'skill', version: '0.9.0' }))
  file(join(p.aasHome, 'skills', slug, 'skill.md'), body)
  file(join(p.claudeConfigDir, 'skills', slug, 'SKILL.md'), body)
  file(join(p.codexConfigDir, 'skills', slug, 'SKILL.md'), body)
}

const backupOf = () => join(root, 'agents', 'backups', 'migrate-2026-10-22T00-00-00-000Z')

test('converts the old layout, backs up first, deploys to both tools and leaves doctor clean', async () => {
  oldInstall('s')
  registry(entry('s', { claude: true, codex: false }))

  const res = await runMigrate(p, NOW)
  expect(res.steps.filter(s => s.result !== 'done')).toEqual([])
  const backup = backupOf()
  expect(res.backupDir).toBe(backup)

  const dir = join(p.aasHome, 'skills', 's')
  expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toBe(BODY)
  expect(readdirSync(dir).sort()).toEqual([MARKER, 'SKILL.md'].sort())
  const marker = await readMarker(dir)
  expect(marker?.runtimeNames).toEqual({ claude: 's', codex: 'old-name' })
  expect(marker?.version).toBe('0.9.0')

  expect(lstatSync(join(p.claudeConfigDir, 'skills', 's')).isSymbolicLink()).toBe(true)
  expect(readlinkSync(join(p.claudeConfigDir, 'skills', 's'))).toBe(dir)
  // Before markers Codex read every installed skill, so it gets a deployment too.
  expect(readlinkSync(join(p.codexConfigDir, 'skills', 's'))).toBe(dir)

  for (const rel of ['store/s/skill.md', 'store/s/manifest.json', 'claude/s/SKILL.md', 'codex/s/SKILL.md']) {
    expect(existsSync(join(backup, rel))).toBe(true)
  }
  const reg = JSON.parse(readFileSync(join(p.aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor).toEqual({ claude: true, codex: true })
  expect(Object.keys(reg.installed[0].deployments).sort()).toEqual(['claude', 'codex'])

  expect(await runDoctor({ ...p, claudeJsonPath: join(p.claudeConfigDir, '.claude.json'), legacyHome: join(root, 'none') })).toEqual([])
})

test('running it again changes nothing', async () => {
  oldInstall('s')
  registry(entry('s', { claude: true, codex: true }))
  await runMigrate(p, NOW)
  const again = await runMigrate(p, new Date('2026-10-23T00:00:00Z'))
  expect(again.steps).toEqual([])
  expect(existsSync(again.backupDir)).toBe(false)
})

test('copies the user changed and directories without our layout are left alone', async () => {
  oldInstall('s')
  file(join(p.claudeConfigDir, 'skills', 's', 'SKILL.md'), BODY + 'my notes\n')
  file(join(p.aasHome, 'skills', 'mine', 'SKILL.md'), BODY)
  registry(entry('s', { claude: true, codex: true }), entry('mine', { claude: false, codex: true }))

  const res = await runMigrate(p, NOW)
  expect(res.steps.map(s => `${s.result}:${s.slug}`)).toEqual(['done:s', 'skipped:s', 'done:s', 'skipped:s', 'done:s', 'skipped:mine'])
  // The user's Claude copy is untouched, so Claude gets no deployment and the registry says so.
  expect(readFileSync(join(p.claudeConfigDir, 'skills', 's', 'SKILL.md'), 'utf-8')).toContain('my notes')
  expect(res.steps[3].message).toStartWith('claude: Refusing to replace')
  const reg = JSON.parse(readFileSync(join(p.aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor).toEqual({ claude: false, codex: true })
  expect(readFileSync(join(p.aasHome, 'skills', 'mine', 'SKILL.md'), 'utf-8')).toBe(BODY)
  expect(existsSync(join(p.aasHome, 'skills', 'mine', MARKER))).toBe(false)
})

test('directories next to the skill that migrate did not create are left alone', async () => {
  oldInstall('probe')
  file(join(p.aasHome, 'skills', 'probe.as-migrate', 'user-data'), 'mine\n')
  file(join(p.aasHome, 'skills', 'probe.as-old', 'user-data'), 'mine too\n')
  registry(entry('probe', { claude: false, codex: true }))

  const res = await runMigrate(p, NOW)
  expect(res.steps.filter(s => s.result === 'error')).toEqual([])
  expect(readFileSync(join(p.aasHome, 'skills', 'probe.as-migrate', 'user-data'), 'utf-8')).toBe('mine\n')
  expect(readFileSync(join(p.aasHome, 'skills', 'probe.as-old', 'user-data'), 'utf-8')).toBe('mine too\n')
  expect(readdirSync(join(p.aasHome, 'skills')).sort()).toEqual(['probe', 'probe.as-migrate', 'probe.as-old'])
})

test('a skill.md without frontmatter is not converted', async () => {
  oldInstall('bare', 'no frontmatter\n')
  registry(entry('bare', { claude: false, codex: true }))
  const res = await runMigrate(p, NOW)
  expect(res.steps.map(s => s.result)).toEqual(['error'])
  expect(readFileSync(join(p.aasHome, 'skills', 'bare', 'skill.md'), 'utf-8')).toBe('no frontmatter\n')
})

const PKG_SKILL = '---\nname: pkg-skill\ndescription: d\n---\npkg\n'

/**
 * What the removed agent-package prototype left: packages-registry.json, the package
 * dir, and tool entries under the oldest (`local.pkg#x`) and later (`local-pkg-x`) names.
 */
function oldPackageInstall() {
  const dir = join(p.aasHome, 'packages', 'local.pkg')
  file(join(dir, 'agent-package.json'), JSON.stringify({
    schemaVersion: 3, name: 'pkg', displayName: 'Pkg', version: '1.0.0', description: 'd',
    publisher: { slug: 'local', name: 'Local' },
    components: [
      { id: 'sk', type: 'skill', version: '1.0.0', source: { repo: 'local/pkg', path: 'SKILL.md' }, targets: { claude: true, codex: true } },
      { id: 'fs', type: 'mcpServer', version: '1.0.0', transport: 'http', url: 'https://mcp.example.com', targets: { claude: true, codex: true } },
      { id: 'prov', type: 'provider', version: '1.0.0', configSchema: {}, provider: {}, targets: { codex: true } },
    ],
  }))
  file(join(dir, 'sources', 'local/pkg', 'SKILL.md'), PKG_SKILL)
  file(join(dir, 'package-config.json'), JSON.stringify({ prov: { apiKey: 'k', baseUrl: 'https://llm.example.com' } }))
  file(join(p.aasHome, 'packages-registry.json'), JSON.stringify({ installedPackages: [
    { packageId: 'local.pkg', packageDir: dir, version: '1.0.0', installedAt: '', updatedAt: '', targets: { claude: true, codex: true } },
  ] }))
  file(join(p.claudeConfigDir, 'skills', 'local.pkg#sk', 'SKILL.md'), PKG_SKILL)
  file(join(p.claudeConfigDir, 'skills', 'local-pkg-sk', 'SKILL.md'), PKG_SKILL)
  file(join(p.codexConfigDir, 'skills', 'local.pkg#sk', 'SKILL.md'), PKG_SKILL)
  file(join(p.claudeConfigDir, '.claude.json'), JSON.stringify({ mcpServers: {
    'local.pkg#fs': { type: 'http', url: 'https://mcp.example.com' }, mine: { type: 'http', url: 'https://mine' },
  } }))
  file(join(p.codexConfigDir, 'config.toml'), [
    'model_provider = "local.pkg#prov"',
    '[model_providers."local.pkg#prov"]', 'name = "prov"', 'base_url = "https://llm.example.com"',
    '[mcp_servers."local-pkg-fs"]', 'url = "https://mcp.example.com"',
    '[mcp_servers.mine]', 'url = "https://mine"', '',
  ].join('\n'))
}

test('the agent-package prototype is retired: its skills and MCP entries go to the backup, providers are reported', async () => {
  oldPackageInstall()
  const res = await runMigrate(p, NOW)
  expect(res.steps.filter(s => s.result === 'error')).toEqual([])
  expect(res.steps.filter(s => s.result === 'done').length).toBe(6)
  expect(res.steps.filter(s => s.result === 'skipped').map(s => s.message)).toEqual([
    expect.stringContaining('model_providers "local.pkg#prov": set by this package\'s provider; left in place'),
  ])

  expect(readdirSync(join(p.claudeConfigDir, 'skills'))).toEqual([])
  expect(readdirSync(join(p.codexConfigDir, 'skills'))).toEqual([])
  const claude = JSON.parse(readFileSync(join(p.claudeConfigDir, '.claude.json'), 'utf-8'))
  expect(Object.keys(claude.mcpServers)).toEqual(['mine'])
  const codex = parseToml(readFileSync(join(p.codexConfigDir, 'config.toml'), 'utf-8')) as {
    model_provider: string; mcp_servers: Record<string, unknown>; model_providers: Record<string, unknown>
  }
  expect(Object.keys(codex.mcp_servers)).toEqual(['mine'])
  expect(codex.model_provider).toBe('local.pkg#prov')
  expect(Object.keys(codex.model_providers)).toEqual(['local.pkg#prov'])
  expect(existsSync(join(p.aasHome, 'packages', 'local.pkg'))).toBe(false)
  expect(existsSync(join(p.aasHome, 'packages-registry.json'))).toBe(false)

  const backup = backupOf()
  for (const rel of [
    'packages/claude/skills/local.pkg#sk/SKILL.md', 'packages/claude/skills/local-pkg-sk/SKILL.md',
    'packages/codex/skills/local.pkg#sk/SKILL.md', 'packages/claude/.claude.json', 'packages/codex/config.toml',
    'packages/store/local.pkg/agent-package.json', 'packages/packages-registry.json',
  ]) {
    expect(existsSync(join(backup, rel))).toBe(true)
  }
  expect(readFileSync(join(backup, 'packages/codex/config.toml'), 'utf-8')).toContain('local-pkg-fs')

  const again = await runMigrate(p, new Date('2026-10-23T00:00:00Z'))
  expect(again.steps).toEqual([])
})

test('a package skill dir the user changed is left alone, and so is the package', async () => {
  oldPackageInstall()
  file(join(p.claudeConfigDir, 'skills', 'local.pkg#sk', 'notes.md'), 'mine')
  const res = await runMigrate(p, NOW)
  expect(res.steps.filter(s => s.result === 'skipped').map(s => s.message)).toContain(
    `${join(p.claudeConfigDir, 'skills', 'local.pkg#sk')} differs from the package's skill, so it is treated as the user's and left alone`,
  )
  expect(res.steps.some(s => s.result === 'error')).toBe(false)
  expect(existsSync(join(p.claudeConfigDir, 'skills', 'local.pkg#sk', 'notes.md'))).toBe(true)
  expect(existsSync(join(p.aasHome, 'packages', 'local.pkg', 'agent-package.json'))).toBe(true)
  expect(JSON.parse(readFileSync(join(p.aasHome, 'packages-registry.json'), 'utf-8')).installedPackages[0].packageId).toBe('local.pkg')
})

test('an MCP entry the user changed is left alone', async () => {
  oldPackageInstall()
  file(join(p.claudeConfigDir, '.claude.json'), JSON.stringify({ mcpServers: { 'local.pkg#fs': { type: 'http', url: 'https://moved.example' } } }))
  const res = await runMigrate(p, NOW)
  expect(res.steps.filter(s => s.result === 'skipped').map(s => s.message)).toContain(
    `${join(p.claudeConfigDir, '.claude.json')} mcpServers["local.pkg#fs"] differs from the package's server, so it is treated as the user's and left alone`,
  )
  expect(JSON.parse(readFileSync(join(p.claudeConfigDir, '.claude.json'), 'utf-8')).mcpServers['local.pkg#fs'].url).toBe('https://moved.example')
})

test('package ids and component ids that would leave their directory are refused before anything is touched', async () => {
  oldPackageInstall()
  const outside = join(p.aasHome, 'outside')
  file(join(outside, 'agent-package.json'), '{}')
  file(join(p.aasHome, 'packages-registry.json'), JSON.stringify({ installedPackages: [
    { packageId: '../outside', targets: { claude: true } },
    { packageId: 'local.pkg', targets: { claude: true, codex: true } },
  ] }))
  const manifestPath = join(p.aasHome, 'packages', 'local.pkg', 'agent-package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  manifest.components[0].id = '../../escape'
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const registryBefore = readFileSync(join(p.aasHome, 'packages-registry.json'), 'utf-8')

  const res = await runMigrate(p, NOW)
  expect(res.steps.map(s => [s.slug, s.result])).toEqual([['../outside', 'error'], ['local.pkg', 'error']])
  expect(res.steps.every(s => s.message.includes('Invalid slug'))).toBe(true)
  expect(existsSync(join(outside, 'agent-package.json'))).toBe(true)
  expect(readFileSync(join(p.aasHome, 'packages-registry.json'), 'utf-8')).toBe(registryBefore)
  expect(existsSync(join(p.claudeConfigDir, 'skills', 'local.pkg#sk'))).toBe(true)
})

test('a packages-registry.json that does not parse is reported and left as it is', async () => {
  file(join(p.aasHome, 'packages-registry.json'), '{"installedPackages": [')
  const res = await runMigrate(p, NOW)
  expect(res.steps.map(s => s.result)).toEqual(['error'])
  expect(readFileSync(join(p.aasHome, 'packages-registry.json'), 'utf-8')).toBe('{"installedPackages": [')
})
