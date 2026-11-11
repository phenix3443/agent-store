import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Where the store's Better Auth publishes its signing keys, and the issuer it
 * stamps on tokens. Absent JWKS URL = token verification disabled (every request
 * is anonymous). */
export type AuthEnv = {
  AUTH_JWKS_URL?: string
  AUTH_ISSUER?: string
}

export interface TokenUser {
  id: string
  email?: string
  /** GitHub login, set by the store's Better Auth from the GitHub profile. */
  username?: string
}

function pick(env: AuthEnv | undefined, key: keyof AuthEnv): string | undefined {
  return env?.[key] ?? (typeof process !== 'undefined' ? process.env?.[key] : undefined)
}

// createRemoteJWKSet caches the fetched keys (and times out after 5 s); keep one
// resolver per URL so the cache survives across requests.
const jwksByUrl = new Map<string, JWTVerifyGetKey>()

function jwksFor(url: string): JWTVerifyGetKey {
  let getKey = jwksByUrl.get(url)
  if (!getKey) {
    getKey = createRemoteJWKSet(new URL(url))
    jwksByUrl.set(url, getKey)
  }
  return getKey
}

/**
 * Verify a Better Auth JWT (from the store's /api/auth/token) and return the
 * user, or null when verification is not configured, there is no token, or it
 * fails. Never throws. `getKey` is injectable so tests run without a network.
 */
export async function verifyAuthToken(
  env: AuthEnv | undefined,
  token: string | undefined | null,
  getKey?: JWTVerifyGetKey
): Promise<TokenUser | null> {
  const jwksUrl = pick(env, 'AUTH_JWKS_URL')
  const resolver = getKey ?? (jwksUrl ? jwksFor(jwksUrl) : undefined)
  if (!resolver || !token) return null
  const issuer = pick(env, 'AUTH_ISSUER')
  try {
    const { payload } = await jwtVerify(token, resolver, issuer ? { issuer, audience: issuer } : {})
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return {
      id: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
      username: typeof payload['username'] === 'string' ? payload['username'] : undefined,
    }
  } catch {
    return null
  }
}
