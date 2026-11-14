import { auth } from '@/lib/auth/server'
import { withoutSessionTokenHeader } from '@/lib/auth/session-token-header'

// Better Auth's own endpoints (/api/auth/*). auth() is lazy (see
// lib/auth/server.ts), so nothing is constructed at build time.
export async function GET(request: Request): Promise<Response> {
  return withoutSessionTokenHeader(await auth().handler(request))
}

export async function POST(request: Request): Promise<Response> {
  return withoutSessionTokenHeader(await auth().handler(request))
}
