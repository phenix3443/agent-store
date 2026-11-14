import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getRelayDaemonStatus, waitForRelayStatus } from '../daemon-status'
import { writeRelayListenState } from '../listen-state'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-daemon-status-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

test('returns not running when no pid file exists', async () => {
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})

test('returns running with the pid when the pid file names a live process', async () => {
  await writeFile(join(aasHome, 'relay.pid'), String(process.pid))
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: true, pid: process.pid })
})

test('returns not running when the pid file names a dead process', async () => {
  // PID 999999 is exceedingly unlikely to be a live process on any test machine.
  await writeFile(join(aasHome, 'relay.pid'), '999999')
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})

test('returns not running when the pid file contains garbage', async () => {
  await writeFile(join(aasHome, 'relay.pid'), 'not-a-number')
  const status = await getRelayDaemonStatus(aasHome)
  expect(status).toEqual({ running: false })
})

test("includes the ports the running daemon reported", async () => {
  await writeFile(join(aasHome, 'relay.pid'), String(process.pid))
  const listeners = [{ id: 'default', name: '默认', port: 18780, listening: false, error: 'Is port 18780 in use?', code: 'EADDRINUSE' }]
  await writeRelayListenState(aasHome, { pid: process.pid, listeners })
  expect(await getRelayDaemonStatus(aasHome)).toEqual({ running: true, pid: process.pid, listeners })
})

test("ignores a report left by an earlier daemon", async () => {
  await writeFile(join(aasHome, 'relay.pid'), String(process.pid))
  await writeRelayListenState(aasHome, { pid: 999999, listeners: [{ id: 'default', name: '默认', port: 18780, listening: true }] })
  expect(await getRelayDaemonStatus(aasHome)).toEqual({ running: true, pid: process.pid })
})

test('waitForRelayStatus returns as soon as the condition holds', async () => {
  setTimeout(() => void writeFile(join(aasHome, 'relay.pid'), String(process.pid)), 50)
  const status = await waitForRelayStatus(aasHome, (s) => s.running, { timeoutMs: 2000, intervalMs: 20 })
  expect(status.running).toBe(true)
})

test('waitForRelayStatus gives up after the timeout with the last status', async () => {
  const status = await waitForRelayStatus(aasHome, (s) => s.running, { timeoutMs: 60, intervalMs: 20 })
  expect(status).toEqual({ running: false })
})
