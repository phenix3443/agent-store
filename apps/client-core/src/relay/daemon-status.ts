import { readFile } from 'fs/promises'
import { join } from 'path'
import type { RelayStatus } from '@as/types'
import { readRelayListenState } from './listen-state'

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function getRelayDaemonStatus(aasHome: string): Promise<RelayStatus> {
  let pid: number
  try {
    const raw = (await readFile(join(aasHome, 'relay.pid'), 'utf-8')).trim()
    pid = Number(raw)
    if (!Number.isInteger(pid)) return { running: false }
  } catch {
    return { running: false }
  }

  if (!isProcessRunning(pid)) return { running: false }
  const listen = await readRelayListenState(aasHome)
  return listen?.pid === pid ? { running: true, pid, listeners: listen.listeners } : { running: true, pid }
}

/** Polls the daemon status until `done` holds or `timeoutMs` passes, and returns the last status. */
export async function waitForRelayStatus(
  aasHome: string,
  done: (status: RelayStatus) => boolean,
  { timeoutMs = 5000, intervalMs = 150 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<RelayStatus> {
  const deadline = Date.now() + timeoutMs
  let status = await getRelayDaemonStatus(aasHome)
  while (!done(status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    status = await getRelayDaemonStatus(aasHome)
  }
  return status
}
