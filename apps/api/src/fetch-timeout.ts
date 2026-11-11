/** Wraps a fetch so every call without its own signal aborts after `ms`. */
export function withTimeout(fetchImpl: typeof fetch, ms: number): typeof fetch {
  return ((input, init) => fetchImpl(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(ms) })) as typeof fetch
}
