import { test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, readdirSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { InstalledItem } from '@as/types'
import { runMigrate, type MigratePaths } from '../migrate'
import { runDoctor } from '../doctor'
import { MARKER, readMarker } from '../skills/store'

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

const backupOf = () => join(root, 'agents', 'agent-store', 'backups', 'migrate-2026-10-22T00-00-00-000Z')

test('converts the old layout, backs up first, links Claude and leaves doctor clean', async () => {
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
  expect(existsSync(join(p.codexConfigDir, 'skills', 's'))).toBe(false)

  for (const rel of ['store/s/skill.md', 'store/s/manifest.json', 'claude/s/SKILL.md', 'codex/s/SKILL.md']) {
    expect(existsSync(join(backup, rel))).toBe(true)
  }
  const reg = JSON.parse(readFileSync(join(p.aasHome, 'registry.json'), 'utf-8'))
  expect(reg.installed[0].enabledFor).toEqual({ claude: true, codex: true })

  expect(await runDoctor({ ...p, claudeJsonPath: join(p.claudeConfigDir, '.claude.json') })).toEqual([])
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
  expect(res.steps.map(s => `${s.result}:${s.slug}`)).toEqual(['done:s', 'skipped:s', 'done:s', 'error:s', 'skipped:mine'])
  // The user's Claude copy is untouched, so the symlink cannot be created.
  expect(readFileSync(join(p.claudeConfigDir, 'skills', 's', 'SKILL.md'), 'utf-8')).toContain('my notes')
  expect(res.steps.find(s => s.result === 'error')?.message).toContain('not Agent Store')
  expect(readFileSync(join(p.aasHome, 'skills', 'mine', 'SKILL.md'), 'utf-8')).toBe(BODY)
  expect(existsSync(join(p.aasHome, 'skills', 'mine', MARKER))).toBe(false)
})

test('a skill.md without frontmatter is not converted', async () => {
  oldInstall('bare', 'no frontmatter\n')
  registry(entry('bare', { claude: false, codex: true }))
  const res = await runMigrate(p, NOW)
  expect(res.steps.map(s => s.result)).toEqual(['error'])
  expect(readFileSync(join(p.aasHome, 'skills', 'bare', 'skill.md'), 'utf-8')).toBe('no frontmatter\n')
})
