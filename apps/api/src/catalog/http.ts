import ky, { isHTTPError, isTimeoutError, type KyInstance } from 'ky'

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

/**
 * HTTP client for the discovery sites. ky retries 408/429/5xx with backoff and waits
 * out Retry-After (capped), which ClawHub's API terms ask clients to honor.
 */
export function upstreamClient(fetchImpl: typeof fetch, retries = 3): KyInstance {
  return ky.create({
    fetch: (input, init) => fetchImpl(input, init),
    headers: { 'user-agent': 'agent-store-catalog-sync' },
    timeout: 30_000,
    retry: {
      limit: retries,
      statusCodes: [408, 429, 500, 502, 503, 504],
      afterStatusCodes: [413, 429, 503],
      maxRetryAfter: 60_000,
      backoffLimit: 10_000,
      retryOnTimeout: true,
    },
  })
}

/** Short description of a failed upstream request, for the report. */
export function describeError(e: unknown): string {
  if (isHTTPError(e)) return `HTTP ${e.response.status} from ${e.request.url}`
  if (isTimeoutError(e)) return `timed out: ${e.request.url}`
  return e instanceof Error ? e.message : String(e)
}

export const isRateLimited = (e: unknown): boolean => isHTTPError(e) && e.response.status === 429
