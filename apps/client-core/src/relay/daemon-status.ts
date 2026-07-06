import { readFile } from 'fs/promises'
import { join } from 'path'
import type { RelayStatus } from '@as/types'

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
  return { running: true, pid }
}
