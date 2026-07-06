# Provider Multi-Config Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the "duplicate into a tracked child config" pattern — already built for the built-in `local` relay provider's port configs — to **any** provider, per the user's updated design mockup: any added provider gets a "+" on its row to create another named sub-config (e.g. the same provider with a second API key), rendered as an indented child row in the same list; the "推荐" (recommended) section always includes every provider (even already-added ones) so users can add more configs; clicking a provider row (not its buttons) shows read-only info, reusing the existing `DetailPanel`.

**Architecture:** `InstalledItem` gains an optional `parentSlug` field. `duplicateProvider` computes the root parent (so duplicating a child still attaches the new sibling to the original root, not to the child) and clears the cloned config's `apiKey` (matching the mockup's "复制父配置，API Key 置空" behavior — previously the whole config including the real key was cloned verbatim). `ResourceList.tsx` splits its installed list into root items and a parent-slug-keyed children map, rendering children as indented rows under their root; the recommended list's filter drops the "already installed" exclusion specifically for providers. `DetailPanel.tsx` gets a small addition showing a child-config count for parent providers — no new component, since it's already the generic read-only info view the design calls for.

**Tech Stack:** TypeScript, React, Tailwind — no new dependencies.

## Global Constraints

- This plan does NOT touch `ProviderEditModal.tsx`'s modal presentation (Dialog vs. inline panel) — that conversion is deferred to a separate, not-yet-written follow-up plan per `docs/superpowers/specs/2026-07-05-provider-multi-config-tree-design.md`.
- This plan does NOT add validation-gating or regress the existing "配置已保存" toast/debounced-autosave behavior in `ProviderEditModal.tsx` — the updated mockup's own validation+toast binding has become dead code in its source, and we deliberately keep our already-more-complete implementation rather than following that regression. No changes to `ProviderEditModal.tsx` in this plan at all.
- This plan does NOT add a `targets` field to the config JSON — "适用客户端" is already implemented via real `enable`/`disable` RPC calls in `ProviderEditModal.tsx`, which is a more correct architecture than the mockup's in-config-object approach. No change needed.
- The `+` (新增子配置) button appears only on ROOT provider rows (items with no `parentSlug`) in the installed list — not on child rows, since `duplicateProvider` already resolves to the correct root parent regardless of which node in the chain you call it on.
- Clicking a provider row's text (not a button) always opens `DetailPanel` (the read-only info view) — this is already existing behavior for every item type, not a new code path.

---

### Task 1: `parentSlug` data model and `duplicateProvider` root-parent tracking

**Files:**
- Modify: `packages/types/src/engine.ts`
- Modify: `apps/client-core/src/engine.ts`
- Modify: `apps/client-core/src/config/provider.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts`
- Test: `apps/client-core/src/config/__tests__/provider.test.ts`

**Interfaces:**
- Produces: `InstalledItem.parentSlug?: string` (root parent's slug; absent means this item IS a root); `duplicateProvider`'s returned `newSlug` entry always has `parentSlug` set to the ROOT of the chain, even when duplicating an existing child.

- [ ] **Step 1: Add `parentSlug` to the `InstalledItem` type**

In `packages/types/src/engine.ts`, change:

```ts
export interface InstalledItem {
  slug: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  installedAt: string
  updatedAt: string
  compatibleWith: ToolTarget[]
  /** Partial: only contains entries for tools in compatibleWith */
  enabledFor: Partial<Record<ToolTarget, boolean>>
}
```

to:

```ts
export interface InstalledItem {
  slug: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  installedAt: string
  updatedAt: string
  compatibleWith: ToolTarget[]
  /** Partial: only contains entries for tools in compatibleWith */
  enabledFor: Partial<Record<ToolTarget, boolean>>
  /** Root provider slug this entry was duplicated from. Absent means this entry is a root (not a duplicate). */
  parentSlug?: string
}
```

- [ ] **Step 2: Write the failing tests for `duplicateProvider`'s root-parent tracking**

Add to `apps/client-core/src/__tests__/engine.test.ts` (the existing `'duplicateProvider: copies config into a new slug and registers it disabled'` test already covers the basic case — read it first, then add):

```ts
test('duplicateProvider: the first duplicate is registered with parentSlug set to the root', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')

  const result = await engine.duplicateProvider('test-provider')

  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  const rootEntry = reg.installed.find((e: { slug: string }) => e.slug === 'test-provider')
  const childEntry = reg.installed.find((e: { slug: string }) => e.slug === result.newSlug)
  expect(rootEntry.parentSlug).toBeUndefined()
  expect(childEntry.parentSlug).toBe('test-provider')
})

test('duplicateProvider: duplicating an existing child attaches the new sibling to the same root, not to the child', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  const first = await engine.duplicateProvider('test-provider')

  const second = await engine.duplicateProvider(first.newSlug)

  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  const secondEntry = reg.installed.find((e: { slug: string }) => e.slug === second.newSlug)
  expect(secondEntry.parentSlug).toBe('test-provider')
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: FAIL — `parentSlug` is currently never set.

- [ ] **Step 4: Implement root-parent computation in `duplicateProvider`**

In `apps/client-core/src/engine.ts`, change the `duplicateProvider` method from:

```ts
  async duplicateProvider(slug: string): Promise<{ newSlug: string }> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    if (entry.category !== 'provider') throw new Error(`Only providers can be duplicated: ${slug}`)

    let newSlug = `${slug}-copy`
    let suffix = 2
    while (findEntry(registry, newSlug)) {
      newSlug = `${slug}-copy-${suffix}`
      suffix += 1
    }

    const sourceDir = itemDir(this.paths.aasHome, 'provider', slug)
    const targetDir = itemDir(this.paths.aasHome, 'provider', newSlug)
    await duplicateProviderConnection(sourceDir, targetDir, newSlug)

    const now = new Date().toISOString()
    const newEntry: InstalledItem = {
      slug: newSlug,
      category: 'provider',
      version: entry.version,
      installedAt: now,
      updatedAt: now,
      compatibleWith: entry.compatibleWith,
      enabledFor: {},
    }
    await writeRegistry(this.paths.aasHome, upsertEntry(registry, newEntry))
    return { newSlug }
  }
```

to:

```ts
  async duplicateProvider(slug: string): Promise<{ newSlug: string }> {
    const registry = await readRegistry(this.paths.aasHome)
    const entry = findEntry(registry, slug)
    if (!entry) throw new Error(`Item not installed: ${slug}`)
    if (entry.category !== 'provider') throw new Error(`Only providers can be duplicated: ${slug}`)

    const rootSlug = entry.parentSlug ?? slug

    let newSlug = `${slug}-copy`
    let suffix = 2
    while (findEntry(registry, newSlug)) {
      newSlug = `${slug}-copy-${suffix}`
      suffix += 1
    }

    const sourceDir = itemDir(this.paths.aasHome, 'provider', slug)
    const targetDir = itemDir(this.paths.aasHome, 'provider', newSlug)
    await duplicateProviderConnection(sourceDir, targetDir, newSlug)

    const now = new Date().toISOString()
    const newEntry: InstalledItem = {
      slug: newSlug,
      category: 'provider',
      version: entry.version,
      installedAt: now,
      updatedAt: now,
      compatibleWith: entry.compatibleWith,
      enabledFor: {},
      parentSlug: rootSlug,
    }
    await writeRegistry(this.paths.aasHome, upsertEntry(registry, newEntry))
    return { newSlug }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: all pass, including the 2 new tests and the pre-existing `duplicateProvider` tests (unaffected — they don't assert on `parentSlug`, and adding an optional field doesn't break `toEqual`-style assertions elsewhere unless they explicitly check the entry shape; confirm none do before moving on).

- [ ] **Step 6: Update the failing test for `duplicateProviderConnection` clearing `apiKey`**

Read `apps/client-core/src/config/__tests__/provider.test.ts` to find its existing `duplicateProviderConnection` test(s), then update the assertion. The existing test likely reads similarly to:

```ts
test('duplicateProviderConnection copies manifest and config to the target dir', async () => {
  // ... setup ...
  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config).toEqual({ apiKey: 'k', baseUrl: 'https://x.com' })
})
```

Change the expectation to:

```ts
  expect(config).toEqual({ apiKey: '', baseUrl: 'https://x.com' })
```

Also update the analogous assertion in `apps/client-core/src/__tests__/engine.test.ts`'s `'duplicateProvider: copies config into a new slug and registers it disabled'` test (it currently asserts `expect(config).toEqual({ apiKey: 'k', baseUrl: 'https://x.com' })` — change to `expect(config).toEqual({ apiKey: '', baseUrl: 'https://x.com' })`).

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts src/__tests__/engine.test.ts`
Expected: FAIL on the two updated assertions — `duplicateProviderConnection` still copies `apiKey` verbatim.

- [ ] **Step 8: Clear `apiKey` in `duplicateProviderConnection`**

In `apps/client-core/src/config/provider.ts`, change the end of `duplicateProviderConnection` from:

```ts
  let config = '{}'
  try {
    config = await readFile(join(sourceDir, 'config.json'), 'utf-8')
  } catch {
    // source has no config.json — fall back to an empty object
  }
  await writeFile(join(targetDir, 'config.json'), config)
}
```

to:

```ts
  let config: Record<string, unknown> = {}
  try {
    config = JSON.parse(await readFile(join(sourceDir, 'config.json'), 'utf-8')) as Record<string, unknown>
  } catch {
    // source has no config.json — fall back to an empty object
  }
  if ('apiKey' in config) config['apiKey'] = ''
  await writeFile(join(targetDir, 'config.json'), JSON.stringify(config, null, 2))
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/client-core && bun test`
Expected: all pass (full package suite, to catch any other test asserting on cloned-config shape).

- [ ] **Step 10: Run type check**

Run: `cd apps/client-core && bun run type-check`
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add packages/types/src/engine.ts apps/client-core/src/engine.ts apps/client-core/src/config/provider.ts apps/client-core/src/__tests__/engine.test.ts apps/client-core/src/config/__tests__/provider.test.ts
git commit -m "feat(client-core): track root parent on duplicated providers, clear apiKey on duplicate

Adds InstalledItem.parentSlug so the GUI can render duplicated provider
configs as a tree under their root, matching the updated design mockup's
generalization of the local-relay child-config pattern to any provider.
Duplicating a child now correctly attaches the new sibling to the
original root, not to the child. Also stops cloning the real apiKey
into the duplicate (previously copied verbatim), matching the mockup's
'复制父配置，API Key 置空' behavior."
```

---

### Task 2: Render provider sub-configs as a tree in `ResourceList.tsx`, always show providers in 推荐

**Files:**
- Modify: `apps/cli-gui/src/components/ResourceList.tsx`
- Test: `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx`

**Interfaces:**
- Consumes: `InstalledItem.parentSlug` (Task 1), existing `duplicateProvider`/`install`/`uninstall` RPCs (unchanged signatures).
- Produces: no new exports — internal component behavior only.

- [ ] **Step 1: Read the current installed-item and recommended-item row rendering in `ResourceList.tsx` fully**

Read the file end to end before editing — it already has the `local` inline-entry block (from a previous plan) immediately above the regular installed-items block; this task's new tree rendering goes inside the regular installed-items block, not the `local` block (which stays as-is, unrelated to this task).

- [ ] **Step 2: Write the failing tests**

Read `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx` fully first to match its exact fixture/mock conventions (installed-item fixtures, `info`/`list` RPC mocking style), then add:

```tsx
test('shows a + button on a root provider row and renders duplicated children indented beneath it', async () => {
  // Extend this test's RPC mock so `list` returns two InstalledItem entries for provider category:
  //   { slug: 'test-provider', category: 'provider', ..., parentSlug: undefined }
  //   { slug: 'test-provider-copy', category: 'provider', ..., parentSlug: 'test-provider' }
  // and `info` resolves ItemDetail for both slugs (reuse this file's existing detail-fixture helper).
  // Set categoryFilter to 'provider' via whatever mechanism this file's other provider-specific tests use.
  render(<ResourceList />)
  await screen.findByText('test-provider') // or whatever display name the fixture uses
  expect(screen.getByLabelText('新增子配置 test-provider')).toBeInTheDocument()
  expect(await screen.findByText('test-provider-copy')).toBeInTheDocument()
})

test('clicking + on a provider row calls duplicateProvider and opens the new child for editing', async () => {
  let duplicatedSlug: string | undefined
  // Extend the RPC mock: duplicateProvider: (args) => { duplicatedSlug = args?.[0]; return { newSlug: 'test-provider-copy' } }
  render(<ResourceList />)
  fireEvent.click(await screen.findByLabelText('新增子配置 test-provider'))
  await waitFor(() => expect(duplicatedSlug).toBe('test-provider'))
  // assert the ProviderEditModal opened for 'test-provider-copy' — reuse whatever assertion this file's
  // existing '编辑' button test uses to confirm ProviderEditModal is open for a given slug.
})

test('removing a child row calls uninstall with the child slug, not the parent', async () => {
  let uninstalledSlug: string | undefined
  // Extend the RPC mock: uninstall: (args) => { uninstalledSlug = args?.[0] }
  render(<ResourceList />)
  await screen.findByText('test-provider-copy')
  fireEvent.click(screen.getByLabelText('删除 test-provider-copy'))
  await waitFor(() => expect(uninstalledSlug).toBe('test-provider-copy'))
})

test('recommended section shows an already-installed provider with a 配置 button', async () => {
  // Extend `search`/catalog RPC mock to include a provider item slug matching an already-installed root
  // (e.g. 'test-provider' is both installed AND present in the catalog search results).
  render(<ResourceList />)
  const recommendedButtons = await screen.findAllByRole('button', { name: '配置' })
  expect(recommendedButtons.length).toBeGreaterThan(0)
})

test('clicking 配置 on an already-installed recommended provider duplicates it, not re-installs it', async () => {
  let calledMethod: string | undefined
  // Extend mock: duplicateProvider: () => { calledMethod = 'duplicateProvider'; return { newSlug: 'x' } }
  //              install: () => { calledMethod = 'install'; return { version: '1.0.0' } }
  render(<ResourceList />)
  fireEvent.click((await screen.findAllByRole('button', { name: '配置' }))[0]!)
  await waitFor(() => expect(calledMethod).toBe('duplicateProvider'))
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ResourceList.test.tsx`
Expected: FAIL — no tree rendering, no `配置` button branching yet.

- [ ] **Step 4: Split installed items into roots and a children map**

In `apps/cli-gui/src/components/ResourceList.tsx`, add (near the existing `installedSlugs` memo):

```ts
  const rootInstalled = useMemo(() => installed.filter((i) => !i.parentSlug), [installed])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, EnrichedInstalledItem[]>()
    for (const item of installed) {
      if (!item.parentSlug) continue
      const list = map.get(item.parentSlug) ?? []
      list.push(item)
      map.set(item.parentSlug, list)
    }
    return map
  }, [installed])
```

Change `visibleInstalled`'s memo to filter `rootInstalled` instead of `installed`:

```ts
  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        rootInstalled.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        favoriteSlugs,
        updatableSlugs
      ),
    [rootInstalled, categoryFilter, textQuery, listFilter, agentApp, favoriteSlugs, updatableSlugs]
  )
```

- [ ] **Step 5: Add the "+" handler and render child rows**

Add a handler near the existing `duplicateProvider` function:

```ts
  async function addChildConfig(item: EnrichedInstalledItem) {
    appendLine(`$ aas duplicate ${item.slug}`)
    try {
      const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
      appendLine(`✓ 已新增子配置 ${result.newSlug}`, 'green')
      setEditingSlug(result.newSlug)
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }
```

In the installed-item row JSX, replace the existing "复制" button (inside the `item.category === 'provider' && (...)` block) — find:

```tsx
                      {item.category === 'provider' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingSlug(item.slug)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateProvider(item)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            复制
                          </button>
                        </>
                      )}
```

and replace the second button (复制) with, keeping the first (编辑) as-is — only render the `+` on ROOT rows (i.e., inside this same map over `visibleInstalled`, every item here is already a root since `visibleInstalled` is now root-only, so no extra guard is needed beyond the existing `item.category === 'provider'` check):

```tsx
                      {item.category === 'provider' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingSlug(item.slug)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            aria-label={`新增子配置 ${item.slug}`}
                            onClick={() => addChildConfig(item)}
                            className="text-xs text-store-text-2 hover:text-store-text"
                          >
                            +
                          </button>
                        </>
                      )}
```

You may now delete the old `duplicateProvider` function entirely if `addChildConfig` fully replaces its only call site (check with `grep -n "duplicateProvider(item)" apps/cli-gui/src/components/ResourceList.tsx` after this edit — if the only remaining reference is inside `addChildConfig`'s own RPC call string `'duplicateProvider'`, i.e. no more calls to the local helper function named `duplicateProvider`, delete that now-dead local function to avoid leaving unused code).

After the installed-item row's closing `</div>` (the outer row div, before the `)` that ends the `.map()` callback), add the children rendering:

```tsx
                  {item.category === 'provider' && (childrenByParent.get(item.slug)?.length ?? 0) > 0 && (
                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-store-border pl-3">
                      {childrenByParent.get(item.slug)!.map((child) => (
                        <div
                          key={child.slug}
                          onClick={() => setSelectedSlug(child.slug)}
                          className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                            selectedSlug === child.slug ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:bg-store-panel'
                          }`}
                        >
                          <span className="font-mono">{child.slug}</span>
                          <button
                            type="button"
                            aria-label={`删除 ${child.slug}`}
                            onClick={(e) => { e.stopPropagation(); uninstall(child) }}
                            className="text-store-text-3 hover:text-store-red"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
```

(This block must be a sibling of the row div you just edited, still inside the same `.map((item) => { ... return (...) })` — since a `.map` callback can only return a single JSX element, wrap the row + children block in a `<div key={item.slug}>` fragment if the current code returns the row div directly without an outer wrapper; check the existing structure first — if the row itself already uses `key={item.slug}` directly on its own root div, change that root div's role: wrap it and the new children block together in a `<div key={item.slug}>...</div>`, moving `key` to the new wrapper and keeping the row's own div without a `key` prop.)

- [ ] **Step 6: Update the recommended list's filter and per-item button**

Change `recommendedBase`'s filter from:

```ts
  const recommendedBase = useMemo(
    () =>
      catalog.filter(
        (item) =>
          !installedSlugs.has(item.slug) &&
          matchesCategoryFilter(item.category, categoryFilter) &&
          matchesText(item.name, item.description, textQuery)
      ),
    [catalog, installedSlugs, categoryFilter, textQuery]
  )
```

to:

```ts
  const recommendedBase = useMemo(
    () =>
      catalog.filter(
        (item) =>
          (!installedSlugs.has(item.slug) || item.category === 'provider') &&
          matchesCategoryFilter(item.category, categoryFilter) &&
          matchesText(item.name, item.description, textQuery)
      ),
    [catalog, installedSlugs, categoryFilter, textQuery]
  )
```

Add a handler:

```ts
  async function configureProvider(item: Item) {
    appendLine(`$ aas configure ${item.slug}`)
    try {
      if (installedSlugs.has(item.slug)) {
        const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
        appendLine(`✓ 已新增子配置 ${result.newSlug}`, 'green')
        setEditingSlug(result.newSlug)
      } else {
        await callRpc('install', [item.slug])
        appendLine(`✓ 已安装 ${item.slug}`, 'green')
        setEditingSlug(item.slug)
      }
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }
```

In the recommended-item row JSX, change the install button from:

```tsx
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      install(item)
                    }}
                    className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    安装
                  </button>
```

to:

```tsx
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.category === 'provider') configureProvider(item)
                      else install(item)
                    }}
                    className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    {item.category === 'provider' ? '配置' : '安装'}
                  </button>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ResourceList.test.tsx`
Expected: all pass.

- [ ] **Step 8: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors. Fix any fallout in other tests that assumed the old flat "复制" button or the old `!installedSlugs.has(item.slug)`-only recommended filter (e.g. a test that installs a provider and then asserts it disappears from recommended — that assumption is now wrong for providers specifically; update such a test's expectation, or if it wasn't provider-specific, leave it alone).

- [ ] **Step 9: Commit**

```bash
git add apps/cli-gui/src/components/ResourceList.tsx apps/cli-gui/src/components/__tests__/ResourceList.test.tsx
git commit -m "feat(cli-gui): render duplicated provider configs as an indented tree, always show providers in 推荐

Any provider's row now has a + button (新增子配置) that duplicates it into
a new tracked child config and immediately opens it for editing; children
render indented beneath their root with a × to remove. The 推荐 section no
longer excludes already-added providers, since users may want another
config for the same provider — its button reads 配置 (duplicate-or-install)
instead of 安装 for provider items specifically."
```

---

### Task 3: Show a child-config count on the read-only provider info view

**Files:**
- Modify: `apps/cli-gui/src/components/DetailPanel.tsx`
- Test: `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx`

**Interfaces:**
- Consumes: `list()` RPC (existing, unchanged) — `DetailPanel` calls it directly for the first time in this task, purely to count siblings with `parentSlug === detail.slug`.

- [ ] **Step 1: Write the failing test**

Read `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx` fully to match its exact `useSelectedDetail`/RPC mocking conventions, then add:

```tsx
test('shows a child-config count banner for a provider with duplicated configs', async () => {
  // Mock useSelectedDetail (or its underlying info/search RPCs, per this file's existing pattern) to
  // resolve an installed provider detail for slug 'test-provider'.
  // Mock the 'list' RPC to return [
  //   { slug: 'test-provider', category: 'provider', ... },
  //   { slug: 'test-provider-copy', category: 'provider', ..., parentSlug: 'test-provider' },
  // ]
  render(<DetailPanel />)
  expect(await screen.findByText(/已有 1 份配置/)).toBeInTheDocument()
})

test('does not show the child-config banner for a provider with no duplicates', async () => {
  // Mock 'list' to return just the single root provider, no children.
  render(<DetailPanel />)
  await screen.findByText(/* the provider's name, to confirm the panel rendered */)
  expect(screen.queryByText(/已有.*份配置/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/cli-gui && bun test src/components/__tests__/DetailPanel.test.tsx`
Expected: FAIL — no such banner exists yet.

- [ ] **Step 3: Add the child-count fetch and banner**

In `apps/cli-gui/src/components/DetailPanel.tsx`, add imports/state:

```ts
import { useEffect, useState } from 'react'
import type { InstalledItem } from '@as/types'
```

(merge with the existing `import { useState } from 'react'` line — change to `import { useEffect, useState } from 'react'`.)

```ts
  const [childCount, setChildCount] = useState(0)

  useEffect(() => {
    if (!detail || detail.category !== 'provider' || !detail.installed) {
      setChildCount(0)
      return
    }
    callRpc<InstalledItem[]>('list').then((items) => {
      setChildCount(items.filter((i) => i.parentSlug === detail.slug).length)
    })
  }, [detail])
```

(Place this `useEffect` after the existing `if (!detail) { return ... }` early-return block is NOT an option since hooks can't follow a conditional return — place it BEFORE that early return, alongside the other hook calls at the top of the component, guarding its body with the `if (!detail || ...)` check shown above instead of relying on the component-level early return.)

Add the banner JSX right after the existing install/favorite button row (the `<div className="mt-3 flex items-center gap-2">...</div>` block), before the `$ agent-store add ...` command box:

```tsx
      {childCount > 0 && (
        <p className="mt-2 text-xs text-store-text-2">
          已有 {childCount} 份配置 · 在左侧列表展开该条目即可管理
        </p>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/DetailPanel.test.tsx`
Expected: all pass.

- [ ] **Step 5: Run the full cli-gui suite and type check**

Run: `cd apps/cli-gui && bun test && bun run type-check`
Expected: all pass, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/cli-gui/src/components/DetailPanel.tsx apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx
git commit -m "feat(cli-gui): show a child-config count banner on a provider's read-only info view"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full monorepo test and type-check suite**

Run: `cd /Users/liushangliang/github/phenix3443/agent-store && bunx turbo run test type-check --force`
Expected: all tasks pass, 0 failures, 0 type errors.

- [ ] **Step 2: Real-environment functional check via CLI RPCs (no GUI screenshot required for this plan — chrome-devtools MCP is unavailable this session, and native-window screenshotting proved unreliable due to desktop contention in the prior plan's QA pass)**

```bash
export AS_HOME=$(mktemp -d /tmp/as-multiconfig-smoketest-XXXX)
cd /Users/liushangliang/github/phenix3443/agent-store
```

Install a real test provider (or reuse a lightweight fixture item already known to exist in the market backend this repo talks to — check `apps/cli/src/commands/install.ts`'s tests or any existing smoke-test script for a known-good slug), then:

```bash
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc list
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc duplicateProvider '["<installed-provider-slug>"]'
AS_HOME="$AS_HOME" bun run apps/cli/src/index.ts __rpc list
```

Expected: the second `list` call shows the new duplicate entry with `parentSlug` set to the original slug, and its `config.json`'s `apiKey` is empty even if the original had one set.

- [ ] **Step 3: Tear down**

```bash
rm -rf "$AS_HOME"
```

No commit for this task — it's verification only. If real-environment GUI visual confirmation later becomes feasible again (chrome-devtools MCP reconnects, or the desktop is free of contention), a follow-up manual click-through of the tree rendering and 配置/安装 button branching is recommended but not blocking for this plan's completion, given the disclosed tooling constraint.
