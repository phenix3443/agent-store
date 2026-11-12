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
