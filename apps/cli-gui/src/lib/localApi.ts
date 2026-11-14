import { Command } from '@tauri-apps/plugin-shell'
import { getStoreBaseUrl } from './storeAuth'

let started = false

/**
 * Starts `aas __local-api`, which tells the web store's pages which of the items they show
 * are installed here (apps/client-core/src/local-api/server.ts). The child is never written
 * to: it exits when this app does and its stdin closes.
 */
export async function startLocalApi(): Promise<void> {
  if (started) return
  started = true
  try {
    await Command.sidecar('binaries/aas', ['__local-api', new URL(getStoreBaseUrl()).origin]).spawn()
  } catch {
    // Outside the Tauri shell (the dev page in a plain browser) there is no sidecar.
    started = false
  }
}
