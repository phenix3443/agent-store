import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getRelayDaemonStatus } from '../daemon-status'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-daemon-status-test-')
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
