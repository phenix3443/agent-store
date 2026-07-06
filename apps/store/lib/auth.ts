import { createClient } from '@/lib/supabase/server'

export interface CurrentUser {
  initial: string
  username: string
  email: string
}

// Resolve the signed-in user for the persistent nav. Returns null when signed
// out. The web store defaults to the logged-out state (design red-line), so any
// failure to reach Supabase is treated as "not logged in".
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const username = (user.user_metadata['user_name'] as string | undefined) ?? ''
    const email = user.email ?? ''
    const initial = (username || email || 'U').charAt(0).toUpperCase()
    return { initial, username, email }
  } catch {
    return null
  }
}
