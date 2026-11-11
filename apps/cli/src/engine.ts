import { EngineImpl } from '@as/client-core'

// The default must be the public store: the desktop client spawns this CLI as its
// sidecar without AS_STORE_URL. Local dev and tests set AS_STORE_URL themselves.
const DEFAULT_STORE_URL = 'https://agent-store-test.panghuli.tech'

export function createEngine(): EngineImpl {
  const storeUrl = process.env['AS_STORE_URL'] ?? DEFAULT_STORE_URL
  return new EngineImpl(undefined, storeUrl)
}
