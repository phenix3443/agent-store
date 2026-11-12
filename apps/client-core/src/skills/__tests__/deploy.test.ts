// Ported from skills-manager's sync_engine.rs tests (MIT): the ownership decision
// table and what each policy may destroy.
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  classifyTarget, deploySkillDir, NO_CLOBBER, permits, recorded, removeClassified, removeRecordedDeployment,
  SkillDeployRefusedError, USER_CONFIRMED, type TargetState,
} from '../deploy'
import { MARKER } from '../store'

let tmp: string
let src: string
let tgt: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'as-deploy-'))
  src = join(tmp, 'source')
  tgt = join(tmp, 'target')
  mkdirSync(src)
  writeFileSync(join(src, 'SKILL.md'), '# hello')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const deploy = (mode: 'symlink' | 'copy', policy = NO_CLOBBER) => deploySkillDir(src, tgt, mode, policy, 'claude', 's')

// Every cell is spelled out, so widening one has to be a deliberate edit here.
test('replace policy decision table', () => {
  const copy = recorded('copy')
  const link = recorded('symlink')
  for (const state of ['absent', 'link-to-source'] as TargetState[]) {
    for (const policy of [NO_CLOBBER, copy, link, USER_CONFIRMED]) expect(permits(policy, state)).toBe(true)
  }
  // A foreign or dangling link is user configuration; only a symlink record or explicit intent replaces it.
  expect([NO_CLOBBER, copy, link, USER_CONFIRMED].map(p => permits(p, 'foreign-link'))).toEqual([false, false, true, true])
  // A real directory is only ever ours under a copy record.
  expect([NO_CLOBBER, copy, link, USER_CONFIRMED].map(p => permits(p, 'real-dir'))).toEqual([false, true, false, true])
  // We never deploy a bare file, so no record vouches for one.
  expect([NO_CLOBBER, copy, link, USER_CONFIRMED].map(p => permits(p, 'real-file'))).toEqual([false, false, false, true])
})

test('without a source no link is ours', async () => {
  symlinkSync(src, tgt)
  expect(await classifyTarget(tgt)).toBe('foreign-link')
  expect(await classifyTarget(tgt, src)).toBe('link-to-source')
  expect(await classifyTarget(join(tmp, 'nothing'))).toBe('absent')
})

test('an unmanaged directory is refused and kept byte for byte', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'unmanaged.txt'), 'DO_NOT_OVERWRITE')
  const err = await deploy('copy').catch(e => e)
  expect(err).toBeInstanceOf(SkillDeployRefusedError)
  expect([err.reason, err.state, err.tool]).toEqual(['not-managed', 'real-dir', 'claude'])
  expect(readFileSync(join(tgt, 'unmanaged.txt'), 'utf-8')).toBe('DO_NOT_OVERWRITE')
  expect(existsSync(join(tgt, 'SKILL.md'))).toBe(false)
})

test('a copy record replaces its own directory', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'old.md'), 'old')
  expect(await deploy('copy', recorded('copy'))).toBe('copy')
  expect(existsSync(join(tgt, 'SKILL.md'))).toBe(true)
  expect(existsSync(join(tgt, 'old.md'))).toBe(false)
})

test('a symlink record does not vouch for the directory that replaced the link', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'mine.txt'), 'user content')
  const err = await deploy('symlink', recorded('symlink')).catch(e => e)
  expect(err.reason).toBe('record-mismatch')
  expect(readFileSync(join(tgt, 'mine.txt'), 'utf-8')).toBe('user content')
})

test('our own link is accepted without a record and left untouched', async () => {
  symlinkSync(src, tgt)
  const before = lstatSync(tgt).mtimeMs
  expect(await deploy('symlink')).toBe('symlink')
  expect(readlinkSync(tgt)).toBe(src)
  expect(lstatSync(tgt).mtimeMs).toBe(before)
})

test('--force replaces an unmanaged directory', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'old.md'), 'old')
  await deploy('copy', USER_CONFIRMED)
  expect(existsSync(join(tgt, 'SKILL.md'))).toBe(true)
  expect(existsSync(join(tgt, 'old.md'))).toBe(false)
})

test('a bare file is refused under every policy but --force', async () => {
  writeFileSync(tgt, 'user file')
  for (const policy of [NO_CLOBBER, recorded('copy'), recorded('symlink')]) {
    expect((await deploy('copy', policy).catch(e => e)).state).toBe('real-file')
  }
  expect(readFileSync(tgt, 'utf-8')).toBe('user file')
})

test('a foreign link is refused and its pointee kept', async () => {
  const elsewhere = join(tmp, 'elsewhere')
  mkdirSync(elsewhere)
  writeFileSync(join(elsewhere, 'mine.md'), 'user content')
  symlinkSync(elsewhere, tgt)
  expect(await deploy('symlink').catch(e => e)).toBeInstanceOf(SkillDeployRefusedError)
  expect(readlinkSync(tgt)).toBe(elsewhere)
  expect(existsSync(join(elsewhere, 'mine.md'))).toBe(true)
})

test('a dangling link is refused when unmanaged and replaced under a symlink record', async () => {
  symlinkSync(join(tmp, 'gone'), tgt)
  expect(await deploy('symlink').catch(e => e)).toBeInstanceOf(SkillDeployRefusedError)
  await deploy('symlink', recorded('symlink'))
  expect(readlinkSync(tgt)).toBe(src)
})

test('switching our link to a copy keeps the source and leaves the marker out', async () => {
  writeFileSync(join(src, MARKER), '{}')
  symlinkSync(src, tgt)
  expect(await deploy('copy')).toBe('copy')
  expect(lstatSync(tgt).isSymbolicLink()).toBe(false)
  expect(readFileSync(join(tgt, 'SKILL.md'), 'utf-8')).toBe('# hello')
  expect(existsSync(join(tgt, MARKER))).toBe(false)
  expect(existsSync(join(src, 'SKILL.md'))).toBe(true)
})

test('removing what was classified as a link does not delete a directory that took its place', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'precious.txt'), 'data')
  await expect(removeClassified(tgt, 'foreign-link')).rejects.toThrow()
  expect(existsSync(join(tgt, 'precious.txt'))).toBe(true)
})

test('a recorded removal keeps content that replaced the link; a copy record removes its directory', async () => {
  mkdirSync(tgt)
  writeFileSync(join(tgt, 'mine.txt'), 'user content')
  expect(await removeRecordedDeployment({ path: tgt, mode: 'symlink', sourceHash: 'h' })).toEqual({ removed: false, state: 'real-dir' })
  expect(readFileSync(join(tgt, 'mine.txt'), 'utf-8')).toBe('user content')
  expect((await removeRecordedDeployment({ path: tgt, mode: 'copy', sourceHash: 'h' })).removed).toBe(true)
  expect(existsSync(tgt)).toBe(false)
})
