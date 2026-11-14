// A stand-in for the store's desktop sign-in (/api/auth/device/*, /token, /sign-out) and the
// account endpoints the client calls (/api/me/entitlements, /api/me/favorites), for shots.sh
// (#195). Everything else is forwarded to the live test store, so the catalog is real.
// The deployed store may not have the device endpoints yet when a PR runs.
//
//   MOCK_PORT=18790 MOCK_STATE=/out/mock-store.json bun test/desktop-linux/mock-store.ts
// POST /__revoke drops every session (a sign-out somewhere else); GET /__state shows the state.
import { writeFileSync } from 'node:fs'

const UPSTREAM = process.env['MOCK_UPSTREAM'] ?? 'https://agent-store-test.panghuli.tech'
const PORT = Number(process.env['MOCK_PORT'] ?? 18790)
const STATE_FILE = process.env['MOCK_STATE'] ?? '/tmp/mock-store.json'
// Polls before a code counts as approved, so the waiting dialog can be screenshotted.
const APPROVE_AFTER = Number(process.env['MOCK_APPROVE_AFTER'] ?? 6)
const USER = { id: 'ci-user', email: 'ci@example.com' }

const state = {
  codes: {} as Record<string, { polls: number; done: boolean }>,
  sessions: [] as string[],
  issued: [] as string[],
  exchanges: {} as Record<string, number>,
  signOuts: [] as string[],
  jwts: [] as string[],
  favorites: (process.env['MOCK_FAVORITES'] ?? '').split(',').filter(Boolean),
  favoriteCalls: [] as string[],
}

function save() {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}
save()

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const random = () => crypto.randomUUID().replace(/-/g, '')

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null
}

const signedIn = (req: Request) => {
  const t = bearer(req)
  return t != null && state.jwts.includes(t)
}

async function summary(id: string): Promise<unknown> {
  const path = id.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${UPSTREAM}/api/resources/${path}`).catch(() => null)
  if (!res?.ok) return null
  const { resource } = (await res.json()) as { resource?: Record<string, unknown> }
  return resource ?? null
}

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)
    const p = url.pathname

    if (p === '/__state') return json(state)
    if (p === '/__revoke' && req.method === 'POST') {
      state.sessions = []
      state.jwts = []
      save()
      return json({ ok: true })
    }

    if (p === '/api/auth/device/code' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { client_id?: string }
      if (body.client_id !== 'agent-store-desktop') return json({ error: 'invalid_client' }, 400)
      const deviceCode = random()
      const userCode = random().slice(0, 8).toUpperCase()
      state.codes[deviceCode] = { polls: 0, done: false }
      save()
      return json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `http://127.0.0.1:${PORT}/auth/device`,
        verification_uri_complete: `http://127.0.0.1:${PORT}/auth/device?user_code=${userCode}`,
        expires_in: 600,
        interval: 1,
      })
    }
    if (p === '/api/auth/device/token' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { device_code?: string; client_id?: string }
      const code = body.device_code ? state.codes[body.device_code] : undefined
      if (!code || code.done || body.client_id !== 'agent-store-desktop') return json({ error: 'invalid_grant' }, 400)
      if (++code.polls < APPROVE_AFTER) {
        save()
        return json({ error: 'authorization_pending', error_description: 'Authorization pending' }, 400)
      }
      code.done = true
      const session = `sess-${random()}`
      state.sessions.push(session)
      state.issued.push(session)
      save()
      return json({ access_token: session, token_type: 'Bearer', expires_in: 604800, scope: '' })
    }
    if (p === '/api/auth/token' && req.method === 'GET') {
      const session = bearer(req)
      if (!session || !state.sessions.includes(session)) return json({ code: 'UNAUTHORIZED', message: 'Unauthorized' }, 401)
      const exp = Math.floor(Date.now() / 1000) + 900
      const jwt = `${b64({ alg: 'none' })}.${b64({ sub: USER.id, email: USER.email, exp })}.ci`
      state.jwts.push(jwt)
      state.exchanges[session] = (state.exchanges[session] ?? 0) + 1
      save()
      return json({ token: jwt })
    }
    if (p === '/api/auth/sign-out' && req.method === 'POST') {
      const session = bearer(req)
      if (session) {
        state.signOuts.push(session)
        state.sessions = state.sessions.filter((s) => s !== session)
        save()
      }
      return json({ success: true })
    }

    if (p === '/api/me/entitlements') return signedIn(req) ? json({ plan: 'free' }) : json({ error: 'Unauthorized' }, 401)
    if (p === '/api/me/favorites' && req.method === 'GET') {
      if (!signedIn(req)) return json({ error: 'Unauthorized' }, 401)
      const favorites = await Promise.all(state.favorites.map(async (id) => ({ id, createdAt: new Date().toISOString(), resource: await summary(id) })))
      return json({ favorites })
    }
    if (p.startsWith('/api/me/favorites/') && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!signedIn(req)) return json({ error: 'Unauthorized' }, 401)
      const id = decodeURIComponent(p.slice('/api/me/favorites/'.length))
      state.favorites = state.favorites.filter((f) => f !== id)
      if (req.method === 'PUT') state.favorites.unshift(id)
      state.favoriteCalls.push(`${req.method} ${id}`)
      save()
      return json({ id, favorited: req.method === 'PUT' })
    }

    const headers = new Headers(req.headers)
    headers.delete('host')
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer()
    const res = await fetch(`${UPSTREAM}${p}${url.search}`, { method: req.method, headers, body })
    const out = new Headers(res.headers)
    out.delete('content-encoding')
    out.delete('content-length')
    return new Response(await res.arrayBuffer(), { status: res.status, headers: out })
  },
})
console.log(`mock store on 127.0.0.1:${PORT}, forwarding to ${UPSTREAM}`)
