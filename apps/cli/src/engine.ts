import { EngineImpl } from '@as/client-core'
import { ensureRelayRunning } from './commands/relay'
import { realRelayOps } from './relay-ops'

// The default must be the public store: the desktop client spawns this CLI as its
// sidecar without AS_STORE_URL. Local dev and tests set AS_STORE_URL themselves.
const DEFAULT_STORE_URL = 'https://agent-store-test.panghuli.tech'

export function createEngine(): EngineImpl {
  const storeUrl = process.env['AS_STORE_URL'] ?? DEFAULT_STORE_URL
  // The desktop client enables providers through this CLI too, so enabling one starts the relay it points at.
  return new EngineImpl(undefined, storeUrl, { startRelay: async () => { await ensureRelayRunning(realRelayOps()) } })
}
