import type { InstalledItem } from '@as/types'

export const LOCAL_API_PORT = 18781

/** The web store's origins. A build pointed at another store adds that one (`aas __local-api <origin>`). */
export const STORE_ORIGINS = ['https://agent-store.panghuli.tech', 'https://agent-store-test.panghuli.tech']

export const MAX_IDS = 100

// The catalog id shape the store and the desktop client's install links use.
const ID = /^(mcp-registry|github|builtin):[A-Za-z0-9._~@/-]{1,300}$/

export interface LocalApiOptions {
  origins: readonly string[]
  installed: () => Promise<InstalledItem[]>
  port?: number
}

/**
 * GET /v1/installed?ids=<id>,<id>  →  {"installed": [...]}, the asked ids installed on this machine.
 *
 * The web store calls this from the visitor's browser, so the answer must reach only
 * pages of the store itself. Every check that can refuse runs before the registry is
 * read, and a refusal is the same empty 403 whatever the reason, so a page on another
 * origin learns nothing from it.
 */
export function localApiHandler(options: LocalApiOptions): (req: Request) => Promise<Response> {
  const port = options.port ?? LOCAL_API_PORT
  const origins = new Set(options.origins)
  // A rebinding page reaches us under its own host name; only the literal loopback address is ours.
  const hosts = new Set([`127.0.0.1:${port}`])

  return async (req) => {
    // Bun.serve builds req.url from the Host header.
    const url = new URL(req.url)
    const origin = req.headers.get('origin')
    if (!hosts.has(url.host) || !origin || !origins.has(origin)) {
      return new Response(null, { status: 403, headers: { 'cache-control': 'no-store' } })
    }
    const cors: Record<string, string> = {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'cache-control': 'no-store',
    }

    if (req.method === 'OPTIONS') {
      if (req.headers.get('access-control-request-method') !== 'GET') return new Response(null, { status: 405, headers: cors })
      // Chromium builds that still send Private Network Access preflights refuse without it.
      if (req.headers.get('access-control-request-private-network') === 'true') cors['access-control-allow-private-network'] = 'true'
      return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' } })
    }

    if (url.pathname !== '/v1/installed') return new Response(null, { status: 404, headers: cors })
    if (req.method !== 'GET') return new Response(null, { status: 405, headers: { ...cors, allow: 'GET' } })

    const raw = url.searchParams.get('ids') ?? ''
    const ids = raw ? raw.split(',') : []
    if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => ID.test(id))) {
      return Response.json({ error: `ids: 1 to ${MAX_IDS} catalog ids, comma separated` }, { status: 400, headers: cors })
    }

    let entries: InstalledItem[]
    try {
      entries = await options.installed()
    } catch {
      return Response.json({ error: 'registry unreadable' }, { status: 503, headers: cors })
    }
    // Every provider install is one more config of the same provider, so the client never calls one "installed".
    const have = new Set(entries.filter((e) => e.category !== 'provider' && e.resourceId).map((e) => e.resourceId!))
    return Response.json({ installed: [...new Set(ids)].filter((id) => have.has(id)) }, { headers: cors })
  }
}

export function startLocalApi(options: LocalApiOptions): { stop: () => void; port: number } {
  const port = options.port ?? LOCAL_API_PORT
  const handler = localApiHandler({ ...options, port })
  const server = Bun.serve({ hostname: '127.0.0.1', port, fetch: handler })
  return { stop: () => server.stop(true), port: server.port ?? port }
}
