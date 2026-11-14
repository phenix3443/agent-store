import type { Engine, ProviderTestOutcome, ProviderTestResult } from '@as/types'
import { errorMessage, EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../utils/exit-codes'

const OUTCOME_TEXT: Record<ProviderTestOutcome, string> = {
  ok: 'ok: address reachable, key not rejected',
  'no-key': 'no API key configured',
  'key-rejected': 'key rejected',
  'not-found': 'address or endpoint path not found',
  redirected: 'redirected; check the address',
  'rate-limited': 'rate limited; the key could not be checked',
  'upstream-error': 'the provider returned a server error',
  'unexpected-status': 'unexpected response',
  timeout: 'timed out',
  unreachable: 'could not connect',
}

/** `aas test <slug>`: one empty request per agent, the way the relay would send it. Fails unless every agent passes. */
export async function runTest(engine: Engine, args: string[], out: (s: string) => void = console.log): Promise<number> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas test <provider-slug>')
    return EXIT_USAGE
  }
  let results: ProviderTestResult[]
  try {
    results = await engine.testProvider(slug)
  } catch (err) {
    out(`  Error: ${errorMessage(err)}`)
    return EXIT_FAILURE
  }
  if (results.length === 0) {
    out(`  ${slug} supports no agent this version can test`)
    return EXIT_FAILURE
  }
  for (const r of results) {
    const facts = [r.statusCode !== undefined ? `HTTP ${r.statusCode}` : undefined, r.latencyMs !== undefined ? `${r.latencyMs} ms` : undefined]
      .filter(Boolean)
      .join(', ')
    out(`  ${r.target.padEnd(7)} ${OUTCOME_TEXT[r.outcome]}${facts ? ` (${facts})` : ''}`)
    out(`          POST ${r.url}`)
    if (r.message) out(`          ${r.message}`)
  }
  out('  The request has an empty body, so nothing is generated or billed, and it is not recorded in usage.')
  return results.every((r) => r.ok) ? EXIT_OK : EXIT_FAILURE
}
