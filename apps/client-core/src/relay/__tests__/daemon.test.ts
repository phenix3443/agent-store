import { test, expect } from 'bun:test'
import { reconcileRelayInstances, relayListeners, runRelayDaemon, type RunningRelayInstance } from '../daemon'
import { readRelayListenState } from '../listen-state'
import type { LocalRelayConfig } from '@as/types'

function config(id: string, port: number, enabled = true, name = id): LocalRelayConfig {
  return { id, name, port, enabled, enabledFor: { claude: true, codex: true } }
}

test('starts an instance for a new enabled config', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
  expect(running.has('a')).toBe(true)
  expect(running.get('a')!.port).toBe(18780)
})

test('does not restart an already-running instance whose config is unchanged', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
})

test('stops an instance when its config is removed', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('stops an instance when its config is disabled', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780, true)], running, start)
  reconcileRelayInstances([config('a', 18780, false)], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('restarts an instance when its port changes', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: number[] = []
  const started: number[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.port)
    return { id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.port) }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18880)], running, start)

  expect(stopped).toEqual([18780])
  expect(started).toEqual([18780, 18880])
  expect(running.get('a')!.port).toBe(18880)
})

test('handles multiple configs independently', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780), config('b', 18880)], running, start)

  expect(started).toEqual(['a', 'b'])
  expect(running.size).toBe(2)
})

test('a start failure for one config does not prevent other configs from starting, and does not throw', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    if (cfg.id === 'bad') throw new Error('EADDRINUSE: address already in use')
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  expect(() => {
    reconcileRelayInstances([config('good', 18780), config('bad', 18880)], running, start)
  }).not.toThrow()

  expect(started).toEqual(['good'])
  expect(running.has('good')).toBe(true)
  expect(running.has('bad')).toBe(false)
})

test('a config that failed to start is retried on the next reconcile call', () => {
  const running = new Map<string, RunningRelayInstance>()
  let shouldFail = true
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    if (shouldFail) throw new Error('EADDRINUSE')
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  expect(running.has('a')).toBe(false)

  shouldFail = false
  reconcileRelayInstances([config('a', 18780)], running, start)
  expect(running.has('a')).toBe(true)
})

test('runRelayDaemon starts a real server per enabled config and stops it on abort', async () => {
  const { mkdtemp, rm, writeFile } = await import('fs/promises')
  const { join } = await import('path')
  const aasHome = await mkdtemp('/tmp/as-daemon-test-')

  try {
    await writeFile(
      join(aasHome, 'relay-configs.json'),
      JSON.stringify([{ id: 'a', name: 'A', port: 0, enabled: true }])
    )

    const controller = new AbortController()
    const daemonPromise = runRelayDaemon(aasHome, { pollIntervalMs: 20, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 60))

    controller.abort()
    await daemonPromise
  } finally {
    await rm(aasHome, { recursive: true, force: true })
  }
})

test('a failed start is kept per config and cleared once the port can be bound', () => {
  const running = new Map<string, RunningRelayInstance>()
  const failures = new Map<string, unknown>()
  let busy = true
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    if (busy) throw Object.assign(new Error(`Failed to start server. Is port ${cfg.port} in use?`), { code: 'EADDRINUSE' })
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }
  const desired = [config('a', 18780), config('off', 18880, false)]

  reconcileRelayInstances(desired, running, start, failures)
  expect(relayListeners(desired, running, failures)).toEqual([
    { id: 'a', name: 'a', port: 18780, listening: false, error: 'Failed to start server. Is port 18780 in use?', code: 'EADDRINUSE' },
  ])

  busy = false
  reconcileRelayInstances(desired, running, start, failures)
  expect(relayListeners(desired, running, failures)).toEqual([{ id: 'a', name: 'a', port: 18780, listening: true }])
  expect(failures.size).toBe(0)
})

test('runRelayDaemon records a port another process holds, with the reason', async () => {
  const { mkdtemp, rm, writeFile } = await import('fs/promises')
  const { join } = await import('path')
  const aasHome = await mkdtemp('/tmp/as-daemon-test-')
  const holder = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('taken') })

  try {
    await writeFile(
      join(aasHome, 'relay-configs.json'),
      JSON.stringify([{ id: 'a', name: 'A', port: holder.port, enabled: true }])
    )
    const controller = new AbortController()
    const daemonPromise = runRelayDaemon(aasHome, {
      pollIntervalMs: 20,
      signal: controller.signal,
      paths: { aasHome, claudeConfigDir: join(aasHome, 'claude'), codexConfigDir: join(aasHome, 'codex') },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    controller.abort()
    await daemonPromise

    const state = await readRelayListenState(aasHome)
    expect(state?.pid).toBe(process.pid)
    expect(state?.listeners).toHaveLength(1)
    expect(state?.listeners[0]).toMatchObject({ id: 'a', port: holder.port, listening: false, code: 'EADDRINUSE' })
    expect(state?.listeners[0]?.error).toBeTruthy()
  } finally {
    holder.stop(true)
    await rm(aasHome, { recursive: true, force: true })
  }
})

test('runRelayDaemon records the ports it listens on', async () => {
  const { mkdtemp, rm, writeFile } = await import('fs/promises')
  const { join } = await import('path')
  const aasHome = await mkdtemp('/tmp/as-daemon-test-')

  try {
    await writeFile(join(aasHome, 'relay-configs.json'), JSON.stringify([{ id: 'a', name: 'A', port: 18999, enabled: true }]))
    const controller = new AbortController()
    const daemonPromise = runRelayDaemon(aasHome, {
      pollIntervalMs: 20,
      signal: controller.signal,
      paths: { aasHome, claudeConfigDir: join(aasHome, 'claude'), codexConfigDir: join(aasHome, 'codex') },
      startServer: ({ port }) => ({ port: port ?? 0, stop: () => {} }),
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    controller.abort()
    await daemonPromise

    expect((await readRelayListenState(aasHome))?.listeners).toEqual([{ id: 'a', name: 'A', port: 18999, listening: true }])
  } finally {
    await rm(aasHome, { recursive: true, force: true })
  }
})
