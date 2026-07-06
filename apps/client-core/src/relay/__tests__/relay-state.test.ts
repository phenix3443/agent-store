import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { readRelayState, writeRelayState, clearRelayState } from '../relay-state'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-relay-state-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

interface FakeState {
  originalBaseUrl: string | null
}

test('readRelayState returns null when no state file exists', async () => {
  const state = await readRelayState<FakeState>(aasHome, 'claude')
  expect(state).toBeNull()
})

test('writeRelayState then readRelayState round-trips the value', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://original.example.com' })
  const state = await readRelayState<FakeState>(aasHome, 'claude')
  expect(state).toEqual({ originalBaseUrl: 'https://original.example.com' })
})

test('claude and codex states are stored independently', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://claude.example.com' })
  await writeRelayState<FakeState>(aasHome, 'codex', { originalBaseUrl: 'https://codex.example.com' })
  expect(await readRelayState<FakeState>(aasHome, 'claude')).toEqual({ originalBaseUrl: 'https://claude.example.com' })
  expect(await readRelayState<FakeState>(aasHome, 'codex')).toEqual({ originalBaseUrl: 'https://codex.example.com' })
})

test('clearRelayState removes the file', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://original.example.com' })
  await clearRelayState(aasHome, 'claude')
  expect(await readRelayState<FakeState>(aasHome, 'claude')).toBeNull()
})

test('clearRelayState on a non-existent file does not throw', async () => {
  await expect(clearRelayState(aasHome, 'claude')).resolves.toBeUndefined()
})
