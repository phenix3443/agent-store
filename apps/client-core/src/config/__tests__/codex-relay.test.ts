import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { parse } from '@iarna/toml'
import { enableRelayForCodex, disableRelayForCodex } from '../codex'
import { RELAY_PORT } from '../../relay/server'

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

async function readAuth(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

test('enableRelayForCodex points config.toml at the relay', async () => {
  await enableRelayForCodex(aasHome, codexDir)
  const config = await readConfig()
  expect(config['model_provider']).toBe('aas-relay')
  const providers = config['model_providers'] as Record<string, { base_url: string }>
  expect(providers['aas-relay'].base_url).toBe(`http://127.0.0.1:${RELAY_PORT}`)
  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('aas-relay')
})

test('disableRelayForCodex restores the original model_provider and auth.json by default', async () => {
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-original' }))

  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  const config = await readConfig()
  expect(config['model_provider']).toBeUndefined()
  expect(config['preferred_auth_method']).toBeUndefined()
  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-original')
})

test('disableRelayForCodex restores a pre-existing preferred_auth_method', async () => {
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    'preferred_auth_method = "chatgpt"\n'
  )

  await enableRelayForCodex(aasHome, codexDir)
  const enabledConfig = await readConfig()
  expect(enabledConfig['preferred_auth_method']).toBe('apikey')

  await disableRelayForCodex(aasHome, codexDir)

  const config = await readConfig()
  expect(config['preferred_auth_method']).toBe('chatgpt')
})

test('preserveOfficialAuthOnSwitch=true leaves auth.json untouched on disable', async () => {
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-official-original' }))

  await enableRelayForCodex(aasHome, codexDir)
  // Simulate the user running `codex login` again while the relay was active.
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-fresh-official-login' }))

  await disableRelayForCodex(aasHome, codexDir, { preserveOfficialAuthOnSwitch: true })

  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-fresh-official-login')
})

test('disableRelayForCodex clears the snapshot', async () => {
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-new-original' }))
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-new-original')
})
