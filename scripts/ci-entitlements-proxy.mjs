// CI only (store-screenshots.yml): the store's server-side API_URL. Forwards every
// request to the test API, except /api/me/entitlements and /api/me/subscription:
// the test API cannot verify the JWTs a CI store mints, so this answers from the
// first word of the token's email instead (see ci-demo-session.mjs). /api/me/favorites
// is kept in memory, the pro user starting with three, their summaries read from the
// test API.
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

function json(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
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

createServer(async (req, res) => {
  const who = emailOf(req.headers.authorization).split('-')[0]
  if (req.url?.startsWith('/api/me/favorites')) {
    const email = emailOf(req.headers.authorization)
    if (!email) return json(res, { error: 'Unauthorized' }, 401)
    const mine = favoritesOf(email)
    const rest = req.url.slice('/api/me/favorites'.length).split('?')[0]
    if (req.method === 'GET' && !rest) {
      const rows = [...mine].sort((a, b) => b[1].localeCompare(a[1]))
      const list = await Promise.all(rows.map(async ([id, createdAt]) => ({ id, createdAt, resource: await summary(id) })))
      return json(res, { favorites: list })
    }
    const id = decodeURIComponent(rest.slice(1))
    if (req.method === 'PUT') mine.set(id, mine.get(id) ?? new Date().toISOString())
    else if (req.method === 'DELETE') mine.delete(id)
    else return json(res, { error: 'Method not allowed' }, 405)
    return json(res, { id, favorited: req.method === 'PUT' })
  }
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
