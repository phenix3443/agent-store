import type { LocalRelayConfig, RelayListener } from '@as/types'
import { listLocalConfigs } from './local-configs'
import { listenError, writeRelayListenState } from './listen-state'
import { startRelayServer } from './server'
import { refreshRelayTakeover, type RelayTakeoverPaths } from './refresh'
import { resolvePaths } from '../paths'

export interface RunningRelayInstance {
  id: string
  port: number
  stop: () => void
}

/** `failures` keeps, per config id, why its last start failed; a later successful start clears it. */
export function reconcileRelayInstances(
  desired: LocalRelayConfig[],
  running: Map<string, RunningRelayInstance>,
  start: (config: LocalRelayConfig) => RunningRelayInstance,
  failures: Map<string, unknown> = new Map()
): void {
  const desiredEnabled = new Map(desired.filter((c) => c.enabled).map((c) => [c.id, c]))

  for (const [id, instance] of running) {
    const desiredConfig = desiredEnabled.get(id)
    if (!desiredConfig || desiredConfig.port !== instance.port) {
      instance.stop()
      running.delete(id)
    }
  }

  for (const [id, cfg] of desiredEnabled) {
    if (!running.has(id)) {
      try {
        running.set(id, start(cfg))
        failures.delete(id)
      } catch (err) {
        failures.set(id, err)
        console.error(`[relay-daemon] failed to start local relay config "${cfg.name}" (${id}) on port ${cfg.port}:`, err)
      }
    }
  }
  for (const id of failures.keys()) if (!desiredEnabled.has(id)) failures.delete(id)
}

export function relayListeners(
  desired: LocalRelayConfig[],
  running: Map<string, RunningRelayInstance>,
  failures: Map<string, unknown>
): RelayListener[] {
  return desired
    .filter((c) => c.enabled)
    .map((c) => {
      const instance = running.get(c.id)
      if (instance) return { id: c.id, name: c.name, port: instance.port, listening: true }
      const failure = failures.get(c.id)
      return { id: c.id, name: c.name, port: c.port, listening: false, ...(failure === undefined ? {} : listenError(failure)) }
    })
}

export async function runRelayDaemon(
  aasHome: string,
  options: {
    pollIntervalMs?: number
    signal?: AbortSignal
    paths?: RelayTakeoverPaths
    startServer?: typeof startRelayServer
  } = {}
): Promise<void> {
  const { pollIntervalMs = 3000, signal } = options
  // Every relay start, however it was triggered, first brings configs taken over by
  // an older version up to the token this relay will require.
  try {
    await refreshRelayTakeover(options.paths ?? resolvePaths({ aasHome }))
  } catch (err) {
    console.error('[relay-daemon] could not refresh the Claude Code / Codex relay config:', err)
  }
  const running = new Map<string, RunningRelayInstance>()
  const failures = new Map<string, unknown>()
  const start = (config: LocalRelayConfig): RunningRelayInstance => {
    const server = (options.startServer ?? startRelayServer)({ aasHome, port: config.port })
    return { id: config.id, port: server.port, stop: server.stop }
  }

  let reported = ''
  while (!signal?.aborted) {
    const desired = await listLocalConfigs(aasHome)
    reconcileRelayInstances(desired, running, start, failures)
    const state = { pid: process.pid, listeners: relayListeners(desired, running, failures) }
    const json = JSON.stringify(state)
    if (json !== reported) {
      try {
        await writeRelayListenState(aasHome, state)
        reported = json
      } catch (err) {
        console.error('[relay-daemon] could not record which ports it listens on:', err)
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  for (const instance of running.values()) instance.stop()
}
