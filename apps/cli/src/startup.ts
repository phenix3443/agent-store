/**
 * Every `aas` command, and every desktop-client action (it runs `aas __rpc`), first
 * refreshes a relay takeover left by an older version. That is what makes the relay
 * usable again right after an upgrade: the relay daemon is long-lived and may never
 * restart. A failure here must not break the command the user ran.
 */
export async function refreshRelayOnStartup(
  refresh: () => Promise<unknown>,
  warn: (s: string) => void = console.error
): Promise<void> {
  try {
    await refresh()
  } catch (err) {
    warn(`warning: could not refresh the Claude Code / Codex relay config: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Moves Agent Store's state from ~/.agents to ~/.agent-store once (#111). Only for
 * the default home: an explicit AS_HOME is left as it is. Like the relay refresh,
 * a failure is reported and the command still runs; the next one tries again.
 */
export async function migrateHomeOnStartup(
  migrate: () => Promise<{ steps: Array<{ slug: string; result: string; message: string }>; relayStopped: boolean } | null>,
  restartRelay: () => Promise<unknown>,
  warn: (s: string) => void = console.error
): Promise<void> {
  try {
    const result = await migrate()
    if (!result) return
    warn('Agent Store moved its files from ~/.agents to ~/.agent-store:')
    for (const s of result.steps) warn(`  ${s.result.padEnd(7)} ${s.slug}: ${s.message}`)
    if (result.relayStopped) await restartRelay()
  } catch (err) {
    warn(`warning: could not move Agent Store's files from ~/.agents to ~/.agent-store: ${err instanceof Error ? err.message : String(err)}`)
  }
}
