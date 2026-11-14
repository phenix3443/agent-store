import { test, expect } from 'bun:test'
import { runTest } from '../test'
import type { Engine, ProviderTestResult } from '@as/types'

function engineWith(results: ProviderTestResult[] | Error): Engine {
  return {
    testProvider: async () => {
      if (results instanceof Error) throw results
      return results
    },
  } as unknown as Engine
}

test('prints each agent with its outcome and exits 0 when all pass', async () => {
  const lines: string[] = []
  const code = await runTest(
    engineWith([{ target: 'claude', url: 'https://api.example.com/v1/messages', outcome: 'ok', ok: true, statusCode: 400, latencyMs: 120 }]),
    ['skyapi'],
    (s) => lines.push(s)
  )
  expect(code).toBe(0)
  expect(lines.join('\n')).toContain('claude  ok: address reachable, key not rejected (HTTP 400, 120 ms)')
  expect(lines.join('\n')).toContain('POST https://api.example.com/v1/messages')
})

test('exits 1 and shows the upstream message when the key is rejected', async () => {
  const lines: string[] = []
  const code = await runTest(
    engineWith([{ target: 'codex', url: 'https://api.example.com/responses', outcome: 'key-rejected', ok: false, statusCode: 401, latencyMs: 80, message: 'Incorrect API key provided: ***' }]),
    ['openrouter'],
    (s) => lines.push(s)
  )
  expect(code).toBe(1)
  expect(lines.join('\n')).toContain('key rejected (HTTP 401, 80 ms)')
  expect(lines.join('\n')).toContain('Incorrect API key provided: ***')
})

test('reports an engine error and a missing slug', async () => {
  const lines: string[] = []
  expect(await runTest(engineWith(new Error('Item not installed: nope')), ['nope'], (s) => lines.push(s))).toBe(1)
  expect(lines.join('\n')).toContain('Item not installed: nope')
  expect(await runTest(engineWith([]), [], (s) => lines.push(s))).toBe(2)
  expect(lines.join('\n')).toContain('Usage: aas test')
})
