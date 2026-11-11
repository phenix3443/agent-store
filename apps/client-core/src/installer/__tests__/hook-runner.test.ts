import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { runHook, writeManifest } from '../hook-runner'
import type { InstallHook, Item } from '@as/types'

let tmpDir: string
const origFetch = globalThis.fetch

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/as-test-')
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

test('config step adds patch keys missing from existing config.json', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ existing: true }))
  await runHook([{ type: 'config', patch: { apiKey: '' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ existing: true, apiKey: '' })
})

test('config step keeps values the user already set', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ apiKey: 'sk-user', baseUrl: 'https://mine.example' }))
  await runHook([{ type: 'config', patch: { apiKey: '', baseUrl: 'https://default.example', model: 'm1' } }], tmpDir)
  const raw = await readFile(join(tmpDir, 'config.json'), 'utf-8')
  expect(JSON.parse(raw)).toEqual({ apiKey: 'sk-user', baseUrl: 'https://mine.example', model: 'm1' })
})

test('script step is rejected before anything is fetched or written', async () => {
  const itemDir = join(tmpDir, 'item')
  let fetched = false
  globalThis.fetch = (async () => { fetched = true; return new Response('x') }) as unknown as typeof fetch
  const steps = [
    { type: 'file', url: 'https://example.com/server', dest: 'server' },
    { type: 'config', patch: { apiKey: '' } },
    { type: 'script', command: 'echo hello > output.txt' },
  ] as unknown as InstallHook['steps']
  await expect(runHook(steps, itemDir)).rejects.toThrow(/script/)
  expect(fetched).toBe(false)
  expect(existsSync(itemDir)).toBe(false)
})

test('unknown step type is rejected', async () => {
  const steps = [{ type: 'exec', command: 'id' }] as unknown as InstallHook['steps']
  await expect(runHook(steps, tmpDir)).rejects.toThrow(/exec/)
})

for (const dest of ['../escape', '../../x', 'sub/../../x', '/tmp/as-abs-escape', '', '.']) {
  test(`file step with dest ${JSON.stringify(dest)} is rejected`, async () => {
    const itemDir = join(tmpDir, 'item')
    let fetched = false
    globalThis.fetch = (async () => { fetched = true; return new Response('x') }) as unknown as typeof fetch
    await expect(
      runHook([{ type: 'file', url: 'https://example.com/server', dest }], itemDir)
    ).rejects.toThrow(/dest/)
    expect(fetched).toBe(false)
    expect(existsSync(itemDir)).toBe(false)
    expect(existsSync(join(tmpDir, 'escape'))).toBe(false)
  })
}

test('file step may write into a subdirectory of the item dir', async () => {
  globalThis.fetch = (async () => new Response('ok')) as unknown as typeof fetch
  await runHook([{ type: 'file', url: 'https://example.com/a', dest: 'bin/./server' }], tmpDir)
  expect(await readFile(join(tmpDir, 'bin', 'server'), 'utf-8')).toBe('ok')
})

for (const url of ['http://example.com/server', 'http://127.0.0.1:8080/server', 'file:///etc/passwd', 'ftp://example.com/x', 'not a url']) {
  test(`file step with url ${url} is rejected`, async () => {
    let fetched = false
    globalThis.fetch = (async () => { fetched = true; return new Response('x') }) as unknown as typeof fetch
    await expect(
      runHook([{ type: 'file', url, dest: 'server' }], tmpDir)
    ).rejects.toThrow(/https/)
    expect(fetched).toBe(false)
    expect(existsSync(join(tmpDir, 'server'))).toBe(false)
  })
}

test('file step rejects a redirect to a non-https URL', async () => {
  globalThis.fetch = (async () => {
    const res = new Response('x')
    Object.defineProperty(res, 'url', { value: 'http://example.com/server' })
    return res
  }) as unknown as typeof fetch
  await expect(
    runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)
  ).rejects.toThrow(/https/)
  expect(existsSync(join(tmpDir, 'server'))).toBe(false)
})

test('file step fetches URL and writes to dest', async () => {
  const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46])
  globalThis.fetch = (async (_url: string) =>
    new Response(bytes, { status: 200 })) as typeof fetch

  await runHook([{ type: 'file', url: 'https://example.com/server', dest: 'server' }], tmpDir)

  const content = await readFile(join(tmpDir, 'server'))
  expect(content[0]).toBe(0x7f)
})

test('file step throws on non-200 response', async () => {
  globalThis.fetch = (async (_url: string) =>
    new Response('Not Found', { status: 404 })) as typeof fetch

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
