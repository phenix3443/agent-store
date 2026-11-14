// CI only (store-screenshots.yml): the store's server-side API_URL. Forwards every
// request to the test API, except /api/me/entitlements: the test API cannot verify
// the JWTs a CI store mints, so this answers from the token's email instead
// ("pro" for the demo user whose email starts with pro, see ci-demo-session.mjs).
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

createServer(async (req, res) => {
  if (req.url?.startsWith('/api/me/entitlements')) {
    const plan = emailOf(req.headers.authorization).startsWith('pro') ? 'pro' : 'free'
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ plan }))
    return
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
