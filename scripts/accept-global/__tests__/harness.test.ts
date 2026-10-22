import { expect, test } from 'bun:test'
import { equalUnderRule } from '../configs'
import { run } from '../proc'
import { Reporter } from '../report'
import { suspiciousRealRoot } from '../roots'

const quiet = () => new Reporter(() => {})

test('exit code: 0 when every required item passed', () => {
  const r = quiet()
  r.record('recognition', 'a', 'PASS')
  r.record('usage', 'optional', 'SKIP', undefined, false)
  expect(r.exitCode()).toBe(0)
})

test('exit code: 1 on any FAIL, even with skips', () => {
  const r = quiet()
  r.record('usage', 'u1', 'SKIP')
  r.record('lifecycle', 'b', 'FAIL')
  expect(r.exitCode()).toBe(1)
})

test('exit code: 2 (INCOMPLETE) when a required item was skipped', () => {
  const r = quiet()
  r.record('recognition', 'a', 'PASS')
  r.record('usage', 'u1', 'SKIP')
  expect(r.exitCode()).toBe(2)
  expect(r.summary()['result']).toBe('INCOMPLETE')
})

test('comparison rule: empty args/env (and Claude headers) equal their absence', () => {
  expect(equalUnderRule('claude', { command: 'node', args: [] }, { command: 'node' })).toBe(true)
  expect(equalUnderRule('claude', { type: 'http', url: 'u', headers: {} }, { type: 'http', url: 'u' })).toBe(true)
  expect(equalUnderRule('codex', { command: 'node', args: [], env: {} }, { command: 'node' })).toBe(true)
})

test('comparison rule: nothing else is normalized', () => {
  expect(equalUnderRule('claude', { command: 'node', args: ['x'] }, { command: 'node' })).toBe(false)
  expect(equalUnderRule('claude', { command: 'node', env: { K: '' } }, { command: 'node' })).toBe(false)
  expect(equalUnderRule('codex', { command: 'node', http_headers: {} }, { command: 'node' })).toBe(false)
  expect(equalUnderRule('codex', { command: 'node', headers: {} }, { command: 'node' })).toBe(false)
  expect(equalUnderRule('claude', { command: 'node', timeout: 5 }, { command: 'node' })).toBe(false)
  expect(equalUnderRule('codex', { command: 'node', startup_timeout_sec: 1 }, { command: 'node', startup_timeout_sec: '1' })).toBe(false)
})

test('--real refuses temp dirs and agent profiles', () => {
  expect(suspiciousRealRoot('/tmp/x')).toContain('temp')
  expect(suspiciousRealRoot('/Users/u/.config/ai-team/claude-coder-profile')).toContain('profile')
  expect(suspiciousRealRoot('/Users/u/.paperclip/instances/x')).toContain('profile')
  expect(suspiciousRealRoot('/Users/u')).toBeUndefined()
})

test('run() kills a hanging child at the bound', async () => {
  const res = await run(['sh', '-c', 'sleep 30'], { env: { PATH: process.env['PATH'] ?? '' }, cwd: '/', timeoutMs: 300 })
  expect(res.timedOut).toBe(true)
  expect(res.code).toBeNull()
  expect(res.ms).toBeLessThan(3000)
})
