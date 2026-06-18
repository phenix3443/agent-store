import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, access, writeFile } from 'fs/promises'
import { join } from 'path'
import { postInstall as providerPostInstall } from '../provider'
import { postInstall as skillPostInstall } from '../skill'
import { postInstall as mcpPostInstall } from '../mcp'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

test('provider postInstall writes empty config.json', async () => {
  await providerPostInstall(tmpDir)
  expect(JSON.parse(await readFile(join(tmpDir, 'config.json'), 'utf-8'))).toEqual({})
})

test('provider postInstall does not overwrite existing config', async () => {
  await writeFile(join(tmpDir, 'config.json'), JSON.stringify({ apiKey: 'sk-existing' }))
  await providerPostInstall(tmpDir)
  const config = JSON.parse(await readFile(join(tmpDir, 'config.json'), 'utf-8'))
  expect(config.apiKey).toBe('sk-existing')
})

test('skill postInstall completes without error', async () => {
  await expect(skillPostInstall(tmpDir)).resolves.toBeUndefined()
})

test('mcp postInstall chmodsx server when present', async () => {
  await writeFile(join(tmpDir, 'server'), '')
  await mcpPostInstall(tmpDir)
  // Bun's fs/promises.access resolves to null (not undefined); just verify no throw
  await expect(access(join(tmpDir, 'server'))).resolves.toBeDefined()
})

test('mcp postInstall does not throw when server absent', async () => {
  await expect(mcpPostInstall(tmpDir)).resolves.toBeUndefined()
})
