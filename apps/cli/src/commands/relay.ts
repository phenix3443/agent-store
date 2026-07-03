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

export async function runRelay(
  args: string[],
  ops: RelayProcessOps,
  out: (s: string) => void = console.log
): Promise<void> {
  const subcommand = args[0]

  if (subcommand === 'start') {
    const running = await isAlreadyRunning(ops)
    if (running) {
      out(`  relay already running (pid ${running})`)
      return
    }
    const pid = ops.spawnDetached()
    await ops.writePidFile(pid)
    out(`  relay started (pid ${pid})`)
    return
  }

  if (subcommand === 'stop') {
    const running = await isAlreadyRunning(ops)
    if (!running) {
      out('  relay not running')
      return
    }
    ops.kill(running)
    await ops.removePidFile()
    out(`  relay stopped (pid ${running})`)
    return
  }

  if (subcommand === 'status') {
    const running = await isAlreadyRunning(ops)
    out(running ? `  relay running (pid ${running})` : '  relay stopped')
    return
  }

  out('Usage: aas relay <start|stop|status>')
}
