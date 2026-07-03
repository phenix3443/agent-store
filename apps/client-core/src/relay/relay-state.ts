import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'

function statePath(aasHome: string, platform: 'claude' | 'codex'): string {
  return join(aasHome, 'relay-state', `${platform}.json`)
}

export async function readRelayState<T>(aasHome: string, platform: 'claude' | 'codex'): Promise<T | null> {
  try {
    return JSON.parse(await readFile(statePath(aasHome, platform), 'utf-8')) as T
  } catch {
    return null
  }
}

export async function writeRelayState<T>(aasHome: string, platform: 'claude' | 'codex', state: T): Promise<void> {
  const path = statePath(aasHome, platform)
  await mkdir(join(aasHome, 'relay-state'), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2))
}

export async function clearRelayState(aasHome: string, platform: 'claude' | 'codex'): Promise<void> {
  await rm(statePath(aasHome, platform), { force: true })
}
