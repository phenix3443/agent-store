export class UpstreamError extends Error {
  constructor(
    readonly code: 'timeout' | 'rate_limited' | 'not_found' | 'unavailable' | 'bad_response',
    message: string,
  ) {
    super(message)
    this.name = 'UpstreamError'
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
}

async function get(fetchImpl: typeof fetch, url: string, label: string, timeoutMs: number, accept: string): Promise<Response> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { accept, 'user-agent': 'agent-store-catalog-sync' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    if (isAbort(e)) throw new UpstreamError('timeout', `${label} did not answer within ${timeoutMs} ms`)
    throw new UpstreamError('unavailable', `${label} unreachable: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (res.status === 404) throw new UpstreamError('not_found', `${label}: HTTP 404`)
  if (res.status === 429) throw new UpstreamError('rate_limited', `${label}: HTTP 429`)
  if (!res.ok) throw new UpstreamError(res.status >= 500 ? 'unavailable' : 'bad_response', `${label}: HTTP ${res.status}`)
  return res
}

/** GET JSON, mapping timeouts, rate limits and non-2xx answers to UpstreamError. */
export async function getJson(fetchImpl: typeof fetch, url: string, label: string, timeoutMs = 15_000): Promise<unknown> {
  const res = await get(fetchImpl, url, label, timeoutMs, 'application/json')
  try {
    return await res.json()
  } catch (e) {
    if (isAbort(e)) throw new UpstreamError('timeout', `${label} did not answer within ${timeoutMs} ms`)
    throw new UpstreamError('bad_response', `${label} returned invalid JSON`)
  }
}

export async function getText(fetchImpl: typeof fetch, url: string, label: string, timeoutMs = 15_000): Promise<string> {
  const res = await get(fetchImpl, url, label, timeoutMs, '*/*')
  return await res.text()
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
