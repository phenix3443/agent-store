import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { enableRelayForClaude, disableRelayForClaude } from '../claude'
import { RELAY_PORT } from '../../relay/server'

let aasHome: string
let claudeDir: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-claude-relay-test-')
  claudeDir = await mkdtemp('/tmp/aas-claude-relay-dir-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
})

async function readSettings(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
}

test('enableRelayForClaude points settings.json at the relay', async () => {
  await enableRelayForClaude(aasHome, claudeDir)
  const settings = await readSettings()
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe(`http://127.0.0.1:${RELAY_PORT}`)
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')
})

test('enableRelayForClaude snapshots pre-existing env values on first call only', async () => {
  await mkdir(claudeDir, { recursive: true })
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://original.example.com', ANTHROPIC_AUTH_TOKEN: 'original-token' },
  }))

  await enableRelayForClaude(aasHome, claudeDir)
  // Simulate something else changing settings.json while the relay is "active".
  const settings = await readSettings()
  settings['someOtherKey'] = 'preserved'
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(settings))

  await enableRelayForClaude(aasHome, claudeDir) // second call must not re-snapshot

  await disableRelayForClaude(aasHome, claudeDir)
  const restored = await readSettings()
  const env = restored['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://original.example.com')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('original-token')
  expect(restored['someOtherKey']).toBe('preserved')
})

test('disableRelayForClaude removes env fields that did not exist originally', async () => {
  // No settings.json exists yet — original state has no env fields at all.
  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)
  const settings = await readSettings()
  expect(settings['env']).toBeUndefined()
})

test('disableRelayForClaude clears the snapshot so a later enable re-snapshots fresh state', async () => {
  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)

  // User manually sets a new "original" value after disabling.
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://new-original.example.com' },
  }))

  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)

  const settings = await readSettings()
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://new-original.example.com')
})
