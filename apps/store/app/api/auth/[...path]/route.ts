import { auth } from '@/lib/auth/server'

// Better Auth's own endpoints (/api/auth/*). auth() is lazy (see
// lib/auth/server.ts), so nothing is constructed at build time.
export function GET(request: Request): Promise<Response> {
  return auth().handler(request)
}

export function POST(request: Request): Promise<Response> {
  return auth().handler(request)
}
