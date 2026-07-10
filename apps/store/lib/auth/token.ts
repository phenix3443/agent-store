// Client-side helper: fetch the current Neon Auth (Better Auth) JWT from the
// same-origin proxy to authenticate calls to the standalone API. Returns null
// when signed out. The session cookie is sent automatically (same-origin).
export async function getAuthToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = (await res.json()) as { token?: unknown }
    return typeof data.token === 'string' ? data.token : null
  } catch {
    return null
  }
}
