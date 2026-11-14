import type { RelayListener, RelayStatus, ToolTarget } from '@as/types'

// Must match RELAY_PORT in apps/client-core/src/relay/server.ts: enabling a provider writes
// this address into the agents' configs whatever port the relay listens on.
export const AGENT_RELAY_ADDRESS = '127.0.0.1:18780'

export type RelayState = 'stopped' | 'listening' | 'failed' | 'unreported'

/** The listeners that could not bind; the daemon keeps retrying them. */
export function failedListeners(status: RelayStatus | null): RelayListener[] {
  return status?.running ? (status.listeners ?? []).filter((l) => !l.listening) : []
}

export function relayState(status: RelayStatus | null): RelayState {
  if (!status?.running) return 'stopped'
  if (!status.listeners) return 'unreported'
  return status.listeners.some((l) => l.listening) ? 'listening' : 'failed'
}

export function routedTargets(status: RelayStatus | null): ToolTarget[] {
  return (Object.entries(status?.routedAgents ?? {}) as [ToolTarget, boolean][]).filter(([, on]) => on).map(([target]) => target)
}
