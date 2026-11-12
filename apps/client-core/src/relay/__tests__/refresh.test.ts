import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { parse } from '@iarna/toml'
import type { InstalledItem } from '@as/types'
import { refreshRelayTakeover } from '../refresh'
import { startRelayServer, RELAY_PORT } from '../server'
import { runRelayDaemon } from '../daemon'
import { RELAY_TOKEN_HEADER } from '../token'
import { disableRelayForClaude } from '../../config/claude'
import { disableRelayForCodex } from '../../config/codex'
import { writeRegistry } from '../../registry/index'
import { itemDir } from '../../paths'

let aasHome: string
let claudeConfigDir: string
let codexConfigDir: string
let stop: (() => void) | undefined

const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`
const paths = () => ({ aasHome, claudeConfigDir, codexConfigDir })
const settingsPath = () => join(claudeConfigDir, 'settings.json')
const tomlPath = () => join(codexConfigDir, 'config.toml')
const authPath = () => join(codexConfigDir, 'auth.json')

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-refresh-home-')
  claudeConfigDir = await mkdtemp('/tmp/as-refresh-claude-')
  codexConfigDir = await mkdtemp('/tmp/as-refresh-codex-')
  stop = undefined
})

afterEach(async () => {
  stop?.()
  for (const d of [aasHome, claudeConfigDir, codexConfigDir]) await rm(d, { recursive: true, force: true })
})

/** What the previous version left behind for a user who had the relay on for both tools. */
async function seedLegacyTakeover(originals = {
  claudeBaseUrl: 'https://orig.example' as string | null,
  claudeToken: 'sk-orig-claude' as string | null,
  codexProvider: 'mine' as string | null,
  codexKey: 'sk-orig-codex' as string | undefined,
}) {
  await mkdir(join(aasHome, 'relay-state'), { recursive: true })
  await writeFile(join(aasHome, 'relay-state', 'claude.json'), JSON.stringify({
    originalBaseUrl: originals.claudeBaseUrl, originalAuthToken: originals.claudeToken,
  }))
  await writeFile(settingsPath(), JSON.stringify({
    model: 'opus', env: { ANTHROPIC_BASE_URL: RELAY_URL, ANTHROPIC_AUTH_TOKEN: 'aas-relay' },
  }))
  await writeFile(join(aasHome, 'relay-state', 'codex.json'), JSON.stringify({
    originalModelProvider: originals.codexProvider,
    originalModelProviders: { mine: { name: 'mine', base_url: 'https://mine.example/v1' } },
    originalAuth: originals.codexKey === undefined ? null : { OPENAI_API_KEY: originals.codexKey },
    originalPreferredAuthMethod: 'chatgpt',
  }))
  await writeFile(tomlPath(), [
    '# my codex setup',
    'model_provider = "aas-relay"',
    'preferred_auth_method = "apikey"',
    '[model_providers.mine]',
    'name = "mine"',
    'base_url = "https://mine.example/v1"',
    '[model_providers.aas-relay]',
    'name = "aas-relay"',
    `base_url = "${RELAY_URL}"`,
    'wire_api = "responses"',
    'requires_openai_auth = false',
    '',
  ].join('\n'))
  await writeFile(authPath(), JSON.stringify({ OPENAI_API_KEY: 'aas-relay', tokens: { access_token: 'refreshed' } }))
}

async function claudeEnv(): Promise<Record<string, unknown>> {
  return (JSON.parse(await readFile(settingsPath(), 'utf-8')) as { env?: Record<string, unknown> }).env ?? {}
}

async function codexConfig(): Promise<Record<string, any>> {
  return parse(await readFile(tomlPath(), 'utf-8')) as Record<string, any>
}

async function snapshotFiles(): Promise<string[]> {
  return Promise.all([settingsPath(), tomlPath(), authPath()].map(p => readFile(p, 'utf-8')))
}

async function startRelayWithProvider(): Promise<{ port: number; upstream: string[] }> {
  const entry: InstalledItem = {
    slug: 'p', category: 'provider', version: '1', installedAt: '', updatedAt: '',
    compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: true },
  }
  await writeRegistry(aasHome, { installed: [entry] })
  const dir = itemDir(aasHome, 'provider', 'p')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'sk-up', baseUrl: 'https://up.example' }))
  const upstream: string[] = []
  const fetchImpl = (async (url: string) => { upstream.push(url); return new Response('{}', { status: 200 }) }) as typeof fetch
  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop
  return { port: server.port, upstream }
}

test('an upgraded relay takeover gets the token and the relay accepts both tools again', async () => {
  await seedLegacyTakeover()
  const { port, upstream } = await startRelayWithProvider()
  const post = (path: string, headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body: '{}' })

  // Before the refresh, the configs the old version wrote are refused.
  expect((await post('/v1/messages', { Authorization: 'Bearer aas-relay' })).status).toBe(401)

  expect(await refreshRelayTakeover(paths())).toEqual({ claude: true, codex: true })

  // Send exactly what each tool's config now tells it to send.
  const env = await claudeEnv()
  expect(env['ANTHROPIC_BASE_URL']).toBe(RELAY_URL)
  expect((await post('/v1/messages', { Authorization: `Bearer ${env['ANTHROPIC_AUTH_TOKEN']}` })).status).toBe(200)
  const relayProvider = (await codexConfig())['model_providers']['aas-relay']
  expect((await post('/responses', relayProvider['http_headers'])).status).toBe(200)
  expect(Object.keys(relayProvider['http_headers'])).toEqual([RELAY_TOKEN_HEADER])
  expect(upstream).toEqual(['https://up.example/v1/messages', 'https://up.example/responses'])
  expect(await readFile(tomlPath(), 'utf-8')).toContain('# my codex setup')
})

test('after the refresh, disabling the relay puts back the values from before the old takeover', async () => {
  await seedLegacyTakeover()
  await refreshRelayTakeover(paths())

  await disableRelayForClaude(aasHome, claudeConfigDir)
  await disableRelayForCodex(aasHome, codexConfigDir)

  expect(await claudeEnv()).toEqual({ ANTHROPIC_BASE_URL: 'https://orig.example', ANTHROPIC_AUTH_TOKEN: 'sk-orig-claude' })
  const config = await codexConfig()
  expect(config['model_provider']).toBe('mine')
  expect(config['preferred_auth_method']).toBe('chatgpt')
  expect(Object.keys(config['model_providers'])).toEqual(['mine'])
  expect(JSON.parse(await readFile(authPath(), 'utf-8'))).toEqual({ OPENAI_API_KEY: 'sk-orig-codex', tokens: { access_token: 'refreshed' } })
})

test('a stale snapshot whose "original" is the old relay value never puts that value back', async () => {
  await seedLegacyTakeover({ claudeBaseUrl: RELAY_URL, claudeToken: 'aas-relay', codexProvider: 'aas-relay', codexKey: 'aas-relay' })
  await refreshRelayTakeover(paths())

  await disableRelayForClaude(aasHome, claudeConfigDir)
  await disableRelayForCodex(aasHome, codexConfigDir)

  expect(await claudeEnv()).toEqual({})
  const config = await codexConfig()
  expect(config['model_provider']).toBeUndefined()
  expect(JSON.parse(await readFile(authPath(), 'utf-8'))).toEqual({ tokens: { access_token: 'refreshed' } })
})

test('the refresh is idempotent: a second run writes nothing', async () => {
  await seedLegacyTakeover()
  await refreshRelayTakeover(paths())
  const before = await snapshotFiles()

  expect(await refreshRelayTakeover(paths())).toEqual({ claude: false, codex: false })
  expect(await snapshotFiles()).toEqual(before)
})

test('a tool the user moved off the relay, or one never taken over, is left alone', async () => {
  await seedLegacyTakeover()
  await writeFile(settingsPath(), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://elsewhere.example', ANTHROPIC_AUTH_TOKEN: 'aas-relay' } }))
  await writeFile(tomlPath(), 'model_provider = "other"\n[model_providers.aas-relay]\nname = "aas-relay"\n')
  const before = await snapshotFiles()

  expect(await refreshRelayTakeover(paths())).toEqual({ claude: false, codex: false })
  expect(await snapshotFiles()).toEqual(before)

  await rm(join(aasHome, 'relay-state'), { recursive: true })
  await seedLegacyTakeover()
  await rm(join(aasHome, 'relay-state'), { recursive: true })
  const untouched = await snapshotFiles()
  expect(await refreshRelayTakeover(paths())).toEqual({ claude: false, codex: false })
  expect(await snapshotFiles()).toEqual(untouched)
})

test('runRelayDaemon refreshes the takeover when it starts', async () => {
  await seedLegacyTakeover()
  await writeFile(join(aasHome, 'relay-configs.json'), JSON.stringify([{ id: 'a', name: 'A', port: 0, enabled: true }]))
  const controller = new AbortController()
  const daemon = runRelayDaemon(aasHome, { pollIntervalMs: 20, signal: controller.signal, paths: paths() })
  await new Promise(resolve => setTimeout(resolve, 60))
  controller.abort()
  await daemon

  expect((await claudeEnv())['ANTHROPIC_AUTH_TOKEN']).toBe((await readFile(join(aasHome, 'relay-token'), 'utf-8')).trim())
  expect((await codexConfig())['model_providers']['aas-relay']['http_headers']).toBeDefined()
})
