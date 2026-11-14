// CI only (store-screenshots.yml): stands in for the desktop client's loopback endpoint
// (apps/client-core/src/local-api/server.ts) so the screenshots show the "installed" state.
// Answers <origin> only, and reports installed the first two ids of each request plus <id>.
//
// Usage: node scripts/ci-local-api.mjs <origin> <id>
import { createServer } from 'node:http'

const [origin, always] = process.argv.slice(2)
if (!origin) {
  console.error('usage: node scripts/ci-local-api.mjs <origin> [id]')
  process.exit(2)
}

createServer((req, res) => {
  if (req.headers.origin !== origin) return res.writeHead(403).end()
  const cors = { 'access-control-allow-origin': origin, vary: 'Origin', 'cache-control': 'no-store' }
  if (req.method === 'OPTIONS') {
    return res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET', 'access-control-allow-private-network': 'true' }).end()
  }
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname !== '/v1/installed') return res.writeHead(404, cors).end()
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
  const installed = ids.filter((id, i) => i < 2 || id === always)
  res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ installed }))
}).listen(18781, '127.0.0.1')
