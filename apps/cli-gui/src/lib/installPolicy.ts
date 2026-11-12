import type { InstallOutcome } from '@as/types'

/** The engine left a tool disabled for something the user fills in on the config page. */
export function needsSetup(outcome: InstallOutcome): boolean {
  return outcome.notEnabled.some((n) => n.reason === 'needs-config' || n.reason === 'no-key')
}

/** Engine errors that `--force` gets past. */
const FORCEABLE = new Set(['McpChangedOutsideError', 'SkillConflictError', 'SkillDeployRefusedError'])

export function canForce(code: string | undefined): boolean {
  return code !== undefined && FORCEABLE.has(code)
}
