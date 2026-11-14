// CI only (store-screenshots.yml): the store's server-side API_URL. Forwards every
// request to the test API, except the account endpoints: the test API cannot verify
// the JWTs a CI store mints, so this answers from the token's email instead.
// /api/me/entitlements is "pro" for the demo user whose email starts with pro (see
// ci-demo-session.mjs); /api/me/favorites is kept in memory, the pro user starting
// with three, their summaries read from the test API.
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

const SEEDED = [
  'github:vercel-labs/skills/find-skills',
  'mcp-registry:com.browser-use/browser-use',
  'builtin:openrouter',
]
const favorites = new Map()
function favoritesOf(email) {
  if (!favorites.has(email)) {
    const now = Date.now()
    const seed = email.startsWith('pro') ? SEEDED : []
    favorites.set(email, new Map(seed.map((id, i) => [id, new Date(now - i * 60_000).toISOString()])))
  }
  return favorites.get(email)
}

async function summary(id) {
  try {
    const path = id.split('/').map(encodeURIComponent).join('/')
    const r = await fetch(`${upstream}/api/resources/${path}`)
    if (!r.ok) return null
    const { resource } = await r.json()
    const { id: rid, kind, name, description, author, version, homepageUrl, installs, stars, verified, tags, transports, origin } = resource
    return { id: rid, kind, name, description, author, version, homepageUrl, installs, stars, verified, tags, transports, origin }
  } catch {
    return null
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
}

createServer(async (req, res) => {
  if (req.url?.startsWith('/api/me/favorites')) {
    const email = emailOf(req.headers.authorization)
    if (!email) return json(res, 401, { error: 'Unauthorized' })
    const mine = favoritesOf(email)
    const rest = req.url.slice('/api/me/favorites'.length).split('?')[0]
    if (req.method === 'GET' && !rest) {
      const rows = [...mine].sort((a, b) => b[1].localeCompare(a[1]))
      const list = await Promise.all(rows.map(async ([id, createdAt]) => ({ id, createdAt, resource: await summary(id) })))
      return json(res, 200, { favorites: list })
    }
    const id = decodeURIComponent(rest.slice(1))
    if (req.method === 'PUT') mine.set(id, mine.get(id) ?? new Date().toISOString())
    else if (req.method === 'DELETE') mine.delete(id)
    else return json(res, 405, { error: 'Method not allowed' })
    return json(res, 200, { id, favorited: req.method === 'PUT' })
  }
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
