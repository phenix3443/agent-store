// The web store's address and the claims the desktop reads from its JWTs.

/** Base URL of the web store, for links to its pages. Override for local dev with VITE_STORE_URL. */
export function getStoreBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  return env?.['VITE_STORE_URL'] || 'https://agent-store-test.panghuli.tech'
}

function claims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as unknown
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Best-effort decode of the `email` claim from a Better Auth JWT. */
export function emailFromJwt(token: string): string | null {
  const email = claims(token)?.['email']
  return typeof email === 'string' ? email : null
}

/** The account id (`sub`) of a Better Auth JWT. */
export function userIdFromJwt(token: string): string | null {
  const sub = claims(token)?.['sub']
  return typeof sub === 'string' && sub ? sub : null
}
