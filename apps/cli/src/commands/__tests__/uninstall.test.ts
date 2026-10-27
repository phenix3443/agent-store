import { test, expect } from 'bun:test'
import { runUninstall } from '../uninstall'
import type { Engine } from '@as/types'

function makeEngine(uninstall: (slug: string) => Promise<void> = async () => {}): Engine {
  return { uninstall } as unknown as Engine
}

test('runUninstall returns 0 on success', async () => {
  const lines: string[] = []
  expect(await runUninstall(makeEngine(), ['x'], s => lines.push(s))).toBe(0)
  expect(lines.join('\n')).toContain('Uninstalled x')
})

test('runUninstall returns 1 on failure', async () => {
  const lines: string[] = []
  const engine = makeEngine(async () => { throw new Error('Item not installed: x') })
  expect(await runUninstall(engine, ['x'], s => lines.push(s))).toBe(1)
  expect(lines.join('\n')).toContain('Item not installed')
})

test('runUninstall returns usage error without a slug', async () => {
  expect(await runUninstall(makeEngine(), [], () => {})).toBe(2)
})

test('runUninstall passes --force', async () => {
  let opts: unknown
  const engine = { uninstall: async (_s: string, o?: unknown) => { opts = o } } as unknown as Engine
  await runUninstall(engine, ['x', '--force'], () => {})
  expect(opts).toEqual({ force: true })
})
