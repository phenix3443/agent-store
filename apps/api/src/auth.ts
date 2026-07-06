import { getSupabase, type SupabaseEnv } from './supabase'

export interface AuthUser {
  id: string
  email?: string
  /** GitHub username from OAuth metadata — maps the user to their publisher profile. */
  username?: string
}

/**
 * Resolves the authenticated user from an `Authorization: Bearer <jwt>` header by
 * validating the token with Supabase Auth. Returns null when there is no token or
 * the token is invalid — callers map that to 401. Never throws.
 */
export async function getAuthUser(
  env: SupabaseEnv | undefined,
  authHeader: string | undefined | null
): Promise<AuthUser | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const supabase = getSupabase(env)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    const username = (data.user.user_metadata as Record<string, unknown> | undefined)?.['user_name']
    return {
      id: data.user.id,
      email: data.user.email,
      username: typeof username === 'string' ? username : undefined,
    }
  } catch {
    return null
  }
}
