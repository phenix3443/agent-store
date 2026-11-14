// Two devices with their own Agent Store home, Claude and Codex directories, and a
// local bare repository as the remote they both back up to.
import { test, expect, beforeAll, afterAll, afterEach } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Item, MCPItem, ProviderItem, SkillItem } from '@as/types'
import { EngineImpl } from '../../engine'
import { ItemCatalog } from '../../__tests__/helpers/item-catalog'
import { runGit } from '../git'
import { BackupSecretError } from '../secrets'
import { writeCredentials } from '../state'

process.env['AS_CLAUDE_BIN'] = ''
process.env['AS_CODEX_BIN'] = ''

const MARKER = 'MARKER-7f3c9a1e2b5d48'

let root: string
const origHome = process.env['HOME']
const origFetch = globalThis.fetch

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'as-backup-test-'))
  // Git's global config and ~/.agents/skills are read from HOME; neither may be the real one.
  process.env['HOME'] = join(root, 'home')
  await mkdir(process.env['HOME'], { recursive: true })
  process.env['GIT_CONFIG_NOSYSTEM'] = '1'
})

afterAll(async () => {
  process.env['HOME'] = origHome
  await rm(root, { recursive: true, force: true })
})

afterEach(() => {
  globalThis.fetch = origFetch
})

const publisher = { id: 'p1', slug: 'pub', name: 'Pub', avatarUrl: '', tier: 'community' as const }
const base = {
  id: 'i1', name: 'Test', description: 'desc', version: '1.0.0', publisher,
  compatibleWith: ['claude' as const, 'codex' as const], tags: [], downloads: 0, status: 'published' as const,
  createdAt: '2026-06-18T00:00:00Z', updatedAt: '2026-06-18T00:00:00Z', installHook: { steps: [] },
}
const skill: SkillItem = { ...base, slug: 'notes', category: 'skill', contentUrl: 'https://s.test/notes/SKILL.md' }
const plainMcp: MCPItem = { ...base, slug: 'plain-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx plain-server', configSchema: { type: 'object' } }
const keyedMcp: MCPItem = {
  ...base, slug: 'keyed-mcp', category: 'mcp', transport: 'stdio', serverCommand: 'npx keyed-server',
  configSchema: { type: 'object', required: ['API_KEY'], properties: { API_KEY: { type: 'string', 'x-secret': true }, region: { type: 'string' } } },
}
const provider: ProviderItem = {
  ...base, slug: 'relay-provider', category: 'provider', supportedModels: ['m'],
  configSchema: { type: 'object', properties: { apiKey: { type: 'string' }, baseUrl: { type: 'string' } } },
}
const ITEMS: Item[] = [skill, plainMcp, keyedMcp, provider]
const SKILL_MD = '---\nname: notes\ndescription: Take notes\n---\nOriginal body\n'

function serveFetch() {
  globalThis.fetch = (async (url: string) => {
    if (String(url) === skill.contentUrl) return new Response(SKILL_MD, { status: 200 })
    throw new Error(`Unmocked URL: ${url}`)
  }) as typeof fetch
}

interface Device {
  name: string
  aasHome: string
  claudeDir: string
  codexDir: string
  engine: EngineImpl
}

let counter = 0

async function device(name: string, options: { maxItemBytes?: number } = {}): Promise<Device> {
  const dir = join(root, `${name}-${++counter}`)
  const aasHome = join(dir, 'agent-store')
  const claudeDir = join(dir, 'claude')
  const codexDir = join(dir, 'codex')
  for (const d of [aasHome, claudeDir, codexDir]) await mkdir(d, { recursive: true })
  const engine = new EngineImpl({ aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir }, 'http://localhost:9', {
    catalog: new ItemCatalog(() => ITEMS),
    startRelay: async () => { await writeFile(join(aasHome, 'relay.pid'), String(process.pid)) },
    backupMaxItemBytes: options.maxItemBytes,
  })
  return { name, aasHome, claudeDir, codexDir, engine }
}

async function bareRemote(): Promise<string> {
  const path = join(root, `remote-${++counter}.git`)
  await runGit(null, ['init', '--bare', '-q', '--initial-branch=main', path])
  return path
}

const remoteFile = (remote: string, path: string) => runGit(remote, ['show', `main:${path}`])

/** Device A with every kind of item, keys set and everything enabled. */
async function populated(name = 'laptop'): Promise<Device> {
  serveFetch()
  const a = await device(name)
  await a.engine.install('notes')
  await a.engine.install('plain-mcp')
  await a.engine.enable('plain-mcp', 'claude')
  await a.engine.enable('plain-mcp', 'codex')
  await a.engine.install('keyed-mcp')
  await a.engine.setConfig('keyed-mcp', { API_KEY: `${MARKER}-mcp`, region: 'eu' })
  await a.engine.enable('keyed-mcp', 'claude')
  await a.engine.install('relay-provider')
  await a.engine.setConfig('relay-provider', { apiKey: `${MARKER}-key`, apiKeys: [`${MARKER}-rotation`], token: `${MARKER}-token`, baseUrl: 'https://api.example.test/v1' })
  await a.engine.enable('relay-provider', 'claude')
  return a
}

const skillPath = (d: Device) => join(d.aasHome, 'skills', 'notes', 'SKILL.md')

test('a second device restores everything; keyed items wait for their key and are not uploaded as disabled', async () => {
  const remote = await bareRemote()
  const a = await populated()
  await a.engine.connectBackup({ remote, device: 'laptop' })
  const first = await a.engine.backupNow()
  expect(first.pushed).not.toBeNull()
  expect(first.uploaded.map(u => u.key).sort()).toEqual(['mcp/keyed-mcp', 'mcp/plain-mcp', 'provider/relay-provider', 'skill/notes'])

  const b = await device('desktop')
  const connected = await b.engine.connectBackup({ remote, device: 'desktop' })
  expect(connected.remoteItems).toBe(4)
  const pulled = await b.engine.pullBackup()
  expect(pulled.failed).toEqual([])
  expect((await b.engine.list()).map(i => i.slug).sort()).toEqual(['keyed-mcp', 'notes', 'plain-mcp', 'relay-provider'])

  expect(await readFile(skillPath(b), 'utf-8')).toBe(SKILL_MD)
  expect(existsSync(join(b.claudeDir, 'skills', 'notes', 'SKILL.md'))).toBe(true)
  const claudeJson = JSON.parse(await readFile(join(b.claudeDir, '.claude.json'), 'utf-8'))
  expect(claudeJson.mcpServers['plain-mcp']).toBeDefined()
  expect(claudeJson.mcpServers['keyed-mcp']).toBeUndefined()

  const missing = Object.fromEntries(pulled.missingSecrets.map(m => [m.key, m]))
  expect(missing['provider/relay-provider']?.reason).toBe('no-key')
  expect(missing['provider/relay-provider']?.targets).toEqual(['claude'])
  expect(missing['mcp/keyed-mcp']?.reason).toBe('needs-config')
  const providerEntry = (await b.engine.list()).find(i => i.slug === 'relay-provider')!
  expect(providerEntry.enabledFor.claude).not.toBe(true)
  const keyedConfig = JSON.parse(await readFile(join(b.aasHome, 'mcps', 'keyed-mcp', 'config.json'), 'utf-8'))
  expect(keyedConfig).toEqual({ region: 'eu' })

  const status = await b.engine.getBackupStatus()
  expect(status.localChanges).toEqual([])
  expect(status.missingSecrets.length).toBe(2)
  const again = await b.engine.backupNow()
  expect(again.pushed).toBeNull()
  expect(again.uploaded).toEqual([])

  // The key B types stays on B, and the merged config keeps it on the next change from A.
  await b.engine.setConfig('relay-provider', { baseUrl: 'https://api.example.test/v1', apiKey: 'desktop-own-key-123' })
  await b.engine.enable('relay-provider', 'claude')
  await a.engine.setConfig('relay-provider', { apiKey: `${MARKER}-key`, baseUrl: 'https://api2.example.test/v1' })
  await a.engine.backupNow()
  await b.engine.backupNow()
  const bConfig = JSON.parse(await readFile(join(b.aasHome, 'providers', 'relay-provider', 'config.json'), 'utf-8'))
  expect(bConfig).toEqual({ baseUrl: 'https://api2.example.test/v1', apiKey: 'desktop-own-key-123' })
  expect((await b.engine.getBackupStatus()).missingSecrets.map(m => m.key)).toEqual(['mcp/keyed-mcp'])
}, 60_000)

test('changes to different parts of the same item merge; a removal reaches the other device', async () => {
  const remote = await bareRemote()
  const a = await populated()
  await a.engine.connectBackup({ remote, device: 'laptop' })
  await a.engine.backupNow()
  const b = await device('desktop')
  await b.engine.connectBackup({ remote, device: 'desktop' })
  await b.engine.pullBackup()

  await writeFile(skillPath(a), SKILL_MD.replace('Original body', 'Edited on laptop'))
  await b.engine.disable('notes', 'codex')
  await b.engine.disable('plain-mcp', 'codex')
  await a.engine.uninstall('keyed-mcp')
  const fromA = await a.engine.backupNow()
  expect(fromA.uploaded.map(u => u.key).sort()).toEqual(['mcp/keyed-mcp', 'skill/notes'])
  const fromB = await b.engine.backupNow()
  expect(fromB.conflicts).toEqual([])
  expect(fromB.uploaded.map(u => u.key).sort()).toEqual(['mcp/plain-mcp', 'skill/notes'])
  expect(await readFile(skillPath(b), 'utf-8')).toContain('Edited on laptop')
  expect((await b.engine.list()).some(i => i.slug === 'keyed-mcp')).toBe(false)

  await a.engine.pullBackup()
  const aItems = Object.fromEntries((await a.engine.list()).map(i => [i.slug, i]))
  expect(aItems['notes'].enabledFor.codex).toBe(false)
  expect(aItems['plain-mcp'].enabledFor.codex).toBe(false)
  expect(aItems['plain-mcp'].enabledFor.claude).toBe(true)
  expect(existsSync(join(a.codexDir, 'skills', 'notes'))).toBe(false)

  const log = await b.engine.listBackupHistory()
  expect(log.map(e => e.device)).toEqual(['desktop', 'laptop', 'laptop'])
}, 60_000)

async function conflicting() {
  const remote = await bareRemote()
  const a = await populated()
  await a.engine.connectBackup({ remote, device: 'laptop' })
  await a.engine.backupNow()
  const b = await device('desktop')
  await b.engine.connectBackup({ remote, device: 'desktop' })
  await b.engine.pullBackup()
  await writeFile(skillPath(a), SKILL_MD.replace('Original body', 'Laptop version'))
  await writeFile(skillPath(b), SKILL_MD.replace('Original body', 'Desktop version'))
  await a.engine.backupNow()
  const r = await b.engine.backupNow()
  return { remote, a, b, r }
}

test('a conflict keeps this machine\'s version, leaves the remote alone and lets other items sync', async () => {
  const { remote, b, r } = await conflicting()
  expect(r.conflicts.map(c => [c.key, c.reason, c.parts, c.remoteDevice])).toEqual([['skill/notes', 'both-changed', ['content'], 'laptop']])
  expect(await readFile(skillPath(b), 'utf-8')).toContain('Desktop version')
  expect(await remoteFile(remote, 'items/skill/notes/content/files/SKILL.md')).toContain('Laptop version')
  expect((await b.engine.getBackupStatus()).conflicts.length).toBe(1)
  // Still pending on the next run.
  expect((await b.engine.backupNow()).conflicts.length).toBe(1)
  expect(await remoteFile(remote, 'items/skill/notes/content/files/SKILL.md')).toContain('Laptop version')
}, 60_000)

test('resolve remote takes the other version after a snapshot, and restoring the snapshot undoes it', async () => {
  const { b } = await conflicting()
  const res = await b.engine.resolveBackupConflict('notes', 'remote')
  expect(res.snapshot).not.toBeNull()
  expect(await readFile(skillPath(b), 'utf-8')).toContain('Laptop version')
  expect((await b.engine.getBackupStatus()).conflicts).toEqual([])

  const snaps = await b.engine.listBackupSnapshots()
  expect(snaps[0].id).toBe(res.snapshot!)
  const restored = await b.engine.restoreBackupSnapshot(res.snapshot!)
  expect(restored.failed).toEqual([])
  expect(await readFile(skillPath(b), 'utf-8')).toContain('Desktop version')
}, 60_000)

test('resolve local uploads this machine\'s version; the other device then takes it', async () => {
  const { remote, a, b } = await conflicting()
  await b.engine.resolveBackupConflict('skill/notes', 'local')
  const up = await b.engine.backupNow()
  expect(up.uploaded.map(u => u.key)).toEqual(['skill/notes'])
  expect(await remoteFile(remote, 'items/skill/notes/content/files/SKILL.md')).toContain('Desktop version')
  await a.engine.pullBackup()
  expect(await readFile(skillPath(a), 'utf-8')).toContain('Desktop version')
}, 60_000)

test('resolve both keeps ours and installs the remote version under a new slug, not enabled', async () => {
  const { b } = await conflicting()
  const res = await b.engine.resolveBackupConflict('notes', 'both')
  expect(res.keptAs).toBe('notes-laptop')
  expect(await readFile(skillPath(b), 'utf-8')).toContain('Desktop version')
  expect(await readFile(join(b.aasHome, 'skills', 'notes-laptop', 'SKILL.md'), 'utf-8')).toContain('Laptop version')
  const copy = (await b.engine.list()).find(i => i.slug === 'notes-laptop')!
  expect(copy.enabledFor).toEqual({})
  const up = await b.engine.backupNow()
  expect(up.uploaded.map(u => u.key).sort()).toEqual(['skill/notes', 'skill/notes-laptop'])
}, 60_000)

test('a skill over the size limit stays local, is flagged, and is not deleted by a device without it', async () => {
  serveFetch()
  const remote = await bareRemote()
  const a = await device('laptop', { maxItemBytes: 10 })
  await a.engine.install('notes')
  await a.engine.connectBackup({ remote, device: 'laptop' })
  const up = await a.engine.backupNow()
  expect(up.localOnly.map(l => l.key)).toEqual(['skill/notes'])
  expect(await remoteFile(remote, 'items/skill/notes/content/item.json')).toContain('too-large')
  await expect(remoteFile(remote, 'items/skill/notes/content/files/SKILL.md')).rejects.toThrow()

  const b = await device('desktop')
  await b.engine.connectBackup({ remote, device: 'desktop' })
  const pulled = await b.engine.backupNow()
  expect(pulled.notRestorable.map(n => n.key)).toEqual(['skill/notes'])
  expect(pulled.uploaded).toEqual([])
  expect(await remoteFile(remote, 'items/skill/notes/content/item.json')).toContain('too-large')
  expect((await b.engine.backupNow()).uploaded).toEqual([])
}, 60_000)

async function allObjects(gitDir: string): Promise<string> {
  return runGit(gitDir, ['cat-file', '--batch-all-objects', '--batch'])
}

test('no key, token or 0600 secret file reaches any file or commit of the backup', async () => {
  const remote = await bareRemote()
  const a = await populated()
  // Marker values everywhere a secret can sit on this machine.
  await writeFile(join(a.aasHome, 'project-env.json'), JSON.stringify({ p1: { API_KEY: `${MARKER}-project` } }), { mode: 0o600 })
  await writeFile(join(a.codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: `${MARKER}-codex-auth` }), { mode: 0o600 })
  await writeFile(join(a.aasHome, 'skills', 'notes', 'private.txt'), `${MARKER}-owner-only`)
  await chmod(join(a.aasHome, 'skills', 'notes', 'private.txt'), 0o600)
  await writeFile(join(a.aasHome, 'skills', 'notes', '.env'), `TOKEN=${MARKER}-dotenv`)
  await a.engine.connectBackup({ remote, device: 'laptop' })
  await writeCredentials(a.aasHome, { username: 'me', password: `${MARKER}-backup-token` })
  const relayToken = (await readFile(join(a.aasHome, 'relay-token'), 'utf-8')).trim()
  expect(relayToken.length).toBeGreaterThan(8)
  const claudeSettings = await readFile(join(a.claudeDir, 'settings.json'), 'utf-8')
  expect(claudeSettings).toContain(relayToken)

  const r = await a.engine.backupNow()
  expect(r.excludedFiles.map(e => [e.file, e.reason]).sort()).toEqual([['.env', 'secret-name'], ['private.txt', 'owner-only']])
  await a.engine.setConfig('keyed-mcp', { API_KEY: `${MARKER}-mcp-2`, region: 'us' })
  await a.engine.backupNow()

  for (const gitDir of [remote, join(a.aasHome, 'backup', 'repo.git')]) {
    const objects = await allObjects(gitDir)
    expect(objects).toContain('relay-provider')
    expect(objects).not.toContain(MARKER)
    expect(objects).not.toContain(relayToken)
  }
}, 60_000)

test('a secret inside a skill stops the backup before anything is written, naming the file', async () => {
  const remote = await bareRemote()
  const a = await populated()
  await a.engine.connectBackup({ remote, device: 'laptop' })
  await a.engine.backupNow()
  const before = await runGit(remote, ['rev-parse', 'main'])
  const localRepo = join(a.aasHome, 'backup', 'repo.git')

  await writeFile(skillPath(a), `${SKILL_MD}\nkey: ${MARKER}-key\n`)
  const err = await a.engine.backupNow().catch(e => e)
  expect(err).toBeInstanceOf(BackupSecretError)
  expect(err.message).toContain('items/skill/notes/content/files/SKILL.md')
  expect(err.message).toContain('relay-provider')
  expect(err.message).not.toContain(MARKER)
  expect(await runGit(remote, ['rev-parse', 'main'])).toBe(before)
  expect(await allObjects(localRepo)).not.toContain(MARKER)
  expect((await a.engine.getBackupStatus()).secretFindings[0]?.file).toBe('items/skill/notes/content/files/SKILL.md')

  await writeFile(skillPath(a), `${SKILL_MD}\nexample: ghp_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6\n`)
  const pattern = await a.engine.backupNow().catch(e => e)
  expect(pattern).toBeInstanceOf(BackupSecretError)
  expect(pattern.message).toContain('a GitHub token')
}, 60_000)

test('connect refuses a repository with other content and leaves nothing behind', async () => {
  const remote = await bareRemote()
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
  const blob = (await runGit(remote, ['hash-object', '-w', '--stdin'], { input: 'hello\n' })).trim()
  const tree = (await runGit(remote, ['mktree'], { input: `100644 blob ${blob}\tREADME.md\n` })).trim()
  const commit = (await runGit(remote, ['commit-tree', tree, '-m', 'init'], { env })).trim()
  await runGit(remote, ['update-ref', 'refs/heads/main', commit])
  const a = await device('laptop')
  await expect(a.engine.connectBackup({ remote })).rejects.toThrow('not an Agent Store backup')
  expect(existsSync(join(a.aasHome, 'backup'))).toBe(false)
  expect((await a.engine.getBackupStatus()).connected).toBe(false)
}, 60_000)

test('disconnect forgets this device only; reconnecting finds the backup again', async () => {
  const remote = await bareRemote()
  const a = await populated()
  await a.engine.connectBackup({ remote, device: 'laptop' })
  await a.engine.backupNow()
  await a.engine.disconnectBackup()
  expect(existsSync(join(a.aasHome, 'backup'))).toBe(false)
  expect(await remoteFile(remote, 'agent-store-backup.json')).toContain('agent-store-backup')
  await expect(a.engine.backupNow()).rejects.toThrow('not connected')
  expect((await a.engine.connectBackup({ remote })).remoteItems).toBe(4)
}, 60_000)
