# Priority-Based Multi-Provider Failover Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let multiple providers be enabled simultaneously for the same client (claude/codex), ordered by the existing `ProviderConnection.level` field, with the relay automatically trying the next-lowest-priority provider when the current one fails (network error, timeout, or 5xx), and record every such fallback in `request_logs.is_fallback`.

**Architecture:** Remove `engine.enable()`'s mutual-exclusivity so `enabledFor[target]` can be `true` for more than one provider at once. The relay's request handler asks a new `findOrderedProvidersForTarget` for all enabled candidates sorted by `level` (ascending, ties keep registry order), then hands them to a new `forwardWithFailover` that tries each in turn — skipping providers whose model whitelist rejects the request, retrying on network failure or 5xx, returning immediately on any other status. The chosen provider's slug and whether it wasn't the first candidate (`isFallback`) flow into the existing `recordUsageAsync` (which already has an `isFallback` field, added but never populated by the usage-tracking plan).

**Tech Stack:** TypeScript, Bun (`bun:test`, `Bun.serve`), existing `@as/client-core`/`@as/types` packages — no new dependencies.

## Global Constraints

- `ProviderConnection.level?: number` already exists (added by the provider-edit-form-rebuild plan) — 1-10, default 1 when unset, lower number = higher priority. Do NOT re-add this field.
- No circuit-breaker state machine. A failure is decided per-request: network throw/timeout or HTTP status >= 500 → try the next candidate. Any other status (including 4xx) → return immediately, do not try the next candidate.
- `is_fallback` means "the provider that actually served this request was not the first candidate in priority order" — this is true regardless of whether that final attempt itself succeeded or failed.
- The `request_logs.is_fallback` column and `recordRequest`/`recordUsageAsync`'s `isFallback?: boolean` parameter already exist (`apps/client-core/src/usage/db.ts`, `apps/client-core/src/usage/logger.ts`, `apps/client-core/src/usage/record-usage.ts`) — wire real values into them, do not change their shape.
- Do not implement retry/backoff, half-open probing, or failure-count windows — immediate failover only, per the spec's explicit YAGNI.

---

### Task 1: Remove enable() mutual exclusivity and the stale credential-matching status reconciliation

**Context:** `AASEngineImpl.enable()` currently disables every other provider enabled for the same target before enabling the new one. Separately, `list()`/`info()` run every provider through `_resolveProviderStatus`, which overrides the registry's own `enabledFor` flags by re-deriving "the one active provider" from whatever credentials are literally written into Claude's `settings.json` / Codex's `config.toml`+`auth.json`. That reconciliation predates the local-relay abstraction: once a provider is enabled, `enableRelayForClaude`/`enableRelayForCodex` always write the *relay's own* sentinel address and token (`http://127.0.0.1:18780` / `aas-relay`) into those files, never a real provider's credentials — so in real usage today, `_findActiveProviderSlug` can never match any real provider's `apiKey`/`baseUrl` and the reconciliation is dead weight kept alive only by tests that hand-craft non-relay settings files. Allowing multiple providers enabled at once makes "the one active provider" a meaningless concept anyway, so this task deletes the reconciliation and makes `list()`/`info()` trust the registry's own `enabledFor` directly — which is also what `relay/server.ts` already uses as its source of truth for routing.

**Files:**
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/client-core/src/config/claude.ts`
- Modify: `apps/client-core/src/config/codex.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `engine.enable(slug, target)` no longer disables sibling providers. `engine.list()`/`engine.info()` return `enabledFor` exactly as stored in the registry (no override). Later tasks' relay code already reads `registry.installed[].enabledFor[target]` directly and is unaffected by this task.

- [ ] **Step 1: Read the current mutual-exclusivity test and the two reconciliation tests to be replaced**

Run: `grep -n "^test(" apps/client-core/src/__tests__/engine.test.ts`

Confirm these three tests exist (by line number, may shift slightly from a prior edit — locate by title, not line number): `'enabling a provider disables other providers for the same target'`, `'list reflects actual active provider from Claude config'`, `'info reflects actual active provider from Codex config'`.

- [ ] **Step 2: Replace the mutual-exclusivity test with a multi-enable test**

Delete the test named `'enabling a provider disables other providers for the same target'` in its entirety (from `test('enabling a provider disables...` through its closing `})`). Replace it with:

```ts
test('enabling a second provider for the same target does not disable the first', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
  }
  mockFetch({
    '/api/items/test-provider': { item: providerItem },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', {
    apiKey: 'sk-1',
    baseUrl: 'https://api.one.example/v1',
  })
  await engine.setConfig('test-provider-2', {
    apiKey: 'sk-2',
    baseUrl: 'https://api.two.example/v1',
  })

  await engine.enable('test-provider', 'claude')
  await engine.enable('test-provider-2', 'claude')

  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'))
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('aas-relay')
  expect(settings.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:18780')

  const list = await engine.list()
  const first = list.find(item => item.slug === 'test-provider')
  const second = list.find(item => item.slug === 'test-provider-2')
  expect(first?.enabledFor.claude).toBe(true)
  expect(second?.enabledFor.claude).toBe(true)
})
```

- [ ] **Step 3: Delete the two stale reconciliation tests**

Delete the test named `'list reflects actual active provider from Claude config'` in its entirety, and the test named `'info reflects actual active provider from Codex config'` in its entirety (each from `test(...)` through its closing `})`).

- [ ] **Step 4: Add a replacement test proving list()/info() trust the registry directly**

Add this test in the same file, near where the two deleted tests were:

```ts
test('list and info report enabledFor from the registry without needing config-file reconciliation', async () => {
  const secondProviderItem: ProviderItem = {
    ...providerItem,
    slug: 'test-provider-2',
    name: 'Second Provider',
    compatibleWith: ['codex'],
  }
  const firstCodexProvider: ProviderItem = {
    ...providerItem,
    compatibleWith: ['codex'],
  }
  mockFetch({
    '/api/items/test-provider': { item: firstCodexProvider },
    '/api/items/test-provider-2': { item: secondProviderItem },
  })
  await engine.install('test-provider')
  await engine.install('test-provider-2')
  await engine.setConfig('test-provider', { apiKey: 'shared-key', baseUrl: 'https://api.shared.example/v1' })
  await engine.setConfig('test-provider-2', { apiKey: 'shared-key', baseUrl: 'https://api.shared.example/v1' })

  await engine.enable('test-provider', 'codex')
  await engine.enable('test-provider-2', 'codex')

  const list = await engine.list()
  const detail = await engine.info('test-provider-2')
  const other = await engine.info('test-provider')
  expect(list.find(item => item.slug === 'test-provider-2')?.enabledFor.codex).toBe(true)
  expect(list.find(item => item.slug === 'test-provider')?.enabledFor.codex).toBe(true)
  expect(detail.enabledFor.codex).toBe(true)
  expect(other.enabledFor.codex).toBe(true)
})
```

- [ ] **Step 5: Run the test suite to confirm the new/changed tests fail against the current implementation**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: FAIL — `'enabling a second provider for the same target does not disable the first'` fails because `enable()` still disables the first provider; the reconciliation-based tests you deleted are gone so no failure from those.

- [ ] **Step 6: Remove the mutual-exclusivity block from `enable()`**

In `apps/client-core/src/engine.ts`, replace the entire `enable` method:

```ts
  async enable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    let nextRegistry = registry
    if (entry.category === 'provider') {
      for (const installed of registry.installed) {
        if (installed.slug === slug || installed.category !== 'provider') continue
        if (!installed.enabledFor[target]) continue
        await this._syncToTarget(installed.slug, installed.category, target, 'remove')
        nextRegistry = upsertEntry(nextRegistry, {
          ...installed,
          enabledFor: { ...installed.enabledFor, [target]: false },
          updatedAt: new Date().toISOString(),
        })
      }
    }
    await this._syncToTarget(slug, entry.category, target, 'add')
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(nextRegistry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: true },
        updatedAt: new Date().toISOString(),
      })
    )
  }
```

with:

```ts
  async enable(slug: string, target: ToolTarget): Promise<void> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    await this._syncToTarget(slug, entry.category, target, 'add')
    await writeRegistry(
      this.paths.aasHome,
      upsertEntry(registry, {
        ...entry,
        enabledFor: { ...entry.enabledFor, [target]: true },
        updatedAt: new Date().toISOString(),
      })
    )
  }
```

- [ ] **Step 7: Delete the reconciliation layer and trust the registry directly in `list()`/`info()`**

In `apps/client-core/src/engine.ts`, change `list()`:

```ts
  async list(options?: ListOptions): Promise<InstalledItem[]> {
    const registry = await readRegistry(this.paths.aasHome)
    let items = await this._resolveProviderStatus(registry.installed)
    if (options?.category) items = items.filter(e => e.category === options.category)
    if (options?.enabledFor) items = items.filter(e => e.enabledFor[options.enabledFor!] === true)
    return items
  }
```

to:

```ts
  async list(options?: ListOptions): Promise<InstalledItem[]> {
    const registry = await readRegistry(this.paths.aasHome)
    let items = registry.installed
    if (options?.category) items = items.filter(e => e.category === options.category)
    if (options?.enabledFor) items = items.filter(e => e.enabledFor[options.enabledFor!] === true)
    return items
  }
```

Change `info()`'s second line from:

```ts
    const entries = await this._resolveProviderStatus(registry.installed)
```

to:

```ts
    const entries = registry.installed
```

Delete the two private methods `_resolveProviderStatus` and `_findActiveProviderSlug` in their entirety (from `private async _resolveProviderStatus(items: InstalledItem[]): Promise<InstalledItem[]> {` through the closing `}` of `_findActiveProviderSlug`, i.e. everything from that point to the end of the class body before the final closing `}` of `AASEngineImpl`).

Change the import block:

```ts
import {
  getClaudeAppliedProviderConnection, syncItemToClaude, enableRelayForClaude, disableRelayForClaude,
} from './config/claude'
import {
  getCodexAppliedProviderConnection, syncItemToCodex, enableRelayForCodex, disableRelayForCodex,
} from './config/codex'
```

to:

```ts
import { syncItemToClaude, enableRelayForClaude, disableRelayForClaude } from './config/claude'
import { syncItemToCodex, enableRelayForCodex, disableRelayForCodex } from './config/codex'
```

Also remove the now-unused `readProviderConnection` import if `_findActiveProviderSlug` was its only caller in this file — check with `grep -n "readProviderConnection" apps/client-core/src/engine.ts` first; if the only remaining match is the import line itself, delete that import line too (it's currently `import { duplicateProviderConnection, readProviderConnection } from './config/provider'` — if `readProviderConnection` becomes unused, change it to `import { duplicateProviderConnection } from './config/provider'`).

- [ ] **Step 8: Delete the now-unused exported functions from `claude.ts`/`codex.ts`**

Run: `grep -rn "getClaudeAppliedProviderConnection\|getCodexAppliedProviderConnection" apps/client-core/src --include="*.ts" | grep -v __tests__`

Expected: no matches (Step 7 removed the only callers). If there are still matches outside `engine.ts`, stop and report `BLOCKED` — do not delete a function that's still used.

In `apps/client-core/src/config/claude.ts`, delete the entire `getClaudeAppliedProviderConnection` function (from `export async function getClaudeAppliedProviderConnection(` through its closing `}`).

In `apps/client-core/src/config/codex.ts`, delete the entire `getCodexAppliedProviderConnection` function (from `export async function getCodexAppliedProviderConnection(` through its closing `}`).

- [ ] **Step 9: Run the full test suite for this package and confirm everything passes**

Run: `cd apps/client-core && bun test && bun run tsc --noEmit`
Expected: all tests pass, 0 type errors. (Check `apps/client-core/package.json` first for the exact `tsc` script name if `bun run tsc --noEmit` isn't defined — use whatever script actually runs the type check, e.g. `bun run type-check`.)

- [ ] **Step 10: Commit**

```bash
git add apps/client-core/src/engine.ts apps/client-core/src/config/claude.ts apps/client-core/src/config/codex.ts apps/client-core/src/__tests__/engine.test.ts
git commit -m "feat(client-core): allow multiple providers enabled per target simultaneously

Removes engine.enable()'s mutual exclusivity so priority-ordered failover
routing (next task) has more than one enabled candidate to route between,
and deletes the credential-matching status reconciliation that predates
the local-relay abstraction and can never match a real provider once the
relay owns the applied Claude/Codex credentials."
```

---

### Task 2: Add `findOrderedProvidersForTarget`

**Context:** The relay needs, for a given target (`claude`/`codex`), the full list of enabled providers sorted by `ProviderConnection.level` ascending (default `1` when unset), so it can try them in priority order. This is a pure data-lookup function, independent of the HTTP/forwarding logic in `server.ts`/`forward.ts`, so it gets its own small file.

**Files:**
- Create: `apps/client-core/src/relay/provider-order.ts`
- Test: `apps/client-core/src/relay/__tests__/provider-order.test.ts`

**Interfaces:**
- Consumes: `readProviderConnection(itemDir: string): Promise<ProviderConnection>` from `apps/client-core/src/config/provider.ts` (existing); `itemDir(aasHome, category, slug): string` from `apps/client-core/src/paths.ts` (existing); `RegistryJson`, `InstalledItem`, `ToolTarget` from `@as/types` (existing).
- Produces: `export interface OrderedProviderCandidate { item: InstalledItem; connection: ProviderConnection }` and `export async function findOrderedProvidersForTarget(aasHome: string, registry: RegistryJson, target: ToolTarget): Promise<OrderedProviderCandidate[]>` — Task 3 imports both from `./provider-order`.

- [ ] **Step 1: Write the failing test**

Create `apps/client-core/src/relay/__tests__/provider-order.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { findOrderedProvidersForTarget } from '../provider-order'
import { itemDir } from '../../paths'
import type { InstalledItem, RegistryJson } from '@as/types'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/as-provider-order-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

async function installProvider(slug: string, enabledFor: Record<string, boolean>, config: Record<string, unknown>) {
  const dir = itemDir(aasHome, 'provider', slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify(config))
}

function providerEntry(slug: string, enabledFor: Record<string, boolean>): InstalledItem {
  return {
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }
}

test('sorts enabled providers by level ascending, defaulting unset level to 1', async () => {
  await installProvider('low-priority', { claude: true }, { apiKey: 'k1', baseUrl: 'https://one.example', level: 5 })
  await installProvider('no-level', { claude: true }, { apiKey: 'k2', baseUrl: 'https://two.example' })
  await installProvider('high-priority', { claude: true }, { apiKey: 'k3', baseUrl: 'https://three.example', level: 1 })

  const registry: RegistryJson = {
    installed: [
      providerEntry('low-priority', { claude: true }),
      providerEntry('no-level', { claude: true }),
      providerEntry('high-priority', { claude: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['no-level', 'high-priority', 'low-priority'])
})

test('excludes providers not enabled for the requested target', async () => {
  await installProvider('enabled-claude', { claude: true, codex: false }, { apiKey: 'k1', baseUrl: 'https://one.example' })
  await installProvider('enabled-codex', { claude: false, codex: true }, { apiKey: 'k2', baseUrl: 'https://two.example' })

  const registry: RegistryJson = {
    installed: [
      providerEntry('enabled-claude', { claude: true, codex: false }),
      providerEntry('enabled-codex', { claude: false, codex: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['enabled-claude'])
})

test('excludes non-provider categories and returns an empty array when nothing is enabled', async () => {
  const registry: RegistryJson = {
    installed: [
      { slug: 'a-skill', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude'], enabledFor: { claude: true } },
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered).toEqual([])
})

test('keeps registry order among providers that share the same level', async () => {
  await installProvider('first', { claude: true }, { apiKey: 'k1', baseUrl: 'https://one.example', level: 3 })
  await installProvider('second', { claude: true }, { apiKey: 'k2', baseUrl: 'https://two.example', level: 3 })

  const registry: RegistryJson = {
    installed: [
      providerEntry('first', { claude: true }),
      providerEntry('second', { claude: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['first', 'second'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/client-core && bun test src/relay/__tests__/provider-order.test.ts`
Expected: FAIL with a module-not-found error for `../provider-order`.

- [ ] **Step 3: Write the implementation**

Create `apps/client-core/src/relay/provider-order.ts`:

```ts
import type { InstalledItem, RegistryJson, ToolTarget } from '@as/types'
import { itemDir } from '../paths'
import { readProviderConnection, type ProviderConnection } from '../config/provider'

export interface OrderedProviderCandidate {
  item: InstalledItem
  connection: ProviderConnection
}

export async function findOrderedProvidersForTarget(
  aasHome: string,
  registry: RegistryJson,
  target: ToolTarget
): Promise<OrderedProviderCandidate[]> {
  const enabled = registry.installed.filter(
    (entry) =>
      entry.category === 'provider' &&
      entry.compatibleWith.includes(target) &&
      entry.enabledFor[target] === true
  )
  const candidates = await Promise.all(
    enabled.map(async (item) => ({
      item,
      connection: await readProviderConnection(itemDir(aasHome, 'provider', item.slug)),
    }))
  )
  return candidates.sort((a, b) => (a.connection.level ?? 1) - (b.connection.level ?? 1))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/provider-order.test.ts`
Expected: 4 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add apps/client-core/src/relay/provider-order.ts apps/client-core/src/relay/__tests__/provider-order.test.ts
git commit -m "feat(client-core): add findOrderedProvidersForTarget for priority-sorted relay routing"
```

---

### Task 3: `forwardWithFailover` and relay wiring

**Context:** The relay's request handler currently picks exactly one active provider and forwards to it once. This task replaces that with trying every enabled candidate, in priority order, skipping ones the model whitelist rejects and retrying on network failure/timeout/5xx, and threading the outcome (which provider was actually used, and whether that was a fallback) into the existing usage-recording call.

**Files:**
- Modify: `apps/client-core/src/relay/forward.ts`
- Modify: `apps/client-core/src/relay/server.ts`
- Test: `apps/client-core/src/relay/__tests__/forward.test.ts`
- Test: `apps/client-core/src/relay/__tests__/server.test.ts`

**Interfaces:**
- Consumes: `findOrderedProvidersForTarget`/`OrderedProviderCandidate` from `./provider-order` (Task 2); `isModelAllowed(model, whitelist)` from `./model-whitelist` (existing); `forwardRequest(path, body, target, fetchImpl)` from `./forward` (existing, unchanged signature); `recordUsageAsync` from `../usage/record-usage` (existing, already has `isFallback?: boolean`).
- Produces: `export interface FailoverCandidate { slug: string; connection: ForwardTarget; endpointPath?: string; whitelist?: string[] }`, `export interface FailoverResult { response: Response; usedSlug: string; isFallback: boolean }`, `export async function forwardWithFailover(defaultPath: string, body: unknown, requestedModel: string | undefined, candidates: FailoverCandidate[], fetchImpl?: typeof fetch): Promise<FailoverResult>` in `apps/client-core/src/relay/forward.ts`.

- [ ] **Step 1: Write the failing tests for `forwardWithFailover`**

Add to the end of `apps/client-core/src/relay/__tests__/forward.test.ts` (check the file's existing imports first — it already imports `forwardRequest` from `../forward` and `test`/`expect` from `bun:test`; add `forwardWithFailover` to the existing import from `'../forward'`):

```ts
test('forwardWithFailover uses the first candidate when it succeeds', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    'claude-3-5-sonnet',
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages'])
  expect(result.usedSlug).toBe('primary')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(200)
})

test('forwardWithFailover falls back to the next candidate on a network error', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://primary')) throw new Error('connect timeout')
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages',
    { model: 'claude-3-5-sonnet' },
    'claude-3-5-sonnet',
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages', 'https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(200)
})

test('forwardWithFailover falls back to the next candidate on a 5xx response', async () => {
  const fetchImpl = (async (url: string) => {
    if (url.startsWith('https://primary')) return new Response('boom', { status: 502 })
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
})

test('forwardWithFailover does not fall back on a 4xx response', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('bad request', { status: 400 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://primary.example/v1/messages'])
  expect(result.usedSlug).toBe('primary')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(400)
})

test('forwardWithFailover returns the last response when every candidate fails', async () => {
  const fetchImpl = (async () => new Response('down', { status: 503 })) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [
      { slug: 'primary', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' } },
      { slug: 'backup', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(result.usedSlug).toBe('backup')
  expect(result.isFallback).toBe(true)
  expect(result.response.status).toBe(503)
})

test('forwardWithFailover skips a candidate whose whitelist rejects the model', async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', { model: 'gpt-4o' }, 'gpt-4o',
    [
      { slug: 'claude-only', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, whitelist: ['claude-*'] },
      { slug: 'any-model', connection: { baseUrl: 'https://backup.example', apiKey: 'k2' } },
    ],
    fetchImpl
  )

  expect(calls).toEqual(['https://backup.example/v1/messages'])
  expect(result.usedSlug).toBe('any-model')
  expect(result.isFallback).toBe(true)
})

test('forwardWithFailover returns a synthesized 403 when every candidate rejects the model', async () => {
  let called = false
  const fetchImpl = (async () => {
    called = true
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const result = await forwardWithFailover(
    '/v1/messages', { model: 'gpt-4o' }, 'gpt-4o',
    [{ slug: 'claude-only', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, whitelist: ['claude-*'] }],
    fetchImpl
  )

  expect(called).toBe(false)
  expect(result.usedSlug).toBe('claude-only')
  expect(result.isFallback).toBe(false)
  expect(result.response.status).toBe(403)
})

test('forwardWithFailover uses a candidate\'s own endpointPath override instead of the default path', async () => {
  let capturedUrl = ''
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  await forwardWithFailover(
    '/v1/messages', {}, undefined,
    [{ slug: 'custom', connection: { baseUrl: 'https://primary.example', apiKey: 'k1' }, endpointPath: '/v1/chat/completions' }],
    fetchImpl
  )

  expect(capturedUrl).toBe('https://primary.example/v1/chat/completions')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/relay/__tests__/forward.test.ts`
Expected: FAIL — `forwardWithFailover` is not exported yet.

- [ ] **Step 3: Implement `forwardWithFailover` in `forward.ts`**

Append to `apps/client-core/src/relay/forward.ts` (keep the existing `ForwardTarget` interface, `buildAuthHeaders`, and `forwardRequest` exactly as they are; add the import and the new code below them):

Add this import at the top of the file, alongside the existing `import { applyModelMapping } from './model-mapping'`:

```ts
import { isModelAllowed } from './model-whitelist'
```

Append at the end of the file:

```ts
export interface FailoverCandidate {
  slug: string
  connection: ForwardTarget
  endpointPath?: string
  whitelist?: string[]
}

export interface FailoverResult {
  response: Response
  usedSlug: string
  isFallback: boolean
}

export async function forwardWithFailover(
  defaultPath: string,
  body: unknown,
  requestedModel: string | undefined,
  candidates: FailoverCandidate[],
  fetchImpl: typeof fetch = fetch
): Promise<FailoverResult> {
  let lastResponse: Response | undefined
  let lastIndex = 0

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!
    lastIndex = i

    if (requestedModel && !isModelAllowed(requestedModel, candidate.whitelist)) {
      lastResponse = Response.json(
        { error: `model ${requestedModel} is not in the whitelist for provider ${candidate.slug}` },
        { status: 403 }
      )
      continue
    }

    let response: Response
    try {
      response = await forwardRequest(candidate.endpointPath || defaultPath, body, candidate.connection, fetchImpl)
    } catch (err) {
      lastResponse = Response.json(
        { error: `upstream request to ${candidate.slug} failed: ${String(err)}` },
        { status: 502 }
      )
      continue
    }

    if (response.status >= 500) {
      lastResponse = response
      continue
    }

    return { response, usedSlug: candidate.slug, isFallback: i > 0 }
  }

  return { response: lastResponse!, usedSlug: candidates[lastIndex]!.slug, isFallback: lastIndex > 0 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/relay/__tests__/forward.test.ts`
Expected: all pass (existing 5 + 8 new = 13 pass, 0 fail).

- [ ] **Step 5: Write the failing integration tests for `server.ts`**

Add to `apps/client-core/src/relay/__tests__/server.test.ts` (it already has `installProvider`, `beforeEach`/`afterEach`, and imports `startRelayServer`/`writeRegistry`/`itemDir`/`InstalledItem` — reuse those, add a helper for multi-entry registries):

```ts
async function installProviders(entries: Array<{ slug: string; enabledFor: Record<string, boolean>; config: Record<string, unknown> }>) {
  const items: InstalledItem[] = entries.map(({ slug, enabledFor }) => ({
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }))
  await writeRegistry(aasHome, { installed: items })
  for (const { slug, config } of entries) {
    const dir = itemDir(aasHome, 'provider', slug)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'config.json'), JSON.stringify(config))
  }
}

test('with two enabled providers, tries the higher-priority (lower level) one first', async () => {
  await installProviders([
    { slug: 'low-priority', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://low.example.com', level: 5 } },
    { slug: 'high-priority', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://high.example.com', level: 1 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  await fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://high.example.com/v1/messages'])
})

test('falls back to the next-priority provider when the first returns a 5xx, and records is_fallback', async () => {
  await installProviders([
    { slug: 'flaky', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://flaky.example.com', level: 1 } },
    { slug: 'reliable', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://reliable.example.com', level: 2 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    if (url.startsWith('https://flaky')) return new Response('boom', { status: 502 })
    return new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://flaky.example.com/v1/messages', 'https://reliable.example.com/v1/messages'])
  expect(res.status).toBe(200)
})

test('does not fall back when the first provider returns a 4xx', async () => {
  await installProviders([
    { slug: 'rejects', enabledFor: { claude: true }, config: { apiKey: 'k1', baseUrl: 'https://rejects.example.com', level: 1 } },
    { slug: 'backup', enabledFor: { claude: true }, config: { apiKey: 'k2', baseUrl: 'https://backup.example.com', level: 2 } },
  ])

  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(url)
    return new Response('bad request', { status: 400 })
  }) as typeof fetch

  const server = startRelayServer({ aasHome, port: 0, fetchImpl })
  stop = server.stop

  const res = await fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', body: JSON.stringify({ model: 'claude-3-5-sonnet' }) })

  expect(calls).toEqual(['https://rejects.example.com/v1/messages'])
  expect(res.status).toBe(400)
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/relay/__tests__/server.test.ts`
Expected: the 3 new tests FAIL (server still only tries one provider); existing tests still pass.

- [ ] **Step 7: Rewrite the request handler in `server.ts`**

Replace the entire contents of `apps/client-core/src/relay/server.ts` with:

```ts
import type { RegistryJson, ToolTarget } from '@as/types'
import { readRegistry } from '../registry/index'
import { findOrderedProvidersForTarget } from './provider-order'
import { forwardWithFailover } from './forward'
import { recordUsageAsync } from '../usage/record-usage'

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

export function startRelayServer(options: RelayServerOptions): { stop: () => void; port: number } {
  const { aasHome, port = RELAY_PORT, fetchImpl } = options

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const target = ROUTES[url.pathname]
      if (!target) return new Response('Not found', { status: 404 })

      const registry: RegistryJson = await readRegistry(aasHome)
      const candidates = await findOrderedProvidersForTarget(aasHome, registry, target)
      const eligible = candidates.filter(({ connection }) => connection.apiKey && connection.baseUrl)
      if (eligible.length === 0) {
        return Response.json({ error: `no active provider for ${target}` }, { status: 503 })
      }

      const body = await req.json().catch(() => ({}))
      const requestedModel = typeof (body as Record<string, unknown>)['model'] === 'string'
        ? (body as Record<string, unknown>)['model'] as string
        : undefined

      const startedAt = Date.now()
      const { response: upstreamResponse, usedSlug, isFallback } = await forwardWithFailover(
        url.pathname,
        body,
        requestedModel,
        eligible.map(({ item, connection }) => ({
          slug: item.slug,
          connection: {
            baseUrl: connection.baseUrl!,
            apiKey: connection.apiKey!,
            authType: connection.authType,
            modelMapping: connection.modelMapping,
          },
          endpointPath: connection.endpointPath,
          whitelist: connection.whitelist,
        })),
        fetchImpl
      )

      const usedConnection = eligible.find(({ item }) => item.slug === usedSlug)!.connection
      const contentType = upstreamResponse.headers.get('content-type') ?? ''
      const isStreaming = contentType.includes('text/event-stream')

      if (upstreamResponse.body) {
        const [clientStream, usageStream] = upstreamResponse.body.tee()
        void recordUsageAsync({
          aasHome, providerSlug: usedSlug, target, model: requestedModel ?? 'unknown',
          pricing: usedConnection.pricing, bodyStream: usageStream, isStreaming,
          statusCode: upstreamResponse.status, startedAt, isFallback,
        })
        return new Response(clientStream, { status: upstreamResponse.status, headers: upstreamResponse.headers })
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      })
    },
  })

  return { stop: () => server.stop(true), port: server.port ?? port }
}
```

- [ ] **Step 8: Run the full relay test suite to verify everything passes**

Run: `cd apps/client-core && bun test src/relay/ && bun run tsc --noEmit` (adjust the type-check command to match `apps/client-core/package.json`'s actual script if different)
Expected: all tests in `src/relay/__tests__/` pass (including the pre-existing `server.test.ts` tests, unchanged, plus the 3 new ones), 0 type errors.

- [ ] **Step 9: Run the full client-core suite**

Run: `cd apps/client-core && bun test`
Expected: all tests pass — this also re-confirms Task 1's engine tests and the usage-tracking tests still pass since `recordUsageAsync`'s shape didn't change.

- [ ] **Step 10: Commit**

```bash
git add apps/client-core/src/relay/forward.ts apps/client-core/src/relay/server.ts apps/client-core/src/relay/__tests__/forward.test.ts apps/client-core/src/relay/__tests__/server.test.ts
git commit -m "feat(client-core): route relay requests through priority-ordered failover

Replaces the single-active-provider lookup with forwardWithFailover, which
tries enabled providers in level order, skips whitelist-rejected
candidates, retries on network failure or 5xx, and returns immediately on
any other status. Threads the resolved provider slug and fallback flag
into the existing usage-recording call."
```

---

### Task 4: Full verification and real-environment smoke test

**Context:** Confirm the whole monorepo still builds/tests cleanly, then prove failover actually works against real third-party infrastructure — per this session's established practice of testing relay behavior against real code-switch-R-configured providers rather than only mocks.

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full monorepo test and type-check suite**

Run: `cd /Users/liushangliang/github/phenix3443/agent-store && bunx turbo run test type-check`
Expected: all tasks pass, 0 failures, 0 type errors.

- [ ] **Step 2: Real-environment smoke test setup**

Read `~/.code-switch/codex.json` and `~/.code-switch/claude-code.json` to find two working provider configs (e.g. `yls`/`yls-me`/`skyapi`) with real base URLs and API keys. Do not copy these files into the repo or commit any real key anywhere.

Create an isolated test home:

```bash
export AS_HOME=$(mktemp -d /tmp/as-failover-smoketest-XXXX)
```

Using the CLI (`bun run apps/cli/src/index.ts` or the built `aas` binary — check `apps/cli/package.json` for the right invocation), install and configure two provider items pointing at the two real endpoints found above, with different `level` values (e.g. `level: 1` for the one you intend to be primary, `level: 2` for the backup), then `enable` both for `claude`.

- [ ] **Step 3: Verify priority ordering with real traffic**

Start the relay daemon against `AS_HOME` (`aas relay start`), send a real request through it (e.g. `curl -X POST http://127.0.0.1:18780/v1/messages -H 'content-type: application/json' -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'`), and confirm (via the primary provider's own request logs, or by temporarily using a proxy/mitm if available, or simply by confirming a real 200 response with real model output) that the level-1 provider was the one that actually handled it.

- [ ] **Step 4: Verify real failover**

Edit the level-1 provider's `config.json` (in `$AS_HOME/providers/<slug>/config.json`) to set `baseUrl` to an intentionally broken address (e.g. `https://127.0.0.1:1` or a nonexistent subdomain) to force a connection failure. Send another request through the relay. Confirm the response is a genuine successful reply (meaning it fell through to the level-2 real provider), and check `$AS_HOME/usage.db`'s `request_logs` table for the new row:

```bash
sqlite3 "$AS_HOME/usage.db" "SELECT provider_slug, is_fallback, status_code FROM request_logs ORDER BY id DESC LIMIT 1"
```

Expected: `is_fallback` is `1` and `provider_slug` is the level-2 provider's slug.

- [ ] **Step 5: Tear down**

```bash
aas relay stop
rm -rf "$AS_HOME"
```

No commit for this task — it's verification only. If any step fails, treat it as `BLOCKED` and report the exact failure rather than silently proceeding.
