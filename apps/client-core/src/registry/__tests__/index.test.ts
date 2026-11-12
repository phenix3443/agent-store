import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { readRegistry, writeRegistry, updateRegistry, findEntry, upsertEntry, removeEntry } from '../index'
import { ConfigParseError } from '../../config/safe-file'
import type { InstalledItem } from '@as/types'

const entry: InstalledItem = {
  slug: 'test-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/as-test-')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

test('readRegistry returns empty registry when file absent', async () => {
  const reg = await readRegistry(tmpDir)
  expect(reg).toEqual({ installed: [] })
})

test('writeRegistry creates registry.json and readRegistry reads it back', async () => {
  await writeRegistry(tmpDir, { installed: [entry] })
  const reg = await readRegistry(tmpDir)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry adds new entry', () => {
  const reg = upsertEntry({ installed: [] }, entry)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry updates existing entry without duplicating', () => {
  const initial = { installed: [entry] }
  const updated = upsertEntry(initial, { ...entry, version: '2.0.0' })
  expect(updated.installed).toHaveLength(1)
  expect(updated.installed[0].version).toBe('2.0.0')
})

test('upsertEntry does not mutate the input', () => {
  const original = { installed: [entry] }
  upsertEntry(original, { ...entry, version: '2.0.0' })
  expect(original.installed[0].version).toBe('1.0.0')
})

test('removeEntry removes by slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'test-provider')
  expect(reg.installed).toHaveLength(0)
})

test('removeEntry is a no-op for unknown slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'unknown')
  expect(reg.installed).toHaveLength(1)
})

test('findEntry returns undefined for missing slug', () => {
  expect(findEntry({ installed: [] }, 'missing')).toBeUndefined()
})

test('findEntry returns matching entry', () => {
  expect(findEntry({ installed: [entry] }, 'test-provider')).toEqual(entry)
})

test('a registry.json that does not parse fails reads and updates instead of resetting', async () => {
  const path = join(tmpDir, 'registry.json')
  await writeFile(path, '{"installed": [')
  await expect(readRegistry(tmpDir)).rejects.toBeInstanceOf(ConfigParseError)
  await expect(updateRegistry(tmpDir, r => upsertEntry(r, entry))).rejects.toBeInstanceOf(ConfigParseError)
  expect(await readFile(path, 'utf-8')).toBe('{"installed": [')
})

test('a registry.json without an installed list is rejected', async () => {
  await writeFile(join(tmpDir, 'registry.json'), '{"items": []}')
  await expect(readRegistry(tmpDir)).rejects.toBeInstanceOf(ConfigParseError)
})

test('updateRegistry leaves no temp or lock files behind', async () => {
  await updateRegistry(tmpDir, r => upsertEntry(r, entry))
  expect(await readdir(tmpDir)).toEqual(['registry.json'])
})

test('a failing update writes nothing and releases the lock', async () => {
  await writeRegistry(tmpDir, { installed: [entry] })
  await expect(updateRegistry(tmpDir, () => { throw new Error('boom') })).rejects.toThrow('boom')
  const reg = await updateRegistry(tmpDir, r => removeEntry(r, 'test-provider'))
  expect(reg.installed).toHaveLength(0)
})

test('concurrent in-process updates keep every entry', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    updateRegistry(tmpDir, async r => {
      await new Promise(resolve => setTimeout(resolve, 1))
      return upsertEntry(r, { ...entry, slug: `item-${i}` })
    })
  ))
  expect((await readRegistry(tmpDir)).installed).toHaveLength(20)
})

test('two writer processes interleaving updates keep both sets of entries', async () => {
  const writer = join(import.meta.dir, 'fixtures', 'writer.ts')
  const procs = ['a', 'b'].map(prefix =>
    Bun.spawn([process.execPath, writer, tmpDir, prefix, '15'], { stderr: 'pipe' })
  )
  const codes = await Promise.all(procs.map(p => p.exited))
  for (const p of procs) {
    const err = await new Response(p.stderr).text()
    if (err) console.error(err)
  }
  expect(codes).toEqual([0, 0])
  const slugs = (await readRegistry(tmpDir)).installed.map(e => e.slug).sort()
  expect(slugs).toHaveLength(30)
  expect(slugs.filter(s => s.startsWith('a-'))).toHaveLength(15)
  expect(slugs.filter(s => s.startsWith('b-'))).toHaveLength(15)
}, 30_000)
