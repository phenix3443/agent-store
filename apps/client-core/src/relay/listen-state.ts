import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import type { RelayListener } from '@as/types'

const LISTEN_FILE = 'relay-listen.json'

/** What the daemon with `pid` last managed to bind. Only that daemon's report counts. */
export interface RelayListenState {
  pid: number
  listeners: RelayListener[]
}

export async function readRelayListenState(aasHome: string): Promise<RelayListenState | null> {
  try {
    const parsed = JSON.parse(await readFile(join(aasHome, LISTEN_FILE), 'utf-8')) as Partial<RelayListenState>
    if (typeof parsed.pid === 'number' && Array.isArray(parsed.listeners)) return parsed as RelayListenState
  } catch {
    // missing or half-written: the daemon has not reported yet
  }
  return null
}

export async function writeRelayListenState(aasHome: string, state: RelayListenState): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  const path = join(aasHome, LISTEN_FILE)
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(state, null, 2))
  await rename(tmp, path)
}

export function listenError(err: unknown): { error: string; code?: string } {
  const code = (err as { code?: unknown } | null)?.code
  return {
    error: err instanceof Error ? err.message : String(err),
    ...(typeof code === 'string' ? { code } : {}),
  }
}
