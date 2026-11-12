import { test, expect, beforeEach, afterEach } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { syncItemToClaude, enableRelayForClaude, disableRelayForClaude } from '../claude'
import { enableRelayForCodex, disableRelayForCodex, upsertCodexProviderConnection } from '../codex'
import { ConfigParseError } from '../safe-file'
import { runHook } from '../../installer/hook-runner'

let aasHome: string
let claudeDir: string
let codexDir: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-safe-home-')
  claudeDir = await mkdtemp('/tmp/as-safe-claude-')
  codexDir = await mkdtemp('/tmp/as-safe-codex-')
})

afterEach(async () => {
  for (const d of [aasHome, claudeDir, codexDir]) await rm(d, { recursive: true, force: true })
})

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}

async function seedProvider(config: object): Promise<void> {
  const dir = join(aasHome, 'providers', 'p')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify(config))
}

const BROKEN = '{"permissions": {"allow": ['

test('a settings.json that does not parse aborts a provider sync and is left untouched', async () => {
  await seedProvider({ apiKey: 'sk-1', baseUrl: 'https://api.example' })
  await writeFile(join(claudeDir, 'settings.json'), BROKEN)
  await expect(
    syncItemToClaude('p', 'provider', aasHome, claudeDir, join(claudeDir, '.claude.json'), 'add')
  ).rejects.toBeInstanceOf(ConfigParseError)
  expect(await readFile(join(claudeDir, 'settings.json'), 'utf-8')).toBe(BROKEN)
})

test('a settings.json that does not parse aborts relay enable and disable', async () => {
  await writeFile(join(claudeDir, 'settings.json'), BROKEN)
  await expect(enableRelayForClaude(aasHome, claudeDir)).rejects.toBeInstanceOf(ConfigParseError)
  await expect(disableRelayForClaude(aasHome, claudeDir)).rejects.toBeInstanceOf(ConfigParseError)
  expect(await readFile(join(claudeDir, 'settings.json'), 'utf-8')).toBe(BROKEN)
})

test('settings.json writes are backed up, keep other keys and are 0600', async () => {
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'opus' }))
  await enableRelayForClaude(aasHome, claudeDir)
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.model).toBe('opus')
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(readFileSync(join(aasHome, 'relay-token'), 'utf-8'))
  expect(await modeOf(join(claudeDir, 'settings.json'))).toBe(0o600)
  const backups = await readdir(join(aasHome, 'agent-store', 'backups'))
  expect(backups.length).toBeGreaterThan(0)
  expect(await readFile(join(aasHome, 'agent-store', 'backups', backups[0], 'settings.json'), 'utf-8'))
    .toBe(JSON.stringify({ model: 'opus' }))
})

test('relay enable and disable never touch auth.json, even one that does not parse', async () => {
  await writeFile(join(codexDir, 'auth.json'), '{"tokens": {')
  await writeFile(join(codexDir, 'config.toml'), 'model = "gpt-5"\n')
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)
  expect(await readFile(join(codexDir, 'auth.json'), 'utf-8')).toBe('{"tokens": {')
  expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toBe('model = "gpt-5"\n')
})

test('an auth.json that does not parse aborts a provider connection write', async () => {
  await writeFile(join(codexDir, 'auth.json'), 'not json')
  await expect(upsertCodexProviderConnection(codexDir, {
    providerKey: 'p', name: 'p', baseUrl: 'https://api.example', apiKey: 'sk-1',
  })).rejects.toBeInstanceOf(ConfigParseError)
  expect(await readFile(join(codexDir, 'auth.json'), 'utf-8')).toBe('not json')
})

test('a new auth.json is 0600', async () => {
  await upsertCodexProviderConnection(codexDir, { providerKey: 'p', name: 'p', baseUrl: 'https://a', apiKey: 'k1' })
  expect(await modeOf(join(codexDir, 'auth.json'))).toBe(0o600)
})

test('an existing auth.json is narrowed to 0600 but a stricter mode is kept', async () => {
  const auth = join(codexDir, 'auth.json')
  await writeFile(auth, JSON.stringify({ OPENAI_API_KEY: 'mine' }))
  await chmod(auth, 0o644)
  await upsertCodexProviderConnection(codexDir, { providerKey: 'p', name: 'p', baseUrl: 'https://a', apiKey: 'k1' })
  expect(await modeOf(auth)).toBe(0o600)
  await chmod(auth, 0o400)
  await upsertCodexProviderConnection(codexDir, { providerKey: 'p', name: 'p', baseUrl: 'https://a', apiKey: 'k2' })
  expect(await modeOf(auth)).toBe(0o400)
  expect(JSON.parse(await readFile(auth, 'utf-8')).OPENAI_API_KEY).toBe('k2')
})

test('relay-state snapshots are 0600', async () => {
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'sk-user' } }))
  await enableRelayForClaude(aasHome, claudeDir)
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-user' }))
  await enableRelayForCodex(aasHome, codexDir)
  expect(await modeOf(join(aasHome, 'relay-state', 'claude.json'))).toBe(0o600)
  expect(await modeOf(join(aasHome, 'relay-state', 'codex.json'))).toBe(0o600)
})

test('a relay-state snapshot that does not parse aborts relay enable instead of being re-snapshotted', async () => {
  await mkdir(join(aasHome, 'relay-state'), { recursive: true })
  await writeFile(join(aasHome, 'relay-state', 'claude.json'), '{"originalAuthToken": "sk-')
  await expect(enableRelayForClaude(aasHome, claudeDir)).rejects.toBeInstanceOf(ConfigParseError)
  expect(await readFile(join(aasHome, 'relay-state', 'claude.json'), 'utf-8')).toBe('{"originalAuthToken": "sk-')
})

test('a hook config step writes config.json 0600', async () => {
  const dir = join(aasHome, 'mcps', 'm')
  await runHook([{ type: 'config', patch: { token: 't' } }], dir)
  expect(await modeOf(join(dir, 'config.json'))).toBe(0o600)
})
