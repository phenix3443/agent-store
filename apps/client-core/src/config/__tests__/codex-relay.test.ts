import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { parse } from '@iarna/toml'
import { enableRelayForCodex, disableRelayForCodex } from '../codex'
import { RELAY_PORT } from '../../relay/server'
import { RELAY_TOKEN_HEADER, relayTokenPath } from '../../relay/token'

let aasHome: string
let codexDir: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-codex-relay-test-')
  codexDir = await mkdtemp('/tmp/as-codex-relay-dir-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

async function readConfig(): Promise<Record<string, unknown>> {
  return parse(await readFile(join(codexDir, 'config.toml'), 'utf-8')) as unknown as Record<string, unknown>
}

async function readRelayToken(): Promise<string> {
  return (await readFile(relayTokenPath(aasHome), 'utf-8')).trim()
}

async function readAuth(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

test('enableRelayForCodex points config.toml at the relay and sends the relay token, leaving auth.json alone', async () => {
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-original' }))
  await enableRelayForCodex(aasHome, codexDir)
  const config = await readConfig()
  expect(config['model_provider']).toBe('aas-relay')
  const providers = config['model_providers'] as Record<string, { base_url: string; http_headers: Record<string, string> }>
  expect(providers['aas-relay'].base_url).toBe(`http://127.0.0.1:${RELAY_PORT}`)
  expect(providers['aas-relay'].http_headers[RELAY_TOKEN_HEADER]).toBe(await readRelayToken())
  expect(await readAuth()).toEqual({ OPENAI_API_KEY: 'sk-original' })
})

test('disableRelayForCodex restores the original model_provider', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'model_provider = "mine"\n[model_providers.mine]\nbase_url = "https://mine.example"\n')

  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  const config = await readConfig()
  expect(config['model_provider']).toBe('mine')
  expect(Object.keys(config['model_providers'] as object)).toEqual(['mine'])
})

test('relay enable and disable leave preferred_auth_method as the user set it', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'preferred_auth_method = "chatgpt"\n')

  await enableRelayForCodex(aasHome, codexDir)
  expect((await readConfig())['preferred_auth_method']).toBe('chatgpt')
  await disableRelayForCodex(aasHome, codexDir)
  expect((await readConfig())['preferred_auth_method']).toBe('chatgpt')
})

test('disable keeps tokens refreshed and providers added while the relay was on, and every TOML comment', async () => {
  const original = [
    '# my codex setup',
    'model = "gpt-5" # pinned',
    'model_provider = "mine"',
    '',
    '# my own provider',
    '[model_providers.mine]',
    'name = "mine"',
    'base_url = "https://mine.example/v1" # proxy',
    '',
  ].join('\n')
  await writeFile(join(codexDir, 'config.toml'), original)
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ tokens: { access_token: 'old', refresh_token: 'r1' } }))

  await enableRelayForCodex(aasHome, codexDir)
  const enabledText = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  for (const comment of ['# my codex setup', '# pinned', '# my own provider', '# proxy']) expect(enabledText).toContain(comment)

  // While the relay is on: Codex refreshes its login, the user adds a provider by hand.
  const refreshed = JSON.stringify({ tokens: { access_token: 'new', refresh_token: 'r2' }, last_refresh: '2026-11-11T00:00:00Z' })
  await writeFile(join(codexDir, 'auth.json'), refreshed)
  await writeFile(join(codexDir, 'config.toml'), enabledText + '\n# added later\n[model_providers.added]\nname = "added"\nbase_url = "https://added.example/v1"\n')

  await disableRelayForCodex(aasHome, codexDir)

  expect(await readFile(join(codexDir, 'auth.json'), 'utf-8')).toBe(refreshed)
  const text = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  for (const comment of ['# my codex setup', '# pinned', '# my own provider', '# proxy', '# added later']) expect(text).toContain(comment)
  const config = parse(text) as unknown as Record<string, unknown>
  expect(config['model_provider']).toBe('mine')
  expect(Object.keys(config['model_providers'] as object).sort()).toEqual(['added', 'mine'])
  expect(text).not.toContain('aas-relay')
})

test('disable leaves a model_provider the user switched to while the relay was on', async () => {
  await writeFile(join(codexDir, 'config.toml'), 'model_provider = "mine"\n')
  await enableRelayForCodex(aasHome, codexDir)
  const text = await readFile(join(codexDir, 'config.toml'), 'utf-8')
  await writeFile(join(codexDir, 'config.toml'), text.replace('model_provider = "aas-relay"', 'model_provider = "other"'))

  await disableRelayForCodex(aasHome, codexDir)

  expect((await readConfig())['model_provider']).toBe('other')
})

test('disable after an upgrade undoes only the old takeover keys that still hold the relay values', async () => {
  // A relay-state snapshot and takeover written by the previous version.
  await mkdir(join(aasHome, 'relay-state'), { recursive: true })
  await writeFile(join(aasHome, 'relay-state', 'codex.json'), JSON.stringify({
    originalModelProvider: 'mine',
    originalModelProviders: { mine: { name: 'mine' } },
    originalAuth: { OPENAI_API_KEY: 'sk-original' },
    originalPreferredAuthMethod: 'chatgpt',
  }))
  await writeFile(join(codexDir, 'config.toml'), [
    'model_provider = "aas-relay"',
    'preferred_auth_method = "apikey"',
    '[model_providers.mine]',
    'name = "mine"',
    '[model_providers.added]',
    'name = "added"',
    '[model_providers.aas-relay]',
    'name = "aas-relay"',
    '',
  ].join('\n'))
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'aas-relay', tokens: { access_token: 'new' } }))

  await disableRelayForCodex(aasHome, codexDir)

  const config = await readConfig()
  expect(config['model_provider']).toBe('mine')
  expect(config['preferred_auth_method']).toBe('chatgpt')
  expect(Object.keys(config['model_providers'] as object).sort()).toEqual(['added', 'mine'])
  expect(await readAuth()).toEqual({ OPENAI_API_KEY: 'sk-original', tokens: { access_token: 'new' } })
})

test('disableRelayForCodex clears the snapshot', async () => {
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  await writeFile(join(codexDir, 'config.toml'), 'model_provider = "new-original"\n')
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  expect((await readConfig())['model_provider']).toBe('new-original')
})

test('a config.toml that does not parse aborts the write and stays byte-identical', async () => {
  const broken = 'model_provider = "mine"\n[model_providers.mine\n'
  await writeFile(join(codexDir, 'config.toml'), broken)
  await expect(enableRelayForCodex(aasHome, codexDir)).rejects.toThrow('could not be parsed')
  expect(await readFile(join(codexDir, 'config.toml'), 'utf-8')).toBe(broken)
})
