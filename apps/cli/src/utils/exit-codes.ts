// Process exit codes for the item commands, so scripts (and the acceptance
// harness) can tell success from failure without parsing output.
export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
