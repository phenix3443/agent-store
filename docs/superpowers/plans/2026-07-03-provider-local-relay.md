# Provider Local Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local HTTP relay to `apps/client-core` so Claude Code/Codex point at a stable local endpoint once, and switching providers no longer requires rewriting their config files — modeled directly on code-switch-R's always-on, per-request-lookup relay architecture.

**Architecture:** A new `apps/client-core/src/relay/` module runs a `Bun.serve` HTTP server on `127.0.0.1:18780` with fixed routes for Claude (`/v1/messages`) and Codex (`/responses`). On every request it re-reads `registry.json` to find whichever provider is currently `enabledFor` that target, injects the real credential per that provider's declared `authType`, rewrites `model` per its `modelMapping`, and forwards to the real upstream — streaming the response back unmodified. `apps/client-core/src/config/claude.ts`/`codex.ts` gain idempotent enable/disable functions that inject the relay's URL into Claude/Codex config exactly once (baseline-snapshot pattern, so repeated calls never lose the true original values), and `apps/cli` gains `aas relay start|stop|status` plus wiring so `aas enable`/`aas disable` on a provider item goes through the relay instead of direct credential injection.

**Tech Stack:** TypeScript, Bun (`Bun.serve`, `Bun.spawn`, built-in `fetch`), Bun test — no new dependencies.

## Global Constraints

- Relay listens on `127.0.0.1:18780` only (loopback, fixed port for v1 — not configurable yet).
- No Anthropic↔OpenAI protocol/SSE translation in this pass — only same-protocol providers are relayed. Cross-protocol providers keep working via the existing direct-injection path (out of scope to change).
- No failover/circuit-breaker/health-check logic — the relay always routes to exactly the one provider currently marked `enabledFor` the target; if none is enabled, it returns an error to the caller.
- No new persistent storage beyond `~/.agents/relay-state/{claude,codex}.json` (baseline snapshots) and `~/.agents/relay.pid` (process tracking) — no SQLite, no request logging.
- `skill`/`mcp` category sync behavior (`syncItemToClaude`/`syncItemToCodex`) is unchanged by this plan — only the `provider` category path changes.
- All new engine-level tests use `mkdtemp`-isolated directories (`aasHome`, `claudeConfigDir`, `codexConfigDir`) — never the real `~/.claude`, `~/.codex`, `~/.agents`, matching the existing pattern in `apps/client-core/src/__tests__/engine.test.ts`.

---

### Task 1: Extend provider config with `authType` and `modelMapping`

**Files:**
- Modify: `apps/client-core/src/config/provider.ts`
- Test: `apps/client-core/src/config/__tests__/provider.test.ts` (new)

**Interfaces:**
- Produces: `ProviderConnection` gains two new optional fields:
  ```ts
  export type ProviderAuthType = 'bearer' | 'anthropic' | { header: string }

  export interface ProviderConnection {
    apiKey?: string
    baseUrl?: string
    authType?: ProviderAuthType
    modelMapping?: Record<string, string>
  }
  ```
  `readProviderConnection(itemDir: string): Promise<ProviderConnection>` (unchanged signature) now also reads `authType` and `modelMapping` from the same `config.json`.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/config/__tests__/provider.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { readProviderConnection } from '../provider'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp('/tmp/aas-provider-test-')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('readProviderConnection returns undefined authType/modelMapping when absent', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBeUndefined()
  expect(conn.modelMapping).toBeUndefined()
})

test('readProviderConnection reads a string authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: 'anthropic' }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBe('anthropic')
})

test('readProviderConnection reads a custom-header authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: { header: 'X-Custom-Key' } }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toEqual({ header: 'X-Custom-Key' })
})

test('readProviderConnection reads modelMapping', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({
    apiKey: 'k',
    modelMapping: { 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' },
  }))
  const conn = await readProviderConnection(dir)
  expect(conn.modelMapping).toEqual({ 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' })
})

test('readProviderConnection ignores a malformed authType', async () => {
  await writeFile(join(dir, 'config.json'), JSON.stringify({ apiKey: 'k', authType: 42 }))
  const conn = await readProviderConnection(dir)
  expect(conn.authType).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: FAIL — `authType`/`modelMapping` are `undefined` in all cases (not implemented yet), so the 2nd/3rd/4th assertions fail.

- [ ] **Step 3: Implement the extension**

Replace the full contents of `apps/client-core/src/config/provider.ts`:

```ts
import { readFile } from 'fs/promises'
import { join } from 'path'

export type ProviderAuthType = 'bearer' | 'anthropic' | { header: string }

export interface ProviderConnection {
  apiKey?: string
  baseUrl?: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function readAuthType(value: unknown): ProviderAuthType | undefined {
  if (value === 'bearer' || value === 'anthropic') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const header = readString((value as Record<string, unknown>)['header'])
    if (header) return { header }
  }
  return undefined
}

function readModelMapping(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined
  if (entries.some(([, v]) => typeof v !== 'string')) return undefined
  return Object.fromEntries(entries) as Record<string, string>
}

export async function readProviderConnection(itemDir: string): Promise<ProviderConnection> {
  try {
    const raw = JSON.parse(await readFile(join(itemDir, 'config.json'), 'utf-8')) as Record<string, unknown>
    return {
      apiKey: readString(raw['apiKey']) ?? readString(raw['token']),
      baseUrl:
        readString(raw['baseUrl']) ??
        readString(raw['apiUrl']) ??
        readString(raw['endpoint']) ??
        'https://api.openai.com/v1',
      authType: readAuthType(raw['authType']),
      modelMapping: readModelMapping(raw['modelMapping']),
    }
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full client-core suite to confirm no regression**

Run: `cd apps/client-core && bun test`
Expected: all existing tests still pass (the `ProviderConnection` interface only gained optional fields, so nothing consuming it should break).

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/config/provider.ts apps/client-core/src/config/__tests__/provider.test.ts
git commit -m "feat(client-core): add authType and modelMapping to provider config"
```

---

### Task 2: Model-mapping pure function module

**Files:**
- Create: `apps/client-core/src/relay/model-mapping.ts`
- Test: `apps/client-core/src/relay/__tests__/model-mapping.test.ts`

**Interfaces:**
- Consumes: `Record<string, string>` mapping table (from Task 1's `ProviderConnection.modelMapping`).
- Produces: `applyModelMapping(body: unknown, modelMapping: Record<string, string> | undefined): unknown` — given a parsed JSON request body, returns a new value with `.model` replaced if a mapping applies; returns the input unchanged (same reference) if no mapping exists, the body isn't a plain object, or it has no `model` field.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/relay/__tests__/model-mapping.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { applyModelMapping } from '../model-mapping'

test('exact match replaces the model field', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-sonnet', messages: [] },
    { 'claude-3-5-sonnet': 'gpt-4o' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o')
})

test('wildcard suffix match replaces the model field', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-haiku', messages: [] },
    { 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o-mini')
})

test('exact match takes priority over wildcard', () => {
  const result = applyModelMapping(
    { model: 'claude-3-5-sonnet', messages: [] },
    { 'claude-3-5-sonnet': 'gpt-4o', 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('gpt-4o')
})

test('no match returns the model unchanged', () => {
  const result = applyModelMapping(
    { model: 'unmapped-model', messages: [] },
    { 'claude-*': 'gpt-4o-mini' }
  ) as { model: string }
  expect(result.model).toBe('unmapped-model')
})

test('undefined modelMapping returns the same body reference', () => {
  const body = { model: 'claude-3-5-sonnet' }
  expect(applyModelMapping(body, undefined)).toBe(body)
})

test('body without a model field is returned unchanged', () => {
  const body = { messages: [] }
  expect(applyModelMapping(body, { 'claude-*': 'gpt-4o-mini' })).toEqual(body)
})

test('non-object body is returned unchanged', () => {
  expect(applyModelMapping('not an object', { 'claude-*': 'gpt-4o-mini' })).toBe('not an object')
  expect(applyModelMapping(null, { 'claude-*': 'gpt-4o-mini' })).toBe(null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/model-mapping.test.ts`
Expected: FAIL — `Cannot find module '../model-mapping'`

- [ ] **Step 3: Implement `model-mapping.ts`**

```ts
function matchWildcard(pattern: string, model: string): boolean {
  if (!pattern.endsWith('*')) return false
  return model.startsWith(pattern.slice(0, -1))
}

function resolveMappedModel(model: string, modelMapping: Record<string, string>): string | undefined {
  if (modelMapping[model]) return modelMapping[model]
  for (const [pattern, target] of Object.entries(modelMapping)) {
    if (matchWildcard(pattern, model)) return target
  }
  return undefined
}

export function applyModelMapping(body: unknown, modelMapping: Record<string, string> | undefined): unknown {
  if (!modelMapping) return body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body

  const record = body as Record<string, unknown>
  const model = record['model']
  if (typeof model !== 'string') return body

  const mapped = resolveMappedModel(model, modelMapping)
  if (!mapped) return body

  return { ...record, model: mapped }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/model-mapping.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client-core/src/relay/model-mapping.ts apps/client-core/src/relay/__tests__/model-mapping.test.ts
git commit -m "feat(client-core): add model-mapping pure function for the relay"
```

---

### Task 3: Request forwarding with auth-header injection

**Files:**
- Create: `apps/client-core/src/relay/forward.ts`
- Test: `apps/client-core/src/relay/__tests__/forward.test.ts`

**Interfaces:**
- Consumes: `ProviderConnection` (Task 1), `applyModelMapping` (Task 2).
- Produces:
  ```ts
  export interface ForwardTarget {
    baseUrl: string
    apiKey: string
    authType?: ProviderAuthType
    modelMapping?: Record<string, string>
  }

  export async function forwardRequest(
    path: string,
    body: unknown,
    target: ForwardTarget,
    fetchImpl?: typeof fetch
  ): Promise<Response>
  ```
  Builds the real auth header per `authType` (default `'bearer'` if absent), applies model mapping to `body`, and forwards a `POST` to `${target.baseUrl}${path}` using `fetchImpl` (defaults to global `fetch` — injectable for tests). Returns the raw `Response` unmodified (streaming body passed through, not buffered) for the caller (Task 4's server) to relay back to the client.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/relay/__tests__/forward.test.ts`:

```ts
import { test, expect, mock } from 'bun:test'
import { forwardRequest } from '../forward'

function fakeFetch(capture: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    capture.url = url
    capture.init = init
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch
}

test('default authType (bearer) sets an Authorization header', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test' }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(capture.url).toBe('https://api.example.com/v1/messages')
  expect(headers.get('Authorization')).toBe('Bearer sk-test')
})

test('anthropic authType sets x-api-key and anthropic-version', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test', authType: 'anthropic' }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(headers.get('x-api-key')).toBe('sk-test')
  expect(headers.get('anthropic-version')).toBe('2023-06-01')
  expect(headers.get('Authorization')).toBeNull()
})

test('custom header authType sets the named header', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test', authType: { header: 'X-Custom-Key' } }, fakeFetch(capture))
  const headers = new Headers(capture.init?.headers)
  expect(headers.get('X-Custom-Key')).toBe('sk-test')
})

test('applies model mapping to the forwarded body', async () => {
  const capture: { url?: string; init?: RequestInit } = {}
  await forwardRequest(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    { baseUrl: 'https://api.example.com', apiKey: 'sk-test', modelMapping: { 'claude-3-5-sonnet': 'gpt-4o' } },
    fakeFetch(capture)
  )
  const sentBody = JSON.parse(capture.init?.body as string) as { model: string }
  expect(sentBody.model).toBe('gpt-4o')
})

test('returns the raw Response from the upstream call', async () => {
  const response = await forwardRequest('/v1/messages', { model: 'x' }, { baseUrl: 'https://api.example.com', apiKey: 'sk-test' }, fakeFetch({}))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/forward.test.ts`
Expected: FAIL — `Cannot find module '../forward'`

- [ ] **Step 3: Implement `forward.ts`**

```ts
import type { ProviderAuthType } from '../config/provider'
import { applyModelMapping } from './model-mapping'

export interface ForwardTarget {
  baseUrl: string
  apiKey: string
  authType?: ProviderAuthType
  modelMapping?: Record<string, string>
}

function buildAuthHeaders(apiKey: string, authType: ProviderAuthType | undefined): Record<string, string> {
  if (authType === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  }
  if (authType && typeof authType === 'object') {
    return { [authType.header]: apiKey }
  }
  return { Authorization: `Bearer ${apiKey}` }
}

export async function forwardRequest(
  path: string,
  body: unknown,
  target: ForwardTarget,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const mappedBody = applyModelMapping(body, target.modelMapping)
  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(target.apiKey, target.authType),
  }

  return fetchImpl(`${target.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(mappedBody),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/forward.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client-core/src/relay/forward.ts apps/client-core/src/relay/__tests__/forward.test.ts
git commit -m "feat(client-core): add relay request forwarding with auth-header injection"
```

---

### Task 4: Relay HTTP server

**Files:**
- Create: `apps/client-core/src/relay/server.ts`
- Test: `apps/client-core/src/relay/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `readRegistry` (`../registry/index.ts`), `itemDir` (`../paths.ts`), `readProviderConnection` (`../config/provider.ts`), `forwardRequest` (Task 3, `./forward.ts`).
- Produces:
  ```ts
  export const RELAY_PORT = 18780

  export interface RelayServerOptions {
    aasHome: string
    port?: number
    fetchImpl?: typeof fetch
  }

  export function startRelayServer(options: RelayServerOptions): { stop: () => void; port: number }
  ```
  `startRelayServer` starts a `Bun.serve` instance bound to `127.0.0.1`, routing `POST /v1/messages` to the `claude` target and `POST /responses` to the `codex` target. For each request it re-reads the registry, finds the `InstalledItem` where `category === 'provider'`, `compatibleWith` includes the target, and `enabledFor[target] === true`; if none is found, responds `503` with `{ error: 'no active provider for <target>' }`. Otherwise it reads that provider's `config.json` via `readProviderConnection(itemDir(aasHome, 'provider', slug))` and calls `forwardRequest`, returning the upstream response's status/headers/body to the caller.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/relay/__tests__/server.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { startRelayServer } from '../server'
import { writeRegistry } from '../../registry/index'
import { itemDir } from '../../paths'
import type { InstalledItem } from '@aas/types'

let aasHome: string
let stop: () => void

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-relay-test-')
})

afterEach(async () => {
  stop?.()
  await rm(aasHome, { recursive: true, force: true })
})

async function installProvider(slug: string, enabledFor: Record<string, boolean>, config: Record<string, unknown>) {
  const entry: InstalledItem = {
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }
  await writeRegistry(aasHome, { installed: [entry] })
  const dir = itemDir(aasHome, 'provider', slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify(config))
}

test('forwards to the active claude provider', async () => {
  await installProvider('test-provider', { claude: true }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response(JSON.stringify({ reply: 'ok' }), { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await fetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reply: 'ok' })
  expect(capturedUrl).toBe('https://upstream.example.com/v1/messages')
})

test('returns 503 when no provider is enabled for the target', async () => {
  await installProvider('test-provider', { claude: false }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  const server = startRelayServer({ aasHome, port: 0 })
  stop = server.stop

  const res = await fetch(`http://127.0.0.1:${server.port}/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'claude-3-5-sonnet' }),
  })

  expect(res.status).toBe(503)
})

test('switching which provider is enabled changes routing on the next request, no restart needed', async () => {
  await installProvider('provider-a', { claude: true }, { apiKey: 'key-a', baseUrl: 'https://a.example.com' })

  const capturedUrls: string[] = []
  const fetchImpl = (async (url: string) => {
    capturedUrls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: '{}' })

  // Switch the active provider without restarting the relay.
  await installProvider('provider-b', { claude: true }, { apiKey: 'key-b', baseUrl: 'https://b.example.com' })

  await fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: '{}' })

  expect(capturedUrls).toEqual(['https://a.example.com/v1/messages', 'https://b.example.com/v1/messages'])
})

test('routes /responses to the codex target', async () => {
  await installProvider('test-provider', { codex: true }, { apiKey: 'sk-test', baseUrl: 'https://upstream.example.com' })

  let capturedUrl: string | undefined
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await fetch(`http://127.0.0.1:${server.port}/responses`, { method: 'POST', body: '{}' })
  expect(capturedUrl).toBe('https://upstream.example.com/responses')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/server.test.ts`
Expected: FAIL — `Cannot find module '../server'`

- [ ] **Step 3: Implement `server.ts`**

```ts
import type { InstalledItem, RegistryJson, ToolTarget } from '@aas/types'
import { readRegistry } from '../registry/index'
import { itemDir } from '../paths'
import { readProviderConnection } from '../config/provider'
import { forwardRequest } from './forward'

export const RELAY_PORT = 18780

export interface RelayServerOptions {
  aasHome: string
  port?: number
  fetchImpl?: typeof fetch
}

const ROUTES: Record<string, ToolTarget> = {
  '/v1/messages': 'claude',
  '/responses': 'codex',
}

function findActiveProviderForTarget(registry: RegistryJson, target: ToolTarget): InstalledItem | undefined {
  return registry.installed.find(
    (entry) =>
      entry.category === 'provider' &&
      entry.compatibleWith.includes(target) &&
      entry.enabledFor[target] === true
  )
}

export function startRelayServer(options: RelayServerOptions): { stop: () => void; port: number } {
  const { aasHome, port = RELAY_PORT, fetchImpl } = options

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const target = ROUTES[url.pathname]
      if (!target) return new Response('Not found', { status: 404 })

      const registry = await readRegistry(aasHome)
      const provider = findActiveProviderForTarget(registry, target)
      if (!provider) {
        return Response.json({ error: `no active provider for ${target}` }, { status: 503 })
      }

      const connection = await readProviderConnection(itemDir(aasHome, 'provider', provider.slug))
      if (!connection.apiKey || !connection.baseUrl) {
        return Response.json({ error: `provider ${provider.slug} is missing apiKey or baseUrl` }, { status: 503 })
      }

      const body = await req.json().catch(() => ({}))
      const upstreamResponse = await forwardRequest(
        url.pathname,
        body,
        {
          baseUrl: connection.baseUrl,
          apiKey: connection.apiKey,
          authType: connection.authType,
          modelMapping: connection.modelMapping,
        },
        fetchImpl
      )

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      })
    },
  })

  return { stop: () => server.stop(true), port: server.port }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/server.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full client-core suite**

Run: `cd apps/client-core && bun test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/relay/server.ts apps/client-core/src/relay/__tests__/server.test.ts
git commit -m "feat(client-core): add relay HTTP server with per-request provider lookup"
```

---

### Task 5: Relay-state snapshot/restore I/O helper

**Files:**
- Create: `apps/client-core/src/relay/relay-state.ts`
- Test: `apps/client-core/src/relay/__tests__/relay-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function readRelayState<T>(aasHome: string, platform: 'claude' | 'codex'): Promise<T | null>
  export async function writeRelayState<T>(aasHome: string, platform: 'claude' | 'codex', state: T): Promise<void>
  export async function clearRelayState(aasHome: string, platform: 'claude' | 'codex'): Promise<void>
  ```
  Reads/writes `~/.agents/relay-state/{claude,codex}.json` (i.e. `join(aasHome, 'relay-state', '${platform}.json')`). `readRelayState` returns `null` if the file doesn't exist or fails to parse. This is a thin, platform-agnostic I/O helper — Tasks 6 and 7 define what shape `T` actually is for each platform and the snapshot-once/restore logic on top of it.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/relay/__tests__/relay-state.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { readRelayState, writeRelayState, clearRelayState } from '../relay-state'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-relay-state-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

interface FakeState {
  originalBaseUrl: string | null
}

test('readRelayState returns null when no state file exists', async () => {
  const state = await readRelayState<FakeState>(aasHome, 'claude')
  expect(state).toBeNull()
})

test('writeRelayState then readRelayState round-trips the value', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://original.example.com' })
  const state = await readRelayState<FakeState>(aasHome, 'claude')
  expect(state).toEqual({ originalBaseUrl: 'https://original.example.com' })
})

test('claude and codex states are stored independently', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://claude.example.com' })
  await writeRelayState<FakeState>(aasHome, 'codex', { originalBaseUrl: 'https://codex.example.com' })
  expect(await readRelayState<FakeState>(aasHome, 'claude')).toEqual({ originalBaseUrl: 'https://claude.example.com' })
  expect(await readRelayState<FakeState>(aasHome, 'codex')).toEqual({ originalBaseUrl: 'https://codex.example.com' })
})

test('clearRelayState removes the file', async () => {
  await writeRelayState<FakeState>(aasHome, 'claude', { originalBaseUrl: 'https://original.example.com' })
  await clearRelayState(aasHome, 'claude')
  expect(await readRelayState<FakeState>(aasHome, 'claude')).toBeNull()
})

test('clearRelayState on a non-existent file does not throw', async () => {
  await expect(clearRelayState(aasHome, 'claude')).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/relay-state.test.ts`
Expected: FAIL — `Cannot find module '../relay-state'`

- [ ] **Step 3: Implement `relay-state.ts`**

```ts
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'

function statePath(aasHome: string, platform: 'claude' | 'codex'): string {
  return join(aasHome, 'relay-state', `${platform}.json`)
}

export async function readRelayState<T>(aasHome: string, platform: 'claude' | 'codex'): Promise<T | null> {
  try {
    return JSON.parse(await readFile(statePath(aasHome, platform), 'utf-8')) as T
  } catch {
    return null
  }
}

export async function writeRelayState<T>(aasHome: string, platform: 'claude' | 'codex', state: T): Promise<void> {
  const path = statePath(aasHome, platform)
  await mkdir(join(aasHome, 'relay-state'), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2))
}

export async function clearRelayState(aasHome: string, platform: 'claude' | 'codex'): Promise<void> {
  await rm(statePath(aasHome, platform), { force: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/relay-state.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client-core/src/relay/relay-state.ts apps/client-core/src/relay/__tests__/relay-state.test.ts
git commit -m "feat(client-core): add relay-state snapshot I/O helper"
```

---

### Task 6: Claude relay enable/disable (baseline-snapshot injection + restore)

**Files:**
- Modify: `apps/client-core/src/config/claude.ts`
- Test: `apps/client-core/src/config/__tests__/claude-relay.test.ts` (new)

**Interfaces:**
- Consumes: `readRelayState`/`writeRelayState`/`clearRelayState` (Task 5), `RELAY_PORT` (Task 4, `../relay/server.ts`).
- Produces:
  ```ts
  export const RELAY_AUTH_TOKEN_SENTINEL = 'aas-relay'

  export async function enableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void>
  export async function disableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void>
  ```
  `enableRelayForClaude` is idempotent: if no snapshot exists yet in `~/.agents/relay-state/claude.json`, it captures the current `env.ANTHROPIC_BASE_URL`/`env.ANTHROPIC_AUTH_TOKEN` (or `null` if absent) before overwriting them to point at `http://127.0.0.1:${RELAY_PORT}` and the sentinel token. If a snapshot already exists, it only re-applies the injected values (in case something else touched `settings.json`) without re-snapshotting. `disableRelayForClaude` reads the snapshot, restores the original `env.*` values exactly (deleting keys that were absent originally), then clears the snapshot.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/config/__tests__/claude-relay.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { enableRelayForClaude, disableRelayForClaude } from '../claude'
import { RELAY_PORT } from '../../relay/server'

let aasHome: string
let claudeDir: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-claude-relay-test-')
  claudeDir = await mkdtemp('/tmp/aas-claude-relay-dir-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(claudeDir, { recursive: true, force: true })
})

async function readSettings(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
}

test('enableRelayForClaude points settings.json at the relay', async () => {
  await enableRelayForClaude(aasHome, claudeDir)
  const settings = await readSettings()
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe(`http://127.0.0.1:${RELAY_PORT}`)
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')
})

test('enableRelayForClaude snapshots pre-existing env values on first call only', async () => {
  await mkdir(claudeDir, { recursive: true })
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://original.example.com', ANTHROPIC_AUTH_TOKEN: 'original-token' },
  }))

  await enableRelayForClaude(aasHome, claudeDir)
  // Simulate something else changing settings.json while the relay is "active".
  const settings = await readSettings()
  settings['someOtherKey'] = 'preserved'
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(settings))

  await enableRelayForClaude(aasHome, claudeDir) // second call must not re-snapshot

  await disableRelayForClaude(aasHome, claudeDir)
  const restored = await readSettings()
  const env = restored['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://original.example.com')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('original-token')
  expect(restored['someOtherKey']).toBe('preserved')
})

test('disableRelayForClaude removes env fields that did not exist originally', async () => {
  // No settings.json exists yet — original state has no env fields at all.
  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)
  const settings = await readSettings()
  expect(settings['env']).toBeUndefined()
})

test('disableRelayForClaude clears the snapshot so a later enable re-snapshots fresh state', async () => {
  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)

  // User manually sets a new "original" value after disabling.
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://new-original.example.com' },
  }))

  await enableRelayForClaude(aasHome, claudeDir)
  await disableRelayForClaude(aasHome, claudeDir)

  const settings = await readSettings()
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://new-original.example.com')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/config/__tests__/claude-relay.test.ts`
Expected: FAIL — `enableRelayForClaude`/`disableRelayForClaude` are not exported from `../claude`.

- [ ] **Step 3: Add the relay functions to `claude.ts`**

Add these imports to the top of `apps/client-core/src/config/claude.ts` (alongside the existing imports):

```ts
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'
```

Add this constant near the top of the file, after the existing `CATEGORY_DIR` constant:

```ts
export const RELAY_AUTH_TOKEN_SENTINEL = 'aas-relay'

interface ClaudeRelayState {
  originalBaseUrl: string | null
  originalAuthToken: string | null
}
```

Add these two functions at the end of `apps/client-core/src/config/claude.ts`:

```ts
export async function enableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  const existingSnapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  if (!existingSnapshot) {
    await writeRelayState<ClaudeRelayState>(aasHome, 'claude', {
      originalBaseUrl: typeof env['ANTHROPIC_BASE_URL'] === 'string' ? env['ANTHROPIC_BASE_URL'] : null,
      originalAuthToken: typeof env['ANTHROPIC_AUTH_TOKEN'] === 'string' ? env['ANTHROPIC_AUTH_TOKEN'] : null,
    })
  }

  env['ANTHROPIC_BASE_URL'] = `http://127.0.0.1:${RELAY_PORT}`
  env['ANTHROPIC_AUTH_TOKEN'] = RELAY_AUTH_TOKEN_SENTINEL
  settings['env'] = env
  await writeSettings(claudeConfigDir, settings)
}

export async function disableRelayForClaude(aasHome: string, claudeConfigDir: string): Promise<void> {
  const snapshot = await readRelayState<ClaudeRelayState>(aasHome, 'claude')
  const settings = await readSettings(claudeConfigDir)
  const env = (settings['env'] ?? {}) as Record<string, unknown>

  if (snapshot?.originalBaseUrl != null) env['ANTHROPIC_BASE_URL'] = snapshot.originalBaseUrl
  else delete env['ANTHROPIC_BASE_URL']

  if (snapshot?.originalAuthToken != null) env['ANTHROPIC_AUTH_TOKEN'] = snapshot.originalAuthToken
  else delete env['ANTHROPIC_AUTH_TOKEN']

  if (Object.keys(env).length > 0) settings['env'] = env
  else delete settings['env']

  await writeSettings(claudeConfigDir, settings)
  await clearRelayState(aasHome, 'claude')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/config/__tests__/claude-relay.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full client-core suite**

Run: `cd apps/client-core && bun test`
Expected: all pass (existing `syncItemToClaude` tests are unaffected — this task only adds new exports).

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/config/claude.ts apps/client-core/src/config/__tests__/claude-relay.test.ts
git commit -m "feat(client-core): add idempotent relay enable/disable for Claude with baseline-snapshot restore"
```

---

### Task 7: Codex relay enable/disable + `preserveOfficialAuthOnSwitch`

**Files:**
- Modify: `apps/client-core/src/config/codex.ts`
- Test: `apps/client-core/src/config/__tests__/codex-relay.test.ts` (new)

**Interfaces:**
- Consumes: `readRelayState`/`writeRelayState`/`clearRelayState` (Task 5), `RELAY_PORT`/`RELAY_AUTH_TOKEN_SENTINEL` (Task 4/6).
- Produces:
  ```ts
  export async function enableRelayForCodex(aasHome: string, codexConfigDir: string): Promise<void>
  export async function disableRelayForCodex(
    aasHome: string,
    codexConfigDir: string,
    options?: { preserveOfficialAuthOnSwitch?: boolean }
  ): Promise<void>
  ```
  `enableRelayForCodex` snapshots (once) the current `model_provider`, the full `model_providers` table, and `auth.json`'s content, then sets `model_provider = 'aas-relay'`, `model_providers['aas-relay'] = { name: 'aas-relay', base_url: 'http://127.0.0.1:${RELAY_PORT}', wire_api: 'responses', requires_openai_auth: false }`, and `auth.json`'s `OPENAI_API_KEY = 'aas-relay'`. `disableRelayForCodex` restores `model_provider`/`model_providers` from the snapshot always; for `auth.json`, it restores the snapshot **unless** `options.preserveOfficialAuthOnSwitch` is `true` AND the current `auth.json` differs from the snapshot in a way that looks like a fresh official login (i.e., simplest correct rule for v1: if `preserveOfficialAuthOnSwitch` is `true`, skip restoring `auth.json` entirely — leave whatever is there, since that's what "preserve" means).

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/config/__tests__/codex-relay.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { parse } from '@iarna/toml'
import { enableRelayForCodex, disableRelayForCodex } from '../codex'
import { RELAY_PORT } from '../../relay/server'

let aasHome: string
let codexDir: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-codex-relay-test-')
  codexDir = await mkdtemp('/tmp/aas-codex-relay-dir-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
  await rm(codexDir, { recursive: true, force: true })
})

async function readConfig(): Promise<Record<string, unknown>> {
  return parse(await readFile(join(codexDir, 'config.toml'), 'utf-8')) as unknown as Record<string, unknown>
}

async function readAuth(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

test('enableRelayForCodex points config.toml at the relay', async () => {
  await enableRelayForCodex(aasHome, codexDir)
  const config = await readConfig()
  expect(config['model_provider']).toBe('aas-relay')
  const providers = config['model_providers'] as Record<string, { base_url: string }>
  expect(providers['aas-relay'].base_url).toBe(`http://127.0.0.1:${RELAY_PORT}`)
  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('aas-relay')
})

test('disableRelayForCodex restores the original model_provider and auth.json by default', async () => {
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-original' }))

  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  const config = await readConfig()
  expect(config['model_provider']).toBeUndefined()
  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-original')
})

test('preserveOfficialAuthOnSwitch=true leaves auth.json untouched on disable', async () => {
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-official-original' }))

  await enableRelayForCodex(aasHome, codexDir)
  // Simulate the user running `codex login` again while the relay was active.
  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-fresh-official-login' }))

  await disableRelayForCodex(aasHome, codexDir, { preserveOfficialAuthOnSwitch: true })

  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-fresh-official-login')
})

test('disableRelayForCodex clears the snapshot', async () => {
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  await writeFile(join(codexDir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-new-original' }))
  await enableRelayForCodex(aasHome, codexDir)
  await disableRelayForCodex(aasHome, codexDir)

  const auth = await readAuth()
  expect(auth['OPENAI_API_KEY']).toBe('sk-new-original')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/config/__tests__/codex-relay.test.ts`
Expected: FAIL — `enableRelayForCodex`/`disableRelayForCodex` are not exported from `../codex`.

- [ ] **Step 3: Add the relay functions to `codex.ts`**

Add these imports to the top of `apps/client-core/src/config/codex.ts`:

```ts
import { readRelayState, writeRelayState, clearRelayState } from '../relay/relay-state'
import { RELAY_PORT } from '../relay/server'
```

Add this near the top of the file, after `CATEGORY_DIR`:

```ts
const RELAY_PROVIDER_KEY = 'aas-relay'

interface CodexRelayState {
  originalModelProvider: string | null
  originalModelProviders: Record<string, unknown> | null
  originalAuth: Record<string, unknown> | null
}
```

Add these two functions at the end of `apps/client-core/src/config/codex.ts`:

```ts
export async function enableRelayForCodex(aasHome: string, codexConfigDir: string): Promise<void> {
  const config = await readConfig(codexConfigDir)
  const auth = await readAuth(codexConfigDir)

  const existingSnapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  if (!existingSnapshot) {
    await writeRelayState<CodexRelayState>(aasHome, 'codex', {
      originalModelProvider: typeof config['model_provider'] === 'string' ? config['model_provider'] : null,
      originalModelProviders: (config['model_providers'] as Record<string, unknown> | undefined) ?? null,
      originalAuth: Object.keys(auth).length > 0 ? auth : null,
    })
  }

  const providers = (config['model_providers'] ?? {}) as Record<string, unknown>
  providers[RELAY_PROVIDER_KEY] = {
    name: RELAY_PROVIDER_KEY,
    base_url: `http://127.0.0.1:${RELAY_PORT}`,
    wire_api: 'responses',
    requires_openai_auth: false,
  }
  config['model_providers'] = providers
  config['model_provider'] = RELAY_PROVIDER_KEY
  config['preferred_auth_method'] = 'apikey'

  auth['OPENAI_API_KEY'] = RELAY_PROVIDER_KEY

  await writeConfig(codexConfigDir, config)
  await writeAuth(codexConfigDir, auth)
}

export async function disableRelayForCodex(
  aasHome: string,
  codexConfigDir: string,
  options?: { preserveOfficialAuthOnSwitch?: boolean }
): Promise<void> {
  const snapshot = await readRelayState<CodexRelayState>(aasHome, 'codex')
  const config = await readConfig(codexConfigDir)

  if (snapshot?.originalModelProvider != null) config['model_provider'] = snapshot.originalModelProvider
  else delete config['model_provider']

  if (snapshot?.originalModelProviders != null) config['model_providers'] = snapshot.originalModelProviders
  else delete config['model_providers']

  await writeConfig(codexConfigDir, config)

  if (!options?.preserveOfficialAuthOnSwitch) {
    const restoredAuth = snapshot?.originalAuth ?? {}
    await writeAuth(codexConfigDir, restoredAuth)
  }

  await clearRelayState(aasHome, 'codex')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/config/__tests__/codex-relay.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full client-core suite**

Run: `cd apps/client-core && bun test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/config/codex.ts apps/client-core/src/config/__tests__/codex-relay.test.ts
git commit -m "feat(client-core): add idempotent relay enable/disable for Codex with preserveOfficialAuthOnSwitch"
```

---

### Task 8: `aas relay start|stop|status` CLI command

**Files:**
- Create: `apps/cli/src/commands/relay.ts`
- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/src/commands/__tests__/relay.test.ts`

**Interfaces:**
- Consumes: none from `@aas/client-core` directly in the command layer (the command spawns a separate process that itself imports `startRelayServer` — see Step 3) — but the test-facing function signature takes an injectable spawn/kill/exists layer so it never touches a real process or the real `~/.agents`.
- Produces:
  ```ts
  export interface RelayProcessOps {
    spawnDetached: (scriptPath: string) => number // returns child PID
    isRunning: (pid: number) => boolean
    kill: (pid: number) => void
    readPidFile: () => Promise<number | null>
    writePidFile: (pid: number) => Promise<void>
    removePidFile: () => Promise<void>
  }

  export async function runRelay(
    args: string[],
    ops: RelayProcessOps,
    out: (s: string) => void
  ): Promise<void>
  ```
  `aas relay start` — if `readPidFile()` returns a PID and `isRunning(pid)` is true, prints "already running" and does nothing; otherwise calls `spawnDetached(...)` and `writePidFile(newPid)`. `aas relay stop` — reads the PID file; if a live process is found, `kill`s it and `removePidFile()`s; otherwise reports "not running". `aas relay status` — reports running/stopped based on the same check.

- [ ] **Step 1: Write the failing test**

Create `apps/cli/src/commands/__tests__/relay.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { runRelay } from '../relay'
import type { RelayProcessOps } from '../relay'

function makeOps(overrides?: Partial<RelayProcessOps>): RelayProcessOps & { spawned: string[]; killed: number[] } {
  const spawned: string[] = []
  const killed: number[] = []
  let storedPid: number | null = null

  return {
    spawned,
    killed,
    spawnDetached: (scriptPath: string) => { spawned.push(scriptPath); return 12345 },
    isRunning: () => true,
    kill: (pid: number) => { killed.push(pid) },
    readPidFile: async () => storedPid,
    writePidFile: async (pid: number) => { storedPid = pid },
    removePidFile: async () => { storedPid = null },
    ...overrides,
  }
}

test('relay start spawns and writes the pid file when not already running', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(1)
  expect(lines.join('\n')).toContain('started')
})

test('relay start does nothing when already running', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(0)
  expect(lines.join('\n')).toContain('already running')
})

test('relay start replaces a stale pid file (process no longer running)', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => false })
  const lines: string[] = []
  await runRelay(['start'], ops, s => lines.push(s))
  expect(ops.spawned).toHaveLength(1)
})

test('relay stop kills the running process and removes the pid file', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  const lines: string[] = []
  await runRelay(['stop'], ops, s => lines.push(s))
  expect(ops.killed).toEqual([999])
  expect(lines.join('\n')).toContain('stopped')
})

test('relay stop reports not running when there is no pid file', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['stop'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('not running')
})

test('relay status reports running', async () => {
  const ops = makeOps({ readPidFile: async () => 999, isRunning: () => true })
  const lines: string[] = []
  await runRelay(['status'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('running')
})

test('relay status reports stopped', async () => {
  const ops = makeOps({ readPidFile: async () => null })
  const lines: string[] = []
  await runRelay(['status'], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('stopped')
})

test('relay with no subcommand prints usage', async () => {
  const ops = makeOps()
  const lines: string[] = []
  await runRelay([], ops, s => lines.push(s))
  expect(lines.join('\n')).toContain('Usage: aas relay')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/commands/__tests__/relay.test.ts`
Expected: FAIL — `Cannot find module '../relay'`

- [ ] **Step 3: Implement `apps/cli/src/commands/relay.ts`**

```ts
export interface RelayProcessOps {
  spawnDetached: (scriptPath: string) => number
  isRunning: (pid: number) => boolean
  kill: (pid: number) => void
  readPidFile: () => Promise<number | null>
  writePidFile: (pid: number) => Promise<void>
  removePidFile: () => Promise<void>
}

async function isAlreadyRunning(ops: RelayProcessOps): Promise<number | null> {
  const pid = await ops.readPidFile()
  if (pid != null && ops.isRunning(pid)) return pid
  return null
}

export async function runRelay(
  args: string[],
  ops: RelayProcessOps,
  out: (s: string) => void = console.log
): Promise<void> {
  const subcommand = args[0]

  if (subcommand === 'start') {
    const running = await isAlreadyRunning(ops)
    if (running) {
      out(`  relay already running (pid ${running})`)
      return
    }
    const pid = ops.spawnDetached(new URL('../relay-daemon.ts', import.meta.url).pathname)
    await ops.writePidFile(pid)
    out(`  relay started (pid ${pid})`)
    return
  }

  if (subcommand === 'stop') {
    const running = await isAlreadyRunning(ops)
    if (!running) {
      out('  relay not running')
      return
    }
    ops.kill(running)
    await ops.removePidFile()
    out(`  relay stopped (pid ${running})`)
    return
  }

  if (subcommand === 'status') {
    const running = await isAlreadyRunning(ops)
    out(running ? `  relay running (pid ${running})` : '  relay stopped')
    return
  }

  out('Usage: aas relay <start|stop|status>')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/commands/__tests__/relay.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Create the real relay daemon entry point**

Create `apps/cli/src/relay-daemon.ts` (the script `spawnDetached` launches as a subprocess — separate from the test-covered `relay.ts` command logic):

```ts
import { startRelayServer } from '@aas/client-core'
import { resolvePaths } from '@aas/client-core'

const paths = resolvePaths()
startRelayServer({ aasHome: paths.aasHome })
```

This requires `startRelayServer` and `resolvePaths` to be exported from `@aas/client-core`'s public entry point — check `apps/client-core/src/index.ts` and add them if missing:

```ts
export { startRelayServer, RELAY_PORT } from './relay/server'
export { resolvePaths } from './paths'
```

- [ ] **Step 6: Wire real process operations and the new command into `apps/cli/src/index.ts`**

Add near the top of `apps/cli/src/index.ts`, alongside the other imports:

```ts
import { runRelay } from './commands/relay'
import { readFile, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
```

Add this helper function (before `main()`):

```ts
function realRelayOps() {
  const pidFile = join(process.env['AAS_HOME'] ?? join(homedir(), '.agents'), 'relay.pid')
  return {
    spawnDetached: (scriptPath: string) => {
      const proc = Bun.spawn(['bun', scriptPath], { stdio: ['ignore', 'ignore', 'ignore'] })
      proc.unref()
      return proc.pid
    },
    isRunning: (pid: number) => {
      try { process.kill(pid, 0); return true } catch { return false }
    },
    kill: (pid: number) => { try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ } },
    readPidFile: async () => {
      try { return Number((await readFile(pidFile, 'utf-8')).trim()) } catch { return null }
    },
    writePidFile: async (pid: number) => { await writeFile(pidFile, String(pid)) },
    removePidFile: async () => { await rm(pidFile, { force: true }) },
  }
}
```

Add this case to the `switch (command)` block in `main()`:

```ts
    case 'relay':      await runRelay(rest, realRelayOps()); break
```

Add `relay <start|stop|status>` to the `USAGE` string, after the `sync` line:

```
  relay <start|stop|status>        Manage the local provider relay
```

- [ ] **Step 7: Run the full cli suite + type-check**

Run: `cd apps/cli && bun test && bun run type-check`
Expected: all pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/cli/src/commands/relay.ts apps/cli/src/commands/__tests__/relay.test.ts apps/cli/src/relay-daemon.ts apps/cli/src/index.ts apps/client-core/src/index.ts
git commit -m "feat(cli): add aas relay start/stop/status command"
```

---

### Task 9: Wire `enable`/`disable` to use the relay for provider items

**Files:**
- Modify: `apps/client-core/src/engine.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `enableRelayForClaude`/`disableRelayForClaude` (Task 6), `enableRelayForCodex`/`disableRelayForCodex` (Task 7).
- Produces: `AASEngineImpl.enable`/`disable` behavior change — no signature change (still `enable(slug: string, target: ToolTarget): Promise<void>`), but for `category === 'provider'` entries, the sync step now calls the relay enable/disable functions instead of writing the real credential into Claude/Codex config directly.

- [ ] **Step 1: Write the failing test**

Add to `apps/client-core/src/__tests__/engine.test.ts` (append at the end of the file, using the existing `providerItem`/`beforeEach` fixtures already defined earlier in that file):

```ts
test('enable on a provider item points Claude at the relay instead of writing the real apiKey', async () => {
  mockFetch({ 'items/test-provider': providerItem })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:18780')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('aas-relay')
  expect(env['ANTHROPIC_AUTH_TOKEN']).not.toBe('sk-real-secret')
})

test('disable on a provider item restores Claude settings via the relay snapshot', async () => {
  mockFetch({ 'items/test-provider': providerItem })
  await engine.install('test-provider')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://pre-existing.example.com', ANTHROPIC_AUTH_TOKEN: 'pre-existing-token' },
  }))
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'claude')
  await engine.disable('test-provider', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  const env = settings['env'] as Record<string, unknown>
  expect(env['ANTHROPIC_BASE_URL']).toBe('https://pre-existing.example.com')
  expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('pre-existing-token')
})

test('enable on a provider item points Codex at the relay instead of writing the real apiKey', async () => {
  mockFetch({ 'items/test-provider': providerItem })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'sk-real-secret', baseUrl: 'https://real-upstream.example.com' })
  )

  await engine.enable('test-provider', 'codex')

  const auth = JSON.parse(await readFile(join(codexDir, 'auth.json'), 'utf-8')) as Record<string, unknown>
  expect(auth['OPENAI_API_KEY']).toBe('aas-relay')
  expect(auth['OPENAI_API_KEY']).not.toBe('sk-real-secret')
})

test('enable/disable on a skill item is unaffected by the relay change', async () => {
  mockFetch({ 'items/test-skill': skillItem })
  await engine.install('test-skill')
  await engine.enable('test-skill', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8')) as Record<string, unknown>
  // Skills sync via file copy, not env vars — env should be untouched by this enable call.
  expect(settings['env']).toBeUndefined()

  await engine.disable('test-skill', 'claude')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: FAIL — the new provider-relay tests fail because `enable`/`disable` still call the direct-injection path (`env['ANTHROPIC_AUTH_TOKEN']` would be `'sk-real-secret'`, not `'aas-relay'`).

- [ ] **Step 3: Modify `AASEngineImpl`'s `_syncToTarget` in `engine.ts`**

Read the current `_syncToTarget` method first (it currently calls `syncItemToClaude`/`syncItemToCodex` unconditionally for every category). Replace it with:

```ts
  private async _syncToTarget(
    slug: string,
    category: 'provider' | 'skill' | 'mcp',
    target: ToolTarget,
    action: 'add' | 'remove'
  ): Promise<void> {
    if (category === 'provider') {
      if (target === 'claude') {
        if (action === 'add') await enableRelayForClaude(this.paths.aasHome, this.paths.claudeConfigDir)
        else await disableRelayForClaude(this.paths.aasHome, this.paths.claudeConfigDir)
      } else if (target === 'codex') {
        if (action === 'add') await enableRelayForCodex(this.paths.aasHome, this.paths.codexConfigDir)
        else await disableRelayForCodex(this.paths.aasHome, this.paths.codexConfigDir)
      }
      return
    }

    if (target === 'claude') {
      await syncItemToClaude(slug, category, this.paths.aasHome, this.paths.claudeConfigDir, action)
    } else if (target === 'codex') {
      await syncItemToCodex(slug, category, this.paths.aasHome, this.paths.codexConfigDir, action)
    }
  }
```

Add the new imports at the top of `apps/client-core/src/engine.ts`, alongside the existing `syncItemToClaude`/`syncItemToCodex` imports:

```ts
import { enableRelayForClaude, disableRelayForClaude } from './config/claude'
import { enableRelayForCodex, disableRelayForCodex } from './config/codex'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: all tests PASS, including the 4 new ones and every pre-existing test in the file (the `disable`/`uninstall`/`sync` flows for provider items now go through the relay path but should still behave correctly end-to-end).

- [ ] **Step 5: Run the full client-core suite**

Run: `cd apps/client-core && bun test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/client-core/src/engine.ts apps/client-core/src/__tests__/engine.test.ts
git commit -m "feat(client-core): route provider enable/disable through the relay instead of direct injection"
```

---

### Task 10: Final integration pass

**Files:** none created — verification only.

- [ ] **Step 1: Run the full client-core and cli suites**

Run: `cd apps/client-core && bun test && cd ../cli && bun test`
Expected: all tests pass, zero failures.

- [ ] **Step 2: Type-check both packages**

Run: `cd apps/client-core && bun run type-check && cd ../cli && bun run type-check`
Expected: no errors.

- [ ] **Step 3: Run the whole workspace suite**

Run (repo root): `pnpm turbo run test type-check`
Expected: all packages pass (this also confirms `apps/cli-gui`'s existing `InstalledList`/`ProviderEditModal` tests, which call `callRpc('enable'/'setConfig')`, still pass unchanged — this plan doesn't touch the RPC layer or the GUI).

- [ ] **Step 4: Manual end-to-end smoke test in an isolated environment**

Run this from the repo root to verify the relay actually works against a fake upstream, without touching real `~/.claude`/`~/.codex`/`~/.agents`:

```bash
export AAS_HOME="$(mktemp -d)"
export CLAUDE_CONFIG_DIR="$(mktemp -d)"
export CODEX_CONFIG_DIR="$(mktemp -d)"
cd apps/cli && bun run build:bin && cd ../..
./bin/aas relay start
sleep 1
./bin/aas relay status
```

Expected: `relay started (pid ...)` then `relay running (pid ...)`. Then:

```bash
./bin/aas relay stop
./bin/aas relay status
```

Expected: `relay stopped (pid ...)` then `relay stopped`.

- [ ] **Step 5: Commit any fixes made during this pass**

If Steps 1–4 required fixes, commit them:

```bash
git add -A
git commit -m "fix: address findings from provider relay integration pass"
```
