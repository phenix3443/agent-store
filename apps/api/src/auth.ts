import { verifyAuthToken, type AuthEnv, type TokenUser } from './auth-token'

export type AuthUser = TokenUser

/**
 * Resolves the authenticated user from an `Authorization: Bearer <jwt>` header.
 * Returns null when there is no token or it is invalid; callers map that to 401.
 * Never throws.
 */
export async function getAuthUser(env: AuthEnv | undefined, authHeader: string | undefined | null): Promise<AuthUser | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  return verifyAuthToken(env, token)
}
