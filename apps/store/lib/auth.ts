import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'

export interface CurrentUser {
  initial: string
  username: string
  email: string
}

// Resolve the signed-in user for the persistent nav from the Better Auth session
// cookie. Returns null when signed out. The web store defaults to
// the logged-out state (design red-line), so any failure is treated as "not
// logged in". `username` is the GitHub login (set from the GitHub profile at
// sign-in), falling back to the display name.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const session = await auth().api.getSession({ headers: await headers() })
    const user = session?.user
    if (!user) return null
    const username = user.username ?? user.name ?? ''
    const email = user.email ?? ''
    const initial = (username || email || 'U').charAt(0).toUpperCase()
    return { initial, username, email }
  } catch {
    return null
  }
}
