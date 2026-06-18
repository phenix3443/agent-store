import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { runHook, writeManifest } from '../hook-runner'
import type { Item } from '@aas/types'

let tmpDir: string
const origFetch = globalThis.fetch

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  globalThis.fetch = origFetch
  await rm(tmpDir, { recursive: true, force: true })
})

test('config step writes config.json with patch', async () => {
  await runHook([{ type: 'config', patch: { apiKey: '' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ apiKey: '' })
})

test('config step merges with existing config.json', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ existing: true }))
  await runHook([{ type: 'config', patch: { apiKey: '' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ existing: true, apiKey: '' })
})

test('script step runs command in itemDir', async () => {
  await runHook([{ type: 'script', command: 'echo hello > output.txt' }], tmpDir)
  const out = await readFile(join(tmpDir, 'output.txt'), 'utf-8')
  expect(out.trim()).toBe('hello')
})

test('script step throws on non-zero exit', async () => {
  await expect(
    runHook([{ type: 'script', command: 'exit 1' }], tmpDir)
  ).rejects.toThrow('exit code 1')
})

test('file step fetches URL and writes to dest', async () => {
  const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46])
  globalThis.fetch = async (_url: string) =>
    new Response(bytes, { status: 200 })

  await runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)

  const content = await readFile(join(tmpDir, 'server'))
  expect(content[0]).toBe(0x7f)
})

test('file step throws on non-200 response', async () => {
  globalThis.fetch = async (_url: string) =>
    new Response('Not Found', { status: 404 })

  await expect(
    runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)
  ).rejects.toThrow('404')
})

test('writeManifest saves full item JSON as manifest.json', async () => {
  const item = { slug: 'test-mcp', category: 'mcp' } as unknown as Item
  await writeManifest(tmpDir, item)
  const raw = await readFile(join(tmpDir, 'manifest.json'), 'utf-8')
  expect(JSON.parse(raw).slug).toBe('test-mcp')
})
