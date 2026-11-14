import type { BatchError } from '@as/types'

/**
 * `code` is the error class name; `reason` / `tool` / `target` / `state` are the engine error's own
 * fields. The desktop client turns them into what the user should do next.
 */
export function errorFields(err: unknown): Record<string, string> {
  if (!(err instanceof Error)) return {}
  const fields: Record<string, string> = { code: err.name }
  for (const key of ['reason', 'tool', 'target', 'state'] as const) {
    const value = (err as unknown as Record<string, unknown>)[key]
    if (typeof value === 'string') fields[key] = value
  }
  return fields
}

export function batchError(err: unknown): BatchError {
  return { message: err instanceof Error ? err.message : String(err), ...errorFields(err) }
}
