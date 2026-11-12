import { test, expect } from 'bun:test'
import { refreshRelayOnStartup } from '../../startup'

test('startup runs the relay config refresh once', async () => {
  let calls = 0
  await refreshRelayOnStartup(async () => { calls++ }, () => {})
  expect(calls).toBe(1)
})

test('a failing refresh is reported on stderr and never fails the command', async () => {
  const warnings: string[] = []
  await refreshRelayOnStartup(async () => { throw new Error('settings.json could not be parsed') }, s => warnings.push(s))
  expect(warnings.join('\n')).toContain('settings.json could not be parsed')
})
