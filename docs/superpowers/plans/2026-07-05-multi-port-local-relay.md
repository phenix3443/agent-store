# Multi-Port Local Relay Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the local relay run more than one named, independently-configurable listen-port instance at once, managed via `{aasHome}/relay-configs.json`, with CRUD exposed through the CLI/RPC surface and the relay daemon reconciling its live `Bun.serve` instances to match the saved configuration on a short poll interval.

**Architecture:** A new pure CRUD module (`local-configs.ts`) owns reading/writing `relay-configs.json`, seeded with one `{ id: 'default', name: '默认', port: 18780, enabled: true }` entry. A new daemon module (`daemon.ts`) separates a pure reconciliation function (diff desired vs. running instances, called with injectable start/stop) from the actual poll loop, so the diff logic is unit-testable without real ports or timers. The CLI's `__relay-daemon` hidden subcommand switches from starting one hardcoded-port `startRelayServer` call to running this poll loop for as long as the process lives. `AASEngineImpl` gets five new methods delegating straight to `local-configs.ts`, exposed through the existing RPC dispatch table.

**Tech Stack:** TypeScript, Bun (`bun:test`, `Bun.serve`, `crypto.randomUUID()`), existing `@aas/client-core`/`@aas/types` packages — no new dependencies.

## Global Constraints

- Seed port is `18780` (the existing `RELAY_PORT` constant in `apps/client-core/src/relay/server.ts`) — do NOT change this to the design mockup's `18100`; this was already decided in the parent spec (`docs/superpowers/specs/2026-07-05-cli-client-full-fidelity-design.md` line 18).
- `addLocalConfig` picks the next free port by starting at the seed port and adding `100` repeatedly until an unused port is found (skips ports already used by any existing config, not just enabled ones).
- `removeLocalConfig` must throw rather than allow removing the last remaining configuration — there must always be at least one.
- No inter-process signaling. Reconciliation is polling-only: the daemon re-reads `relay-configs.json` every few seconds and starts/stops `Bun.serve` instances to match. This is an explicit, deliberate simplification from the spec (line 50).
- Each config's underlying relay behavior (routing, priority failover, whitelist, usage recording) is identical across ports — a listen port is just another `Bun.serve` instance created via the existing `startRelayServer({ aasHome, port })`, not a differently-behaved server.

---

### Task 1: `LocalRelayConfig` type and the `local-configs.ts` CRUD module

**Context:** This task adds the on-disk shape and its CRUD operations, independent of the daemon or any RPC wiring, so it can be fully tested in isolation first.

**Files:**
- Modify: `packages/types/src/engine.ts`
- Modify: `packages/types/src/index.ts`
- Create: `apps/client-core/src/relay/local-configs.ts`
- Test: `apps/client-core/src/relay/__tests__/local-configs.test.ts`

**Interfaces:**
- Consumes: `RELAY_PORT` (existing constant, `apps/client-core/src/relay/server.ts`).
- Produces: `export interface LocalRelayConfig { id: string; name: string; port: number; enabled: boolean }` in `@aas/types`; and from `apps/client-core/src/relay/local-configs.ts`: `listLocalConfigs(aasHome)`, `addLocalConfig(aasHome, name)`, `removeLocalConfig(aasHome, id)`, `updateLocalConfig(aasHome, id, patch)`, `setLocalConfigEnabled(aasHome, id, enabled)`, `toggleLocalConfig(aasHome, id)` — all consumed by Task 2 (daemon) and Task 3 (engine/RPC wiring).

- [ ] **Step 1: Add the `LocalRelayConfig` type**

In `packages/types/src/engine.ts`, add this interface near `ModelPricing` (anywhere at the top level of the file is fine):

```ts
export interface LocalRelayConfig {
  id: string
  name: string
  port: number
  enabled: boolean
}
```

In `packages/types/src/index.ts`, add `LocalRelayConfig` to the existing `export type { ... } from './engine'` block:

```ts
export type {
  ToolTarget,
  AASPaths,
  SearchOptions,
  InstallResult,
  SyncResult,
  UpdateAvailable,
  UpdateResult,
  ListOptions,
  InstalledItem,
  ItemDetail,
  AASEngine,
  ModelPricing,
  UsageSummaryRow,
  UsageSummaryOptions,
  LocalRelayConfig,
} from './engine'
```

- [ ] **Step 2: Write the failing tests**

Create `apps/client-core/src/relay/__tests__/local-configs.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { join } from 'path'
import {
  listLocalConfigs, addLocalConfig, removeLocalConfig, updateLocalConfig,
  setLocalConfigEnabled, toggleLocalConfig,
} from '../local-configs'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-local-configs-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

test('listLocalConfigs seeds a default config when no file exists', async () => {
  const configs = await listLocalConfigs(aasHome)
  expect(configs).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true }])
})

test('addLocalConfig picks the next free port in +100 increments', async () => {
  const first = await addLocalConfig(aasHome, 'Second')
  expect(first.port).toBe(18880)
  expect(first.name).toBe('Second')
  expect(first.enabled).toBe(true)
  expect(typeof first.id).toBe('string')
  expect(first.id.length).toBeGreaterThan(0)

  const second = await addLocalConfig(aasHome, 'Third')
  expect(second.port).toBe(18980)

  const all = await listLocalConfigs(aasHome)
  expect(all.map((c) => c.port)).toEqual([18780, 18880, 18980])
})

test('addLocalConfig skips a port already used by a disabled config', async () => {
  const added = await addLocalConfig(aasHome, 'Second')
  await setLocalConfigEnabled(aasHome, added.id, false)

  const third = await addLocalConfig(aasHome, 'Third')
  expect(third.port).toBe(18980)
})

test('removeLocalConfig removes the matching entry', async () => {
  const added = await addLocalConfig(aasHome, 'Second')
  await removeLocalConfig(aasHome, added.id)
  const all = await listLocalConfigs(aasHome)
  expect(all).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true }])
})

test('removeLocalConfig throws when trying to remove the last remaining config', async () => {
  await expect(removeLocalConfig(aasHome, 'default')).rejects.toThrow(
    'Cannot remove the last local relay configuration'
  )
})

test('removeLocalConfig throws for an unknown id', async () => {
  await addLocalConfig(aasHome, 'Second')
  await expect(removeLocalConfig(aasHome, 'nonexistent')).rejects.toThrow(
    'Local relay configuration not found: nonexistent'
  )
})

test('updateLocalConfig patches name and/or port independently', async () => {
  const added = await addLocalConfig(aasHome, 'Second')

  const renamed = await updateLocalConfig(aasHome, added.id, { name: 'Renamed' })
  expect(renamed.name).toBe('Renamed')
  expect(renamed.port).toBe(added.port)

  const reported = await updateLocalConfig(aasHome, added.id, { port: 19999 })
  expect(reported.name).toBe('Renamed')
  expect(reported.port).toBe(19999)
})

test('updateLocalConfig throws for an unknown id', async () => {
  await expect(updateLocalConfig(aasHome, 'nonexistent', { name: 'X' })).rejects.toThrow(
    'Local relay configuration not found: nonexistent'
  )
})

test('setLocalConfigEnabled sets the enabled flag explicitly', async () => {
  const updated = await setLocalConfigEnabled(aasHome, 'default', false)
  expect(updated.enabled).toBe(false)
  const all = await listLocalConfigs(aasHome)
  expect(all[0]!.enabled).toBe(false)
})

test('toggleLocalConfig flips the current enabled state', async () => {
  const first = await toggleLocalConfig(aasHome, 'default')
  expect(first.enabled).toBe(false)
  const second = await toggleLocalConfig(aasHome, 'default')
  expect(second.enabled).toBe(true)
})

test('configs persist to relay-configs.json in aasHome', async () => {
  await addLocalConfig(aasHome, 'Second')
  const raw = JSON.parse(await readFile(join(aasHome, 'relay-configs.json'), 'utf-8'))
  expect(raw).toHaveLength(2)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/relay/__tests__/local-configs.test.ts`
Expected: FAIL with a module-not-found error for `../local-configs`.

- [ ] **Step 4: Implement `local-configs.ts`**

Create `apps/client-core/src/relay/local-configs.ts`:

```ts
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { LocalRelayConfig } from '@aas/types'
import { RELAY_PORT } from './server'

const CONFIG_FILE = 'relay-configs.json'
const SEED_CONFIG: LocalRelayConfig = { id: 'default', name: '默认', port: RELAY_PORT, enabled: true }

async function readConfigs(aasHome: string): Promise<LocalRelayConfig[]> {
  try {
    const raw = await readFile(join(aasHome, CONFIG_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as LocalRelayConfig[]
    return parsed.length > 0 ? parsed : [SEED_CONFIG]
  } catch {
    return [SEED_CONFIG]
  }
}

async function writeConfigs(aasHome: string, configs: LocalRelayConfig[]): Promise<void> {
  await mkdir(aasHome, { recursive: true })
  await writeFile(join(aasHome, CONFIG_FILE), JSON.stringify(configs, null, 2))
}

export async function listLocalConfigs(aasHome: string): Promise<LocalRelayConfig[]> {
  return readConfigs(aasHome)
}

export async function addLocalConfig(aasHome: string, name: string): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const usedPorts = new Set(configs.map((c) => c.port))
  let port = SEED_CONFIG.port
  while (usedPorts.has(port)) port += 100
  const config: LocalRelayConfig = { id: crypto.randomUUID(), name, port, enabled: true }
  await writeConfigs(aasHome, [...configs, config])
  return config
}

export async function removeLocalConfig(aasHome: string, id: string): Promise<void> {
  const configs = await readConfigs(aasHome)
  if (configs.length <= 1) {
    throw new Error('Cannot remove the last local relay configuration')
  }
  const next = configs.filter((c) => c.id !== id)
  if (next.length === configs.length) {
    throw new Error(`Local relay configuration not found: ${id}`)
  }
  await writeConfigs(aasHome, next)
}

export async function updateLocalConfig(
  aasHome: string,
  id: string,
  patch: { name?: string; port?: number }
): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const index = configs.findIndex((c) => c.id === id)
  if (index === -1) throw new Error(`Local relay configuration not found: ${id}`)
  const updated: LocalRelayConfig = {
    ...configs[index]!,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.port !== undefined ? { port: patch.port } : {}),
  }
  const next = [...configs]
  next[index] = updated
  await writeConfigs(aasHome, next)
  return updated
}

export async function setLocalConfigEnabled(
  aasHome: string,
  id: string,
  enabled: boolean
): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const index = configs.findIndex((c) => c.id === id)
  if (index === -1) throw new Error(`Local relay configuration not found: ${id}`)
  const updated: LocalRelayConfig = { ...configs[index]!, enabled }
  const next = [...configs]
  next[index] = updated
  await writeConfigs(aasHome, next)
  return updated
}

export async function toggleLocalConfig(aasHome: string, id: string): Promise<LocalRelayConfig> {
  const configs = await readConfigs(aasHome)
  const current = configs.find((c) => c.id === id)
  if (!current) throw new Error(`Local relay configuration not found: ${id}`)
  return setLocalConfigEnabled(aasHome, id, !current.enabled)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/relay/__tests__/local-configs.test.ts`
Expected: 11 pass, 0 fail.

- [ ] **Step 6: Run the package type check**

Run: `cd apps/client-core && bun run type-check` (check `apps/client-core/package.json` for the exact script name if different) and `cd packages/types && bun run type-check` (or equivalent — check that package's `package.json`).
Expected: 0 errors in both.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/engine.ts packages/types/src/index.ts apps/client-core/src/relay/local-configs.ts apps/client-core/src/relay/__tests__/local-configs.test.ts
git commit -m "feat(client-core): add LocalRelayConfig CRUD for multi-port relay management"
```

---

### Task 2: Relay daemon reconciliation loop

**Context:** The daemon process needs to run one `Bun.serve` instance per enabled config in `relay-configs.json`, and pick up additions/removals/port changes/enable-toggles without a restart. This task splits the diffing logic (pure, easily testable) from the actual polling loop (which needs real timers and is harder to unit-test tightly), per the plan's file-structure principle of keeping testable logic in small pure functions.

**Files:**
- Create: `apps/client-core/src/relay/daemon.ts`
- Modify: `apps/client-core/src/index.ts`
- Test: `apps/client-core/src/relay/__tests__/daemon.test.ts`

**Interfaces:**
- Consumes: `listLocalConfigs(aasHome)` from `./local-configs` (Task 1); `startRelayServer({ aasHome, port }): { stop: () => void; port: number }` from `./server` (existing, unchanged).
- Produces: `export interface RunningRelayInstance { id: string; port: number; stop: () => void }`, `export function reconcileRelayInstances(desired: LocalRelayConfig[], running: Map<string, RunningRelayInstance>, start: (config: LocalRelayConfig) => RunningRelayInstance): void`, `export async function runRelayDaemon(aasHome: string, options?: { pollIntervalMs?: number; signal?: AbortSignal }): Promise<void>` — Task 3 doesn't consume these directly (only the CLI wiring in this task does), but they must be exported from `apps/client-core/src/index.ts` for `apps/cli`'s `__relay-daemon` case to import `runRelayDaemon`.

- [ ] **Step 1: Write the failing tests for `reconcileRelayInstances`**

Create `apps/client-core/src/relay/__tests__/daemon.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { reconcileRelayInstances, type RunningRelayInstance } from '../daemon'
import type { LocalRelayConfig } from '@aas/types'

function config(id: string, port: number, enabled = true, name = id): LocalRelayConfig {
  return { id, name, port, enabled }
}

test('starts an instance for a new enabled config', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
  expect(running.has('a')).toBe(true)
  expect(running.get('a')!.port).toBe(18780)
})

test('does not restart an already-running instance whose config is unchanged', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18780)], running, start)

  expect(started).toEqual(['a'])
})

test('stops an instance when its config is removed', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('stops an instance when its config is disabled', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => ({
    id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.id),
  })

  reconcileRelayInstances([config('a', 18780, true)], running, start)
  reconcileRelayInstances([config('a', 18780, false)], running, start)

  expect(stopped).toEqual(['a'])
  expect(running.has('a')).toBe(false)
})

test('restarts an instance when its port changes', () => {
  const running = new Map<string, RunningRelayInstance>()
  const stopped: number[] = []
  const started: number[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.port)
    return { id: cfg.id, port: cfg.port, stop: () => stopped.push(cfg.port) }
  }

  reconcileRelayInstances([config('a', 18780)], running, start)
  reconcileRelayInstances([config('a', 18880)], running, start)

  expect(stopped).toEqual([18780])
  expect(started).toEqual([18780, 18880])
  expect(running.get('a')!.port).toBe(18880)
})

test('handles multiple configs independently', () => {
  const running = new Map<string, RunningRelayInstance>()
  const started: string[] = []
  const start = (cfg: LocalRelayConfig): RunningRelayInstance => {
    started.push(cfg.id)
    return { id: cfg.id, port: cfg.port, stop: () => {} }
  }

  reconcileRelayInstances([config('a', 18780), config('b', 18880)], running, start)

  expect(started).toEqual(['a', 'b'])
  expect(running.size).toBe(2)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/relay/__tests__/daemon.test.ts`
Expected: FAIL with a module-not-found error for `../daemon`.

- [ ] **Step 3: Implement `daemon.ts`**

Create `apps/client-core/src/relay/daemon.ts`:

```ts
import type { LocalRelayConfig } from '@aas/types'
import { listLocalConfigs } from './local-configs'
import { startRelayServer } from './server'

export interface RunningRelayInstance {
  id: string
  port: number
  stop: () => void
}

export function reconcileRelayInstances(
  desired: LocalRelayConfig[],
  running: Map<string, RunningRelayInstance>,
  start: (config: LocalRelayConfig) => RunningRelayInstance
): void {
  const desiredEnabled = new Map(desired.filter((c) => c.enabled).map((c) => [c.id, c]))

  for (const [id, instance] of running) {
    const desiredConfig = desiredEnabled.get(id)
    if (!desiredConfig || desiredConfig.port !== instance.port) {
      instance.stop()
      running.delete(id)
    }
  }

  for (const [id, cfg] of desiredEnabled) {
    if (!running.has(id)) {
      running.set(id, start(cfg))
    }
  }
}

export async function runRelayDaemon(
  aasHome: string,
  options: { pollIntervalMs?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const { pollIntervalMs = 3000, signal } = options
  const running = new Map<string, RunningRelayInstance>()
  const start = (config: LocalRelayConfig): RunningRelayInstance => {
    const server = startRelayServer({ aasHome, port: config.port })
    return { id: config.id, port: server.port, stop: server.stop }
  }

  while (!signal?.aborted) {
    const desired = await listLocalConfigs(aasHome)
    reconcileRelayInstances(desired, running, start)
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  for (const instance of running.values()) instance.stop()
}
```

- [ ] **Step 4: Run the reconciliation tests to verify they pass**

Run: `cd apps/client-core && bun test src/relay/__tests__/daemon.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Add an integration test for `runRelayDaemon` itself**

Append to `apps/client-core/src/relay/__tests__/daemon.test.ts`:

```ts
test('runRelayDaemon starts a real server per enabled config and stops it on abort', async () => {
  const { mkdtemp, rm, writeFile } = await import('fs/promises')
  const { join } = await import('path')
  const aasHome = await mkdtemp('/tmp/aas-daemon-test-')

  try {
    await writeFile(
      join(aasHome, 'relay-configs.json'),
      JSON.stringify([{ id: 'a', name: 'A', port: 0, enabled: true }])
    )

    const controller = new AbortController()
    const daemonPromise = runRelayDaemon(aasHome, { pollIntervalMs: 20, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 60))

    controller.abort()
    await daemonPromise
  } finally {
    await rm(aasHome, { recursive: true, force: true })
  }
})
```

Add `runRelayDaemon` to the existing import from `'../daemon'` at the top of the file.

- [ ] **Step 6: Run the full test file to verify it passes**

Run: `cd apps/client-core && bun test src/relay/__tests__/daemon.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 7: Export `runRelayDaemon` from the package barrel**

In `apps/client-core/src/index.ts`, change:

```ts
export { startRelayServer, RELAY_PORT } from './relay/server'
```

to:

```ts
export { startRelayServer, RELAY_PORT } from './relay/server'
export { runRelayDaemon } from './relay/daemon'
```

- [ ] **Step 8: Run the full client-core suite and type check**

Run: `cd apps/client-core && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/client-core/src/relay/daemon.ts apps/client-core/src/relay/__tests__/daemon.test.ts apps/client-core/src/index.ts
git commit -m "feat(client-core): add relay daemon reconciliation loop for multi-port configs"
```

---

### Task 3: Wire the CLI daemon entrypoint and add engine/RPC methods

**Context:** This task makes the new capability reachable: the CLI's hidden `__relay-daemon` subcommand switches from a single hardcoded `startRelayServer` call to the polling `runRelayDaemon` loop, and `AASEngineImpl` gains the five CRUD methods so the GUI (via RPC) and any future CLI command can manage configs.

**Files:**
- Modify: `apps/cli/src/index.ts`
- Modify: `packages/types/src/engine.ts`
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/cli/src/commands/rpc.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts`
- Test: `apps/cli/src/commands/__tests__/rpc.test.ts` (check the exact existing test file name/path with `find apps/cli/src -iname "*rpc*test*"` first — use whatever already exists, or this path if none does)

**Interfaces:**
- Consumes: `listLocalConfigs`, `addLocalConfig`, `removeLocalConfig`, `updateLocalConfig`, `toggleLocalConfig` from `apps/client-core/src/relay/local-configs.ts` (Task 1); `runRelayDaemon` from `@aas/client-core` (Task 2).
- Produces: `AASEngine.listLocalConfigs(): Promise<LocalRelayConfig[]>`, `.addLocalConfig(name: string): Promise<LocalRelayConfig>`, `.removeLocalConfig(id: string): Promise<void>`, `.updateLocalConfig(id: string, patch: { name?: string; port?: number }): Promise<LocalRelayConfig>`, `.toggleLocalConfig(id: string): Promise<LocalRelayConfig>` — consumed by RPC dispatch and, in a later not-yet-planned dashboard/local-provider-detail task, by the GUI.

- [ ] **Step 1: Switch the CLI daemon entrypoint**

In `apps/cli/src/index.ts`, change the import line:

```ts
import { startRelayServer, resolvePaths } from '@aas/client-core'
```

to:

```ts
import { runRelayDaemon, resolvePaths } from '@aas/client-core'
```

Change the `__relay-daemon` case:

```ts
    case '__relay-daemon': {
      const paths = resolvePaths()
      startRelayServer({ aasHome: paths.aasHome })
      return // keep the process alive; Bun.serve holds the event loop open
    }
```

to:

```ts
    case '__relay-daemon': {
      const paths = resolvePaths()
      await runRelayDaemon(paths.aasHome)
      return
    }
```

There's no unit test for `apps/cli/src/index.ts`'s `main()` dispatch in this codebase (confirm with `find apps/cli/src -iname "*index*test*"` — if one exists, read it first and add a case if its pattern supports it; if none exists, skip a test for this step, it's exercised by Task 4's real-environment smoke test instead).

- [ ] **Step 2: Add the methods to the `AASEngine` interface**

In `packages/types/src/engine.ts`, add to the `AASEngine` interface (after `parsePricingFromUrl`):

```ts
  /** Lists all local relay listen-port configurations. */
  listLocalConfigs(): Promise<LocalRelayConfig[]>
  /** Adds a new local relay configuration on the next free port, enabled by default. */
  addLocalConfig(name: string): Promise<LocalRelayConfig>
  /** Removes a local relay configuration. Throws if it's the last remaining one. */
  removeLocalConfig(id: string): Promise<void>
  /** Renames and/or changes the port of a local relay configuration. */
  updateLocalConfig(id: string, patch: { name?: string; port?: number }): Promise<LocalRelayConfig>
  /** Flips a local relay configuration's enabled flag. */
  toggleLocalConfig(id: string): Promise<LocalRelayConfig>
```

- [ ] **Step 3: Write the failing tests for the engine methods**

Add to `apps/client-core/src/__tests__/engine.test.ts` (it already imports `AASEngineImpl` and sets up `aasHome`/`engine` in `beforeEach` — reuse those):

```ts
test('listLocalConfigs returns the seeded default when nothing is configured', async () => {
  const configs = await engine.listLocalConfigs()
  expect(configs).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true }])
})

test('addLocalConfig, updateLocalConfig, toggleLocalConfig, removeLocalConfig round-trip through the engine', async () => {
  const added = await engine.addLocalConfig('Second')
  expect(added.port).toBe(18880)

  const renamed = await engine.updateLocalConfig(added.id, { name: 'Renamed' })
  expect(renamed.name).toBe('Renamed')

  const toggled = await engine.toggleLocalConfig(added.id)
  expect(toggled.enabled).toBe(false)

  await engine.removeLocalConfig(added.id)
  const remaining = await engine.listLocalConfigs()
  expect(remaining).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true }])
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: FAIL — `engine.listLocalConfigs` is not a function.

- [ ] **Step 5: Implement the engine methods**

In `apps/client-core/src/engine.ts`, add this import:

```ts
import {
  listLocalConfigs as _listLocalConfigs, addLocalConfig as _addLocalConfig,
  removeLocalConfig as _removeLocalConfig, updateLocalConfig as _updateLocalConfig,
  toggleLocalConfig as _toggleLocalConfig,
} from './relay/local-configs'
```

Add `LocalRelayConfig` to the existing `import type { ... } from '@aas/types'` block at the top of the file.

Add these five methods to the `AASEngineImpl` class (anywhere among the other public methods, e.g. right after `parsePricingFromUrl`):

```ts
  async listLocalConfigs(): Promise<LocalRelayConfig[]> {
    return _listLocalConfigs(this.paths.aasHome)
  }

  async addLocalConfig(name: string): Promise<LocalRelayConfig> {
    return _addLocalConfig(this.paths.aasHome, name)
  }

  async removeLocalConfig(id: string): Promise<void> {
    return _removeLocalConfig(this.paths.aasHome, id)
  }

  async updateLocalConfig(id: string, patch: { name?: string; port?: number }): Promise<LocalRelayConfig> {
    return _updateLocalConfig(this.paths.aasHome, id, patch)
  }

  async toggleLocalConfig(id: string): Promise<LocalRelayConfig> {
    return _toggleLocalConfig(this.paths.aasHome, id)
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: all pass (including the 2 new tests).

- [ ] **Step 7: Add the RPC dispatch entries**

In `apps/cli/src/commands/rpc.ts`, add to the `RPC_METHODS` table (after `parsePricingFromUrl`):

```ts
  listLocalConfigs: (e) => e.listLocalConfigs(),
  addLocalConfig: (e, a) => e.addLocalConfig(a[0] as string),
  removeLocalConfig: (e, a) => e.removeLocalConfig(a[0] as string),
  updateLocalConfig: (e, a) => e.updateLocalConfig(a[0] as string, a[1] as { name?: string; port?: number }),
  toggleLocalConfig: (e, a) => e.toggleLocalConfig(a[0] as string),
```

- [ ] **Step 8: Check for and extend an existing RPC dispatch test**

Run: `find apps/cli/src -iname "*rpc*test*"`

If a test file exists (e.g. `apps/cli/src/commands/__tests__/rpc.test.ts`), read it to see its mocking pattern for `AASEngine` (likely a hand-built object implementing a subset of `AASEngine`, or a full mock), and add one test confirming `listLocalConfigs` dispatches correctly, e.g.:

```ts
test('listLocalConfigs dispatches to engine.listLocalConfigs', async () => {
  const calls: unknown[][] = []
  const engine = {
    listLocalConfigs: async (...args: unknown[]) => { calls.push(args); return [] },
  } as unknown as AASEngine
  const out: string[] = []
  await runRpc(engine, ['listLocalConfigs'], (s) => out.push(s))
  expect(calls).toEqual([[]])
  expect(JSON.parse(out[0]!)).toEqual({ ok: true, data: [] })
})
```

Adapt the exact mock-engine construction to match whatever pattern the existing file already uses for other methods (e.g. if it builds one big mock object reused across tests, add `listLocalConfigs` to that object instead of a bespoke one per test). If no such test file exists at all, skip this step — the RPC methods are still exercised end-to-end in Task 4's real environment smoke test.

- [ ] **Step 9: Run the full client-core and cli suites plus type checks**

Run: `cd apps/client-core && bun test && bun run type-check && cd ../cli && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/cli/src/index.ts packages/types/src/engine.ts apps/client-core/src/engine.ts apps/cli/src/commands/rpc.ts apps/client-core/src/__tests__/engine.test.ts
git commit -m "feat(client-core,cli): expose local relay config CRUD via AASEngine and RPC"
```

(If Step 8 added a test file change, include it in the `git add` too.)

---

### Task 4: Full verification and real-environment smoke test

**Context:** Confirm the whole monorepo still builds/tests cleanly, then prove the daemon actually runs multiple real listen ports and reacts to config changes without a restart.

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full monorepo test and type-check suite**

Run: `cd /Users/liushangliang/github/phenix3443/ai-agent-store && bunx turbo run test type-check`
Expected: all tasks pass, 0 failures, 0 type errors. (If you see a stale-`dist/`-artifact-looking spurious failure, rerun once before treating it as real — this happened once earlier in this session and resolved on rebuild.)

- [ ] **Step 2: Real-environment smoke test setup**

```bash
export AAS_HOME=$(mktemp -d /tmp/aas-multiport-smoketest-XXXX)
cd /Users/liushangliang/github/phenix3443/ai-agent-store
```

Start the daemon directly (bypassing the PID-file-managed `aas relay start/stop` CLI wrapper, so you can watch its stdout):

```bash
AAS_HOME="$AAS_HOME" bun run apps/cli/src/index.ts __relay-daemon &
echo $! > /tmp/multiport-daemon.pid
sleep 1
```

- [ ] **Step 3: Verify the seeded default config serves on 18780**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18780/v1/messages -X POST -d '{}'
```

Expected: some HTTP status (likely `503` since no provider is enabled yet) — the point is the port responds at all, proving the daemon started the seeded config's server.

- [ ] **Step 4: Add a second config and confirm it comes up without restarting the daemon**

Using the RPC command (adjust invocation to match `apps/cli`'s actual `__rpc` entrypoint):

```bash
AAS_HOME="$AAS_HOME" bun run apps/cli/src/index.ts __rpc addLocalConfig '["Second"]'
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18880/v1/messages -X POST -d '{}'
```

Expected: the `addLocalConfig` RPC call returns a JSON success response reporting `port: 18880`; after waiting past the daemon's poll interval (default 3s, hence the `sleep 4`), port `18880` also responds — proving the running daemon picked up the new config without a restart.

- [ ] **Step 5: Disable the second config and confirm its port stops responding**

```bash
AAS_HOME="$AAS_HOME" bun run apps/cli/src/index.ts __rpc listLocalConfigs
# note the id of the "Second" config from the output, then:
AAS_HOME="$AAS_HOME" bun run apps/cli/src/index.ts __rpc toggleLocalConfig '["<id-from-above>"]'
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" --max-time 2 http://127.0.0.1:18880/v1/messages -X POST -d '{}' || echo "connection refused, as expected"
```

Expected: the curl either fails to connect or times out, confirming the daemon stopped that port's server.

- [ ] **Step 6: Tear down**

```bash
kill "$(cat /tmp/multiport-daemon.pid)"
rm -f /tmp/multiport-daemon.pid
rm -rf "$AAS_HOME"
```

No commit for this task — it's verification only. If any step fails, treat it as `BLOCKED` and report the exact failure rather than silently proceeding.
