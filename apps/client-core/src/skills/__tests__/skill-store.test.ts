import { test, expect, beforeEach, afterEach } from 'bun:test'
import { spawnSync } from 'child_process'
import { gzipSync } from 'zlib'
import { existsSync, readdirSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { SkillItem } from '@as/types'
import { EngineImpl } from '../../engine'
import { SkillDeployRefusedError } from '../deploy'
import { ItemCatalog } from '../../__tests__/helpers/item-catalog'
import { extractSkillDir, UnsafeArchiveError } from '../tar'
import { MARKER, readMarker } from '../store'

const SHA = 'a'.repeat(40)
const SKILL_MD = '---\nname: probe-codeword\ndescription: test skill\n---\nread references/token.md\n'

let root: string
let aasHome: string
let claudeDir: string
let codexDir: string
let engine: EngineImpl
let tarball: Uint8Array
let served: SkillItem | null = null
const origFetch = globalThis.fetch

/** A codeload-shaped tarball: everything under `<name>-<sha>/`. */
function codeload(files: Record<string, string>): Uint8Array {
  const work = mkdtempSync(join(tmpdir(), 'as-tar-'))
  const top = join(work, `probes-${SHA}`)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(top, rel, '..'), { recursive: true })
    writeFileSync(join(top, rel), body)
  }
  const out = join(work, 'x.tar.gz')
  const res = spawnSync('tar', ['-czf', out, '-C', work, `probes-${SHA}`], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
  if (res.status !== 0) throw new Error(String(res.stderr))
  const buf = readFileSync(out)
  rmSync(work, { recursive: true, force: true })
  return buf
}

/** A hand-built tar entry, for names `tar` itself refuses to write. */
function rawEntry(name: string, flag: string, body = '', linkname = ''): Buffer {
  const h = Buffer.alloc(512)
  h.write(name, 0, 100)
  h.write('0000644\0', 100)
  const bytes = Buffer.from(body)
  h.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124)
  h.write('        ', 148)
  h.write(flag, 156)
  h.write(linkname, 157, 100)
  h.write('ustar\0', 257)
  h.write('00', 263)
  let sum = 0
  for (const b of h) sum += b
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  const data = Buffer.alloc(Math.ceil(bytes.length / 512) * 512)
  bytes.copy(data)
  return Buffer.concat([h, data])
}

function rawTarGz(...entries: Buffer[]): Uint8Array {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
}

const item = (over: Partial<SkillItem> = {}): SkillItem => ({
  id: 'i1', slug: 'probe-skill', name: 'Probe', description: 'd', category: 'skill', version: '1.0.0',
  publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'community' },
  compatibleWith: ['claude', 'codex'], tags: [], downloads: 0, status: 'published',
  createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z', installHook: { steps: [] },
  contentUrl: 'https://files.test/SKILL.md',
  source: { repo: 'acme/probes', ref: 'main', dir: 'skills/probe' },
  ...over,
})

function serve(it: SkillItem) {
  served = it
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = String(input instanceof Request ? input.url : input)
    if (u === 'https://gh.test/repos/acme/probes/commits/main') return Response.json({ sha: SHA })
    if (u === `https://codeload.test/acme/probes/tar.gz/${SHA}`) return new Response(tarball)
    if (u === 'https://files.test/SKILL.md') return new Response(SKILL_MD)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const storeDir = (slug = 'probe-skill') => join(aasHome, 'skills', slug)
// Deployed under the frontmatter name, so both tools call it the same.
const claudeLink = (name = 'probe-codeword') => join(claudeDir, 'skills', name)
const codexLink = (name = 'probe-codeword') => join(codexDir, 'skills', name)
const registry = () => JSON.parse(readFileSync(join(aasHome, 'registry.json'), 'utf-8')) as { installed: Array<{ slug: string; enabledFor: Record<string, boolean>; deployments?: Record<string, { path: string; mode: string; sourceHash: string }> }> }
const entry = (slug = 'probe-skill') => registry().installed.find(e => e.slug === slug)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'as-skill-'))
  aasHome = join(root, 'agents')
  claudeDir = join(root, 'claude')
  codexDir = join(root, 'codex')
  process.env['AS_GITHUB_API_URL'] = 'https://gh.test'
  process.env['AS_CODELOAD_URL'] = 'https://codeload.test'
  engine = new EngineImpl({ aasHome, claudeConfigDir: claudeDir, codexConfigDir: codexDir }, 'http://store.test', { catalog: new ItemCatalog(() => (served ? [served] : [])) })
  served = null
  tarball = codeload({
    'skills/probe/SKILL.md': SKILL_MD,
    'skills/probe/references/token.md': 'TOKEN_42\n',
    'skills/other/SKILL.md': '---\nname: other\ndescription: x\n---\n',
    'README.md': 'repo readme',
  })
})

afterEach(() => {
  globalThis.fetch = origFetch
  delete process.env['AS_GITHUB_API_URL']
  delete process.env['AS_CODELOAD_URL']
  rmSync(root, { recursive: true, force: true })
})

// ── extraction safety ─────────────────────────────────────────────────────────

test('extractSkillDir writes only the requested directory', async () => {
  const dest = join(root, 'out')
  const files = await extractSkillDir(tarball, 'skills/probe', dest)
  expect(files.sort()).toEqual(['SKILL.md', 'references/token.md'])
  expect(existsSync(join(dest, 'README.md'))).toBe(false)
})

test('extractSkillDir with an empty dir takes the repo root', async () => {
  const dest = join(root, 'out')
  await extractSkillDir(tarball, '', dest)
  expect(readFileSync(join(dest, 'README.md'), 'utf-8')).toBe('repo readme')
})

test('extractSkillDir rejects .. entries, absolute entries and escaping symlinks before writing', async () => {
  const cases = [
    rawTarGz(rawEntry(`r-${SHA}/d/SKILL.md`, '0', 'x'), rawEntry(`r-${SHA}/d/../../evil`, '0', 'x')),
    rawTarGz(rawEntry('/etc/evil', '0', 'x')),
    rawTarGz(rawEntry(`r-${SHA}/d/SKILL.md`, '0', 'x'), rawEntry(`r-${SHA}/d/up`, '2', '', '../../outside')),
    rawTarGz(rawEntry(`r-${SHA}/d/abs`, '2', '', '/etc/passwd')),
    rawTarGz(rawEntry(`r-${SHA}/d/dev`, '3')),
  ]
  for (const gz of cases) {
    const dest = join(root, `out-${Math.random()}`)
    await expect(extractSkillDir(gz, 'd', dest)).rejects.toBeInstanceOf(UnsafeArchiveError)
    expect(existsSync(dest)).toBe(false)
  }
})

test('extractSkillDir rejects reaching outside through a chain of links', async () => {
  const cases = [
    // l -> . then l/l2 -> ..: lexically inside, on disk dest/l2 -> ..
    rawTarGz(rawEntry(`r-${SHA}/d/l`, '2', '', '.'), rawEntry(`r-${SHA}/d/l/l2`, '2', '', '..'), rawEntry(`r-${SHA}/d/l/l2/evil`, '0', 'x')),
    // l -> . then l2 -> l/..
    rawTarGz(rawEntry(`r-${SHA}/d/l`, '2', '', '.'), rawEntry(`r-${SHA}/d/l2`, '2', '', 'l/..')),
    // a file written below a link
    rawTarGz(rawEntry(`r-${SHA}/d/sub/`, '5'), rawEntry(`r-${SHA}/d/l`, '2', '', 'sub'), rawEntry(`r-${SHA}/d/l/f`, '0', 'x')),
  ]
  for (const gz of cases) {
    const dest = join(root, `out-${Math.random()}`)
    await expect(extractSkillDir(gz, 'd', dest)).rejects.toBeInstanceOf(UnsafeArchiveError)
    expect(existsSync(dest)).toBe(false)
  }
})

test('extractSkillDir rejects a truncated archive', async () => {
  const full = Buffer.concat([rawEntry(`r-${SHA}/d/SKILL.md`, '0', 'x'.repeat(2000))])
  const gz = gzipSync(full.subarray(0, 1024))
  await expect(extractSkillDir(gz, 'd', join(root, 'out'))).rejects.toThrow('truncated')
})

test('extractSkillDir reads pax paths with multibyte characters', async () => {
  const path = `r-${SHA}/d/réfs/ü.md`
  const rec = (k: string, v: string) => {
    const body = ` ${k}=${v}\n`
    let len = Buffer.byteLength(body)
    while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body)
    return `${len}${body}`
  }
  const pax = rec('path', path)
  const dest = join(root, 'out')
  const gz = rawTarGz(rawEntry('pax', 'x', pax), rawEntry('ignored', '0', 'hi'), rawEntry(`r-${SHA}/d/SKILL.md`, '0', 'x'))
  await extractSkillDir(gz, 'd', dest)
  expect(readFileSync(join(dest, 'réfs', 'ü.md'), 'utf-8')).toBe('hi')
})

test('extractSkillDir keeps a symlink that stays inside the directory', async () => {
  const dest = join(root, 'out')
  const gz = rawTarGz(rawEntry(`r-${SHA}/d/SKILL.md`, '0', 'x'), rawEntry(`r-${SHA}/d/alias.md`, '2', '', 'SKILL.md'))
  await extractSkillDir(gz, 'd', dest)
  expect(readlinkSync(join(dest, 'alias.md'))).toBe('SKILL.md')
})

test('extractSkillDir rejects content over the size limit', async () => {
  const big = 'x'.repeat(21 * 1024 * 1024)
  const gz = rawTarGz(rawEntry(`r-${SHA}/d/big`, '0', big))
  await expect(extractSkillDir(gz, 'd', join(root, 'out'))).rejects.toThrow('over')
})

// ── install ───────────────────────────────────────────────────────────────────

test('install puts the whole directory in the library, writes the marker and links both tools', async () => {
  serve(item())
  await engine.install('probe-skill')
  expect(readFileSync(join(storeDir(), 'references', 'token.md'), 'utf-8')).toBe('TOKEN_42\n')
  const marker = await readMarker(storeDir())
  expect(marker?.runtimeNames).toEqual({ claude: 'probe-codeword', codex: 'probe-codeword' })
  expect(marker?.source).toEqual({ repo: 'acme/probes', ref: 'main', resolvedSha: SHA, path: 'skills/probe' })
  expect(marker?.contentHash).toMatch(/^[0-9a-f]{64}$/)
  for (const link of [claudeLink(), codexLink()]) {
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe(storeDir())
  }
  expect(entry()?.enabledFor).toEqual({ codex: true, claude: true })
  expect(entry()?.deployments).toEqual({
    claude: { path: claudeLink(), mode: 'symlink', sourceHash: marker!.contentHash },
    codex: { path: codexLink(), mode: 'symlink', sourceHash: marker!.contentHash },
  })
  // Frontmatter is kept as the source wrote it.
  expect(readFileSync(join(storeDir(), 'SKILL.md'), 'utf-8')).toBe(SKILL_MD)
})

test('install without source falls back to contentUrl as SKILL.md', async () => {
  serve(item({ source: undefined }))
  await engine.install('probe-skill')
  expect(readFileSync(join(storeDir(), 'SKILL.md'), 'utf-8')).toBe(SKILL_MD)
  expect((await readMarker(storeDir()))?.source).toBeNull()
})

for (const [target, other] of [['codex', 'claude'], ['claude', 'codex']] as const) {
  test(`install --target ${target} deploys to ${target} only`, async () => {
    serve(item())
    await engine.install('probe-skill', { target })
    expect(existsSync(join(storeDir(), 'SKILL.md'))).toBe(true)
    expect(existsSync(target === 'claude' ? claudeLink() : codexLink())).toBe(true)
    expect(existsSync(other === 'claude' ? claudeLink() : codexLink())).toBe(false)
    expect(entry()?.enabledFor).toEqual({ [target]: true })
  })
}

test('a skill declared for one tool is deployed to that tool only', async () => {
  serve(item({ compatibleWith: ['claude'] }))
  await engine.install('probe-skill')
  expect(existsSync(claudeLink())).toBe(true)
  expect(existsSync(codexLink())).toBe(false)
  expect(entry()?.enabledFor).toEqual({ claude: true })
  await expect(engine.enable('probe-skill', 'codex')).rejects.toThrow('does not support codex')
})

test('a SKILL.md without name/description fails and leaves no trace', async () => {
  tarball = codeload({ 'skills/probe/SKILL.md': '# no frontmatter\n' })
  serve(item())
  await expect(engine.install('probe-skill')).rejects.toThrow('frontmatter')
  expect(existsSync(storeDir())).toBe(false)
  expect(existsSync(join(aasHome, 'skills')) ? readdirSync(join(aasHome, 'skills')) : []).toEqual([])
})

test('an invalid slug is rejected before anything is written', async () => {
  serve(item({ slug: '-bad' }))
  await expect(engine.install('-bad')).rejects.toThrow('Invalid slug')
  expect(existsSync(join(aasHome, 'skills'))).toBe(false)
})

test('SKILL.md must exist with exact case', async () => {
  tarball = codeload({ 'skills/probe/skill.md': SKILL_MD })
  serve(item())
  await expect(engine.install('probe-skill')).rejects.toThrow('no SKILL.md')
  expect(existsSync(storeDir())).toBe(false)
})

test('a pre-marker install (manifest.json + skill.md) can be reinstalled and uninstalled', async () => {
  const legacy = () => {
    mkdirSync(storeDir(), { recursive: true })
    writeFileSync(join(storeDir(), 'skill.md'), SKILL_MD)
    writeFileSync(join(storeDir(), 'manifest.json'), JSON.stringify({ slug: 'probe-skill', category: 'skill' }))
    mkdirSync(join(aasHome), { recursive: true })
    writeFileSync(join(aasHome, 'registry.json'), JSON.stringify({ installed: [{
      slug: 'probe-skill', category: 'skill', version: '0.9.0', installedAt: '', updatedAt: '',
      compatibleWith: ['claude', 'codex'], enabledFor: {},
    }] }))
  }
  legacy()
  serve(item())
  await engine.install('probe-skill')
  expect(existsSync(join(storeDir(), MARKER))).toBe(true)
  expect(readdirSync(storeDir()).sort()).toEqual([MARKER, 'SKILL.md', 'references'].sort())

  rmSync(storeDir(), { recursive: true, force: true })
  rmSync(claudeLink())
  rmSync(codexLink())
  legacy()
  await engine.uninstall('probe-skill')
  expect(existsSync(storeDir())).toBe(false)
  expect(entry()).toBeUndefined()
})

test('a user directory with the same slug in the library is never replaced', async () => {
  mkdirSync(storeDir(), { recursive: true })
  writeFileSync(join(storeDir(), 'SKILL.md'), 'mine')
  serve(item())
  await expect(engine.install('probe-skill')).rejects.toThrow('not installed by Agent Store')
  expect(readFileSync(join(storeDir(), 'SKILL.md'), 'utf-8')).toBe('mine')
  expect(existsSync(join(storeDir(), MARKER))).toBe(false)
})

test('a Codex name clash stops the Codex deployment only; --force deploys anyway', async () => {
  const users = join(codexDir, 'skills', 'users-own')
  mkdirSync(users, { recursive: true })
  writeFileSync(join(users, 'SKILL.md'), '---\nname: probe-codeword\ndescription: mine\n---\n')
  serve(item())
  const err = await engine.install('probe-skill').catch(e => e)
  expect(err.message).toContain(`deploying it to codex failed: Codex already sees a skill named "probe-codeword" at ${users}`)
  expect(err.reason).toBe('name-clash')
  expect(entry()?.enabledFor).toEqual({ claude: true })
  expect(existsSync(codexLink())).toBe(false)
  await engine.enable('probe-skill', 'codex', { force: true })
  expect(readlinkSync(codexLink())).toBe(storeDir())
  // A same-named skill in the library is not something Codex reads.
  expect(existsSync(join(users, 'SKILL.md'))).toBe(true)
})

test('a user directory at a tool path is refused and kept; --force replaces it', async () => {
  mkdirSync(codexLink(), { recursive: true })
  writeFileSync(join(codexLink(), 'SKILL.md'), 'users own')
  serve(item())
  const err = await engine.install('probe-skill').catch(e => e)
  expect(err).toBeInstanceOf(SkillDeployRefusedError)
  expect([err.reason, err.state, err.tool]).toEqual(['not-managed', 'real-dir', 'codex'])
  expect(readFileSync(join(codexLink(), 'SKILL.md'), 'utf-8')).toBe('users own')
  expect(entry()?.enabledFor).toEqual({ claude: true })
  await engine.enable('probe-skill', 'codex', { force: true })
  expect(readlinkSync(codexLink())).toBe(storeDir())
})

test('reinstall replaces the directory; a local edit needs --force', async () => {
  serve(item())
  await engine.install('probe-skill')
  tarball = codeload({ 'skills/probe/SKILL.md': SKILL_MD, 'skills/probe/new.md': 'v2' })
  await engine.install('probe-skill')
  expect(existsSync(join(storeDir(), 'references'))).toBe(false)
  expect(readFileSync(join(storeDir(), 'new.md'), 'utf-8')).toBe('v2')
  expect(readlinkSync(claudeLink())).toBe(storeDir())

  writeFileSync(join(storeDir(), 'new.md'), 'edited')
  await expect(engine.install('probe-skill')).rejects.toThrow('--force')
  expect(readFileSync(join(storeDir(), 'new.md'), 'utf-8')).toBe('edited')
  await engine.install('probe-skill', { force: true })
  expect(readFileSync(join(storeDir(), 'new.md'), 'utf-8')).toBe('v2')
})

// ── lifecycle ─────────────────────────────────────────────────────────────────

test('lifecycle: each tool is enabled and disabled on its own, then uninstall', async () => {
  serve(item())
  await engine.install('probe-skill')

  await engine.disable('probe-skill', 'claude')
  expect(existsSync(claudeLink())).toBe(false)
  expect(readlinkSync(codexLink())).toBe(storeDir())
  expect(existsSync(join(storeDir(), 'SKILL.md'))).toBe(true)
  expect(entry()?.enabledFor).toEqual({ codex: true, claude: false })

  await engine.disable('probe-skill', 'codex')
  expect(existsSync(codexLink())).toBe(false)
  expect(entry()?.enabledFor).toEqual({ codex: false, claude: false })
  expect(entry()?.deployments).toBeUndefined()

  await engine.enable('probe-skill', 'codex')
  expect(readlinkSync(codexLink())).toBe(storeDir())
  await engine.enable('probe-skill', 'claude')
  await engine.enable('probe-skill', 'claude') // idempotent
  expect(readlinkSync(claudeLink())).toBe(storeDir())
  expect(entry()?.enabledFor).toEqual({ codex: true, claude: true })

  await engine.uninstall('probe-skill')
  expect(existsSync(claudeLink())).toBe(false)
  expect(existsSync(codexLink())).toBe(false)
  expect(existsSync(storeDir())).toBe(false)
  expect(entry()).toBeUndefined()
})

test('enable refuses to replace a link that is not ours', async () => {
  serve(item())
  await engine.install('probe-skill', { target: 'codex' })
  mkdirSync(join(claudeDir, 'skills'), { recursive: true })
  symlinkSync(join(root, 'elsewhere'), claudeLink())
  await expect(engine.enable('probe-skill', 'claude')).rejects.toThrow('Refusing to replace')
  expect(readlinkSync(claudeLink())).toBe(join(root, 'elsewhere'))
  expect(entry()?.enabledFor['claude']).toBeFalsy()
})

test('disable keeps a directory the user put where our link was; --force removes it', async () => {
  serve(item())
  await engine.install('probe-skill')
  rmSync(claudeLink())
  mkdirSync(claudeLink())
  writeFileSync(join(claudeLink(), 'SKILL.md'), 'users own')
  const err = await engine.disable('probe-skill', 'claude').catch(e => e)
  expect(err).toBeInstanceOf(SkillDeployRefusedError)
  expect(err.reason).toBe('record-mismatch')
  expect(readFileSync(join(claudeLink(), 'SKILL.md'), 'utf-8')).toBe('users own')
  expect(entry()?.enabledFor.claude).toBe(true)
  await engine.disable('probe-skill', 'claude', { force: true })
  expect(existsSync(claudeLink())).toBe(false)
  expect(entry()?.enabledFor.claude).toBe(false)
})

test('partial failure: a user directory at the Claude path leaves the registry truthful', async () => {
  mkdirSync(claudeLink(), { recursive: true })
  writeFileSync(join(claudeLink(), 'SKILL.md'), 'users own')
  serve(item())
  await expect(engine.install('probe-skill')).rejects.toThrow('deploying it to claude failed')
  expect(entry()?.enabledFor).toEqual({ codex: true })
  expect(existsSync(join(storeDir(), MARKER))).toBe(true)
  expect(lstatSync(claudeLink()).isDirectory()).toBe(true)

  // Uninstall leaves the user's directory alone.
  await engine.uninstall('probe-skill')
  expect(readFileSync(join(claudeLink(), 'SKILL.md'), 'utf-8')).toBe('users own')
  expect(existsSync(storeDir())).toBe(false)
  expect(existsSync(codexLink())).toBe(false)
})

test('copy mode: real copies without the marker, refreshed on reinstall, removed on disable', async () => {
  process.env['AS_SKILL_DEPLOY_MODE'] = 'copy'
  try {
    serve(item())
    await engine.install('probe-skill')
    for (const dir of [claudeLink(), codexLink()]) {
      expect(lstatSync(dir).isDirectory()).toBe(true)
      expect(readFileSync(join(dir, 'references', 'token.md'), 'utf-8')).toBe('TOKEN_42\n')
      expect(existsSync(join(dir, MARKER))).toBe(false)
    }
    expect(entry()?.deployments?.['claude']?.mode).toBe('copy')
    tarball = codeload({ 'skills/probe/SKILL.md': SKILL_MD, 'skills/probe/new.md': 'v2' })
    await engine.install('probe-skill')
    expect(readFileSync(join(claudeLink(), 'new.md'), 'utf-8')).toBe('v2')
    expect(existsSync(join(claudeLink(), 'references'))).toBe(false)
    await engine.disable('probe-skill', 'codex')
    expect(existsSync(codexLink())).toBe(false)
  } finally {
    delete process.env['AS_SKILL_DEPLOY_MODE']
  }
})

test('uninstall refuses locally edited content without --force', async () => {
  serve(item())
  await engine.install('probe-skill')
  writeFileSync(join(storeDir(), 'SKILL.md'), 'edited')
  await expect(engine.uninstall('probe-skill')).rejects.toThrow('--force')
  expect(existsSync(storeDir())).toBe(true)
  expect(existsSync(claudeLink())).toBe(false)
  expect(entry()?.enabledFor).toEqual({ codex: false, claude: false })
  await engine.uninstall('probe-skill', { force: true })
  expect(existsSync(storeDir())).toBe(false)
  expect(entry()).toBeUndefined()
})

test('sync recreates a missing link and reports missing content', async () => {
  serve(item())
  await engine.install('probe-skill')
  rmSync(claudeLink())
  let result = await engine.sync()
  expect(result.errors).toEqual([])
  expect(readlinkSync(claudeLink())).toBe(storeDir())

  rmSync(storeDir(), { recursive: true, force: true })
  result = await engine.sync(['codex'])
  expect(result.errors.map(e => e.slug)).toEqual(['probe-skill:codex'])
})

test('info and getConfigSchema read the manifest from the marker', async () => {
  serve(item())
  await engine.install('probe-skill')
  expect(existsSync(join(storeDir(), 'manifest.json'))).toBe(false)
  const info = await engine.info('probe-skill')
  expect(info.name).toBe('Probe')
  expect(info.deployments?.codex?.path).toBe(codexLink())
  expect((await engine.getConfigSchema('probe-skill')).schema).toEqual({})
})
