import { test, expect } from 'bun:test'
import { runRelay, ensureRelayRunning, stopRelay } from '../relay'
import type { RelayProcessOps } from '../relay'

function makeOps(overrides?: Partial<RelayProcessOps>): RelayProcessOps & { spawned: string[]; killed: number[] } {
  const spawned: string[] = []
  const killed: number[] = []
  let storedPid: number | null = null

  return {
    spawned,
    killed,
    spawnDetached: () => { spawned.push('spawned'); return 12345 },
    isRunning: () => true,
    kill: (pid: number) => { killed.push(pid) },
    readPidFile: async () => storedPid,
    writePidFile: async (pid: number) => { storedPid = pid },
    removePidFile: async () => { storedPid = null },
    ...overrides,
  }
}

test('relay start spawns and writes the pid file when not already running', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(1)
  expect(lines.join('\n')).toContain('started')
})

test('relay start does nothing when already running', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(0)
  expect(lines.join('\n')).toContain('already running')
})

test('relay start replaces a stale pid file (process no longer running)', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => false })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(1)
})

test('relay stop kills the running process and removes the pid file', async () => {
  const killed = new Set<number>()
  const ops = makeOps({ readPidFile: async () => 999, isRunning: (pid) => !killed.has(pid), kill: (pid) => { killed.add(pid); ops.killed.push(pid) } })
  const lines: string[] = []
  await runRelay(['stop'], ops, s => lines.push(s))
  expect(ops.killed).toEqual([999])
  expect(lines.join('\n')).toContain('stopped')
})

test('relay stop reports not running when there is no pid file', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['stop'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('not running')
})

test('relay status reports running', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  const lines: string[] = []
  await runRelay(['status'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('running')
})

test('relay status reports stopped', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['status'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('stopped')
})

test('relay with no subcommand prints usage', async () => {
  const ops = makeOps()
  const lines: string[] = []
  await runRelay([], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage: aas relay')
})

test('ensureRelayRunning starts the relay only when it is not already running', async () => {
  const down = makeOps()
  await ensureRelayRunning(down)
  expect(down.spawned).toHaveLength(1)
  expect(await down.readPidFile()).toBe(12345)

  const up = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  await ensureRelayRunning(up)
  expect(up.spawned).toHaveLength(0)
})

test('stopRelay waits until the process has exited', async () => {
  let alive = 3
  const ops = makeOps({ isRunning: () => alive-- > 0 })
  await ops.writePidFile(999)
  const started = Date.now()
  expect(await stopRelay(ops, 2000)).toBe(999)
  expect(alive).toBeLessThanOrEqual(0)
  expect(Date.now() - started).toBeGreaterThanOrEqual(150)
  expect(await ops.readPidFile()).toBeNull()
})

test('stopRelay gives up waiting after the timeout and still clears the pid file', async () => {
  let stored: number | null = 999
  const ops = makeOps({ readPidFile: async () => stored, removePidFile: async () => { stored = null }, isRunning: () => true })
  expect(await stopRelay(ops, 150)).toBe(999)
  expect(stored).toBeNull()
})

test('stopRelay does nothing when no relay runs', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  expect(await stopRelay(ops)).toBeNull()
  expect(ops.killed).toEqual([])
})
