import { test, expect } from 'bun:test'
import { withTimeout } from '../waffo'

// A fetch that never answers unless its signal aborts — stands in for a stalled API.
const hanging: typeof fetch = ((_input: unknown, init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })) as typeof fetch

test('withTimeout aborts a request that does not answer in time', async () => {
  const started = Date.now()
  await expect(withTimeout(hanging, 50)('https://api.example/x')).rejects.toThrow()
  expect(Date.now() - started).toBeLessThan(1000)
})

test('withTimeout keeps a caller-supplied signal', async () => {
  const controller = new AbortController()
  const p = withTimeout(hanging, 60_000)('https://api.example/x', { signal: controller.signal })
  controller.abort(new Error('caller'))
  await expect(p).rejects.toThrow('caller')
})
