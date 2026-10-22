import { test, expect } from 'bun:test'
import { runMigrateCommand } from '../migrate'

const res = (steps: { slug: string; result: 'done' | 'skipped' | 'error'; message: string }[]) => async () => ({ backupDir: '/b', steps })

test('runMigrateCommand returns 0 with nothing to do', async () => {
  const lines: string[] = []
  expect(await runMigrateCommand(res([]), s => lines.push(s), () => false)).toBe(0)
  expect(lines).toEqual(['  Nothing to migrate'])
})

test('runMigrateCommand prints steps and the backup dir', async () => {
  const lines: string[] = []
  const code = await runMigrateCommand(res([{ slug: 's', result: 'done', message: 'converted' }]), s => lines.push(s), () => true)
  expect(code).toBe(0)
  expect(lines.join('\n')).toContain('[s] converted')
  expect(lines.join('\n')).toContain('Backup: /b')
})

test('runMigrateCommand returns 1 when a skill fails or migrate throws', async () => {
  expect(await runMigrateCommand(res([{ slug: 's', result: 'error', message: 'x' }]), () => {}, () => false)).toBe(1)
  expect(await runMigrateCommand(async () => { throw new Error('boom') }, () => {}, () => false)).toBe(1)
})
