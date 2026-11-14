import { test, expect, beforeEach, afterEach } from 'bun:test'
import { createHash } from 'crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import type { CatalogSearchResult } from '@as/types'
import { EngineImpl } from '../../engine'
import type { Catalog } from '../../catalog'
import { ImportUndoConflictError } from '../apply'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

let root: string
let home: string
let claude: string
let codex: string
let agents: string
let claudeJson: string
let codexToml: string
let engine: EngineImpl
let catalog: Catalog

const offlineCatalog: Catalog = {
  search: async () => ({ resources: [], nextOffset: null, offline: true }),
  get: async () => { throw new Error('offline') },
  resolveItem: async () => { throw new Error('offline') },
}

function makeEngine(c: Catalog = offlineCatalog) {
  catalog = c
  engine = new EngineImpl({ aasHome: home, claudeConfigDir: claude, claudeJsonPath: claudeJson, codexConfigDir: codex }, 'http://localhost:1', { catalog, agentsSkillsDir: agents })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-import-'))
  home = join(root, 'agent-store')
  claude = join(root, 'claude')
  codex = join(root, 'codex')
  agents = join(root, 'agents', 'skills')
  claudeJson = join(claude, '.claude.json')
  codexToml = join(codex, 'config.toml')
  for (const d of [join(claude, 'skills'), join(codex, 'skills'), agents]) mkdirSync(d, { recursive: true })
  makeEngine()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function skill(dir: string, name: string, body = 'body\n', extra: Record<string, string> = {}) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n${body}`)
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
}

/**
 * Every path under `dirs` with its type, mode, content (or link target) and, for files, mtime.
 * Directory mtimes are left out: renaming a directory to another parent may touch its own.
 */
function snapshot(...dirs: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name)
      const st = lstatSync(full)
      const key = relative(root, full)
      if (st.isSymbolicLink()) out[key] = `L ${readlinkSync(full)}`
      else if (st.isDirectory()) { out[key] = `D ${st.mode & 0o777}`; walk(full) }
      else out[key] = `F ${st.mode & 0o777} ${st.mtimeMs} ${createHash('sha256').update(readFileSync(full)).digest('hex')}`
    }
  }
  for (const d of dirs) if (existsSync(d)) walk(d)
  return out
}

const toolSide = () => snapshot(claude, codex, agents)

function mcpConfigs() {
  mkdirSync(claude, { recursive: true })
  writeFileSync(claudeJson, JSON.stringify({
    numStartups: 3,
    mcpServers: {
      github: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github', '--token=ghp_SECRETVALUE123'], env: { GITHUB_TOKEN: 'ghp_ENVSECRET' }, timeout: 30 },
      remote: { type: 'http', url: 'https://user:pw@mcp.example.com/mcp?key=URLSECRET', headers: { Authorization: 'Bearer HEADERSECRET' } },
    },
  }, null, 2))
  writeFileSync(codexToml, '# my codex config\nmodel = "o3"\n\n[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-github"]\n\n[mcp_servers.github.env]\nGITHUB_TOKEN = "ghp_CODEXSECRET"\n')
}

test('scan groups identical copies, splits differing ones and lists what cannot be imported', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes')
  skill(join(codex, 'skills', 'notes'), 'notes')
  skill(join(claude, 'skills', 'review'), 'review', 'claude version\n')
  skill(join(codex, 'skills', 'review'), 'review', 'codex version\n')
  skill(join(root, 'dotfiles', 'linked'), 'linked')
  symlinkSync(join(root, 'dotfiles', 'linked'), join(claude, 'skills', 'linked'), 'dir')
  skill(join(agents, 'escapes'), 'escapes')
  symlinkSync('../../outside.md', join(agents, 'escapes', 'ref.md'))
  skill(join(claude, 'skills', '.hidden'), 'hidden')
  mkdirSync(join(claude, 'skills', 'not-a-skill'))

  const scan = await engine.scanImports()
  const byId = Object.fromEntries(scan.skills.map(s => [s.id, s]))
  expect(Object.keys(byId).sort()).toEqual(['skill:escapes', 'skill:linked', 'skill:notes', 'skill:review@claude', 'skill:review@codex'])
  expect(byId['skill:notes'].locations.map(l => l.agent)).toEqual(['claude', 'codex'])
  expect(byId['skill:notes'].importable).toBe(true)
  expect(byId['skill:linked']).toMatchObject({ importable: false, reason: 'symlink' })
  expect(byId['skill:escapes']).toMatchObject({ importable: false, reason: 'external-link', locations: [{ agent: 'codex', root: 'agents' }] })
  expect(scan.catalogChecked).toBe(false)
  expect(scan.agents.map(a => [a.agent, a.binary, a.detected])).toEqual([['claude', null, true], ['codex', null, true]])
})

test('scan leaves out secrets, entries Agent Store wrote and unparseable files', async () => {
  mcpConfigs()
  const scan = await engine.scanImports()
  const text = JSON.stringify(scan)
  for (const secret of ['SECRETVALUE', 'ENVSECRET', 'URLSECRET', 'HEADERSECRET', 'CODEXSECRET', ':pw@']) expect(text).not.toContain(secret)
  const github = scan.mcps.find(m => m.id === 'mcp:github')!
  expect(github.entries.map(e => e.agent)).toEqual(['claude', 'codex'])
  expect(github.entries[0]).toMatchObject({ transport: 'stdio', command: 'npx', envNames: ['GITHUB_TOKEN'], lossyKeys: ['timeout'] })
  expect(github.entries[0].args).toEqual(['-y', '@modelcontextprotocol/server-github', '--token=***'])
  expect(scan.mcps.find(m => m.id === 'mcp:remote')!.entries[0]).toMatchObject({ transport: 'http', headerNames: ['Authorization'] })

  writeFileSync(codexToml, 'this is = = not toml SECRET')
  const broken = await engine.scanImports()
  expect(broken.problems.map(p => p.path)).toEqual([codexToml])
  expect(JSON.stringify(broken.problems)).not.toContain('SECRET')
  expect(broken.mcps.find(m => m.id === 'mcp:github')!.entries.map(e => e.agent)).toEqual(['claude'])
})

test('apply moves a skill into the library, links it back for each agent, and undo restores every byte', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes', 'body\n', { 'scripts/run.sh': '#!/bin/sh\n', 'refs/a.md': 'a' })
  chmodSync(join(claude, 'skills', 'notes', 'scripts', 'run.sh'), 0o755)
  symlinkSync('refs/a.md', join(claude, 'skills', 'notes', 'alias.md'))
  utimesSync(join(claude, 'skills', 'notes', 'refs', 'a.md'), new Date('2025-01-01'), new Date('2025-01-01'))
  skill(join(codex, 'skills', 'notes'), 'notes', 'body\n', { 'scripts/run.sh': '#!/bin/sh\n', 'refs/a.md': 'a' })
  chmodSync(join(codex, 'skills', 'notes', 'scripts', 'run.sh'), 0o755)
  symlinkSync('refs/a.md', join(codex, 'skills', 'notes', 'alias.md'))
  mcpConfigs()
  const before = toolSide()
  const claudeBytes = readFileSync(claudeJson)
  const codexBytes = readFileSync(codexToml)

  const result = await engine.applyImport(['skill:notes', 'mcp:github'])
  expect(result.items.map(i => [i.id, i.slug, i.agents])).toEqual([['skill:notes', 'notes', ['claude', 'codex']], ['mcp:github', 'github', ['claude', 'codex']]])
  const lib = join(home, 'skills', 'notes')
  expect(readlinkSync(join(claude, 'skills', 'notes'))).toBe(lib)
  expect(readlinkSync(join(codex, 'skills', 'notes'))).toBe(lib)
  expect(existsSync(join(lib, '.agent-store.json'))).toBe(true)
  expect(readFileSync(claudeJson).equals(claudeBytes)).toBe(true)
  expect(readFileSync(codexToml).equals(codexBytes)).toBe(true)
  const listed = await engine.list()
  expect(listed.find(e => e.slug === 'notes')).toMatchObject({ category: 'skill', version: 'local', enabledFor: { claude: true, codex: true } })
  expect(listed.find(e => e.slug === 'github')).toMatchObject({ category: 'mcp', enabledFor: { claude: true, codex: true }, imported: { importId: result.importId } })
  expect((await engine.scanImports()).skills).toEqual([])
  expect((await engine.scanImports()).mcps.map(m => m.id)).toEqual(['mcp:remote'])
  expect(lstatSync(join(home, 'imports', result.importId, 'import.json')).mode & 0o777).toBe(0o600)
  expect(lstatSync(join(home, 'mcps', 'github', 'manifest.json')).mode & 0o777).toBe(0o600)
  expect(await engine.checkUpdates()).toEqual([])

  const undone = await engine.undoImport()
  expect(undone.items.map(i => [i.slug, i.result])).toEqual([['github', 'bytes'], ['notes', 'bytes']])
  expect(toolSide()).toEqual(before)
  expect(readFileSync(claudeJson).equals(claudeBytes)).toBe(true)
  expect(readFileSync(codexToml).equals(codexBytes)).toBe(true)
  expect(await engine.list()).toEqual([])
  expect(existsSync(lib)).toBe(false)
  expect(existsSync(join(home, 'mcps', 'github'))).toBe(false)
  expect((await engine.listImports()).map(r => r.state)).toEqual(['undone'])
  await expect(engine.undoImport()).rejects.toThrow('Nothing to undo')
})

test('an imported MCP entry follows the ownership rules, and undo writes back one disabled since', async () => {
  mcpConfigs()
  const original = JSON.parse(readFileSync(claudeJson, 'utf-8')).mcpServers.github
  await engine.applyImport(['mcp:github'])
  await engine.disable('github', 'claude')
  expect(JSON.parse(readFileSync(claudeJson, 'utf-8')).mcpServers.github).toBeUndefined()
  await engine.enable('github', 'claude')
  expect(JSON.parse(readFileSync(claudeJson, 'utf-8')).mcpServers.github).toEqual(original)
  await engine.disable('github', 'claude')

  const undone = await engine.undoImport()
  expect(undone.items).toMatchObject([{ slug: 'github', result: 'entry' }])
  expect(JSON.parse(readFileSync(claudeJson, 'utf-8')).mcpServers.github).toEqual(original)
})

test('same-name skills that differ become separate library items, each deployed only where it was', async () => {
  skill(join(claude, 'skills', 'review'), 'review', 'claude version\n')
  skill(join(codex, 'skills', 'review'), 'review', 'codex version\n')
  const r = await engine.applyImport(['skill:review@claude', 'skill:review@codex'])
  expect(r.items.map(i => [i.slug, i.agents])).toEqual([['review', ['claude']], ['review-2', ['codex']]])
  expect(readlinkSync(join(claude, 'skills', 'review'))).toBe(join(home, 'skills', 'review'))
  expect(readlinkSync(join(codex, 'skills', 'review'))).toBe(join(home, 'skills', 'review-2'))
  expect(readFileSync(join(codex, 'skills', 'review', 'SKILL.md'), 'utf-8')).toContain('codex version')
})

test('a slug already taken in the library gets a suffix; the agents still see the original name', async () => {
  skill(join(home, 'skills', 'notes'), 'notes')
  skill(join(claude, 'skills', 'notes'), 'notes', 'mine\n')
  const r = await engine.applyImport(['skill:notes'])
  expect(r.items[0].slug).toBe('notes-2')
  expect(readlinkSync(join(claude, 'skills', 'notes'))).toBe(join(home, 'skills', 'notes-2'))
})

test('undo refuses, changing nothing, when something else took the place; --force keeps an edited copy', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes')
  const before = toolSide()
  await engine.applyImport(['skill:notes'])
  writeFileSync(join(claude, 'skills', 'notes', 'SKILL.md'), '---\nname: notes\ndescription: d\n---\nedited through the link\n')
  const err = await engine.undoImport().catch(e => e)
  expect(err).toBeInstanceOf(ImportUndoConflictError)
  expect((err as ImportUndoConflictError).conflicts.map(c => c.reason)).toEqual(['modified'])
  expect(readlinkSync(join(claude, 'skills', 'notes'))).toBe(join(home, 'skills', 'notes'))

  const forced = await engine.undoImport(undefined, { force: true })
  expect(forced.items[0].result).toBe('kept-copy')
  expect(readFileSync(join(forced.items[0].keptAt!, 'SKILL.md'), 'utf-8')).toContain('edited through the link')
  expect(toolSide()).toEqual(before)
})

test('undo never replaces a directory the user put in place after the import', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes')
  await engine.applyImport(['skill:notes'])
  rmSync(join(claude, 'skills', 'notes'))
  skill(join(claude, 'skills', 'notes'), 'notes', 'new one\n')
  const err = await engine.undoImport(undefined, { force: true }).catch(e => e)
  expect((err as ImportUndoConflictError).conflicts.map(c => c.reason)).toEqual(['occupied'])
  expect(readFileSync(join(claude, 'skills', 'notes', 'SKILL.md'), 'utf-8')).toContain('new one')
})

test('a failed import is rolled back to the exact state before it', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes')
  mcpConfigs()
  const before = toolSide()
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'mcps'), 'a file where the MCP directory goes')
  await expect(engine.applyImport(['skill:notes', 'mcp:github'])).rejects.toThrow()
  expect(toolSide()).toEqual(before)
  expect(await engine.list()).toEqual([])
  expect((await engine.listImports()).map(r => r.state)).toEqual(['rolled-back'])
})

test('apply refuses ids a scan does not offer, before writing anything', async () => {
  skill(join(root, 'dotfiles', 'linked'), 'linked')
  symlinkSync(join(root, 'dotfiles', 'linked'), join(claude, 'skills', 'linked'), 'dir')
  await expect(engine.applyImport(['skill:linked'])).rejects.toThrow('cannot be imported')
  await expect(engine.applyImport(['skill:nope'])).rejects.toThrow('scan again')
  expect(existsSync(join(home, 'imports'))).toBe(false)
})

test('only with matchCatalog are names sent; a skill identical to a catalog entry is then tied to it', async () => {
  skill(join(claude, 'skills', 'notes'), 'notes')
  const content = readFileSync(join(claude, 'skills', 'notes', 'SKILL.md'))
  const sha = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
  const queries: string[] = []
  makeEngine({
    search: async (q: string) => {
      queries.push(q)
      return { resources: [{ id: 'github:o/r/notes', kind: 'skill', name: 'notes' }], nextOffset: null, offline: false } as unknown as CatalogSearchResult
    },
    get: async () => ({ id: 'github:o/r/notes', kind: 'skill', name: 'notes', version: '1.2.0', origin: {}, files: [{ path: 'SKILL.md', type: 'file', mode: '100644', size: content.length, sha, downloadUrl: '' }] }) as never,
    resolveItem: async () => { throw new Error('unused') },
  })
  expect((await engine.scanImports()).catalogChecked).toBe(false)
  expect(queries).toEqual([])
  const scan = await engine.scanImports({ matchCatalog: true })
  expect(scan.catalogChecked).toBe(true)
  expect(scan.skills[0].catalog).toEqual({ id: 'github:o/r/notes', name: 'notes', version: '1.2.0', exact: true })
  expect(queries).toEqual(['notes'])
  await engine.applyImport(['skill:notes'], { matchCatalog: true })
  expect((await engine.list())[0]).toMatchObject({ resourceId: 'github:o/r/notes', version: '1.2.0' })
})
