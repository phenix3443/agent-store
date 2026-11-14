// CI only (store-screenshots.yml): the store's server-side API_URL. Forwards every
// request to the test API, except /api/me/entitlements and /api/me/subscription:
// the test API cannot verify the JWTs a CI store mints, so this answers from the
// first word of the token's email instead (see ci-demo-session.mjs).
//
// Usage: node scripts/ci-entitlements-proxy.mjs <upstream> <port>
import { createServer } from 'node:http'

const [upstream, port = '4010'] = process.argv.slice(2)
if (!upstream) {
  console.error('usage: node scripts/ci-entitlements-proxy.mjs <upstream> <port>')
  process.exit(2)
}

function emailOf(auth = '') {
  try {
    const payload = auth.replace(/^Bearer /, '').split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).email ?? ''
  } catch {
    return ''
  }
}

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)
const periodEnd = day(30)
const SUBSCRIPTIONS = {
  pro: { plan: 'pro', status: 'active', period: 'monthly', currentPeriodEnd: periodEnd },
  canceling: { plan: 'pro', status: 'canceling', period: 'monthly', currentPeriodEnd: periodEnd },
  canceled: { plan: 'pro', status: 'canceled', period: 'monthly', currentPeriodEnd: day(-3) },
}

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const who = emailOf(req.headers.authorization).split('-')[0]
  if (req.url?.startsWith('/api/me/entitlements')) {
    return json(res, { plan: who === 'pro' || who === 'canceling' ? 'pro' : 'free' })
  }
  if (req.url === '/api/me/subscription') {
    return json(res, { subscription: SUBSCRIPTIONS[who] ?? null })
  }
  try {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const headers = { ...req.headers }
    delete headers.host
    delete headers['accept-encoding']
    const r = await fetch(upstream + req.url, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    })
    const out = Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k)))
    res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()))
  } catch (e) {
    res.writeHead(502).end(String(e))
  }
}).listen(Number(port), '0.0.0.0')
