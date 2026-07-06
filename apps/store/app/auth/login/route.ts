import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const url = new URL(request.url)
  const origin = url.origin
  const provider = url.searchParams.get('provider') === 'google' ? 'google' : 'github'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  return NextResponse.redirect(data.url)
}
