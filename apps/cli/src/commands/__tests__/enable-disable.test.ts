import { test, expect } from 'bun:test'
import { runEnable } from '../enable'
import { runDisable } from '../disable'
import type { Engine } from '@as/types'

function makeEngine(
  enableFn: (slug: string, target: string) => Promise<void> = async () => {},
  disableFn: (slug: string, target: string) => Promise<void> = async () => {}
): Engine {
  return { enable: enableFn, disable: disableFn } as unknown as Engine
}

test('runEnable enables for specified target', async () => {
  let called = false
  const engine = makeEngine(async (s, t) => { called = true; expect(s).toBe('test-mcp'); expect(t).toBe('claude') })
  await runEnable(engine, ['test-mcp', '--for', 'claude'], () => {})
  expect(called).toBe(true)
})

test('runEnable shows success message', async () => {
  const lines: string[] = []
  await runEnable(makeEngine(), ['test-mcp', '--for', 'claude'], s => lines.push(s))
  expect(lines.join('\n')).toContain('enabled')
})

test('runEnable shows usage when --for missing', async () => {
  const lines: string[] = []
  await runEnable(makeEngine(), ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runDisable disables for specified target', async () => {
  let called = false
  const engine = makeEngine(async () => {}, async (s, t) => { called = true; expect(t).toBe('codex') })
  await runDisable(engine, ['test-mcp', '--for', 'codex'], () => {})
  expect(called).toBe(true)
})

test('runDisable shows success message', async () => {
  const lines: string[] = []
  await runDisable(makeEngine(), ['test-mcp', '--for', 'claude'], s => lines.push(s))
  expect(lines.join('\n')).toContain('disabled')
})

test('runDisable shows usage when --for missing', async () => {
  const lines: string[] = []
  await runDisable(makeEngine(), ['test-mcp'], s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage')
})

test('runEnable returns 0 on success and 1 on failure', async () => {
  expect(await runEnable(makeEngine(), ['test-mcp', '--for', 'claude'], () => {})).toBe(0)
  const failing = makeEngine(async () => { throw new Error('conflict') })
  expect(await runEnable(failing, ['test-mcp', '--for', 'claude'], () => {})).toBe(1)
})

test('runEnable returns usage error when --for missing', async () => {
  expect(await runEnable(makeEngine(), ['test-mcp'], () => {})).toBe(2)
})

test('runEnable rejects an unknown target', async () => {
  let called = false
  const engine = makeEngine(async () => { called = true })
  expect(await runEnable(engine, ['test-mcp', '--for', 'cursor'], () => {})).toBe(2)
  expect(called).toBe(false)
})

test('runDisable returns 0 on success and 1 on failure', async () => {
  expect(await runDisable(makeEngine(), ['test-mcp', '--for', 'codex'], () => {})).toBe(0)
  const failing = makeEngine(async () => {}, async () => { throw new Error('changed outside') })
  expect(await runDisable(failing, ['test-mcp', '--for', 'codex'], () => {})).toBe(1)
})

test('runDisable returns usage error when --for missing', async () => {
  expect(await runDisable(makeEngine(), ['test-mcp'], () => {})).toBe(2)
})

test('runEnable passes --replace and runDisable passes --force', async () => {
  const seen: unknown[] = []
  const engine = {
    enable: async (_s: string, _t: string, o?: unknown) => { seen.push(o) },
    disable: async (_s: string, _t: string, o?: unknown) => { seen.push(o) },
  } as unknown as Engine
  await runEnable(engine, ['m', '--for', 'claude', '--replace'], () => {})
  await runEnable(engine, ['m', '--for', 'claude'], () => {})
  await runDisable(engine, ['m', '--for', 'codex', '--force'], () => {})
  expect(seen).toEqual([{ replace: true }, undefined, { force: true }])
})
