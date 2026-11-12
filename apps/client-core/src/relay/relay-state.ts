import { rm } from 'fs/promises'
import { join } from 'path'
import { atomicWriteSecretFile, readJsonObject } from '../config/safe-file'

function statePath(aasHome: string, platform: 'claude' | 'codex'): string {
  return join(aasHome, 'relay-state', `${platform}.json`)
}

/** `null` when no snapshot exists; a snapshot that does not parse throws, so it is never re-taken over the relay's own values. */
export async function readRelayState<T>(aasHome: string, platform: 'claude' | 'codex'): Promise<T | null> {
  return ((await readJsonObject(statePath(aasHome, platform))) as T | undefined) ?? null
}

export async function writeRelayState<T>(aasHome: string, platform: 'claude' | 'codex', state: T): Promise<void> {
  await atomicWriteSecretFile(statePath(aasHome, platform), JSON.stringify(state, null, 2))
}

export async function clearRelayState(aasHome: string, platform: 'claude' | 'codex'): Promise<void> {
  await rm(statePath(aasHome, platform), { force: true })
}
