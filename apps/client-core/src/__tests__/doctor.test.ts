import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { InstalledItem } from '@as/types'
import { runDoctor, type DoctorPaths } from '../doctor'
import { contentHash, MARKER } from '../skills/store'

let root: string
let p: DoctorPaths

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-doctor-'))
  p = {
    aasHome: join(root, 'agents'),
    claudeConfigDir: join(root, 'claude'),
    claudeJsonPath: join(root, 'claude', '.claude.json'),
    codexConfigDir: join(root, 'codex'),
  }
  mkdirSync(p.aasHome, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function entry(slug: string, category: InstalledItem['category'], enabledFor: InstalledItem['enabledFor']): InstalledItem {
  return { slug, category, version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude', 'codex'], enabledFor }
}

function registry(...items: InstalledItem[]) {
  writeFileSync(join(p.aasHome, 'registry.json'), JSON.stringify({ installed: items }))
}

function skillMd(dir: string, name: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody\n`)
}

async function storeSkill(slug: string, codexName = slug): Promise<string> {
  const dir = join(p.aasHome, 'skills', slug)
  skillMd(dir, codexName)
  const marker = { slug, version: '1.0.0', source: null, contentHash: await contentHash(dir), runtimeNames: { claude: slug, codex: codexName }, manifest: {} }
  writeFileSync(join(dir, MARKER), JSON.stringify(marker))
  return dir
}

function link(slug: string, target: string) {
  mkdirSync(join(p.claudeConfigDir, 'skills'), { recursive: true })
  symlinkSync(target, join(p.claudeConfigDir, 'skills', slug), 'dir')
}

const codes = async () => (await runDoctor(p)).map(f => `${f.level}:${f.code}${f.slug ? `:${f.slug}` : ''}`).sort()

test('a healthy skill and MCP report nothing', async () => {
  link('s', await storeSkill('s'))
  const written = { type: 'stdio', command: 'node', args: ['x.mjs'] }
  mkdirSync(join(p.aasHome, 'mcps', 'm'), { recursive: true })
  writeFileSync(join(p.aasHome, 'mcps', 'm', 'targets.json'), JSON.stringify({ claude: { name: 'm', written, previous: null } }))
  mkdirSync(p.claudeConfigDir, { recursive: true })
  writeFileSync(p.claudeJsonPath, JSON.stringify({ mcpServers: { m: written } }))
  registry(entry('s', 'skill', { claude: true, codex: true }), entry('m', 'mcp', { claude: true, codex: false }))
  expect(await codes()).toEqual([])
})

test('skill drift: missing link, modified content, Codex name clash, orphan marker', async () => {
  const dir = await storeSkill('s', 'shared-name')
  writeFileSync(join(dir, 'extra.md'), 'local edit')
  skillMd(join(p.codexConfigDir, 'skills', 'hand-made'), 'shared-name')
  await storeSkill('orphan')
  registry(entry('s', 'skill', { claude: true, codex: true }))
  expect(await codes()).toEqual([
    'error:claude-link-missing:s',
    'warn:codex-shadowed:s',
    'warn:skill-modified:s',
    'warn:skill-orphan:orphan',
  ])
})

test('a user directory in the Claude skills dir shadows ours; a stale link is reported when disabled', async () => {
  await storeSkill('s')
  skillMd(join(p.claudeConfigDir, 'skills', 's'), 's')
  link('t', await storeSkill('t'))
  registry(entry('s', 'skill', { claude: true, codex: true }), entry('t', 'skill', { claude: false, codex: true }))
  expect(await codes()).toEqual(['error:claude-shadowed:s', 'warn:claude-link-stale:t'])
})

test('old layout: single-file store dir and a copy under $CODEX_HOME/skills', async () => {
  const dir = join(p.aasHome, 'skills', 'old')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ slug: 'old', category: 'skill' }))
  writeFileSync(join(dir, 'skill.md'), 'x')
  skillMd(join(p.codexConfigDir, 'skills', 'old'), 'old')
  registry(entry('old', 'skill', { claude: false, codex: true }))
  expect(await codes()).toEqual(['warn:legacy-copy:old', 'warn:legacy-layout:old'])
})

test('missing content, user-owned dir without marker', async () => {
  skillMd(join(p.aasHome, 'skills', 'mine'), 'mine')
  registry(entry('gone', 'skill', { claude: true, codex: true }), entry('mine', 'skill', { claude: false, codex: true }))
  expect(await codes()).toEqual(['error:skill-content-missing:gone', 'error:skill-marker-missing:mine'])
})

test('MCP drift: missing record, missing entry, edited entry, unreadable config', async () => {
  const written = { command: 'node', args: ['x.mjs'] }
  for (const slug of ['a', 'b', 'c']) mkdirSync(join(p.aasHome, 'mcps', slug), { recursive: true })
  writeFileSync(join(p.aasHome, 'mcps', 'b', 'targets.json'), JSON.stringify({ codex: { name: 'b', written, previous: null } }))
  writeFileSync(join(p.aasHome, 'mcps', 'c', 'targets.json'), JSON.stringify({
    codex: { name: 'c', written, previous: null },
    claude: { name: 'c', written: { type: 'stdio', ...written }, previous: null },
  }))
  mkdirSync(p.codexConfigDir, { recursive: true })
  writeFileSync(join(p.codexConfigDir, 'config.toml'), '[mcp_servers.c]\ncommand = "node"\nargs = ["y.mjs"]\n')
  mkdirSync(p.claudeConfigDir, { recursive: true })
  writeFileSync(p.claudeJsonPath, '{ broken')
  registry(
    entry('a', 'mcp', { claude: false, codex: true }),
    entry('b', 'mcp', { claude: false, codex: true }),
    entry('c', 'mcp', { claude: true, codex: true }),
  )
  expect(await codes()).toEqual([
    'error:config-unreadable:c',
    'error:mcp-missing:b',
    'error:mcp-target-missing:a',
    'warn:mcp-changed-outside:c',
  ])
})
