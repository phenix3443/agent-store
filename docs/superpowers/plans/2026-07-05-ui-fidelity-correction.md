# CLI 客户端视觉/结构对齐修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/cli-gui` into structural and visual alignment with the actual design mockup (`docs/ui/Agent Store.dc.html`'s "CLI 客户端" tab), per the concrete deltas recorded in `docs/superpowers/specs/2026-07-05-ui-fidelity-correction-design.md` — a 4-icon rail (no separate browse/all icons), a restructured Overview dashboard (tabbed trend selector, area chart, tinted icon stat pills, model-count stat, redesigned cards), and "local" modeled as an inline built-in provider entry with expandable port-config child rows instead of a separate full-screen view.

**Architecture:** A new shared `CategoryIcon.tsx` component centralizes the category→icon+color mapping used throughout (rail, dashboard cards, list rows). The IconRail collapses to 4 buttons where each category button both sets `categoryFilter` and navigates to `'browse'` in one click. `Overview.tsx`'s cards are restructured in place (same RPCs, different layout/JSX). The largest change: `ResourceList.tsx` gains an inline-rendered "local" entry (fetched via the already-existing `listLocalConfigs`/`getRelayStatus` RPCs) with expandable child rows, `DetailPanel.tsx` gains a dedicated branch for local-provider detail (parent aggregate view and child port-editor view) keyed off a sentinel `selectedSlug` value, and the standalone `LocalRelayDetail.tsx` + `navView: 'local-relay'` are removed entirely.

**Tech Stack:** React, TypeScript, Tailwind, lucide-react (already a dependency — the mockup's icons are confirmed lucide icons by SVG path-data comparison), bun:test + @testing-library/react.

## Global Constraints

- CSS custom properties in `apps/cli-gui/src/globals.css` (`--wall`, `--accent`, `--green`, `--amber`, `--red`, etc.) already exactly match the mockup — **do not modify `globals.css`**. The fix is in how components use these tokens (icons, tinted backgrounds, layout), not the palette itself.
- Category→color mapping used throughout this plan: `provider` → `store-accent`, `skill` → `store-green`, `mcp` → `store-amber`. Category→icon mapping: `provider` → `ArrowLeftRight`, `skill` → `Sparkles`, `mcp` → `Boxes` (all already imported/used somewhere in the codebase, all from `lucide-react`).
- "本地代理" is renamed to "local" wherever it appears as the built-in provider's display name (matching the mockup's literal text), except for descriptive prose (e.g. code comments, this plan's own text) which may keep referring to it as "本地代理" for readability.
- The "模型分布" stat is a **distinct-model count** for the active period (`new Set(rows.map(r => r.model)).size`), not a full model-level usage breakdown chart — an explicit YAGNI decision recorded in the design doc, not a placeholder to fill in later.
- "可更新" card's "全部" link is a visual-only element in this plan (rendered, not wired to a filter) — explicit YAGNI decision.
- This plan does **not** touch `ProviderEditModal.tsx`'s Dialog-based presentation (modal vs. inline-panel is a separate, larger rearchitecture tracked as a follow-up plan, `2026-07-05-inline-provider-config-panel.md`, not written yet) — do not start converting it in this plan.

---

### Task 1: 4-icon rail with combined category+browse navigation

**Context:** The rail currently has 6 buttons (概览/浏览商店/divider/全部/供应商/技能/MCP) plus a plain gear Settings icon. The mockup has exactly 4 (概览/供应商/技能/MCP) where clicking a category button navigates directly into that category's browse view — there is no separate "浏览商店" step and no "全部" category. The bottom Settings entry is a filled gradient circle, not a bare gear icon.

**Files:**
- Modify: `apps/cli-gui/src/components/IconRail.tsx`
- Modify: `apps/cli-gui/src/state/AppState.tsx` (only if `CategoryFilter`'s `'all'` member needs to stay for internal default state — keep it, just stop exposing an "全部" rail button for it; see Step 3)
- Test: `apps/cli-gui/src/components/__tests__/IconRail.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` (`navView`, `setNavView`, `categoryFilter`, `setCategoryFilter`) — unchanged shape.
- Produces: no new exports; `IconRail` behavior changes only.

- [ ] **Step 1: Read the current `IconRail.test.tsx` fully**

Read `apps/cli-gui/src/components/__tests__/IconRail.test.tsx` to see its exact existing test list and fixture/mock conventions before editing — several tests reference the now-removed "浏览商店"/"全部" buttons and must be replaced, not left dangling.

- [ ] **Step 2: Write the failing tests**

Replace the test file's assertions with (keep the file's existing imports/mock setup style, adapt only the assertions below):

```tsx
test('shows exactly four nav/category buttons: 概览, 供应商, 技能, MCP', () => {
  render(<IconRail />)
  expect(screen.getByLabelText('概览')).toBeInTheDocument()
  expect(screen.getByLabelText('供应商')).toBeInTheDocument()
  expect(screen.getByLabelText('技能')).toBeInTheDocument()
  expect(screen.getByLabelText('MCP')).toBeInTheDocument()
  expect(screen.queryByLabelText('浏览商店')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('全部')).not.toBeInTheDocument()
})

test('defaults to 概览 active', () => {
  render(<IconRail />)
  expect(screen.getByLabelText('概览')).toHaveClass('bg-store-accent-soft')
})

test('clicking 供应商 sets categoryFilter to provider and navView to browse', () => {
  render(<IconRail />)
  fireEvent.click(screen.getByLabelText('供应商'))
  expect(screen.getByLabelText('供应商')).toHaveClass('bg-store-accent-soft')
})

test('clicking 技能 sets categoryFilter to skill and navView to browse', () => {
  render(<IconRail />)
  fireEvent.click(screen.getByLabelText('技能'))
  expect(screen.getByLabelText('技能')).toHaveClass('bg-store-accent-soft')
})

test('clicking 概览 after switching to a category returns to the overview state', () => {
  render(<IconRail />)
  fireEvent.click(screen.getByLabelText('供应商'))
  fireEvent.click(screen.getByLabelText('概览'))
  expect(screen.getByLabelText('概览')).toHaveClass('bg-store-accent-soft')
  expect(screen.getByLabelText('供应商')).not.toHaveClass('bg-store-accent-soft')
})

test('shows a settings button at the bottom of the rail', () => {
  render(<IconRail />)
  expect(screen.getByLabelText('设置')).toBeInTheDocument()
})
```

Import `fireEvent` from `@testing-library/react` if not already imported in this file.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/IconRail.test.tsx`
Expected: FAIL — current rail still has 6 buttons.

- [ ] **Step 4: Rewrite `IconRail.tsx`**

Replace the full contents of `apps/cli-gui/src/components/IconRail.tsx` with:

```tsx
import { useState } from 'react'
import { LayoutDashboard, ArrowLeftRight, Sparkles, Boxes } from 'lucide-react'
import { useAppState, type CategoryFilter } from '../state/AppState'
import { SettingsModal } from './SettingsModal'

const CATEGORY_ICONS: { value: Exclude<CategoryFilter, 'all'>; label: string; icon: typeof ArrowLeftRight }[] = [
  { value: 'provider', label: '供应商', icon: ArrowLeftRight },
  { value: 'skill', label: '技能', icon: Sparkles },
  { value: 'mcp', label: 'MCP', icon: Boxes },
]

function railButtonClass(active: boolean): string {
  return `flex h-9 w-9 items-center justify-center rounded-lg ${
    active ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:text-store-text'
  }`
}

export function IconRail() {
  const { navView, setNavView, categoryFilter, setCategoryFilter } = useAppState()
  const [settingsOpen, setSettingsOpen] = useState(false)

  function goToOverview() {
    setNavView('overview')
  }

  function goToCategory(value: Exclude<CategoryFilter, 'all'>) {
    setCategoryFilter(value)
    setNavView('browse')
  }

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-store-border bg-store-sidebar py-4">
      <button
        type="button"
        aria-label="概览"
        onClick={goToOverview}
        className={railButtonClass(navView === 'overview')}
      >
        <LayoutDashboard size={18} />
      </button>

      <div className="my-2 h-px w-8 bg-store-border" />

      {CATEGORY_ICONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          onClick={() => goToCategory(value)}
          className={railButtonClass(navView === 'browse' && categoryFilter === value)}
        >
          <Icon size={18} />
        </button>
      ))}

      <button
        type="button"
        aria-label="设置"
        onClick={() => setSettingsOpen(true)}
        className="mt-auto flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ background: 'linear-gradient(135deg, #7c82ff, #4b4fc7)' }}
      >
        <span className="text-xs font-semibold">Y</span>
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
```

Note: the mockup's bottom button shows a single letter avatar ("Y") on a gradient circle, matching a signed-in user initial. Since this app has no real auth/account concept yet, hardcode `"Y"` as a placeholder glyph (matching the mockup's literal rendered content) — this is a deliberate, disclosed simplification (no user-account system exists to source a real initial from), not a stray hardcode to silently fix later.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/IconRail.test.tsx`
Expected: all pass.

- [ ] **Step 6: Fix fallout in other test files**

Run: `cd apps/cli-gui && bun test 2>&1 | grep -B2 "fail\|Error"` to find any other test referencing the removed "浏览商店"/"全部" rail buttons (likely in `App.test.tsx`, `ResourceList.test.tsx`) or asserting the old 6-button rail. Update those assertions to use the new 4-button rail (e.g., a test that clicked "浏览商店" to switch to browse view should instead click one of the category buttons, e.g. "供应商", to reach the browse view — since there's no longer a category-agnostic way to enter browse from the rail; if a test genuinely needs "all categories" browse state, set `categoryFilter`/`navView` directly via the app-state test harness instead of simulating a rail click that no longer exists).

- [ ] **Step 7: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui/src/components/IconRail.tsx apps/cli-gui/src/components/__tests__/
git commit -m "fix(cli-gui): reduce icon rail to 4 buttons matching the design mockup

The mockup has exactly 概览/供应商/技能/MCP — no separate 浏览商店 or 全部
icon. Clicking a category button now sets categoryFilter and navigates to
browse in one action, matching the mockup's single-click category entry."
```

---

### Task 2: Shared `CategoryIcon` component and its use in Overview's category cards

**Context:** The mockup renders every provider/skill/mcp reference (list rows, dashboard cards) with a small colored icon badge — blue-tinted `ArrowLeftRight` for providers, green-tinted `Sparkles` for skills, amber-tinted `Boxes` for MCP servers. This task creates the shared component and wires it into the Overview category-count cards (the highest-visibility use); Task 4 reuses it for provider list rows.

**Files:**
- Create: `apps/cli-gui/src/components/CategoryIcon.tsx`
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Test: `apps/cli-gui/src/components/__tests__/CategoryIcon.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`

**Interfaces:**
- Produces: `export function CategoryIcon({ category, size }: { category: 'provider' | 'skill' | 'mcp'; size?: 'sm' | 'md' }): JSX.Element` — consumed by `Overview.tsx` (this task) and `ResourceList.tsx` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/CategoryIcon.test.tsx`:

```tsx
import { test, expect, afterEach, cleanup } from 'bun:test'
import { render } from '@testing-library/react'
import { CategoryIcon } from '../CategoryIcon'

afterEach(() => cleanup())

test('renders a provider icon with the accent color tint', () => {
  const { container } = render(<CategoryIcon category="provider" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-accent')
})

test('renders a skill icon with the green color tint', () => {
  const { container } = render(<CategoryIcon category="skill" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-green')
})

test('renders an mcp icon with the amber color tint', () => {
  const { container } = render(<CategoryIcon category="mcp" />)
  const badge = container.firstElementChild as HTMLElement
  expect(badge.className).toContain('store-amber')
})

test('renders an svg icon inside the badge', () => {
  const { container } = render(<CategoryIcon category="provider" />)
  expect(container.querySelector('svg')).not.toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/CategoryIcon.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `CategoryIcon.tsx`**

Create `apps/cli-gui/src/components/CategoryIcon.tsx`:

```tsx
import { ArrowLeftRight, Sparkles, Boxes } from 'lucide-react'

type Category = 'provider' | 'skill' | 'mcp'

const CATEGORY_CONFIG: Record<Category, { icon: typeof ArrowLeftRight; color: string }> = {
  provider: { icon: ArrowLeftRight, color: 'store-accent' },
  skill: { icon: Sparkles, color: 'store-green' },
  mcp: { icon: Boxes, color: 'store-amber' },
}

export function CategoryIcon({ category, size = 'md' }: { category: Category; size?: 'sm' | 'md' }) {
  const { icon: Icon, color } = CATEGORY_CONFIG[category]
  const boxClass = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 14 : 16

  return (
    <div className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg bg-${color}/15 text-${color}`}>
      <Icon size={iconSize} />
    </div>
  )
}
```

Note: Tailwind requires class names to be statically analyzable — `bg-${color}/15` and `text-${color}` with `color` limited to the three literal strings `'store-accent' | 'store-green' | 'store-amber'` from `CATEGORY_CONFIG` will be picked up by Tailwind's content scan since the full literal strings (`bg-store-accent/15`, `text-store-accent`, etc.) appear verbatim in this file's source as template-literal-interpolated results of a closed enum — if the build's Tailwind JIT does NOT pick these up (verify by checking the rendered class actually applies a background color, not just the class name being present — inspect visually in Step 5's dev check), switch to an explicit `Record<Category, { icon: ..., bgClass: string, textClass: string }>` with each fully-spelled-out class string instead of interpolation, e.g. `{ icon: ArrowLeftRight, bgClass: 'bg-store-accent/15', textClass: 'text-store-accent' }`. Prefer the fully-spelled-out form if there's any doubt — it's guaranteed to work with Tailwind's static scanning, while template-literal interpolation is a known Tailwind gotcha.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test src/components/__tests__/CategoryIcon.test.tsx`
Expected: 4 pass.

- [ ] **Step 5: Verify Tailwind actually applies the color (not just the class name existing)**

Run `cd apps/cli-gui && make dev-gui` (or the project's equivalent dev command) briefly and visually confirm the category icons render with colored backgrounds, not transparent/black boxes — this catches the Tailwind dynamic-class gotcha described in Step 3 immediately rather than at final QA. If the color doesn't render, apply the fully-spelled-out class fix described in Step 3 now.

- [ ] **Step 6: Write the failing test for the Overview integration**

Update the existing category-count-card test in `apps/cli-gui/src/components/__tests__/Overview.test.tsx` (the one from an earlier plan asserting `'供应商'`/`'技能'`/`'MCP'` text) — add an assertion that each card now renders an icon:

```tsx
test('shows a count card per category from the list RPC', async () => {
  // ... existing mock setup unchanged ...
  render(<AppStateProvider><Overview /></AppStateProvider>)

  const providerCard = (await screen.findByText('供应商')).closest('button')!
  expect(providerCard.querySelector('svg')).not.toBeNull()
})
```

- [ ] **Step 7: Run the test to verify it fails, then update `Overview.tsx`'s category cards**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx` — expect FAIL (no icon yet).

In `apps/cli-gui/src/components/Overview.tsx`, add the import `import { CategoryIcon } from './CategoryIcon'`, and change the category-cards grid from:

```tsx
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
```

to:

```tsx
      <div className="grid grid-cols-3 gap-4">
        {CATEGORY_CARDS.map(({ category, label }) => (
          <button
            key={category}
            type="button"
            onClick={() => goToCategory(category)}
            className="flex items-center justify-between gap-3 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
          >
            <div className="flex items-center gap-3">
              <CategoryIcon category={category} />
              <span className="text-xs font-medium text-store-text-2">{label}</span>
            </div>
            <span className="text-2xl font-semibold text-store-text">
              {installed.filter((i) => i.category === category).length}
            </span>
          </button>
        ))}
      </div>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 9: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/cli-gui/src/components/CategoryIcon.tsx apps/cli-gui/src/components/__tests__/CategoryIcon.test.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx
git commit -m "feat(cli-gui): add CategoryIcon badge component, use in Overview category cards"
```

---

### Task 3: Restructure the Overview dashboard's trend/relay/updates/recent-requests cards

**Context:** This task rewrites the visual structure of the remaining Overview cards to match the mockup: a tabbed (not 3-column) trend selector with an area-filled chart and 4 tinted stat pills including a distinct-model count; local+updatable cards side-by-side; recent-requests rows with status dots and color-coded status codes. It does NOT touch the "local" card's click behavior or content in a way that conflicts with Task 4 — this task only handles the trend/category-icon/recent-requests/updates visual structure; Task 4 will separately replace the "local" card's destination (from `navView: 'local-relay'` to selecting the `'__local__'` detail) and can be done independently after this task lands.

**Files:**
- Modify: `apps/cli-gui/src/components/Overview.tsx`
- Modify: `apps/cli-gui/src/components/UsageTrendChart.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx`

**Interfaces:**
- Consumes: existing `getUsageSummary`/`getRelayStatus`/`listLocalConfigs`/`getRecentRequests`/`checkUpdates` RPCs — no new RPCs.
- Produces: `UsageTrendChart` gains an area-fill visual (same props/signature, `{ rows: UsageSummaryRow[] }` — no interface change, only its internal SVG markup changes) — no other task depends on new exports from this task.

- [ ] **Step 1: Write the failing test for the tabbed trend selector**

Add to `apps/cli-gui/src/components/__tests__/Overview.test.tsx` (extend the existing trend-card test's mock to distinguish `days:1/7/30` responses, matching the pattern already used by earlier tasks in this codebase):

```tsx
test('trend card shows a tab selector and switches stats between periods', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 3, successCount: 3, unpricedRequestCount: 0, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 }]
      if (days === 7) return [{ date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 20, successCount: 20, unpricedRequestCount: 0, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.05 }]
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('总请求数')).toBeInTheDocument()
  expect(await screen.findByText('3')).toBeInTheDocument()
  expect(screen.queryByText('20')).not.toBeInTheDocument()

  fireEvent.click(screen.getByText('近 7 天'))

  expect(await screen.findByText('20')).toBeInTheDocument()
  expect(screen.queryByText('3')).not.toBeInTheDocument()
})

test('trend card shows a distinct-model count as 模型分布', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') {
      const days = (args?.[0] as { days?: number } | undefined)?.days
      if (days === 1) {
        return [
          { date: '2026-07-05', providerSlug: 'p', target: 'claude', model: 'a', requestCount: 1, successCount: 1, unpricedRequestCount: 0, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
          { date: '2026-07-05', providerSlug: 'p', target: 'codex', model: 'b', requestCount: 1, successCount: 1, unpricedRequestCount: 0, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
        ]
      }
      return []
    }
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('模型分布')).toBeInTheDocument()
  const modelStat = (await screen.findByText('模型分布')).closest('div')!
  expect(modelStat.textContent).toContain('2')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: FAIL — no tab selector, no 模型分布 stat.

- [ ] **Step 3: Rewrite the trend card in `Overview.tsx`**

Add a `trendPeriod` state and replace `summarize`'s single-purpose helper with one that also counts distinct models:

```ts
  const [trendPeriod, setTrendPeriod] = useState<'today' | 'last7Days' | 'last30Days'>('today')
```

Change `summarize` to:

```ts
  function summarize(rows: UsageSummaryRow[]) {
    return {
      requestCount: rows.reduce((sum, r) => sum + r.requestCount, 0),
      successCount: rows.reduce((sum, r) => sum + r.successCount, 0),
      costUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
      tokens: rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      modelCount: new Set(rows.map((r) => r.model)).size,
    }
  }
```

(`successRateLabel` from the prior plan stays as-is, still consuming `summarize(...)`'s `requestCount`/`successCount`.)

Replace the entire trend card JSX block (currently the `<div className="rounded-xl border ... 消耗趋势 ...">...</div>` containing the 3-column today/7-day/30-day stats) with:

```tsx
      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-accent-soft text-store-accent">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-store-text">消耗趋势</p>
              <p className="text-xs text-store-text-2">用量数据统计</p>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg border border-store-border bg-store-panel-2 p-1 text-xs">
            {(
              [
                { key: 'today', label: '今日' },
                { key: 'last7Days', label: '近 7 天' },
                { key: 'last30Days', label: '近 30 天' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setTrendPeriod(p.key)}
                className={`rounded-md px-2 py-1 ${trendPeriod === p.key ? 'bg-store-panel text-store-text' : 'text-store-text-2'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <UsageTrendChart rows={last7Days} />

        <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-store-accent-soft p-3">
            <p className="text-store-text-2">总费用</p>
            <p className="mt-1 text-base font-semibold text-store-text">${summarize(activePeriodRows()).costUsd.toFixed(4)}</p>
          </div>
          <div className="rounded-lg bg-store-panel-2 p-3">
            <p className="text-store-text-2">总 Tokens</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).tokens}</p>
          </div>
          <div className="rounded-lg bg-store-green/10 p-3">
            <p className="text-store-text-2">总请求数</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).requestCount}</p>
          </div>
          <div className="rounded-lg bg-store-accent-soft p-3">
            <p className="text-store-text-2">模型分布</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).modelCount}</p>
          </div>
        </div>
      </div>
```

Add a small helper right above the return statement to resolve the active period's rows:

```ts
  function activePeriodRows(): UsageSummaryRow[] {
    if (trendPeriod === 'today') return today
    if (trendPeriod === 'last7Days') return last7Days
    return last30Days
  }
```

Add `TrendingUp` to the lucide-react import at the top of the file.

**Note on the local-relay card's stats**: the prior plan's version reused `summarize(today)` directly for the "本地代理"/`local` card's today's-requests/success-rate figures — keep that as `summarize(today)` explicitly (not `summarize(activePeriodRows())`), since that card always shows "今日" regardless of the trend tab's selection. Do not accidentally couple it to `trendPeriod`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/Overview.test.tsx`
Expected: all pass.

- [ ] **Step 5: Add an area fill to `UsageTrendChart`**

Update the test file `apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx`'s first test to also check for a filled area path:

```tsx
test('renders an svg polyline and a filled area path with one point per distinct date', () => {
  const rows = [
    row({ date: '2026-07-01', costUsd: 1 }),
    row({ date: '2026-07-01', providerSlug: 'q', costUsd: 2 }),
    row({ date: '2026-07-02', costUsd: 3 }),
  ]

  const { container } = render(<UsageTrendChart rows={rows} />)

  const polyline = container.querySelector('polyline')
  expect(polyline).not.toBeNull()
  const points = polyline!.getAttribute('points')!.trim().split(' ')
  expect(points).toHaveLength(2)
  expect(container.querySelector('path')).not.toBeNull()
})
```

Run: `cd apps/cli-gui && bun test src/components/__tests__/UsageTrendChart.test.tsx` — expect this specific test to fail (no `path` element yet).

In `apps/cli-gui/src/components/UsageTrendChart.tsx`, change the non-empty-data return from:

```tsx
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="text-store-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
```

to:

```tsx
  const areaPath = `M${points.split(' ')[0]!.replace(',', ' ')} L${points.replace(/ /g, ' L')} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="text-store-accent">
      <path d={areaPath} fill="currentColor" opacity={0.15} stroke="none" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
```

- [ ] **Step 6: Run the chart tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/UsageTrendChart.test.tsx`
Expected: all pass.

- [ ] **Step 7: Redesign the recent-requests card rows**

In `Overview.tsx`, replace the recent-requests row markup:

```tsx
          {recentRequests.map((row) => (
            <div key={row.id} className="flex items-center justify-between text-xs text-store-text-2">
              <span>{row.target} · {row.model}</span>
              <span>
                {row.providerSlug}
                {row.isFallback ? '（降级）' : ''}
              </span>
            </div>
          ))}
```

with:

```tsx
          {recentRequests.map((row) => (
            <div key={row.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${row.statusCode < 400 ? 'bg-store-green' : 'bg-store-red'}`} />
                <span className="font-medium text-store-text">{row.target === 'claude' ? 'Claude Code' : 'Codex'}</span>
                <span className="font-mono text-store-text-2">
                  {row.model} → {row.providerSlug}
                  {row.isFallback ? '（降级）' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-store-text-3">
                <span>{row.latencyMs}ms</span>
                <span className={row.statusCode < 400 ? 'text-store-green' : 'text-store-red'}>{row.statusCode}</span>
              </div>
            </div>
          ))}
```

Add a test to `Overview.test.tsx` confirming the status-code color and client-name mapping (extend the existing recent-requests test rather than duplicating its mock setup):

```tsx
test('recent request rows show a colored status dot and mapped client name', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') {
      return [{ id: 1, createdAt: '2026-07-05T00:00:00Z', providerSlug: 'p1', target: 'claude', model: 'm1', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.001, statusCode: 502, latencyMs: 100, isStreaming: false, isFallback: false }]
    }
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in Overview test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<AppStateProvider><Overview /></AppStateProvider>)

  expect(await screen.findByText('Claude Code')).toBeInTheDocument()
  expect(await screen.findByText('502')).toHaveClass('text-store-red')
})
```

- [ ] **Step 8: Run the tests to verify they pass, then the full suite**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/UsageTrendChart.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx apps/cli-gui/src/components/__tests__/UsageTrendChart.test.tsx
git commit -m "fix(cli-gui): restructure Overview trend card with tabbed periods, area chart, and 模型分布 stat

Matches the design mockup's actual layout: a segmented today/7-day/30-day
tab switches all four stat pills (费用/Tokens/请求数/模型分布) instead of
showing three periods side by side, and the chart now renders a filled
area under the line, not just a bare polyline. Recent-request rows gain
a colored status dot and color-coded status code."
```

---

### Task 4: Model "local" as an inline built-in provider with expandable port-config rows

**Context:** This is the largest and highest-risk task in this plan: it removes the standalone `navView: 'local-relay'` full-screen view (`LocalRelayDetail.tsx`) built by an earlier plan, and replaces it with the mockup's actual design — "local" rendered inline at the top of the provider browse list's "已添加" section, tagged "内置", with its port configs shown as always-expanded indented child rows in the same list. Clicking "local" or a child row drives the SAME right-hand `DetailPanel` used for every other list item, via a new sentinel `selectedSlug` scheme (`'__local__'` for the parent, `'__local__:<configId>'` for a child), since neither "local" nor its port configs are real registry items reachable through the existing `info`/`search` RPCs.

**Files:**
- Modify: `apps/cli-gui/src/components/ResourceList.tsx`
- Modify: `apps/cli-gui/src/lib/useSelectedDetail.ts`
- Modify: `apps/cli-gui/src/components/DetailPanel.tsx`
- Modify: `apps/cli-gui/src/components/Overview.tsx` (the "local" card's click target changes)
- Modify: `apps/cli-gui/src/App.tsx` (remove the `'local-relay'` branch)
- Modify: `apps/cli-gui/src/state/AppState.tsx` (remove `'local-relay'` from `NavView`)
- Delete: `apps/cli-gui/src/components/LocalRelayDetail.tsx`
- Delete: `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx`
- Create: `apps/cli-gui/src/components/LocalProviderDetail.tsx`
- Test: `apps/cli-gui/src/components/__tests__/LocalProviderDetail.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx`
- Test: `apps/cli-gui/src/components/__tests__/Overview.test.tsx`
- Test: `apps/cli-gui/src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: `listLocalConfigs`, `getRelayStatus`, `addLocalConfig`, `updateLocalConfig`, `toggleLocalConfig`, `removeLocalConfig` (all existing RPCs, unchanged).
- Produces: `export function LocalProviderDetail({ selectedSlug }: { selectedSlug: string }): JSX.Element` — the sentinel convention `'__local__'` / `'__local__:<id>'` is internal to `ResourceList.tsx`/`DetailPanel.tsx`/`LocalProviderDetail.tsx`/`Overview.tsx`, not exposed as a shared constant module (a shared `LOCAL_PROVIDER_SENTINEL = '__local__'` constant exported from `LocalProviderDetail.tsx` and imported by the other three files is the cleanest way to avoid typo drift — do this rather than repeating the literal string in four files).

- [ ] **Step 1: Define the sentinel constant and helper functions**

In `apps/cli-gui/src/components/LocalProviderDetail.tsx` (new file — write this constant/helper section first, the component itself comes in a later step), start with:

```tsx
export const LOCAL_PROVIDER_SENTINEL = '__local__'

export function isLocalProviderSlug(slug: string | null): boolean {
  return slug === LOCAL_PROVIDER_SENTINEL || (slug?.startsWith(`${LOCAL_PROVIDER_SENTINEL}:`) ?? false)
}

export function localConfigIdFromSlug(slug: string): string | null {
  if (slug === LOCAL_PROVIDER_SENTINEL) return null
  return slug.slice(`${LOCAL_PROVIDER_SENTINEL}:`.length)
}
```

- [ ] **Step 2: Write the failing tests for `useSelectedDetail`'s local-sentinel bypass**

Read `apps/cli-gui/src/lib/useSelectedDetail.ts`'s current test file (find it with `find apps/cli-gui/src/lib -iname "*useSelectedDetail*test*"`; if none exists, create `apps/cli-gui/src/lib/__tests__/useSelectedDetail.test.ts` following this codebase's existing hook-testing conventions — check how `AppState.test.tsx` tests a hook via `renderHook`-equivalent patterns, e.g. a tiny wrapper component, and match that style). Add:

```tsx
test('returns null immediately for a local-provider sentinel slug, without calling any RPC', async () => {
  const calls: string[] = []
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    calls.push(method)
    throw new Error('should not be called')
  }) as typeof rpcModule.callRpc)

  function Probe() {
    const detail = useSelectedDetail()
    return <span>{detail ? 'has-detail' : 'no-detail'}</span>
  }

  render(
    <AppStateProviderWithSelectedSlug slug="__local__">
      <Probe />
    </AppStateProviderWithSelectedSlug>
  )

  expect(await screen.findByText('no-detail')).toBeInTheDocument()
  expect(calls).toEqual([])
})
```

(`AppStateProviderWithSelectedSlug` is illustrative — use whatever mechanism this codebase's other hook tests already use to seed `selectedSlug` into `AppStateProvider`, e.g. rendering `AppStateProvider` then calling `setSelectedSlug` via a test-only probe button, matching the pattern in `AppState.test.tsx`. Read that file for the exact established pattern before writing this test.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/cli-gui && bun test <the useSelectedDetail test file>`
Expected: FAIL — `useSelectedDetail` currently calls `callRpc('info', ...)` unconditionally.

- [ ] **Step 4: Update `useSelectedDetail.ts`**

In `apps/cli-gui/src/lib/useSelectedDetail.ts`, add the import `import { isLocalProviderSlug } from '../components/LocalProviderDetail'` and change the effect's guard from:

```ts
  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null)
      return
    }
```

to:

```ts
  useEffect(() => {
    if (!selectedSlug || isLocalProviderSlug(selectedSlug)) {
      setDetail(null)
      return
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/cli-gui && bun test <the useSelectedDetail test file>`
Expected: pass.

- [ ] **Step 6: Write the failing tests for `LocalProviderDetail`**

Add to `apps/cli-gui/src/components/__tests__/LocalProviderDetail.test.tsx` (reuse the `mockRpc` helper style from the now-being-deleted `LocalRelayDetail.test.tsx` — read that file first for its exact RPC-mocking conventions before it's deleted in Step 12, since this new test file supersedes it):

```tsx
import { test, expect, afterEach, spyOn, mock, fireEvent, waitFor } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { LocalProviderDetail, LOCAL_PROVIDER_SENTINEL } from '../LocalProviderDetail'

afterEach(() => { cleanup(); mock.restore() })

function mockRpc(overrides: Record<string, (args?: unknown[]) => unknown> = {}) {
  const configs = [
    { id: 'default', name: '默认', port: 18780, enabled: true },
    { id: 'extra', name: '测试环境', port: 18880, enabled: false },
  ]
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (overrides[method]) return overrides[method](args)
    if (method === 'listLocalConfigs') return configs
    if (method === 'getRelayStatus') return { running: true, pid: 123 }
    throw new Error(`unexpected RPC in LocalProviderDetail test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('parent view shows aggregate stats: address, config count, running count', async () => {
  mockRpc()
  render(<LocalProviderDetail selectedSlug={LOCAL_PROVIDER_SENTINEL} />)
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(await screen.findByText('内置 Provider')).toBeInTheDocument()
  expect(await screen.findByText('127.0.0.1')).toBeInTheDocument()
  expect(await screen.findByText(/2 个配置/)).toBeInTheDocument()
  expect(await screen.findByText(/1 个运行中/)).toBeInTheDocument()
})

test('child view shows a breadcrumb, a toggle switch, and an editable port field', async () => {
  mockRpc()
  render(<LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} />)
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(await screen.findByText('默认')).toBeInTheDocument()
  expect(await screen.findByRole('switch')).toBeInTheDocument()
  expect(await screen.findByDisplayValue('18780')).toBeInTheDocument()
})

test('toggling the child view switch calls toggleLocalConfig', async () => {
  let toggledId: string | undefined
  mockRpc({ toggleLocalConfig: (args) => { toggledId = args?.[0] as string; return { id: 'default', name: '默认', port: 18780, enabled: false } } })
  render(<LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} />)
  fireEvent.click(await screen.findByRole('switch'))
  await waitFor(() => expect(toggledId).toBe('default'))
})

test('editing the port field in the child view calls updateLocalConfig', async () => {
  let updatedPort: number | undefined
  mockRpc({
    updateLocalConfig: (args) => {
      updatedPort = (args?.[1] as { port?: number })?.port
      return { id: 'default', name: '默认', port: 19999, enabled: true }
    },
  })
  render(<LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} />)
  const portInput = await screen.findByDisplayValue('18780')
  fireEvent.change(portInput, { target: { value: '19999' } })
  await waitFor(() => expect(updatedPort).toBe(19999))
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/LocalProviderDetail.test.tsx`
Expected: FAIL — component doesn't exist beyond the sentinel helpers from Step 1.

- [ ] **Step 8: Implement `LocalProviderDetail.tsx`**

Append to `apps/cli-gui/src/components/LocalProviderDetail.tsx` (below the Step 1 sentinel helpers):

```tsx
import { useEffect, useState } from 'react'
import { ArrowLeft, RadioTower } from 'lucide-react'
import type { LocalRelayConfig, RelayStatus } from '@as/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'

export function LocalProviderDetail({ selectedSlug }: { selectedSlug: string }) {
  const { setSelectedSlug } = useAppState()
  const [configs, setConfigs] = useState<LocalRelayConfig[]>([])
  const [status, setStatus] = useState<RelayStatus>({ running: false })

  async function refresh() {
    setConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
    setStatus(await callRpc<RelayStatus>('getRelayStatus'))
  }

  useEffect(() => {
    refresh()
  }, [])

  const configId = localConfigIdFromSlug(selectedSlug)
  const runningCount = configs.filter((c) => c.enabled).length

  if (configId === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-store-accent-soft text-store-accent">
            <RadioTower size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-store-text">local</h2>
              <span className="rounded-full bg-store-accent-soft px-2 py-0.5 text-[10px] font-medium text-store-accent">
                内置 Provider
              </span>
            </div>
            <p className="text-xs text-store-text-2">by Agent Store</p>
          </div>
        </div>

        <p className="mt-3 text-sm text-store-text-2">
          Claude / Codex 指向 local 的某个监听端口，请求经该配置按 Level 顺序转发到上游供应商，失败自动降级。
        </p>

        <div className="mt-4 flex items-center gap-4 border-t border-store-border pt-4 text-sm text-store-text-2">
          <span>127.0.0.1</span>
          <span>{configs.length} 个配置</span>
          <span className="text-store-green">{runningCount} 个运行中</span>
        </div>
      </div>
    )
  }

  const config = configs.find((c) => c.id === configId)
  if (!config) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <button type="button" onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)} className="flex items-center gap-1 text-sm text-store-text-2 hover:text-store-text">
          <ArrowLeft size={14} /> local
        </button>
      </div>
    )
  }

  async function toggle() {
    await callRpc('toggleLocalConfig', [configId])
    refresh()
  }

  async function changePort(port: number) {
    if (!Number.isInteger(port) || port <= 0) return
    await callRpc('updateLocalConfig', [configId, { port }])
    refresh()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)} className="flex items-center gap-1 text-xs text-store-text-2 hover:text-store-text">
            <ArrowLeft size={12} /> local
          </button>
          <h2 className="mt-1 text-lg font-semibold text-store-text">{config.name}</h2>
          <p className="text-xs text-store-text-2">把 Claude / Codex 的 base URL 指向此端口即可接入这份配置。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={config.enabled ? 'text-xs text-store-green' : 'text-xs text-store-text-2'}>
            {config.enabled ? '运行中' : '已停用'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label={`${config.name} 启用状态`}
            onClick={toggle}
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${config.enabled ? 'bg-store-accent' : 'bg-store-border-strong'}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-store-border pt-4">
        <p className="mb-2 text-xs font-medium text-store-text-2">监听端口</p>
        <div className="flex items-center gap-2 rounded-lg border border-store-border bg-store-panel-2 px-3 py-2 font-mono text-sm">
          <span className="text-store-text-3">127.0.0.1 :</span>
          <input
            value={config.port}
            onChange={(e) => changePort(Number(e.target.value))}
            className="w-20 bg-transparent text-store-accent outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-store-text-3">
          把 Claude / Codex 的 base URL 指向 http://127.0.0.1:{config.port} 即可接入这份配置。
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/LocalProviderDetail.test.tsx`
Expected: all pass.

- [ ] **Step 10: Wire the sentinel branch into `DetailPanel.tsx`**

In `apps/cli-gui/src/components/DetailPanel.tsx`, add the import `import { LocalProviderDetail, isLocalProviderSlug } from './LocalProviderDetail'`, add `selectedSlug` to the destructured `useAppState()` call, and add this branch right after the hook calls, before the `if (!detail)` check:

```tsx
  const { favoriteSlugs, toggleFavorite, bumpInstalledVersion, selectedSlug } = useAppState()
  const { appendLine } = useTerminalLog()
  const detail = useSelectedDetail()
  const [tab, setTab] = useState<Tab>('overview')

  if (selectedSlug && isLocalProviderSlug(selectedSlug)) {
    return <LocalProviderDetail selectedSlug={selectedSlug} />
  }

  if (!detail) {
```

Add a test to `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx` confirming the branch (read the file's existing setup first to match its `AppStateProvider`/`selectedSlug`-seeding pattern):

```tsx
test('renders LocalProviderDetail when selectedSlug is the local-provider sentinel', async () => {
  // seed selectedSlug to '__local__' using this file's existing pattern for setting selectedSlug
  // mock listLocalConfigs/getRelayStatus RPCs
  // assert screen.findByText('内置 Provider') resolves
})
```

- [ ] **Step 11: Add the inline "local" entry and child rows to `ResourceList.tsx`**

In `apps/cli-gui/src/components/ResourceList.tsx`, add imports:

```ts
import type { LocalRelayConfig, RelayStatus } from '@as/types'
import { LOCAL_PROVIDER_SENTINEL } from './LocalProviderDetail'
```

Add state and a fetch effect (near the existing `updates` state):

```ts
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ running: false })

  async function refreshLocal() {
    setLocalConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
    setRelayStatus(await callRpc<RelayStatus>('getRelayStatus'))
  }
```

Add `refreshLocal()` to the existing mount `useEffect` (the one calling `refreshInstalled(); refreshCatalog(); refreshUpdates()`), so it becomes:

```ts
  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    refreshUpdates()
    refreshLocal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])
```

Add an `addLocalPort` handler:

```ts
  async function addLocalPort() {
    await callRpc('addLocalConfig', ['新配置'])
    refreshLocal()
  }

  async function removeLocalPort(id: string) {
    await callRpc('removeLocalConfig', [id])
    refreshLocal()
  }
```

Render the inline "local" block immediately before the existing `{navView === 'browse' && showInstalledSection(listFilter) && (` installed-items block — gated on `categoryFilter === 'provider'` (matching the mockup, where "local" only appears under the 供应商 category) and only within the browse view:

```tsx
      {navView === 'browse' && categoryFilter === 'provider' && showInstalledSection(listFilter) && (
        <div>
          <div
            onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)}
            className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 ${
              selectedSlug === LOCAL_PROVIDER_SENTINEL ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-store-text">local</span>
              <span className="rounded-full bg-store-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-store-accent">内置</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-store-text-3">
                {localConfigs.length} 个配置 · {localConfigs.filter((c) => c.enabled).length} 个运行中
              </span>
              <button type="button" aria-label="新增本地监听配置" onClick={addLocalPort} className="text-store-text-2 hover:text-store-text">
                +
              </button>
            </div>
          </div>
          <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-store-border pl-3">
            {localConfigs.map((config) => (
              <div
                key={config.id}
                onClick={() => setSelectedSlug(`${LOCAL_PROVIDER_SENTINEL}:${config.id}`)}
                className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                  selectedSlug === `${LOCAL_PROVIDER_SENTINEL}:${config.id}` ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:bg-store-panel'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${config.enabled ? 'bg-store-green' : 'bg-store-text-3'}`} />
                  <span>{config.name}</span>
                  <span className="font-mono text-store-text-3">:{config.port}</span>
                </div>
                <button
                  type="button"
                  aria-label={`删除 ${config.name}`}
                  onClick={(e) => { e.stopPropagation(); removeLocalPort(config.id) }}
                  className="text-store-text-3 hover:text-store-red"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
```

Note: `relayStatus` fetched above is not directly rendered in this row (the mockup's row text is derived purely from `localConfigs.length`/`.filter(enabled)`, matching what's already shown) — it's fetched here so it's available if a future task needs it in this list view, and to keep `ResourceList`'s and `Overview`'s local-data-fetching parallel; if your reviewer flags `relayStatus` as unused in this file, that's a valid Minor finding — silence it by removing the unused state rather than keeping a fetch with no consumer. Decide based on whether `bun run type-check`/lint flags it as unused; if it does, remove `relayStatus`/`getRelayStatus` from this file's Step 11 addition entirely (keep it only in `Overview.tsx` and `LocalProviderDetail.tsx`, which do consume it).

- [ ] **Step 12: Write the failing/updated tests for `ResourceList.tsx`**

Add to `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx` (extend the shared RPC mock to include `listLocalConfigs`/`getRelayStatus`/`addLocalConfig`/`removeLocalConfig` branches — every existing test in this file will need these added to its mock or a shared default, since the component now calls them unconditionally on mount; check whether this file already centralizes its RPC mock in one function and extend that single place rather than editing every test):

```tsx
test('shows an inline local entry with 内置 badge and expandable port rows under the provider category', async () => {
  // mock listLocalConfigs -> [{ id: 'default', name: '默认', port: 18780, enabled: true }]
  // set categoryFilter to 'provider' via this file's existing pattern
  render(<ResourceList />)
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(await screen.findByText('内置')).toBeInTheDocument()
  expect(await screen.findByText('默认')).toBeInTheDocument()
})

test('clicking the local row sets selectedSlug to the sentinel', async () => {
  // mock listLocalConfigs -> [...]
  render(<ResourceList />)
  fireEvent.click(await screen.findByText('local'))
  // assert selectedSlug became '__local__' via whatever observable this file's other selection tests already use
  // (e.g. the row gaining the selected border class, matching the pattern used for regular installed items)
})

test('does not show the local entry outside the provider category', async () => {
  // set categoryFilter to 'skill'
  render(<ResourceList />)
  await screen.findByText(/* some skill item name from existing fixtures */)
  expect(screen.queryByText('内置')).not.toBeInTheDocument()
})
```

- [ ] **Step 13: Run the ResourceList tests to verify they pass, fixing any pre-existing test broken by the new unconditional RPC calls**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ResourceList.test.tsx`

If pre-existing tests in this file fail because their `callRpc` mock throws on the new `listLocalConfigs`/`getRelayStatus` calls (since ResourceList now calls them on every mount), add those two branches (returning empty/default values, e.g. `[]` and `{ running: false }`) to this file's shared mock setup so every test tolerates them, following whatever the file's existing shared-mock-helper pattern is.

- [ ] **Step 14: Update the "local" card in `Overview.tsx` to navigate to the sentinel detail instead of `navView: 'local-relay'`**

In `apps/cli-gui/src/components/Overview.tsx`, add the import `import { LOCAL_PROVIDER_SENTINEL } from './LocalProviderDetail'`, and change the local-relay card's click handler from:

```tsx
      <button
        type="button"
        onClick={() => setNavView('local-relay')}
```

to:

```tsx
      <button
        type="button"
        onClick={() => {
          setCategoryFilter('provider')
          setNavView('browse')
          setSelectedSlug(LOCAL_PROVIDER_SENTINEL)
        }}
```

`setSelectedSlug` and `setCategoryFilter` need to be destructured from `useAppState()` at the top of `Overview` (extend the existing `const { setNavView, setCategoryFilter } = useAppState()` line to `const { setNavView, setCategoryFilter, setSelectedSlug } = useAppState()`).

Update the corresponding test in `Overview.test.tsx` (the one asserting the local-relay card's click behavior) to assert the new destination instead of the removed `navView: 'local-relay'`.

- [ ] **Step 15: Remove the `'local-relay'` NavView branch and the standalone `LocalRelayDetail` component**

In `apps/cli-gui/src/state/AppState.tsx`, change:

```ts
export type NavView = 'browse' | 'overview' | 'local-relay'
```

to:

```ts
export type NavView = 'browse' | 'overview'
```

In `apps/cli-gui/src/App.tsx`, remove the import `import { LocalRelayDetail } from './components/LocalRelayDetail'` and remove this line from `MainArea`:

```tsx
  if (navView === 'local-relay') return <LocalRelayDetail />
```

Delete `apps/cli-gui/src/components/LocalRelayDetail.tsx` and `apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx` entirely (`git rm`).

Before deleting, check whether `LocalRelayDetail.tsx` was the only place `ProxyLogModal`'s "查看代理日志" entry point existed outside `Overview.tsx` (it was, per the prior plan) — add an equivalent entry point to `LocalProviderDetail.tsx`'s parent view (the `configId === null` branch) instead, so the proxy-log-modal-from-local-provider-detail requirement from the original design spec isn't silently dropped:

```tsx
import { useState } from 'react'
// ... existing imports ...
import { ProxyLogModal } from './ProxyLogModal'
```

```tsx
  const [logModalOpen, setLogModalOpen] = useState(false)
```

Add a button in the parent view's stat row area and render the modal:

```tsx
        <div className="mt-4 flex items-center justify-between border-t border-store-border pt-4">
          <div className="flex items-center gap-4 text-sm text-store-text-2">
            <span>127.0.0.1</span>
            <span>{configs.length} 个配置</span>
            <span className="text-store-green">{runningCount} 个运行中</span>
          </div>
          <button type="button" onClick={() => setLogModalOpen(true)} className="text-xs text-store-accent hover:opacity-80">
            查看代理日志
          </button>
        </div>
        <ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />
```

(this replaces the earlier plain stat-row `<div className="mt-4 flex items-center gap-4 ...">` — fold the two into one `justify-between` row as shown, don't duplicate it.)

Add a test to `LocalProviderDetail.test.tsx` confirming this button opens the modal (mock `getRecentRequests` returning `[]` in `mockRpc`'s default branches).

- [ ] **Step 16: Fix fallout in `App.test.tsx`**

Search `apps/cli-gui/src/__tests__/App.test.tsx` for any reference to `'local-relay'` or a test that clicked the Overview local-relay card expecting a full-screen `LocalRelayDetail` — update or remove per the new sentinel-based navigation (the card now stays within the browse three-pane layout with `DetailPanel` showing the local detail, not a full-width replacement).

- [ ] **Step 17: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors. This is the largest task in the plan — expect to iterate on test fallout more than once; that's expected given the scope, not a sign something is wrong.

- [ ] **Step 18: Commit**

```bash
git add apps/cli-gui/src/components/LocalProviderDetail.tsx apps/cli-gui/src/components/__tests__/LocalProviderDetail.test.tsx apps/cli-gui/src/components/ResourceList.tsx apps/cli-gui/src/components/__tests__/ResourceList.test.tsx apps/cli-gui/src/components/DetailPanel.tsx apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx apps/cli-gui/src/components/Overview.tsx apps/cli-gui/src/components/__tests__/Overview.test.tsx apps/cli-gui/src/App.tsx apps/cli-gui/src/__tests__/App.test.tsx apps/cli-gui/src/state/AppState.tsx apps/cli-gui/src/lib/useSelectedDetail.ts
git rm apps/cli-gui/src/components/LocalRelayDetail.tsx apps/cli-gui/src/components/__tests__/LocalRelayDetail.test.tsx
git commit -m "fix(cli-gui): model local as an inline built-in provider, not a separate full-screen view

Reverses a simplification from the overview-dashboard plan that was based
on indirect research rather than the actual mockup: local now appears
inline at the top of the provider browse list with a 内置 badge and
always-expanded port-config child rows, matching the mockup exactly.
Clicking local or a child config drives the existing DetailPanel via a
sentinel selectedSlug value instead of a dedicated navView/full-screen
component."
```

---

### Task 5: Full verification and real visual QA against the actual mockup

**Context:** Confirm the whole monorepo still builds/tests cleanly, then do a rigorous side-by-side visual comparison against the actual live mockup file (not a summary or an older screenshot) — per the AGENTS.md UI sign-off rule and this exact session's experience of an earlier QA pass that was too shallow (confirmed functional correctness but missed real structural/visual mismatches).

**Files:** none (verification only).

- [ ] **Step 1: Run the full monorepo test and type-check suite**

Run: `cd /Users/liushangliang/github/phenix3443/agent-store && bunx turbo run test type-check --force`
Expected: all tasks pass, 0 failures, 0 type errors.

- [ ] **Step 2: Open the real mockup and the real running app side by side**

Open `docs/ui/Agent Store.dc.html` in a browser (or via the chrome-devtools MCP tool if available), click the "CLI 客户端" tab, and separately launch `make dev-gui` with an isolated `AS_HOME` populated with realistic data (reuse real yls-me/skyapi credentials from `~/.code-switch/codex.json`/`~/.code-switch/claude-code.json` transiently, real usage history, a running relay daemon with 2 local configs — matching the previous QA session's setup).

- [ ] **Step 3: Screen-by-screen comparison checklist**

For each of the following, take a native-window screenshot of the real app (per this session's established `osascript`/`screencapture` technique) and compare directly against the mockup's rendering of the same screen:

1. Overview dashboard: icon rail (exactly 4 buttons + gradient avatar), trend card (tab selector, area chart, 4 tinted stat pills including 模型分布), category cards (icon + right-aligned count), local+可更新 side-by-side cards, recent-requests rows (status dot + color-coded status code).
2. Provider browse view: "local" inline entry with 内置 badge and expanded port child rows at the top of 已添加, alongside real installed/recommended providers.
3. Clicking "local" → detail panel parent view (icon, 内置 Provider badge, description, stat row, 查看代理日志 button).
4. Clicking a port child row → detail panel child view (breadcrumb, toggle switch, editable port field).
5. Toggling the switch and editing the port — confirm both persist via real RPC calls and the list view updates.
6. Proxy log modal opened from both the Overview card and the local parent detail view.
7. Skill and MCP browse views — confirm the rail's category icons still work in combined categoryFilter+navView mode.

- [ ] **Step 4: Fix any remaining visual deltas found**

If Step 3 finds mismatches, fix them directly (small, targeted commits) before considering this plan complete — do not defer visual mismatches found during this dedicated QA pass the way the previous, too-shallow QA pass did.

- [ ] **Step 5: Tear down and final commit**

Stop the relay daemon, remove the isolated `AS_HOME`, and commit any Step 4 fixes. No dedicated commit for this task itself if Step 4 found nothing to fix.
