import type { ProviderTestOutcome, ProviderTestResult, ToolTarget } from '@as/types'
import type { ProviderConnection } from '../config/provider'
import { buildAuthHeaders } from './forward'
import { RELAY_ROUTE_PATHS } from './server'

const MESSAGE_LIMIT = 300

function outcomeOf(status: number): ProviderTestOutcome {
  if (status === 401 || status === 403) return 'key-rejected'
  if (status === 404 || status === 405) return 'not-found'
  if (status === 429) return 'rate-limited'
  if (status >= 300 && status < 400) return 'redirected'
  if (status >= 500) return 'upstream-error'
  // The body is empty on purpose, so a provider that accepted the key answers 400 or 422.
  if ((status >= 200 && status < 300) || status === 400 || status === 422) return 'ok'
  return 'unexpected-status'
}

// Some providers echo part of a wrong key ("sk-abcd****wxyz"), so any word sharing the key's
// first six or last four characters goes too.
function redact(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length < 4) continue
    out = out.split(secret).join('***')
    if (secret.length < 12) continue
    const head = secret.slice(0, 6)
    const tail = secret.slice(-4)
    out = out.replace(/[^\s"'`,;()]+/g, (word) => (word.includes(head) || word.includes(tail) ? '***' : word))
  }
  return out
}

function upstreamMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const error = parsed['error']
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>)['message'] === 'string') {
      return (error as Record<string, unknown>)['message'] as string
    }
    if (typeof parsed['message'] === 'string') return parsed['message']
    if (typeof parsed['detail'] === 'string') return parsed['detail']
  } catch {
    // not JSON
  }
  const text = body.trim()
  return text ? text : undefined
}

/**
 * Makes the request the relay would make for `target` (same URL, same auth header, the key the
 * relay tries first) with `{}` as the body, which no provider can generate from. Nothing is
 * recorded: this bypasses the relay, its usage log and provider health.
 */
export async function testProviderConnection(
  connection: ProviderConnection,
  target: ToolTarget,
  { fetchImpl = fetch, timeoutMs = 10_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<ProviderTestResult> {
  const url = `${connection.baseUrl ?? ''}${connection.endpointPath || RELAY_ROUTE_PATHS[target]}`
  const keys = connection.apiKeys && connection.apiKeys.length > 0 ? connection.apiKeys : connection.apiKey ? [connection.apiKey] : []
  const secrets = [...keys, ...(connection.apiKey ? [connection.apiKey] : [])]
  const key = keys[0]
  if (!key) return { target, url, outcome: 'no-key', ok: false }

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(key, connection.authType) },
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    const timedOut = name === 'TimeoutError' || name === 'AbortError'
    const message = redact(err instanceof Error ? err.message : String(err), secrets).slice(0, MESSAGE_LIMIT)
    return { target, url, outcome: timedOut ? 'timeout' : 'unreachable', ok: false, latencyMs: Date.now() - startedAt, message }
  }
  const latencyMs = Date.now() - startedAt
  const outcome = outcomeOf(response.status)
  let message: string | undefined
  if (outcome !== 'ok') {
    const raw = await response.text().catch(() => '')
    const text = upstreamMessage(raw.slice(0, 4096))
    message = text ? redact(text, secrets).slice(0, MESSAGE_LIMIT) : undefined
  } else {
    await response.body?.cancel().catch(() => undefined)
  }
  return { target, url, outcome, ok: outcome === 'ok', statusCode: response.status, latencyMs, ...(message ? { message } : {}) }
}
