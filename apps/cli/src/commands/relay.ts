export interface RelayProcessOps {
  spawnDetached: () => number
  isRunning: (pid: number) => boolean
  kill: (pid: number) => void
  readPidFile: () => Promise<number | null>
  writePidFile: (pid: number) => Promise<void>
  removePidFile: () => Promise<void>
}

async function isAlreadyRunning(ops: RelayProcessOps): Promise<number | null> {
  const pid = await ops.readPidFile()
  if (pid != null && ops.isRunning(pid)) return pid
  return null
}

/** Starts the relay unless it already runs; returns its pid and whether this call started it. */
export async function ensureRelayRunning(ops: RelayProcessOps): Promise<{ pid: number; started: boolean }> {
  const running = await isAlreadyRunning(ops)
  if (running) return { pid: running, started: false }
  const pid = ops.spawnDetached()
  await ops.writePidFile(pid)
  return { pid, started: true }
}

/** Sends SIGTERM and waits up to `timeoutMs` for the process to exit, so the port is free on return. */
export async function stopRelay(ops: RelayProcessOps, timeoutMs = 3000): Promise<number | null> {
  const pid = await isAlreadyRunning(ops)
  if (!pid) return null
  ops.kill(pid)
  const deadline = Date.now() + timeoutMs
  while (ops.isRunning(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
  await ops.removePidFile()
  return pid
}

export async function runRelay(
  args: string[],
  ops: RelayProcessOps,
  out: (s: string) => void = console.log
): Promise<void> {
  const subcommand = args[0]

  if (subcommand === 'start') {
    const { pid, started } = await ensureRelayRunning(ops)
    out(started ? `  relay started (pid ${pid})` : `  relay already running (pid ${pid})`)
    return
  }

  if (subcommand === 'stop') {
    const stopped = await stopRelay(ops)
    out(stopped ? `  relay stopped (pid ${stopped})` : '  relay not running')
    return
  }

  if (subcommand === 'status') {
    const running = await isAlreadyRunning(ops)
    out(running ? `  relay running (pid ${running})` : '  relay stopped')
    return
  }

  out('Usage: aas relay <start|stop|status>')
}
