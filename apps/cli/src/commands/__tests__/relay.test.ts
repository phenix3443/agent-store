import { test, expect } from 'bun:test'
import { runRelay } from '../relay'
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
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
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
