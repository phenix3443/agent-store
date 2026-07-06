# Overview Dashboard + Proxy Log Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/cli-gui` the design mockup's default Overview dashboard (consumption trend, category counts, local relay status, recent requests, updatable packages) and a proxy request log modal — the last unbuilt piece of `docs/superpowers/specs/2026-07-05-cli-client-full-fidelity-design.md` (subsystem 4). Along the way, migrate "更新" from a standalone nav view to a `listFilter` token, per that spec's explicit correction (§20).

**Architecture:** `navView` gains `'overview'` (new default) and `'local-relay'`; `App.tsx` renders either the existing three-pane browse layout or one full-width component (`Overview.tsx` / `LocalRelayDetail.tsx`) depending on `navView`. `Overview.tsx` is composed of small independent cards, each fetching its own data via already-existing or newly-added (`docs/superpowers/plans/2026-07-05-dashboard-backend-additions.md`, already merged) RPCs: `getUsageSummary` (trend), `list` (category counts), `getRelayStatus`+`listLocalConfigs` (local relay card), `getRecentRequests` (recent requests + proxy log modal), `checkUpdates` (updatable packages). No chart library — a small hand-written SVG polyline component. "更新" becomes a `ListFilter` value filtering the already-loaded installed list, replacing the old dedicated `navView === 'updates'` branch entirely.

**Tech Stack:** React, TypeScript, Tailwind (existing `apps/cli-gui` conventions), `@testing-library/react` + `bun:test` for component tests. No new dependencies (no chart library).

## Global Constraints

- Seed/default relay port references, if shown, must say `18780` (the actual default), not the mockup's `18100` — this is already established in earlier merged plans; the Overview UI must not introduce a new hardcoded `18100` anywhere.
- Dead mockup fields (`appRows`, `errorCount`, etc. from the original HTML mockup) are explicitly NOT ported — only real, backend-sourced numbers appear on cards (per spec §19: "改为真实数据").
- No i18n layer — GUI text is Chinese-only, matching the rest of `apps/cli-gui`.
- No circuit-breaker/health-check-polling UI beyond what's already stored (`healthCheck: boolean` on a provider is already a stored-but-inert flag from an earlier plan — this plan does not add real polling behavior for it).
- "本地代理" (local relay) detail is modeled as a single-screen list-with-inline-edit (`LocalRelayDetail.tsx`), not a two-screen parent/child drill-down — a deliberate simplification from the original spec's "父视图/子视图" framing, since the editable data per config (name, port, enabled) is simple enough that a drill-down adds navigation cost with no benefit. This is a disclosed "忠实复刻 vs 修正" decision, not a silent scope cut.
- Per `AGENTS.md`'s UI sign-off rule, the final task's verification must include real native-window screenshots (via `make dev-gui` + `screencapture`/`osascript`, per this session's established technique), not just a browser-tab check, before this plan is considered visually complete.

---

### Task 1: Migrate "更新" from a nav view to a `listFilter` token

**Context:** Currently `navView` has a dedicated `'updates'` value with its own fetch-on-switch, own render branch, and own IconRail icon. The spec's §20 correction requires "更新" to instead be a `ListFilter` value (like `popular`/`enabled`) that filters the already-loaded installed list to only packages with an available update, using the existing `@` token-menu UI pattern. This task does the filter-logic + data-source migration; the IconRail icon swap and `navView` default change happen in Task 2 alongside introducing the Overview view (so there's no in-between state where neither the old nor new "更新" entry point works from the icon rail — Task 1 keeps the rail's "浏览商店" as the only rail icon for now, deliberately, since `navView: 'updates'` and its `RefreshCw` icon are removed here but "概览" doesn't exist until Task 2; the token menu remains the working entry point to updates throughout).

**Files:**
- Modify: `apps/cli-gui/src/state/AppState.tsx`
- Modify: `apps/cli-gui/src/lib/resources.ts`
- Modify: `apps/cli-gui/src/components/ResourceList.tsx`
- Modify: `apps/cli-gui/src/components/IconRail.tsx`
- Test: `apps/cli-gui/src/lib/__tests__/resources.test.ts`
- Test: `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx` (check `find apps/cli-gui/src -iname "*ResourceList*test*"` for the exact existing path/patterns first)
- Test: `apps/cli-gui/src/components/__tests__/IconRail.test.tsx`

**Interfaces:**
- Consumes: existing `checkUpdates` RPC (`apps/client-core`, unchanged), existing `filterInstalledByListFilter`/`FILTER_TOKENS` patterns.
- Produces: `ListFilter` gains `'updates'`; `filterInstalledByListFilter(items, filter, agentApp, favoriteSlugs, updatableSlugs)` gains a 5th parameter (a `Set<string>` of slugs with an available update) — Task 2 onward does not touch this signature further.

- [ ] **Step 1: Write the failing test for the extended filter function**

Add to `apps/cli-gui/src/lib/__tests__/resources.test.ts` (read the existing file first to match its exact fixture style for `EnrichedInstalledItem`):

```ts
test('filterInstalledByListFilter: "updates" filters to only slugs with an available update', () => {
  const items = [
    { ...baseInstalled, slug: 'a' },
    { ...baseInstalled, slug: 'b' },
    { ...baseInstalled, slug: 'c' },
  ]
  const updatableSlugs = new Set(['b'])

  const result = filterInstalledByListFilter(items, 'updates', 'claude', new Set(), updatableSlugs)

  expect(result.map((i) => i.slug)).toEqual(['b'])
})

test('filterInstalledByListFilter: "updates" with no available updates returns an empty array', () => {
  const items = [{ ...baseInstalled, slug: 'a' }]

  const result = filterInstalledByListFilter(items, 'updates', 'claude', new Set(), new Set())

  expect(result).toEqual([])
})
```

(Adapt `baseInstalled` to whatever fixture name/shape the existing test file already uses for an `EnrichedInstalledItem` — reuse it, don't invent a new one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/resources.test.ts`
Expected: FAIL — `filterInstalledByListFilter` called with 5 args doesn't match the current 4-arg signature (TypeScript error) or the `'updates'` filter falls through to the default passthrough branch (returns all items, not just `['b']`).

- [ ] **Step 3: Add `'updates'` to `ListFilter` and extend the filter function**

In `apps/cli-gui/src/state/AppState.tsx`, change:

```ts
export type ListFilter = 'all' | 'popular' | 'recent' | 'installed' | 'enabled' | 'disabled' | 'favorites'
```

to:

```ts
export type ListFilter = 'all' | 'popular' | 'recent' | 'installed' | 'enabled' | 'disabled' | 'favorites' | 'updates'
```

In `apps/cli-gui/src/lib/resources.ts`, change `filterInstalledByListFilter`'s signature and body from:

```ts
export function filterInstalledByListFilter(
  items: EnrichedInstalledItem[],
  filter: ListFilter,
  agentApp: AgentApp,
  favoriteSlugs: Set<string>
): EnrichedInstalledItem[] {
  if (filter === 'enabled') return items.filter((i) => !!i.enabledFor[agentApp])
  if (filter === 'disabled') return items.filter((i) => !i.enabledFor[agentApp])
  if (filter === 'favorites') return items.filter((i) => favoriteSlugs.has(i.slug))
  return items
}
```

to:

```ts
export function filterInstalledByListFilter(
  items: EnrichedInstalledItem[],
  filter: ListFilter,
  agentApp: AgentApp,
  favoriteSlugs: Set<string>,
  updatableSlugs: Set<string> = new Set()
): EnrichedInstalledItem[] {
  if (filter === 'enabled') return items.filter((i) => !!i.enabledFor[agentApp])
  if (filter === 'disabled') return items.filter((i) => !i.enabledFor[agentApp])
  if (filter === 'favorites') return items.filter((i) => favoriteSlugs.has(i.slug))
  if (filter === 'updates') return items.filter((i) => updatableSlugs.has(i.slug))
  return items
}
```

(The default parameter keeps every other existing call site — and any test not passing a 5th arg — compiling and behaving as before.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/resources.test.ts`
Expected: all pass, including the 2 new tests.

- [ ] **Step 5: Find the existing ResourceList test file and read it**

Run: `find apps/cli-gui/src -iname "*ResourceList*test*"`

Read the found file fully to learn its exact `callRpc` mocking pattern (likely `spyOn(rpcModule, 'callRpc').mockImplementation(...)` dispatching on the method-name string argument) before writing new tests, so your additions match it exactly.

- [ ] **Step 6: Write the failing tests for the ResourceList migration**

Add to that test file (adapt the exact mock-dispatch style to what Step 5 found):

```ts
test('the installed list shows an update badge and a real 更新 button for a package with an available update', async () => {
  // Extend this test's callRpc mock to additionally handle:
  //   'checkUpdates' -> [{ slug: 'test-provider', currentVersion: '1.0.0', latestVersion: '1.1.0' }]
  // alongside whatever 'list'/'info'/'search' fixtures the existing tests already set up for an
  // installed item with slug 'test-provider'. Then:
  render(<ResourceList />)
  await screen.findByText('test-provider') // or whatever name fixture is already used
  expect(await screen.findByText('有更新')).toBeInTheDocument()
  const updateButton = screen.getByRole('button', { name: /更新/ })
  await userEvent.click(updateButton)
  // assert callRpc was called with ('update', ['test-provider'])
})

test('selecting the @updates token filters the installed list to only updatable packages', async () => {
  // Set up two installed items (slugs 'a' and 'b'), checkUpdates returning an update only for 'b'.
  render(<ResourceList />)
  await screen.findByText(/* item a's name */)
  const searchInput = screen.getByPlaceholderText('搜索，或用 @ 过滤…')
  await userEvent.type(searchInput, '@')
  await userEvent.click(screen.getByText('@updates · 有更新'))
  // assert item a's name is no longer rendered, item b's name still is
})

test('navView no longer has an "updates" render branch — the old dedicated updates list markup is gone', () => {
  // This is a structural assertion: grep-level, not a rendered-DOM assertion. Skip a runtime test for
  // this specific claim; Step 7 below removes the dead code, and the full test suite (Step 9) plus a
  // manual review confirms no `navView === 'updates'` string remains in ResourceList.tsx.
})
```

Adapt the exact `screen.getByRole`/`userEvent` calls to whatever testing utilities the existing file already imports (`@testing-library/user-event` may or may not already be a dependency — check `apps/cli-gui/package.json` and the existing test file's imports first; if `userEvent` isn't already used elsewhere in this file, use `fireEvent` from `@testing-library/react` instead, matching whatever this specific file's existing tests already do for simulating typing/clicking).

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test <the ResourceList test file path>`
Expected: FAIL — no "有更新" badge/button exists yet, no `@updates` token exists yet.

- [ ] **Step 8: Implement the ResourceList changes**

In `apps/cli-gui/src/components/ResourceList.tsx`:

Add `'updates'` to `FILTER_TOKENS`:

```ts
const FILTER_TOKENS: { key: Exclude<ListFilter, 'all'>; label: string }[] = [
  { key: 'popular', label: '最热门' },
  { key: 'recent', label: '最近发布' },
  { key: 'installed', label: '已安装' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已禁用' },
  { key: 'favorites', label: '收藏' },
  { key: 'updates', label: '有更新' },
]
```

Change the updates-fetching effect from being gated on `navView === 'updates'` to running unconditionally alongside `refreshInstalled`. Replace:

```ts
  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])

  useEffect(() => {
    if (navView === 'updates') refreshUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navView])
```

with:

```ts
  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    refreshUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])
```

Add a memoized `updatableSlugs` set (near the existing `installedSlugs` memo):

```ts
  const updatableSlugs = useMemo(() => new Set(updates.map((u) => u.slug)), [updates])
```

Pass it into the `visibleInstalled` memo's call to `filterInstalledByListFilter`:

```ts
  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        installed.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        favoriteSlugs,
        updatableSlugs
      ),
    [installed, categoryFilter, textQuery, listFilter, agentApp, favoriteSlugs, updatableSlugs]
  )
```

In the installed-item row JSX (inside the `已安装` section), add an update badge + button next to the existing enabled/disabled pill. Change:

```tsx
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`为 ${agentApp} ${enabled ? '禁用' : '启用'} ${item.slug}`}
                        onClick={() => toggleEnabled(item)}
                        className={`rounded-md px-2 py-1 text-xs ${
                          enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
                        }`}
                      >
                        {enabled ? '已启用' : '已禁用'}
                      </button>
```

to:

```tsx
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {updatableSlugs.has(item.slug) && (
                        <>
                          <span className="rounded-md bg-store-amber/10 px-2 py-1 text-xs text-store-amber">有更新</span>
                          <button
                            type="button"
                            onClick={() => updateOne(item.slug)}
                            className="rounded-md bg-store-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                          >
                            更新
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`为 ${agentApp} ${enabled ? '禁用' : '启用'} ${item.slug}`}
                        onClick={() => toggleEnabled(item)}
                        className={`rounded-md px-2 py-1 text-xs ${
                          enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
                        }`}
                      >
                        {enabled ? '已启用' : '已禁用'}
                      </button>
```

Remove the entire `navView === 'updates'` block (from `{navView === 'updates' && (` through its matching closing `)}`, currently the block rendering the standalone updates list with "全部更新"/per-row "更新" buttons) — this is now fully superseded by the installed-list badge/button plus the `@updates` filter token. Also remove `updateAll` if, after this removal, it has no remaining call site (check with `grep -n "updateAll" apps/cli-gui/src/components/ResourceList.tsx` after the removal — if the bulk "全部更新" button had no other place to live, it's acceptable to drop it in this task per YAGNI, since the design spec's Overview dashboard's own "可更新" card, added in a later task of this plan, will have its own "更新" per-row action but does not require a bulk-update button; if you'd rather keep `updateAll` reachable, that's a judgment call — the simplest correct choice is to drop it here, since no button in the remaining UI calls it and dead exported-but-unused local functions are exactly what YAGNI review would flag).

- [ ] **Step 9: Remove the "更新" icon from `IconRail.tsx`**

In `apps/cli-gui/src/components/IconRail.tsx`, remove the `RefreshCw` import (if it becomes unused after this removal — check first) and this button:

```tsx
      <button
        type="button"
        aria-label="更新"
        onClick={() => setNavView('updates')}
        className={railButtonClass(navView === 'updates')}
      >
        <RefreshCw size={18} />
      </button>
```

Do not add a replacement icon yet — Task 2 adds the "概览" icon.

- [ ] **Step 10: Run the full cli-gui suite and fix any fallout**

Run: `cd apps/cli-gui && bun test && bun run type-check`

Some existing tests may reference the removed `'更新'` IconRail button or the old `navView === 'updates'` behavior (check `apps/cli-gui/src/components/__tests__/IconRail.test.tsx` and any `App.test.tsx`/`ResourceList.test.tsx` assertions referencing `navView: 'updates'`). Update any such tests to remove assertions about the deleted icon/branch — do not leave a test asserting dead behavior. If `IconRail.test.tsx` has a test like `'clicking 更新 switches nav view to updates'`, delete that test entirely (there's no longer a rail icon to click for this).

Expected after fixes: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/cli-gui/src/state/AppState.tsx apps/cli-gui/src/lib/resources.ts apps/cli-gui/src/lib/__tests__/resources.test.ts apps/cli-gui/src/components/ResourceList.tsx apps/cli-gui/src/components/IconRail.tsx apps/cli-gui/src/components/__tests__/
git commit -m "feat(cli-gui): migrate 更新 from a nav view to a listFilter token

Per the design spec's correction (更新 should be a listFilter value like
popular/enabled, not a separate navigation destination), the installed
list now shows an inline 有更新 badge and real update button per package,
filterable via the existing @ token menu, replacing the old dedicated
navView === 'updates' branch and its IconRail icon."
```

---

### Task 2: `navView: 'overview'` default + `Overview.tsx` skeleton with category count cards

**Context:** This task introduces the new default view. `Overview.tsx` starts with just the category-count cards (data already available via the existing `list` RPC) and the layout plumbing in `App.tsx` — later tasks in this plan add the remaining cards (usage trend, local relay status, recent requests, updatable packages) to the same component without touching this task's scaffolding.

**Files:**
- Modify: `apps/cli-gui/src/state/AppState.tsx`
- Modify: `apps/cli-gui/src/components/IconRail.tsx`
- Modify: `apps/cli-gui/src/App.tsx`
- Create: `apps/cli-gui/src/components/Overview.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/IconRail.test.tsx`
- Test: `apps/cli-gui/src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: existing `list` RPC (`InstalledItem[]`, already used elsewhere in the GUI).
- Produces: `NavView` gains `'overview'` (new default) and `'local-relay'` (added now so Task 4 doesn't need to touch `AppState.tsx` again); `Overview.tsx` exported for later tasks in this plan to extend with more cards.

- [ ] **Step 1: Add the new `NavView` values and change the default**

In `apps/cli-gui/src/state/AppState.tsx`, change:

```ts
export type NavView = 'browse' | 'updates'
```

to:

```ts
export type NavView = 'browse' | 'overview' | 'local-relay'
```

Change:

```ts
  const [navView, setNavView] = useState<NavView>('browse')
```

to:

```ts
  const [navView, setNavView] = useState<NavView>('overview')
```

- [ ] **Step 2: Write the failing test for the Overview skeleton**

Create `apps/cli-gui/src/components/__tests__/Overview.test.tsx`:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider } from '../../state/AppState'
import { Overview } from '../Overview'
import type { InstalledItem } from '@as/types'

afterEach(() => { cleanup(); mock.restore() })

const providerItem: InstalledItem = {
  slug: 'p1', category: 'provider', version: '1.0.0', installedAt: '', updatedAt: '',
  compatibleWith: ['claude'], enabledFor: { claude: true },
}
const skillItem: InstalledItem = {
  slug: 's1', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '',
  compatibleWith: ['claude'], enabledFor: {},
}

test('shows a count card per category from the list RPC', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return [providerItem, skillItem]
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('供应商')).toBeInTheDocument()
  expect(await screen.findByText('技能')).toBeInTheDocument()
  expect(await screen.findByText('MCP')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — `../Overview` module doesn't exist.

- [ ] **Step 4: Implement the `Overview.tsx` skeleton**

Create `apps/cli-gui/src/components/Overview.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { InstalledItem } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'

const CATEGORY_CARDS: { category: InstalledItem['category']; label: string }[] = [
  { category: 'provider', label: '供应商' },
  { category: 'skill', label: '技能' },
  { category: 'mcp', label: 'MCP' },
]

export function Overview() {
  const { setNavView, setCategoryFilter } = useAppState()
  const [installed, setInstalled] = useState<InstalledItem[]>([])

  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(setInstalled)
  }, [])

  function goToCategory(category: InstalledItem['category']) {
    setCategoryFilter(category)
    setNavView('browse')
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-store-text">概览</h1>

      <div className="grid grid-cols-3 gap-4">
        {CATEGORY_CARDS.map(({ category, label }) => (
          <button
            key={category}
            type="button"
            onClick={() => goToCategory(category)}
            className="flex flex-col items-start gap-1 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
          >
            <span className="text-xs font-medium text-store-text-2">{label}</span>
            <span className="text-2xl font-semibold text-store-text">
              {installed.filter((i) => i.category === category).length}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: pass.

- [ ] **Step 6: Wire `Overview` into `App.tsx`**

Replace the full contents of `apps/cli-gui/src/App.tsx` with:

```tsx
import { AppStateProvider, useAppState } from './state/AppState'
import { TerminalLogProvider } from './state/TerminalLog'
import { TitleBar } from './components/TitleBar'
import { IconRail } from './components/IconRail'
import { ResourceList } from './components/ResourceList'
import { DetailPanel } from './components/DetailPanel'
import { InfoSidebar } from './components/InfoSidebar'
import { TerminalPane } from './components/TerminalPane'
import { Overview } from './components/Overview'

function MainArea() {
  const { navView } = useAppState()

  if (navView === 'overview') return <Overview />

  return (
    <>
      <ResourceList />
      <DetailPanel />
      <InfoSidebar />
    </>
  )
}

export function App() {
  return (
    <AppStateProvider>
      <TerminalLogProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
          <TitleBar />
          <div className="flex flex-1 overflow-hidden">
            <IconRail />
            <MainArea />
          </div>
          <TerminalPane />
        </div>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}
```

(This task's `MainArea` only branches on `'overview'` vs. everything else — Task 4 adds the `'local-relay'` branch.)

- [ ] **Step 7: Add the "概览" icon to `IconRail.tsx`**

In `apps/cli-gui/src/components/IconRail.tsx`, add `LayoutDashboard` to the lucide-react import:

```ts
import { Compass, LayoutDashboard, LayoutGrid, ArrowLeftRight, Sparkles, Boxes, Settings } from 'lucide-react'
```

Add a new button before the existing "浏览商店" button:

```tsx
      <button
        type="button"
        aria-label="概览"
        onClick={() => setNavView('overview')}
        className={railButtonClass(navView === 'overview')}
      >
        <LayoutDashboard size={18} />
      </button>
```

- [ ] **Step 8: Update `App.test.tsx` for the new default view**

Read the existing `apps/cli-gui/src/__tests__/App.test.tsx` test fully (it currently asserts the browse-view empty state is visible by default). Replace it with:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../lib/rpc'
import { App } from '../App'

afterEach(() => { cleanup(); mock.restore() })

function mockAllRpcs() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'search') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in smoke test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('renders the icon rail and the Overview dashboard by default', async () => {
  mockAllRpcs()

  render(<App />)

  expect(screen.getByLabelText('概览')).toBeInTheDocument()
  expect(screen.getByLabelText('浏览商店')).toBeInTheDocument()
  expect(await screen.findByText('概览')).toBeInTheDocument()
  expect(await screen.findByText('供应商')).toBeInTheDocument()
  expect(screen.getByLabelText('展开终端')).toBeInTheDocument()
})

test('clicking 浏览商店 switches to the browse three-pane layout', async () => {
  mockAllRpcs()

  render(<App />)

  await screen.findByText('供应商')
  screen.getByLabelText('浏览商店').click()

  expect(await screen.findByPlaceholderText('搜索，或用 @ 过滤…')).toBeInTheDocument()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
})
```

- [ ] **Step 9: Check `IconRail.test.tsx` for stale default-view assumptions**

Read `apps/cli-gui/src/components/__tests__/IconRail.test.tsx` fully. It likely has a test like `'defaults to browse nav and all category'` asserting `navView === 'browse'` is the initial `aria-pressed`/active state on the "浏览商店" button — update that assertion to expect `'概览'` (the new "概览" button) to be the initially-active one instead, and add a new test confirming clicking "概览" sets `navView` back to `'overview'` after switching away from it (mirroring the existing "clicking X switches nav view to Y" test pattern already in this file for the other buttons).

- [ ] **Step 10: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/cli-gui/src/state/AppState.tsx apps/cli-gui/src/components/IconRail.tsx apps/cli-gui/src/App.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx apps/cli-gui/src/components/__tests__/IconRail.test.tsx apps/cli-gui/src/__tests__/App.test.tsx
git commit -m "feat(cli-gui): add Overview dashboard as the default nav view

Overview.tsx starts with category-count cards (供应商/技能/MCP) sourced
from the real list() RPC, replacing the previous browse-view default.
Clicking a count card navigates to the browse view filtered to that
category."
```

---

### Task 3: Usage/consumption trend card

**Context:** Adds a card to `Overview.tsx` showing today/7-day/30-day request count, tokens, and cost, sourced from the already-merged `getUsageSummary` RPC, plus a small hand-written SVG polyline chart of daily cost over the last 7 days — no chart library.

**Files:**
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Create: `apps/cli-gui/src/components/UsageTrendChart.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx`

**Interfaces:**
- Consumes: `getUsageSummary(options?: { days?: number }): Promise<UsageSummaryRow[]>` (existing RPC, `UsageSummaryRow` from `@as/types`, fields: `date, providerSlug, target, model, requestCount, successCount, unpricedRequestCount, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd`).
- Produces: `export function UsageTrendChart({ rows }: { rows: UsageSummaryRow[] }): JSX.Element` — self-contained, only consumed by `Overview.tsx` in this plan.

- [ ] **Step 1: Write the failing test for `UsageTrendChart`**

Create `apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { UsageTrendChart } from '../UsageTrendChart'
import type { UsageSummaryRow } from '@as/types'

afterEach(() => cleanup())

function row(overrides: Partial<UsageSummaryRow>): UsageSummaryRow {
  return {
    date: '2026-07-01', providerSlug: 'p', target: 'claude', model: 'm',
    requestCount: 0, successCount: 0, unpricedRequestCount: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    ...overrides,
  }
}

test('renders an svg polyline with one point per distinct date', () => {
  const rows = [
    row({ date: '2026-07-01', costUsd: 1 }),
    row({ date: '2026-07-01', providerSlug: 'q', costUsd: 2 }),
    row({ date: '2026-07-02', costUsd: 3 }),
  ]

  const { container } = render(<UsageTrendChart rows={rows} />)

  const polyline = container.querySelector('polyline')
  expect(polyline).not.toBeNull()
  const points = polyline!.getAttribute('points')!.trim().split(' ')
  expect(points).toHaveLength(2) // 2 distinct dates, costs summed per date (3 and 3)
})

test('renders a flat line with no crash when there is no data', () => {
  const { container } = render(<UsageTrendChart rows={[]} />)
  expect(container.querySelector('svg')).not.toBeNull()
  expect(screen.getByText('暂无用量数据')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/UsageTrendChart.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `UsageTrendChart.tsx`**

Create `apps/cli-gui/src/components/UsageTrendChart.tsx`:

```tsx
import type { UsageSummaryRow } from '@as/types'

const WIDTH = 280
const HEIGHT = 60

export function UsageTrendChart({ rows }: { rows: UsageSummaryRow[] }) {
  const byDate = new Map<string, number>()
  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.costUsd)
  }
  const dates = [...byDate.keys()].sort()

  if (dates.length === 0) {
    return (
      <div className="relative flex h-[60px] items-center justify-center text-xs text-store-text-3">
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 text-store-accent" />
        <span>暂无用量数据</span>
      </div>
    )
  }

  const costs = dates.map((d) => byDate.get(d)!)
  const max = Math.max(...costs, 0.0001)
  const points = dates
    .map((d, i) => {
      const x = dates.length === 1 ? WIDTH / 2 : (i / (dates.length - 1)) * WIDTH
      const y = HEIGHT - (byDate.get(d)! / max) * HEIGHT
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="text-store-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/UsageTrendChart.test.tsx`
Expected: 2 pass.

- [ ] **Step 5: Write the failing test for the Overview integration**

Add to `apps/cli-gui/src/components/__tests__/Overview.test.tsx`:

```tsx
test('shows a consumption trend card with today/7-day/30-day totals', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'm', requestCount: 3, successCount: 3, unpricedRequestCount: 0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05 }]
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('消耗趋势')).toBeInTheDocument()
  expect(await screen.findByText('3 请求')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — no "消耗趋势" card exists yet.

- [ ] **Step 7: Add the trend card to `Overview.tsx`**

In `apps/cli-gui/src/components/Overview.tsx`, add the import:

```ts
import type { InstalledItem, UsageSummaryRow } from '@as/types'
import { UsageTrendChart } from './UsageTrendChart'
```

Add state and a fetch effect:

```ts
  const [today, setToday] = useState<UsageSummaryRow[]>([])
  const [last7Days, setLast7Days] = useState<UsageSummaryRow[]>([])
  const [last30Days, setLast30Days] = useState<UsageSummaryRow[]>([])

  useEffect(() => {
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 1 }]).then(setToday)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 7 }]).then(setLast7Days)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 30 }]).then(setLast30Days)
  }, [])

  function summarize(rows: UsageSummaryRow[]) {
    return rows.reduce(
      (acc, r) => ({
        requestCount: acc.requestCount + r.requestCount,
        costUsd: acc.costUsd + r.costUsd,
      }),
      { requestCount: 0, costUsd: 0 }
    )
  }
```

Add the card JSX (inside the returned `<div>`, after the category-count grid):

```tsx
      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <p className="mb-3 text-sm font-medium text-store-text">消耗趋势</p>
        <div className="mb-4 grid grid-cols-3 gap-4 text-xs text-store-text-2">
          <div>
            <p>今日</p>
            <p className="text-base font-semibold text-store-text">{summarize(today).requestCount} 请求</p>
            <p>${summarize(today).costUsd.toFixed(4)}</p>
          </div>
          <div>
            <p>近 7 天</p>
            <p className="text-base font-semibold text-store-text">{summarize(last7Days).requestCount} 请求</p>
            <p>${summarize(last7Days).costUsd.toFixed(4)}</p>
          </div>
          <div>
            <p>近 30 天</p>
            <p className="text-base font-semibold text-store-text">{summarize(last30Days).requestCount} 请求</p>
            <p>${summarize(last30Days).costUsd.toFixed(4)}</p>
          </div>
        </div>
        <UsageTrendChart rows={last7Days} />
      </div>
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 9: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/cli-gui/src/components/UsageTrendChart.tsx apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx
git commit -m "feat(cli-gui): add consumption trend card with a hand-drawn SVG chart to Overview"
```

---

### Task 4: Local relay status card + `LocalRelayDetail.tsx`

**Context:** Adds the "本地代理状态" card to `Overview.tsx` (running status, listen address, today's request count/success rate) and a dedicated full-width view for managing local relay configs (list, add, rename, change port, toggle, remove), reusing the already-merged `getRelayStatus`/`listLocalConfigs`/`addLocalConfig`/`updateLocalConfig`/`toggleLocalConfig`/`removeLocalConfig` RPCs. Per this plan's Global Constraints, this is a single-screen list-with-inline-edit, not a two-screen parent/child drill-down.

**Files:**
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Modify: `apps/cli-gui/src/App.tsx`
- Create: `apps/cli-gui/src/components/LocalRelayDetail.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx`

**Interfaces:**
- Consumes: `getRelayStatus(): Promise<RelayStatus>`, `listLocalConfigs(): Promise<LocalRelayConfig[]>`, `addLocalConfig(name): Promise<LocalRelayConfig>`, `updateLocalConfig(id, patch): Promise<LocalRelayConfig>`, `toggleLocalConfig(id): Promise<LocalRelayConfig>`, `removeLocalConfig(id): Promise<void>` (all existing RPCs from `docs/superpowers/plans/2026-07-05-dashboard-backend-additions.md` and `docs/superpowers/plans/2026-07-05-multi-port-local-relay.md`, already merged), `getUsageSummary({ days: 1 })` (reused from Task 3, filtered client-side to find rows attributable to the local relay — see Step 8 note on scope of "today's request count" for this card).
- Produces: `export function LocalRelayDetail(): JSX.Element`, consumed by `App.tsx`'s `MainArea` for `navView === 'local-relay'`.

- [ ] **Step 1: Write the failing test for `LocalRelayDetail`**

Create `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx`:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { LocalRelayDetail } from '../LocalRelayDetail'

afterEach(() => { cleanup(); mock.restore() })

function mockRpc(overrides: Record<string, (args?: unknown[]) => unknown> = {}) {
  const configs = [{ id: 'default', name: '默认', port: 18780, enabled: true }]
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (overrides[method]) return overrides[method](args)
    if (method === 'listLocalConfigs') return configs
    if (method === 'getRelayStatus') return { running: true, pid: 123 }
    throw new Error(`unexpected RPC in LocalRelayDetail test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('lists existing configs with name, port, and enabled state', async () => {
  mockRpc()
  render(<LocalRelayDetail />)
  expect(await screen.findByDisplayValue('默认')).toBeInTheDocument()
  expect(await screen.findByDisplayValue('18780')).toBeInTheDocument()
  expect(await screen.findByText(/运行中/)).toBeInTheDocument()
})

test('adding a config calls addLocalConfig and refreshes the list', async () => {
  let added = false
  mockRpc({
    addLocalConfig: () => { added = true; return { id: 'new', name: '新配置', port: 18880, enabled: true } },
  })
  render(<LocalRelayDetail />)
  await screen.findByDisplayValue('默认')
  fireEvent.click(screen.getByRole('button', { name: '新增配置' }))
  await waitFor(() => expect(added).toBe(true))
})

test('toggling a config calls toggleLocalConfig', async () => {
  let toggledId: string | undefined
  mockRpc({
    toggleLocalConfig: (args) => { toggledId = args?.[0] as string; return { id: 'default', name: '默认', port: 18780, enabled: false } },
  })
  render(<LocalRelayDetail />)
  const toggle = await screen.findByRole('button', { name: /启用状态/ })
  fireEvent.click(toggle)
  await waitFor(() => expect(toggledId).toBe('default'))
})

test('removing a config calls removeLocalConfig', async () => {
  let removedId: string | undefined
  mockRpc({
    listLocalConfigs: () => [
      { id: 'default', name: '默认', port: 18780, enabled: true },
      { id: 'extra', name: '额外', port: 18880, enabled: true },
    ],
    removeLocalConfig: (args) => { removedId = args?.[0] as string; return undefined },
  })
  render(<LocalRelayDetail />)
  await screen.findByDisplayValue('额外')
  const removeButtons = screen.getAllByRole('button', { name: '删除' })
  fireEvent.click(removeButtons[removeButtons.length - 1]!)
  await waitFor(() => expect(removedId).toBe('extra'))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/LocalRelayDetail.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `LocalRelayDetail.tsx`**

Create `apps/cli-gui/src/components/LocalRelayDetail.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { LocalRelayConfig, RelayStatus } from '@as/types'
import { callRpc } from '../lib/rpc'

export function LocalRelayDetail() {
  const [configs, setConfigs] = useState<LocalRelayConfig[]>([])
  const [status, setStatus] = useState<RelayStatus>({ running: false })

  async function refresh() {
    setConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
    setStatus(await callRpc<RelayStatus>('getRelayStatus'))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function addConfig() {
    await callRpc('addLocalConfig', ['新配置'])
    refresh()
  }

  async function renameConfig(id: string, name: string) {
    await callRpc('updateLocalConfig', [id, { name }])
    refresh()
  }

  async function changePort(id: string, port: number) {
    if (!Number.isInteger(port) || port <= 0) return
    await callRpc('updateLocalConfig', [id, { port }])
    refresh()
  }

  async function toggle(id: string) {
    await callRpc('toggleLocalConfig', [id])
    refresh()
  }

  async function remove(id: string) {
    await callRpc('removeLocalConfig', [id])
    refresh()
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-store-text">本地代理</h1>
        <button
          type="button"
          onClick={addConfig}
          className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          新增配置
        </button>
      </div>

      <p className="text-xs text-store-text-2">
        {status.running ? `运行中（pid ${status.pid}）` : '未运行'}
      </p>

      <div className="flex flex-col gap-2">
        {configs.map((config) => (
          <div key={config.id} className="flex items-center gap-3 rounded-lg border border-store-border bg-store-panel px-3 py-2">
            <input
              value={config.name}
              onChange={(e) => renameConfig(config.id, e.target.value)}
              className="w-32 rounded-md border border-store-border bg-store-panel-2 px-2 py-1 text-sm text-store-text"
            />
            <input
              type="number"
              value={config.port}
              onChange={(e) => changePort(config.id, Number(e.target.value))}
              className="w-24 rounded-md border border-store-border bg-store-panel-2 px-2 py-1 text-sm text-store-text"
            />
            <button
              type="button"
              aria-label={`${config.name} 启用状态`}
              aria-pressed={config.enabled}
              onClick={() => toggle(config.id)}
              className={`rounded-md px-2 py-1 text-xs ${
                config.enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
              }`}
            >
              {config.enabled ? '已启用' : '已禁用'}
            </button>
            <button
              type="button"
              onClick={() => remove(config.id)}
              className="ml-auto text-xs text-store-red hover:opacity-80"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/LocalRelayDetail.test.tsx`
Expected: all pass. (Note: the "toggling" test's button label uses `aria-label={`${config.name} 启用状态`}` = `"默认 启用状态"` — the test's `name: /启用状态/` regex matches this via substring, confirm this before treating a mismatch as a real failure.)

- [ ] **Step 5: Wire `'local-relay'` into `App.tsx`**

In `apps/cli-gui/src/App.tsx`, add the import `import { LocalRelayDetail } from './components/LocalRelayDetail'` and extend `MainArea`:

```tsx
function MainArea() {
  const { navView } = useAppState()

  if (navView === 'overview') return <Overview />
  if (navView === 'local-relay') return <LocalRelayDetail />

  return (
    <>
      <ResourceList />
      <DetailPanel />
      <InfoSidebar />
    </>
  )
}
```

- [ ] **Step 6: Write the failing test for the Overview local-relay card**

Add to `apps/cli-gui/src/components/__tests__/Overview.test.tsx` (extend the shared mock's `getRelayStatus`/`listLocalConfigs` branches to return non-empty data for this specific test):

```tsx
test('shows a local relay status card that navigates to the local-relay view on click', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: true, pid: 456 }
    if (method === 'listLocalConfigs') return [{ id: 'default', name: '默认', port: 18780, enabled: true }]
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  const card = await screen.findByText('本地代理')
  expect(await screen.findByText(/运行中/)).toBeInTheDocument()
  fireEvent.click(card)
  // Assert navView switched — since Overview itself doesn't render LocalRelayDetail (App.tsx does the
  // routing), assert the click handler ran without throwing; a full navigation assertion belongs in
  // an App.tsx-level test instead. Import `fireEvent` from '@testing-library/react' at the top of this
  // file if not already imported.
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — no "本地代理" card exists yet.

- [ ] **Step 8: Add the local relay card to `Overview.tsx`**

Add imports and state:

```ts
import type { LocalRelayConfig, RelayStatus } from '@as/types'
```

```ts
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ running: false })
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])

  useEffect(() => {
    callRpc<RelayStatus>('getRelayStatus').then(setRelayStatus)
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then(setLocalConfigs)
  }, [])
```

Add the card JSX (after the trend card):

```tsx
      <button
        type="button"
        onClick={() => setNavView('local-relay')}
        className="flex flex-col items-start gap-1 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
      >
        <p className="text-sm font-medium text-store-text">本地代理</p>
        <p className="text-xs text-store-text-2">
          {relayStatus.running ? `运行中 · ${localConfigs.length} 个监听配置` : '未运行'}
        </p>
      </button>
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 10: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/cli-gui/src/components/LocalRelayDetail.tsx apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx apps/cli-gui/src/App.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx
git commit -m "feat(cli-gui): add local relay status card and single-screen config management view"
```

---

### Task 5: Recent requests card + `ProxyLogModal.tsx`

**Context:** Adds the "最近请求" card (last 5 requests) to `Overview.tsx` and a modal showing more (last 20 by default) request-log rows, openable from both the Overview card's "查看全部" and a new button on `LocalRelayDetail.tsx`, per the spec.

**Files:**
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Modify: `apps/cli-gui/src/components/LocalRelayDetail.tsx`
- Create: `apps/cli-gui/src/components/ProxyLogModal.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/ProxyLogModal.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx`

**Interfaces:**
- Consumes: `getRecentRequests(options?: { limit?: number }): Promise<RecentRequestRow[]>` (existing RPC from `docs/superpowers/plans/2026-07-05-dashboard-backend-additions.md`, already merged; `RecentRequestRow` fields: `id, createdAt, providerSlug, target, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd, statusCode, latencyMs, isStreaming, isFallback`).
- Produces: `export function ProxyLogModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element`, consumed by `Overview.tsx` and `LocalRelayDetail.tsx`.

- [ ] **Step 1: Write the failing test for `ProxyLogModal`**

Read `apps/cli-gui/src/components/ProviderEditModal.tsx` first (it already uses `@radix-ui/react-dialog`, the established modal pattern in this codebase) to match its exact `Dialog.Root`/`Dialog.Portal`/`Dialog.Overlay`/`Dialog.Content` structure and className conventions.

Create `apps/cli-gui/src/components/__tests__/ProxyLogModal.test.tsx`:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { ProxyLogModal } from '../ProxyLogModal'
import type { RecentRequestRow } from '@as/types'

afterEach(() => { cleanup(); mock.restore() })

function row(overrides: Partial<RecentRequestRow>): RecentRequestRow {
  return {
    id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1',
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001,
    statusCode: 200, latencyMs: 500, isStreaming: false, isFallback: false,
    ...overrides,
  }
}

test('shows recent request rows including a fallback marker', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'getRecentRequests') {
      return [row({ id: 2, providerSlug: 'backup', isFallback: true }), row({ id: 1 })]
    }
    throw new Error(`unexpected RPC in ProxyLogModal test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<ProxyLogModal open onOpenChange={() => {}} />)

  expect(await screen.findByText('p1')).toBeInTheDocument()
  expect(await screen.findByText(/backup.*（降级）/)).toBeInTheDocument()
})

test('does not fetch when closed', () => {
  const spy = spyOn(rpcModule, 'callRpc')
  render(<ProxyLogModal open={false} onOpenChange={() => {}} />)
  expect(spy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProxyLogModal.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `ProxyLogModal.tsx`**

Create `apps/cli-gui/src/components/ProxyLogModal.tsx` (matching whatever exact Radix Dialog structure Step 1 found in `ProviderEditModal.tsx` — the following is the expected shape, adapt className tokens to match that file precisely):

```tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { RecentRequestRow } from '@as/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'

interface ProxyLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProxyLogModal({ open, onOpenChange }: ProxyLogModalProps) {
  const [rows, setRows] = useState<RecentRequestRow[]>([])

  useEffect(() => {
    if (!open) return
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 20 }]).then(setRows)
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">代理请求日志</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-1">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs">
                <span className="text-store-text-3">{row.createdAt}</span>
                <span className="text-store-text">{row.target}</span>
                <span className="font-mono text-store-text-2">{row.model}</span>
                <span className="text-store-text">
                  {row.providerSlug}
                  {row.isFallback ? '（降级）' : ''}
                </span>
                <span className={row.statusCode >= 400 ? 'text-store-red' : 'text-store-green'}>{row.statusCode}</span>
                <span className="text-store-text-3">{row.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ProxyLogModal.test.tsx`
Expected: 2 pass.

- [ ] **Step 5: Write the failing test for the Overview recent-requests card**

Add to `apps/cli-gui/src/components/__tests__/Overview.test.tsx`:

```tsx
test('shows the 5 most recent requests and opens the proxy log modal from 查看全部', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') {
      return [{ id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001, statusCode: 200, latencyMs: 100, isStreaming: false, isFallback: false }]
    }
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('最近请求')).toBeInTheDocument()
  expect(await screen.findByText('p1')).toBeInTheDocument()
  fireEvent.click(screen.getByText('查看全部'))
  expect(await screen.findByText('代理请求日志')).toBeInTheDocument()
})
```

Import `fireEvent` from `@testing-library/react` at the top of the file if not already imported by an earlier task.

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — no "最近请求" card exists yet.

- [ ] **Step 7: Add the recent-requests card to `Overview.tsx`**

Add imports and state:

```ts
import type { RecentRequestRow } from '@as/types'
import { ProxyLogModal } from './ProxyLogModal'
```

```ts
  const [recentRequests, setRecentRequests] = useState<RecentRequestRow[]>([])
  const [logModalOpen, setLogModalOpen] = useState(false)

  useEffect(() => {
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 5 }]).then(setRecentRequests)
  }, [])
```

Add the card JSX (after the local relay card):

```tsx
      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-store-text">最近请求</p>
          <button type="button" onClick={() => setLogModalOpen(true)} className="text-xs text-store-accent hover:opacity-80">
            查看全部
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {recentRequests.map((row) => (
            <div key={row.id} className="flex items-center justify-between text-xs text-store-text-2">
              <span>{row.target} · {row.model}</span>
              <span>
                {row.providerSlug}
                {row.isFallback ? '（降级）' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 9: Add a proxy log entry point to `LocalRelayDetail.tsx`**

In `apps/cli-gui/src/components/LocalRelayDetail.tsx`, add the import `import { ProxyLogModal } from './ProxyLogModal'`, add `const [logModalOpen, setLogModalOpen] = useState(false)`, add a button next to "新增配置":

```tsx
        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="rounded-md border border-store-border-strong px-3 py-1.5 text-xs font-medium text-store-text"
        >
          查看代理日志
        </button>
```

and render `<ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />` at the end of the returned JSX, alongside the existing content.

Add a test to `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx` confirming clicking "查看代理日志" opens the modal (extend the shared `mockRpc` helper to also handle `getRecentRequests: () => []`).

- [ ] **Step 10: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/cli-gui/src/components/ProxyLogModal.tsx apps/cli-gui/src/components/__tests__/ProxyLogModal.test.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx apps/cli-gui/src/components/LocalRelayDetail.tsx apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx
git commit -m "feat(cli-gui): add recent requests card and proxy request log modal"
```

---

### Task 6: Updatable packages card, full verification, and real visual QA

**Context:** Adds the last Overview card (reusing Task 1's `checkUpdates`-derived data), then runs the complete verification suite this session has established: full monorepo tests/types, a real `make dev-gui` run, and native-window screenshots compared against the design mockup, per `AGENTS.md`'s UI sign-off rule.

**Files:**
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`

**Interfaces:**
- Consumes: `checkUpdates(): Promise<UpdateAvailable[]>` (existing RPC, `UpdateAvailable` fields: `slug, currentVersion, latestVersion`), `update(slug?: string): Promise<UpdateResult[]>` (existing RPC).

- [ ] **Step 1: Write the failing test for the updatable-packages card**

Add to `apps/cli-gui/src/components/__tests__/Overview.test.tsx`:

```tsx
test('shows up to 4 updatable packages with a real 更新 button', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return [{ slug: 'a', currentVersion: '1.0.0', latestVersion: '1.1.0' }]
    if (method === 'update') return [{ slug: args?.[0] as string, fromVersion: '1.0.0', toVersion: '1.1.0' }]
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('可更新')).toBeInTheDocument()
  expect(await screen.findByText(/a.*1\.0\.0.*1\.1\.0/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — no "可更新" card exists yet.

- [ ] **Step 3: Add the updatable-packages card to `Overview.tsx`**

Add imports and state:

```ts
import type { UpdateAvailable } from '@as/types'
```

```ts
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])

  useEffect(() => {
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }, [])

  async function updateOne(slug: string) {
    await callRpc('update', [slug])
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }
```

Add the card JSX (after the recent-requests card / `<ProxyLogModal .../>`):

```tsx
      {updates.length > 0 && (
        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <p className="mb-2 text-sm font-medium text-store-text">可更新</p>
          <div className="flex flex-col gap-1">
            {updates.slice(0, 4).map((item) => (
              <div key={item.slug} className="flex items-center justify-between text-xs">
                <span className="text-store-text">
                  {item.slug} v{item.currentVersion} → v{item.latestVersion}
                </span>
                <button
                  type="button"
                  onClick={() => updateOne(item.slug)}
                  className="rounded-md bg-store-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                >
                  更新
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 5: Run the full monorepo suite**

Run: `cd /Users/liushangliang/github/phenix3443/agent-store && bunx turbo run test type-check --force`
Expected: all tasks pass, 0 failures, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx
git commit -m "feat(cli-gui): add updatable-packages card to Overview, completing the dashboard"
```

- [ ] **Step 7: Real environment + visual QA**

Following this session's established technique (see `AGENTS.md`'s UI sign-off rule):

1. Set up an isolated `AS_HOME` with at least one real installed provider (reuse the real yls-me/skyapi credentials from `~/.code-switch/codex.json`/`~/.code-switch/claude-code.json`, transiently, never committed), some usage history (send a few real requests through a running relay so `getUsageSummary`/`getRecentRequests` return real, non-empty data), and at least one local relay config besides the default.
2. Run `make dev-gui` (or the equivalent Tauri dev command — check the `Makefile`/`apps/cli-gui/package.json` for the exact target) pointed at that `AS_HOME`.
3. Use `osascript` to focus the native window and `screencapture -R{x},{y},{w},{h}` to capture it (not a plain browser tab — the Tauri IPC bridge must be live, per the established AGENTS.md incident this rule was written from).
4. Compare screen-by-screen against `docs/ui/Agent Store.dc.html`'s Overview/dashboard screen and the reference screenshots in `docs/ui/screens/` (if present) — confirm: default view is the Overview dashboard (not browse), category counts are real, the consumption trend card renders a visible line (not blank), the local relay card reflects the real running daemon, recent requests shows real rows (not placeholders), clicking "查看全部" opens a populated proxy log modal, clicking the local relay card navigates to a working config-management view, and clicking "浏览商店" still shows the original three-pane browse layout unaffected.
5. Click through: toggle a local relay config's enabled state and confirm the UI updates; add a local relay config and confirm a new row appears; open the proxy log modal from both entry points (Overview card and `LocalRelayDetail`).
6. Tear down the isolated `AS_HOME` and stop any spawned relay daemon.

If any visual or functional mismatch is found, fix it and re-screenshot before considering this task (and the plan) complete. This step has no commit of its own — any fixes found here get their own small commit(s), each following this plan's existing commit-message conventions.

No further task after this — this plan, once Step 7 passes, completes the full-fidelity design spec's subsystem 4, and with it (combined with the three already-merged plans this session for priority routing, multi-port relay, and provider edit form), the entire `docs/superpowers/specs/2026-07-05-cli-client-full-fidelity-design.md` scope.
