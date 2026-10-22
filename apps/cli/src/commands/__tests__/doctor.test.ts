import { test, expect } from 'bun:test'
import { runDoctorCommand } from '../doctor'

test('runDoctorCommand returns 0 when nothing is wrong', async () => {
  const lines: string[] = []
  expect(await runDoctorCommand(async () => [], s => lines.push(s))).toBe(0)
  expect(lines.join('\n')).toContain('No problems found')
})

test('runDoctorCommand returns 0 on warnings only', async () => {
  const lines: string[] = []
  const code = await runDoctorCommand(async () => [{ level: 'warn', code: 'skill-modified', slug: 's', message: 'changed' }], s => lines.push(s))
  expect(code).toBe(0)
  expect(lines.join('\n')).toContain('skill-modified [s]: changed')
})

test('runDoctorCommand returns 1 on an error or when the check throws', async () => {
  expect(await runDoctorCommand(async () => [{ level: 'error', code: 'mcp-missing', message: 'x' }], () => {})).toBe(1)
  expect(await runDoctorCommand(async () => { throw new Error('boom') }, () => {})).toBe(1)
})
