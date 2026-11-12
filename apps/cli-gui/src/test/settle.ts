/**
 * Lets the RPC chains a test started (a refresh after an install, a status read
 * after a toggle) finish while the RPC mock is still in place. Without it a call
 * that lands after `mock.restore()` hits the real `callRpc`, which has no Tauri
 * IPC in tests, and bun fails the run with "Unhandled error between tests".
 */
export async function settleRpc(ticks = 25): Promise<void> {
  for (let i = 0; i < ticks; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
