# GUI 客户端 UI 对齐设计稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/cli-gui` 从"标签页 + 简单列表"重构为与 `docs/ui/Agent Store.dc.html`「CLI 客户端」页签一致的三栏布局（图标导航条 + 分组列表 + 详情面板 + 右侧信息栏），并新增真实的"复制供应商配置"能力。

**Architecture:** 后端（`packages/types` / `apps/client-core` / `apps/cli`）先新增 `duplicateProvider` 能力并逐层打通 RPC；前端在不破坏现有页面的前提下先新增状态字段与新组件（各自独立可测），最后一个任务原子替换 `App.tsx` 并删除旧组件，保证每个任务结束时应用都能编译、测试通过。

**Tech Stack:** TypeScript, React 18, Tauri 2, bun:test + @testing-library/react + happy-dom（`apps/cli-gui`），bun:test 直接跑 Node 文件系统（`apps/client-core`、`apps/cli`）。

## Global Constraints

- 完全对齐设计稿的视觉与交互结构（单列表分组「已安装」「推荐」+ 详情面板 + 右侧信息栏），参见 `docs/superpowers/specs/2026-07-04-gui-client-design-alignment-design.md`。
- 废弃「更新」「收藏」独立标签页；「更新」改为 `IconRail` 的一个导航图标（沿用现有 `checkUpdates`/`update` RPC，不新增 RPC）；「收藏」是 GUI 内存态（`favoriteSlugs: Set<string>`），不持久化、不接后端。
- 搜索框支持 `@` 过滤 token（`popular`/`recent`/`installed`/`enabled`/`disabled`/`favorites`），非 `@` 开头的输入按名称/描述做纯文本过滤。
- 详情面板三个 tab（概览/评价/版本）全部实现 UI；概览用真实数据；评价无数据时显示"暂无评价"；版本无历史数据时只显示当前版本一行。
- 底部终端面板保留，默认折叠为一行，可展开/收起（`AppState.terminalExpanded`，默认 `false`）。
- 新增"复制供应商配置"必须是真实能力（新 engine 方法 + RPC 分支），不是纯 UI 壳子；复制后新连接默认不启用（`enabledFor: {}`）。
- 每个任务结束时 `apps/cli-gui`、`apps/client-core`、`apps/cli` 各自的 `bun test` 与 `tsc --noEmit` 必须通过（前端任务在最后一个任务之前不得破坏 `App.tsx` 现有渲染路径）。
- 不实现登录/发布账户体系、不新增评价或版本历史的存储/API。

---

### Task 1: `duplicateProviderConnection` — 复制供应商本地配置文件

**Files:**
- Modify: `apps/client-core/src/config/provider.ts`
- Test: `apps/client-core/src/config/__tests__/provider.test.ts`

**Interfaces:**
- Produces: `duplicateProviderConnection(sourceDir: string, targetDir: string, newSlug: string): Promise<void>` — 读取 `sourceDir/manifest.json` 与（可选的）`sourceDir/config.json`，在 `targetDir` 下写出新的 `manifest.json`（`slug`/`id` 改为 `newSlug`，`name` 追加"副本"后缀）与 `config.json`（原样复制，源文件不存在时写 `{}`）。

- [ ] **Step 1: Write the failing tests**

追加到 `apps/client-core/src/config/__tests__/provider.test.ts`（在已有 import 之后新增一个 import，测试追加到文件末尾）：

```ts
import { duplicateProviderConnection } from '../provider'
```

```ts
test('duplicateProviderConnection copies manifest with new slug/id and appends a suffix to the name', async () => {
  const sourceDir = join(dir, 'source')
  const targetDir = join(dir, 'target')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))
  await writeFile(join(sourceDir, 'config.json'), JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-copy')

  const manifest = JSON.parse(await readFile(join(targetDir, 'manifest.json'), 'utf-8'))
  expect(manifest.slug).toBe('yls-copy')
  expect(manifest.id).toBe('yls-copy')
  expect(manifest.name).toBe('yls 副本')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config).toEqual({ apiKey: 'k', baseUrl: 'https://x.com' })
})

test('duplicateProviderConnection writes an empty config.json when the source has none', async () => {
  const sourceDir = join(dir, 'source-no-config')
  const targetDir = join(dir, 'target-no-config')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({ id: 'yls', slug: 'yls', name: 'yls' }))

  await duplicateProviderConnection(sourceDir, targetDir, 'yls-copy-2')

  const config = JSON.parse(await readFile(join(targetDir, 'config.json'), 'utf-8'))
  expect(config).toEqual({})
})
```

`provider.test.ts` 顶部已有 `import { mkdtemp, rm, writeFile } from 'fs/promises'`，需要改成：

```ts
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: FAIL — `duplicateProviderConnection is not a function` (or import error).

- [ ] **Step 3: Implement `duplicateProviderConnection`**

在 `apps/client-core/src/config/provider.ts` 顶部把：

```ts
import { readFile } from 'fs/promises'
import { join } from 'path'
```

改成：

```ts
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
```

在文件末尾（`readProviderConnection` 函数之后）追加：

```ts
export async function duplicateProviderConnection(
  sourceDir: string,
  targetDir: string,
  newSlug: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true })

  const manifestRaw = JSON.parse(
    await readFile(join(sourceDir, 'manifest.json'), 'utf-8')
  ) as Record<string, unknown>
  const manifest = {
    ...manifestRaw,
    slug: newSlug,
    id: newSlug,
    name: `${String(manifestRaw['name'])} 副本`,
  }
  await writeFile(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  let config = '{}'
  try {
    config = await readFile(join(sourceDir, 'config.json'), 'utf-8')
  } catch {
    // source has no config.json — fall back to an empty object
  }
  await writeFile(join(targetDir, 'config.json'), config)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/config/__tests__/provider.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/client-core && bun run type-check`
Expected: no errors.

```bash
git add apps/client-core/src/config/provider.ts apps/client-core/src/config/__tests__/provider.test.ts
git commit -m "feat(client-core): add duplicateProviderConnection"
```

---

### Task 2: `AASEngine.duplicateProvider` — engine 层复制供应商

**Files:**
- Modify: `packages/types/src/engine.ts`
- Modify: `apps/client-core/src/engine.ts`
- Test: `apps/client-core/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `duplicateProviderConnection(sourceDir, targetDir, newSlug)` (Task 1); `itemDir(aasHome, category, slug)` from `./paths`；`readRegistry`/`writeRegistry`/`findEntry`/`upsertEntry` from `./registry/index`。
- Produces: `AASEngine.duplicateProvider(slug: string): Promise<{ newSlug: string }>` — 追加到 `AASEngine` 接口与 `AASEngineImpl`。新 slug 生成规则：`{slug}-copy`，若已存在则 `{slug}-copy-2`、`{slug}-copy-3`……直至不冲突。非 provider 类目或未安装时抛错。

- [ ] **Step 1: Add the method to the `AASEngine` interface**

在 `packages/types/src/engine.ts` 的 `AASEngine` 接口内，`info(slug: string): Promise<ItemDetail>` 这一行之后追加：

```ts
  /** Duplicates an installed provider's local config into a new slug. Throws if slug is not an installed provider. */
  duplicateProvider(slug: string): Promise<{ newSlug: string }>
```

- [ ] **Step 2: Write the failing tests**

追加到 `apps/client-core/src/__tests__/engine.test.ts`（文件末尾，复用文件已有的 `providerItem`、`mockFetch`、`beforeEach`/`afterEach` 中的 `engine`/`aasHome`）：

```ts
test('duplicateProvider: copies config into a new slug and registers it disabled', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await writeFile(
    join(aasHome, 'providers', 'test-provider', 'config.json'),
    JSON.stringify({ apiKey: 'k', baseUrl: 'https://x.com' })
  )

  const result = await engine.duplicateProvider('test-provider')
  expect(result.newSlug).toBe('test-provider-copy')

  const manifest = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider-copy', 'manifest.json'), 'utf-8')
  )
  expect(manifest.slug).toBe('test-provider-copy')

  const config = JSON.parse(
    await readFile(join(aasHome, 'providers', 'test-provider-copy', 'config.json'), 'utf-8')
  )
  expect(config).toEqual({ apiKey: 'k', baseUrl: 'https://x.com' })

  const reg = JSON.parse(await readFile(join(aasHome, 'registry.json'), 'utf-8'))
  const newEntry = reg.installed.find((e: { slug: string }) => e.slug === 'test-provider-copy')
  expect(newEntry.enabledFor).toEqual({})
  expect(newEntry.category).toBe('provider')
})

test('duplicateProvider: increments the suffix when the copy slug is taken', async () => {
  mockFetch({ '/api/items/test-provider': { item: providerItem } })
  await engine.install('test-provider')
  await engine.duplicateProvider('test-provider')
  const second = await engine.duplicateProvider('test-provider')
  expect(second.newSlug).toBe('test-provider-copy-2')
})

test('duplicateProvider: throws for a non-provider item', async () => {
  mockFetch({ '/api/items/test-skill': { item: skillItem } })
  await engine.install('test-skill')
  await expect(engine.duplicateProvider('test-skill')).rejects.toThrow('Only providers can be duplicated')
})

test('duplicateProvider: throws when the slug is not installed', async () => {
  await expect(engine.duplicateProvider('missing')).rejects.toThrow('Item not installed')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts -t duplicateProvider`
Expected: FAIL — `engine.duplicateProvider is not a function`.

- [ ] **Step 4: Implement `AASEngineImpl.duplicateProvider`**

在 `apps/client-core/src/engine.ts` 顶部把：

```ts
import { readProviderConnection } from './config/provider'
```

改成：

```ts
import { duplicateProviderConnection, readProviderConnection } from './config/provider'
```

在 `async info(slug: string): Promise<ItemDetail> { ... }` 方法结束的 `}` 之后（`private async _syncToTarget` 之前）追加：

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/client-core && bun test src/__tests__/engine.test.ts`
Expected: PASS (full file, including pre-existing tests).

- [ ] **Step 6: Type-check and commit**

Run: `cd apps/client-core && bun run type-check && cd ../../packages/types && bun run type-check`
Expected: no errors.

```bash
git add packages/types/src/engine.ts apps/client-core/src/engine.ts apps/client-core/src/__tests__/engine.test.ts
git commit -m "feat(client-core): add AASEngine.duplicateProvider"
```

---

### Task 3: RPC 分支 `duplicateProvider`

**Files:**
- Modify: `apps/cli/src/commands/rpc.ts`
- Modify: `apps/cli/src/commands/__tests__/rpc.test.ts`

**Interfaces:**
- Consumes: `AASEngine.duplicateProvider(slug)` (Task 2).
- Produces: RPC method name `'duplicateProvider'`, args `[slug: string]`, returns `{ newSlug: string }` — GUI 在 Task 7 用 `callRpc<{ newSlug: string }>('duplicateProvider', [slug])` 调用。

- [ ] **Step 1: Write the failing test**

在 `apps/cli/src/commands/__tests__/rpc.test.ts` 的 `makeEngine` 工厂里，`info: async () => { throw new Error('not installed') },` 这一行之后追加一行默认实现：

```ts
    duplicateProvider: async () => ({ newSlug: 'openai-provider-copy' }),
```

在文件末尾追加：

```ts
test('runRpc calls duplicateProvider with the slug and returns the new slug', async () => {
  const duplicateProvider = async (slug: string) => {
    expect(slug).toBe('openai-provider')
    return { newSlug: 'openai-provider-copy' }
  }
  const lines: string[] = []
  const code = await runRpc(
    makeEngine({ duplicateProvider: duplicateProvider as AASEngine['duplicateProvider'] }),
    ['duplicateProvider', '["openai-provider"]'],
    s => lines.push(s)
  )
  expect(code).toBe(0)
  const parsed = JSON.parse(lines[0])
  expect(parsed.ok).toBe(true)
  expect(parsed.data.newSlug).toBe('openai-provider-copy')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/commands/__tests__/rpc.test.ts -t duplicateProvider`
Expected: FAIL — `Unknown RPC method: duplicateProvider`.

- [ ] **Step 3: Add the RPC branch**

在 `apps/cli/src/commands/rpc.ts` 的 `RPC_METHODS` 对象里，`info: (e, a) => e.info(a[0] as string),` 这一行之后追加：

```ts
  duplicateProvider: (e, a) => e.duplicateProvider(a[0] as string),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli && bun test src/commands/__tests__/rpc.test.ts`
Expected: PASS (full file).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli && bun run type-check`
Expected: no errors.

```bash
git add apps/cli/src/commands/rpc.ts apps/cli/src/commands/__tests__/rpc.test.ts
git commit -m "feat(cli): expose duplicateProvider over RPC"
```

---

### Task 4: `AppState` 扩展（新增字段，不删旧字段）

**Files:**
- Modify: `apps/cli-gui/src/state/AppState.tsx`
- Test: `apps/cli-gui/src/state/__tests__/AppState.test.tsx` (new file)

**Interfaces:**
- Produces (new, additive — `section`/`setSection`/`agentApp`/`setAgentApp` unchanged): `NavView = 'browse' | 'updates'`, `CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'`, `ListFilter = 'all' | 'popular' | 'recent' | 'installed' | 'enabled' | 'disabled' | 'favorites'`; context fields `navView`, `setNavView`, `categoryFilter`, `setCategoryFilter`, `listFilter`, `setListFilter`, `selectedSlug: string | null`, `setSelectedSlug(slug: string | null)`, `favoriteSlugs: Set<string>`, `toggleFavorite(slug: string)`, `terminalExpanded: boolean`, `setTerminalExpanded(v: boolean)`.

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/state/__tests__/AppState.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../AppState'

afterEach(() => { cleanup() })

function Probe() {
  const {
    navView, setNavView, categoryFilter, setCategoryFilter,
    listFilter, setListFilter, selectedSlug, setSelectedSlug,
    favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
  } = useAppState()
  return (
    <div>
      <span data-testid="nav">{navView}</span>
      <span data-testid="category">{categoryFilter}</span>
      <span data-testid="filter">{listFilter}</span>
      <span data-testid="selected">{selectedSlug ?? 'none'}</span>
      <span data-testid="favorites">{[...favoriteSlugs].join(',')}</span>
      <span data-testid="terminal">{String(terminalExpanded)}</span>
      <button onClick={() => setNavView('updates')}>set-nav</button>
      <button onClick={() => setCategoryFilter('provider')}>set-category</button>
      <button onClick={() => setListFilter('installed')}>set-filter</button>
      <button onClick={() => setSelectedSlug('filesystem')}>select</button>
      <button onClick={() => toggleFavorite('filesystem')}>toggle-fav</button>
      <button onClick={() => setTerminalExpanded(true)}>expand-terminal</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AppStateProvider>
      <Probe />
    </AppStateProvider>
  )
}

test('defaults: browse nav, all category, all filter, no selection, no favorites, terminal collapsed', () => {
  renderProbe()
  expect(screen.getByTestId('nav').textContent).toBe('browse')
  expect(screen.getByTestId('category').textContent).toBe('all')
  expect(screen.getByTestId('filter').textContent).toBe('all')
  expect(screen.getByTestId('selected').textContent).toBe('none')
  expect(screen.getByTestId('favorites').textContent).toBe('')
  expect(screen.getByTestId('terminal').textContent).toBe('false')
})

test('setters update their respective fields', () => {
  renderProbe()
  fireEvent.click(screen.getByText('set-nav'))
  fireEvent.click(screen.getByText('set-category'))
  fireEvent.click(screen.getByText('set-filter'))
  fireEvent.click(screen.getByText('select'))
  fireEvent.click(screen.getByText('expand-terminal'))
  expect(screen.getByTestId('nav').textContent).toBe('updates')
  expect(screen.getByTestId('category').textContent).toBe('provider')
  expect(screen.getByTestId('filter').textContent).toBe('installed')
  expect(screen.getByTestId('selected').textContent).toBe('filesystem')
  expect(screen.getByTestId('terminal').textContent).toBe('true')
})

test('toggleFavorite adds then removes a slug', () => {
  renderProbe()
  fireEvent.click(screen.getByText('toggle-fav'))
  expect(screen.getByTestId('favorites').textContent).toBe('filesystem')
  fireEvent.click(screen.getByText('toggle-fav'))
  expect(screen.getByTestId('favorites').textContent).toBe('')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/state/__tests__/AppState.test.tsx`
Expected: FAIL — `useAppState(...)` does not return `navView`/etc (undefined reads / destructure errors).

- [ ] **Step 3: Extend `AppState.tsx`**

Replace the full contents of `apps/cli-gui/src/state/AppState.tsx` with:

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

export type Section = 'installed' | 'browse' | 'updates' | 'favorites'
export type AgentApp = 'claude' | 'codex'
export type NavView = 'browse' | 'updates'
export type CategoryFilter = 'all' | 'provider' | 'skill' | 'mcp'
export type ListFilter = 'all' | 'popular' | 'recent' | 'installed' | 'enabled' | 'disabled' | 'favorites'

interface AppStateValue {
  section: Section
  setSection: (s: Section) => void
  agentApp: AgentApp
  setAgentApp: (a: AgentApp) => void
  navView: NavView
  setNavView: (v: NavView) => void
  categoryFilter: CategoryFilter
  setCategoryFilter: (c: CategoryFilter) => void
  listFilter: ListFilter
  setListFilter: (f: ListFilter) => void
  selectedSlug: string | null
  setSelectedSlug: (slug: string | null) => void
  favoriteSlugs: Set<string>
  toggleFavorite: (slug: string) => void
  terminalExpanded: boolean
  setTerminalExpanded: (v: boolean) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('installed')
  const [agentApp, setAgentApp] = useState<AgentApp>('claude')
  const [navView, setNavView] = useState<NavView>('browse')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [terminalExpanded, setTerminalExpanded] = useState(false)

  function toggleFavorite(slug: string) {
    setFavoriteSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <AppStateContext.Provider
      value={{
        section, setSection, agentApp, setAgentApp,
        navView, setNavView, categoryFilter, setCategoryFilter,
        listFilter, setListFilter, selectedSlug, setSelectedSlug,
        favoriteSlugs, toggleFavorite, terminalExpanded, setTerminalExpanded,
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/state/__tests__/AppState.test.tsx src/components/__tests__/Sidebar.test.tsx`
Expected: PASS for both files (Sidebar still uses only `section`/`agentApp`, untouched).

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/state/AppState.tsx apps/cli-gui/src/state/__tests__/AppState.test.tsx
git commit -m "feat(cli-gui): extend AppState with nav/filter/selection/favorites/terminal fields"
```

---

### Task 5: `lib/resources.ts` — 纯过滤/合并辅助函数

**Files:**
- Create: `apps/cli-gui/src/lib/resources.ts`
- Test: `apps/cli-gui/src/lib/__tests__/resources.test.ts`

**Interfaces:**
- Consumes: `InstalledItem`, `Item`, `ItemDetail` from `@as/types`; `CategoryFilter`, `ListFilter`, `AgentApp` from `../state/AppState` (Task 4).
- Produces: `matchesCategoryFilter(category, filter)`, `matchesText(name, description, query)`, `EnrichedInstalledItem` type, `enrichInstalled(item, detail)`, `filterInstalledByListFilter(items, filter, agentApp, favoriteSlugs)`, `filterRecommendedByListFilter(items, filter, favoriteSlugs)`, `showInstalledSection(filter)`, `showRecommendedSection(filter)` — all consumed by `ResourceList.tsx` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/lib/__tests__/resources.test.ts`:

```ts
import { test, expect } from 'bun:test'
import {
  matchesCategoryFilter, matchesText, enrichInstalled,
  filterInstalledByListFilter, filterRecommendedByListFilter,
  showInstalledSection, showRecommendedSection,
} from '../resources'
import type { InstalledItem, Item, ItemDetail } from '@as/types'

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

const installedItem: InstalledItem = {
  slug: 'filesystem', category: 'mcp', version: '0.8.1',
  installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
}

const itemDetail: ItemDetail = {
  ...installedItem,
  name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
  publisher, tags: ['fs'], downloads: 388000,
}

const catalogItem: Item = {
  id: 'i1', slug: 'context7', name: 'context7', description: '文档上下文',
  readmeUrl: '', icon: '', category: 'mcp', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 118000, rating: 4.7,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  configSchema: {}, transport: 'stdio', serverCommand: './server',
}

test('matchesCategoryFilter: "all" matches everything, others match exactly', () => {
  expect(matchesCategoryFilter('mcp', 'all')).toBe(true)
  expect(matchesCategoryFilter('mcp', 'mcp')).toBe(true)
  expect(matchesCategoryFilter('mcp', 'provider')).toBe(false)
})

test('matchesText: empty query matches everything, otherwise matches name or description case-insensitively', () => {
  expect(matchesText('filesystem', '读写本地文件系统', '')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', 'FILE')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', '文件')).toBe(true)
  expect(matchesText('filesystem', '读写本地文件系统', 'nope')).toBe(false)
})

test('enrichInstalled: merges detail fields onto the installed entry with rating defaulted to 0', () => {
  const enriched = enrichInstalled(installedItem, itemDetail)
  expect(enriched.slug).toBe('filesystem')
  expect(enriched.name).toBe('filesystem')
  expect(enriched.description).toBe('读写本地文件系统')
  expect(enriched.downloads).toBe(388000)
  expect(enriched.rating).toBe(0)
  expect(enriched.enabledFor).toEqual({ claude: true, codex: false })
})

test('filterInstalledByListFilter: "enabled"/"disabled" filter by the active agent app', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'enabled', 'claude', new Set()).length).toBe(1)
  expect(filterInstalledByListFilter(enriched, 'enabled', 'codex', new Set()).length).toBe(0)
  expect(filterInstalledByListFilter(enriched, 'disabled', 'codex', new Set()).length).toBe(1)
})

test('filterInstalledByListFilter: "favorites" filters by the favorite set', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'favorites', 'claude', new Set()).length).toBe(0)
  expect(filterInstalledByListFilter(enriched, 'favorites', 'claude', new Set(['filesystem'])).length).toBe(1)
})

test('filterInstalledByListFilter: "all" and other filters pass everything through', () => {
  const enriched = [enrichInstalled(installedItem, itemDetail)]
  expect(filterInstalledByListFilter(enriched, 'all', 'claude', new Set()).length).toBe(1)
  expect(filterInstalledByListFilter(enriched, 'popular', 'claude', new Set()).length).toBe(1)
})

test('filterRecommendedByListFilter: "popular" sorts by downloads descending', () => {
  const low: Item = { ...catalogItem, slug: 'low', downloads: 10 }
  const high: Item = { ...catalogItem, slug: 'high', downloads: 999 }
  const sorted = filterRecommendedByListFilter([low, high], 'popular', new Set())
  expect(sorted.map(i => i.slug)).toEqual(['high', 'low'])
})

test('filterRecommendedByListFilter: "recent" sorts by createdAt descending', () => {
  const older: Item = { ...catalogItem, slug: 'older', createdAt: '2026-01-01T00:00:00Z' }
  const newer: Item = { ...catalogItem, slug: 'newer', createdAt: '2026-06-01T00:00:00Z' }
  const sorted = filterRecommendedByListFilter([older, newer], 'recent', new Set())
  expect(sorted.map(i => i.slug)).toEqual(['newer', 'older'])
})

test('filterRecommendedByListFilter: "favorites" filters by the favorite set', () => {
  expect(filterRecommendedByListFilter([catalogItem], 'favorites', new Set()).length).toBe(0)
  expect(filterRecommendedByListFilter([catalogItem], 'favorites', new Set(['context7'])).length).toBe(1)
})

test('showInstalledSection / showRecommendedSection: "all" shows both, status filters only show installed, discovery filters only show recommended', () => {
  expect(showInstalledSection('all')).toBe(true)
  expect(showRecommendedSection('all')).toBe(true)
  expect(showInstalledSection('enabled')).toBe(true)
  expect(showRecommendedSection('enabled')).toBe(false)
  expect(showInstalledSection('popular')).toBe(false)
  expect(showRecommendedSection('popular')).toBe(true)
  expect(showInstalledSection('favorites')).toBe(true)
  expect(showRecommendedSection('favorites')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/resources.test.ts`
Expected: FAIL — cannot find module `../resources`.

- [ ] **Step 3: Implement `resources.ts`**

Create `apps/cli-gui/src/lib/resources.ts`:

```ts
import type { InstalledItem, Item, ItemDetail } from '@as/types'
import type { AgentApp, CategoryFilter, ListFilter } from '../state/AppState'

export function matchesCategoryFilter(category: Item['category'], filter: CategoryFilter): boolean {
  return filter === 'all' || category === filter
}

export function matchesText(name: string, description: string, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return name.toLowerCase().includes(q) || description.toLowerCase().includes(q)
}

export interface EnrichedInstalledItem extends InstalledItem {
  name: string
  description: string
  publisher: ItemDetail['publisher']
  tags: string[]
  downloads: number
  rating: number
}

export function enrichInstalled(item: InstalledItem, detail: ItemDetail): EnrichedInstalledItem {
  return {
    ...item,
    name: detail.name,
    description: detail.description,
    publisher: detail.publisher,
    tags: detail.tags,
    downloads: detail.downloads,
    rating: 0,
  }
}

const INSTALLED_SECTION_FILTERS: ListFilter[] = ['all', 'installed', 'enabled', 'disabled', 'favorites']
const RECOMMENDED_SECTION_FILTERS: ListFilter[] = ['all', 'popular', 'recent', 'favorites']

export function showInstalledSection(filter: ListFilter): boolean {
  return INSTALLED_SECTION_FILTERS.includes(filter)
}

export function showRecommendedSection(filter: ListFilter): boolean {
  return RECOMMENDED_SECTION_FILTERS.includes(filter)
}

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

export function filterRecommendedByListFilter(
  items: Item[],
  filter: ListFilter,
  favoriteSlugs: Set<string>
): Item[] {
  if (filter === 'popular') return [...items].sort((a, b) => b.downloads - a.downloads)
  if (filter === 'recent') {
    return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  if (filter === 'favorites') return items.filter((i) => favoriteSlugs.has(i.slug))
  return items
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/lib/__tests__/resources.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/lib/resources.ts apps/cli-gui/src/lib/__tests__/resources.test.ts
git commit -m "feat(cli-gui): add resource list filtering/enrichment helpers"
```

---

### Task 6: `IconRail.tsx` — 左侧图标导航条

**Files:**
- Create: `apps/cli-gui/src/components/IconRail.tsx`
- Test: `apps/cli-gui/src/components/__tests__/IconRail.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` (`navView`, `setNavView`, `categoryFilter`, `setCategoryFilter`) from Task 4; `SettingsModal` (existing, unchanged).
- Produces: `IconRail` component — mounted in `App.tsx` in Task 11 (not yet mounted in this task).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/IconRail.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { IconRail } from '../IconRail'

afterEach(() => { cleanup() })

function Probe() {
  const { navView, categoryFilter } = useAppState()
  return <span data-testid="probe">{navView}:{categoryFilter}</span>
}

function renderIconRail() {
  return render(
    <AppStateProvider>
      <IconRail />
      <Probe />
    </AppStateProvider>
  )
}

test('defaults to browse nav and all category', () => {
  renderIconRail()
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking 更新 switches nav view to updates', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('更新'))
  expect(screen.getByTestId('probe').textContent).toBe('updates:all')
})

test('clicking 浏览商店 switches nav view back to browse', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('更新'))
  fireEvent.click(screen.getByLabelText('浏览商店'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking a category icon sets categoryFilter', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('供应商'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:provider')
  fireEvent.click(screen.getByLabelText('全部'))
  expect(screen.getByTestId('probe').textContent).toBe('browse:all')
})

test('clicking 设置 opens the settings modal', () => {
  renderIconRail()
  fireEvent.click(screen.getByLabelText('设置'))
  expect(screen.getByText('设置')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/IconRail.test.tsx`
Expected: FAIL — cannot find module `../IconRail`.

- [ ] **Step 3: Implement `IconRail.tsx`**

Create `apps/cli-gui/src/components/IconRail.tsx`:

```tsx
import { useState } from 'react'
import { Compass, RefreshCw, LayoutGrid, ArrowLeftRight, Sparkles, Boxes, Settings } from 'lucide-react'
import { useAppState, type CategoryFilter } from '../state/AppState'
import { SettingsModal } from './SettingsModal'

const CATEGORY_ICONS: { value: CategoryFilter; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'all', label: '全部', icon: LayoutGrid },
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

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-store-border bg-store-sidebar py-4">
      <button
        type="button"
        aria-label="浏览商店"
        onClick={() => setNavView('browse')}
        className={railButtonClass(navView === 'browse')}
      >
        <Compass size={18} />
      </button>
      <button
        type="button"
        aria-label="更新"
        onClick={() => setNavView('updates')}
        className={railButtonClass(navView === 'updates')}
      >
        <RefreshCw size={18} />
      </button>

      <div className="my-2 h-px w-8 bg-store-border" />

      {CATEGORY_ICONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          onClick={() => setCategoryFilter(value)}
          className={railButtonClass(categoryFilter === value)}
        >
          <Icon size={18} />
        </button>
      ))}

      <button
        type="button"
        aria-label="设置"
        onClick={() => setSettingsOpen(true)}
        className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-store-text-2 hover:text-store-text"
      >
        <Settings size={18} />
      </button>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/IconRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/components/IconRail.tsx apps/cli-gui/src/components/__tests__/IconRail.test.tsx
git commit -m "feat(cli-gui): add IconRail navigation component"
```

---

### Task 7: `ResourceList.tsx` — 分组列表 + 搜索/@ 过滤 + 复制供应商

**Files:**
- Create: `apps/cli-gui/src/components/ResourceList.tsx`
- Test: `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` (`agentApp`, `setAgentApp`, `categoryFilter`, `listFilter`, `setListFilter`, `selectedSlug`, `setSelectedSlug`, `favoriteSlugs`) from Task 4; `matchesCategoryFilter`, `matchesText`, `enrichInstalled`, `filterInstalledByListFilter`, `filterRecommendedByListFilter`, `showInstalledSection`, `showRecommendedSection`, `EnrichedInstalledItem` from `../lib/resources` (Task 5); `callRpc` from `../lib/rpc`; `useTerminalLog` from `../state/TerminalLog`; `ProviderEditModal` (existing, unchanged); RPC methods `list`, `info`, `search`, `install`, `uninstall`, `enable`, `disable`, `duplicateProvider` (Task 3).
- Produces: `ResourceList` component — mounted in `App.tsx` in Task 11 (not yet mounted in this task). Root element carries its own width/scroll layout (`w-80 shrink-0 ... overflow-y-auto`).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/ResourceList.test.tsx`:

```tsx
import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { ResourceList } from '../ResourceList'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

const installedList = [
  {
    slug: 'filesystem', category: 'mcp', version: '0.8.1',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  },
  {
    slug: 'yls', category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude'], enabledFor: { claude: true },
  },
]

const infoBySlug: Record<string, unknown> = {
  filesystem: {
    ...installedList[0], name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
    publisher, tags: ['fs'], downloads: 388000,
  },
  yls: {
    ...installedList[1], name: 'yls', description: 'YLS 中转端点', readmeUrl: '', icon: '',
    publisher, tags: [], downloads: 32000,
  },
}

const catalogItem = {
  id: 'i1', slug: 'context7', name: 'context7', description: '文档上下文',
  readmeUrl: '', icon: '', category: 'mcp', version: '1.0.0', publisher,
  compatibleWith: ['claude'], tags: [], downloads: 118000, rating: 4.7,
  status: 'published', installHook: { steps: [] },
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z', configSchema: {},
}

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function defaultHandlers(overrides?: Record<string, (...args: unknown[]) => unknown>) {
  return {
    list: () => installedList,
    info: (slug: unknown) => infoBySlug[slug as string],
    search: () => [catalogItem],
    ...overrides,
  }
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

async function renderList(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc(defaultHandlers(handlers))
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <ResourceList />
        <TerminalProbe />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('renders installed and recommended groups', async () => {
  await renderList()
  await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
  expect(screen.getByText('yls')).toBeInTheDocument()
  expect(screen.getByText('context7')).toBeInTheDocument()
  expect(screen.getByText('已安装')).toBeInTheDocument()
  expect(screen.getByText('推荐')).toBeInTheDocument()
})

test('typing @ opens the filter token menu; selecting @installed hides the recommended group', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: '@' } })
  fireEvent.click(screen.getByText('@installed · 已安装'))
  expect(screen.queryByText('context7')).not.toBeInTheDocument()
  expect(screen.getByText('filesystem')).toBeInTheDocument()
})

test('plain text filters both groups by name', async () => {
  await renderList()
  await waitFor(() => screen.getByText('context7'))
  fireEvent.change(screen.getByPlaceholderText('搜索，或用 @ 过滤…'), { target: { value: 'context' } })
  expect(screen.queryByText('filesystem')).not.toBeInTheDocument()
  expect(screen.getByText('context7')).toBeInTheDocument()
})

test('clicking 安装 on a recommended item calls install and refreshes', async () => {
  const install = mock(() => ({ version: '1.0.0' }))
  await renderList({ install })
  await waitFor(() => screen.getByText('context7'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('context7'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('clicking 卸载 on an installed item calls uninstall', async () => {
  const uninstall = mock(() => undefined)
  await renderList({ uninstall })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getAllByText('卸载')[0])
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('filesystem'))
})

test('toggling enable for the active agent app calls enable/disable', async () => {
  const disable = mock(() => undefined)
  await renderList({ disable })
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByLabelText('为 claude 禁用 filesystem'))
  await waitFor(() => expect(disable).toHaveBeenCalledWith('filesystem', 'claude'))
})

test('clicking 复制 on a provider row calls duplicateProvider and logs the new slug', async () => {
  const duplicateProvider = mock(() => ({ newSlug: 'yls-copy' }))
  await renderList({ duplicateProvider })
  await waitFor(() => screen.getByText('yls'))
  fireEvent.click(screen.getByText('复制'))
  await waitFor(() => expect(duplicateProvider).toHaveBeenCalledWith('yls'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('复制 is not shown for non-provider installed items', async () => {
  await renderList()
  await waitFor(() => screen.getByText('filesystem'))
  const filesystemRow = screen.getByText('filesystem').closest('div')
  expect(filesystemRow?.parentElement?.textContent).not.toContain('复制')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ResourceList.test.tsx`
Expected: FAIL — cannot find module `../ResourceList`.

- [ ] **Step 3: Implement `ResourceList.tsx`**

Create `apps/cli-gui/src/components/ResourceList.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Item, InstalledItem, ItemDetail } from '@as/types'
import { Search } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState, type ListFilter } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { ProviderEditModal } from './ProviderEditModal'
import {
  matchesCategoryFilter, matchesText, enrichInstalled, filterInstalledByListFilter,
  filterRecommendedByListFilter, showInstalledSection, showRecommendedSection,
  type EnrichedInstalledItem,
} from '../lib/resources'

const FILTER_TOKENS: { key: Exclude<ListFilter, 'all'>; label: string }[] = [
  { key: 'popular', label: '最热门' },
  { key: 'recent', label: '最近发布' },
  { key: 'installed', label: '已安装' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已禁用' },
  { key: 'favorites', label: '收藏' },
]

export function ResourceList() {
  const {
    agentApp, setAgentApp, categoryFilter, listFilter, setListFilter,
    selectedSlug, setSelectedSlug, favoriteSlugs,
  } = useAppState()
  const { appendLine } = useTerminalLog()
  const [installed, setInstalled] = useState<EnrichedInstalledItem[]>([])
  const [catalog, setCatalog] = useState<Item[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  async function refreshInstalled() {
    const result = await callRpc<InstalledItem[]>('list')
    const details = await Promise.all(result.map((item) => callRpc<ItemDetail>('info', [item.slug])))
    setInstalled(result.map((item, i) => enrichInstalled(item, details[i])))
  }

  async function refreshCatalog() {
    setCatalog(await callRpc<Item[]>('search', ['']))
  }

  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const installedSlugs = useMemo(() => new Set(installed.map((i) => i.slug)), [installed])

  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        installed.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        favoriteSlugs
      ),
    [installed, categoryFilter, textQuery, listFilter, agentApp, favoriteSlugs]
  )

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

  const visibleRecommended = useMemo(
    () => filterRecommendedByListFilter(recommendedBase, listFilter, favoriteSlugs),
    [recommendedBase, listFilter, favoriteSlugs]
  )

  function handleSearchInput(value: string) {
    if (value.startsWith('@')) {
      setTokenMenuOpen(true)
      return
    }
    setTokenMenuOpen(false)
    setTextQuery(value)
    if (listFilter !== 'all') setListFilter('all')
  }

  function selectToken(key: Exclude<ListFilter, 'all'>) {
    setListFilter(key)
    setTextQuery('')
    setTokenMenuOpen(false)
  }

  function clearSearch() {
    setTextQuery('')
    setListFilter('all')
    setTokenMenuOpen(false)
  }

  async function toggleEnabled(item: EnrichedInstalledItem) {
    const isEnabled = !!item.enabledFor[agentApp]
    appendLine(`$ aas ${isEnabled ? 'disable' : 'enable'} ${item.slug} --for ${agentApp}`)
    try {
      await callRpc(isEnabled ? 'disable' : 'enable', [item.slug, agentApp])
      appendLine(`✓ ${item.slug} ${isEnabled ? '已禁用' : '已启用'} (${agentApp})`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refreshInstalled()
  }

  async function uninstall(item: EnrichedInstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ 已卸载 ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    if (selectedSlug === item.slug) setSelectedSlug(null)
    refreshInstalled()
  }

  async function install(item: Item) {
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ 已安装 ${item.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refreshInstalled()
  }

  async function duplicateProvider(item: EnrichedInstalledItem) {
    appendLine(`$ aas duplicate ${item.slug}`)
    try {
      const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
      appendLine(`✓ 已复制 ${item.slug} → ${result.newSlug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refreshInstalled()
  }

  const searchValue = listFilter === 'all' ? textQuery : `@${listFilter}`

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-store-border p-4">
      <div className="flex gap-1 rounded-lg border border-store-border bg-store-panel p-1 text-xs">
        <button
          type="button"
          onClick={() => setAgentApp('claude')}
          className={`flex-1 rounded-md px-2 py-1.5 ${agentApp === 'claude' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
        >
          Claude Code
        </button>
        <button
          type="button"
          onClick={() => setAgentApp('codex')}
          className={`flex-1 rounded-md px-2 py-1.5 ${agentApp === 'codex' ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'}`}
        >
          Codex
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-store-text-3" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="搜索，或用 @ 过滤…"
          className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-8 pr-8 text-sm text-store-text"
        />
        {(textQuery !== '' || listFilter !== 'all') && (
          <button
            type="button"
            aria-label="清除"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-store-text-3 hover:text-store-text"
          >
            ×
          </button>
        )}
        {tokenMenuOpen && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-store-border bg-store-content p-1 shadow-lg">
            {FILTER_TOKENS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectToken(t.key)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-store-text hover:bg-store-panel-2"
              >
                @{t.key} · {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showInstalledSection(listFilter) && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-store-text-2">
            已安装 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleInstalled.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleInstalled.map((item) => {
              const enabled = !!item.enabledFor[agentApp]
              return (
                <div
                  key={item.slug}
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`cursor-pointer rounded-lg border px-3 py-2 ${
                    selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-store-text">{item.name}</p>
                      <p className="text-xs text-store-text-3">
                        {item.publisher.name} · {item.category}
                      </p>
                    </div>
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
                      <button
                        type="button"
                        onClick={() => uninstall(item)}
                        className="text-xs text-store-red hover:opacity-80"
                      >
                        卸载
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showRecommendedSection(listFilter) && (
        <div>
          <p className="mb-2 text-xs font-medium text-store-text-2">
            推荐 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleRecommended.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleRecommended.map((item) => (
              <div
                key={item.slug}
                onClick={() => setSelectedSlug(item.slug)}
                className={`cursor-pointer rounded-lg border px-3 py-2 ${
                  selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-store-text">{item.name}</p>
                    <p className="text-xs text-store-text-3">
                      ★ {item.rating} · ↓ {item.downloads}
                    </p>
                  </div>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingSlug && (
        <ProviderEditModal slug={editingSlug} open onOpenChange={(open) => { if (!open) setEditingSlug(null) }} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/ResourceList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/components/ResourceList.tsx apps/cli-gui/src/components/__tests__/ResourceList.test.tsx
git commit -m "feat(cli-gui): add ResourceList with grouped installed/recommended views"
```

---

### Task 8: `useSelectedDetail` hook + `DetailPanel.tsx`

**Files:**
- Create: `apps/cli-gui/src/lib/useSelectedDetail.ts`
- Create: `apps/cli-gui/src/components/DetailPanel.tsx`
- Test: `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` (`selectedSlug`, `favoriteSlugs`, `toggleFavorite`) from Task 4; `callRpc` from `../lib/rpc`; `useTerminalLog` from `../state/TerminalLog`.
- Produces: `SelectedDetail = (ItemDetail & { installed: true }) | (Item & { installed: false })` and `useSelectedDetail(): SelectedDetail | null` from `lib/useSelectedDetail.ts` — reused by `InfoSidebar.tsx` in Task 9. `DetailPanel` component — mounted in `App.tsx` in Task 11 (not yet mounted in this task).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx`:

```tsx
import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { DetailPanel } from '../DetailPanel'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function renderPanel(slug = 'filesystem') {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Select slug={slug} />
        <DetailPanel />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('shows the empty state with no selection', () => {
  renderPanel()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
})

test('shows an installed item detail from the info RPC', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
      name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
      publisher, tags: ['fs'], downloads: 388000,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
  expect(screen.getByText('✓ 已安装')).toBeInTheDocument()
})

test('shows an install button for a not-yet-installed item and installs it', async () => {
  const install = mock(() => ({ version: '1.0.0' }))
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
      readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
    install,
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('安装'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('filesystem'))
})

test('switching to the 评价 tab shows the empty state', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByText('评价'))
  expect(screen.getByText('暂无评价')).toBeInTheDocument()
})

test('switching to the 版本 tab shows the current version', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByText('版本'))
  expect(screen.getByText('当前版本：v0.8.1')).toBeInTheDocument()
})

test('clicking the heart button toggles favorite state', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByLabelText('收藏'))
  fireEvent.click(screen.getByLabelText('收藏'))
  expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/DetailPanel.test.tsx`
Expected: FAIL — cannot find module `../DetailPanel`.

- [ ] **Step 3: Implement `useSelectedDetail.ts`**

Create `apps/cli-gui/src/lib/useSelectedDetail.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Item, ItemDetail } from '@as/types'
import { callRpc } from './rpc'
import { useAppState } from '../state/AppState'

export type SelectedDetail = (ItemDetail & { installed: true }) | (Item & { installed: false })

export function useSelectedDetail(): SelectedDetail | null {
  const { selectedSlug } = useAppState()
  const [detail, setDetail] = useState<SelectedDetail | null>(null)

  useEffect(() => {
    if (!selectedSlug) {
      setDetail(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const info = await callRpc<ItemDetail>('info', [selectedSlug])
        if (!cancelled) setDetail({ ...info, installed: true })
      } catch {
        const items = await callRpc<Item[]>('search', [''])
        const found = items.find((i) => i.slug === selectedSlug)
        if (!cancelled) setDetail(found ? { ...found, installed: false } : null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedSlug])

  return detail
}
```

- [ ] **Step 4: Implement `DetailPanel.tsx`**

Create `apps/cli-gui/src/components/DetailPanel.tsx`:

```tsx
import { useState } from 'react'
import { Heart } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useSelectedDetail } from '../lib/useSelectedDetail'

const CATEGORY_LABEL: Record<string, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

const USE_CASE_COPY: Record<string, string> = {
  provider: '安装后作为可切换的 API 端点预设，一键切换即可对全部会话生效。',
  skill: '安装后 agent 会在相关任务中自动加载该技能，无需额外配置。',
  mcp: '安装后自动注册为 MCP 服务器，agent 可直接调用其暴露的工具。',
}

type Tab = 'overview' | 'reviews' | 'versions'

export function DetailPanel() {
  const { favoriteSlugs, toggleFavorite } = useAppState()
  const { appendLine } = useTerminalLog()
  const detail = useSelectedDetail()
  const [tab, setTab] = useState<Tab>('overview')

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-store-text-2">
        从左侧选择一个资源查看详情
      </div>
    )
  }

  async function install() {
    if (!detail || detail.installed) return
    appendLine(`$ aas install ${detail.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [detail.slug])
      appendLine(`✓ 已安装 ${detail.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
  }

  const isFavorite = favoriteSlugs.has(detail.slug)
  const rating = 'rating' in detail ? detail.rating : 0

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-store-panel-2" />
        <div>
          <h2 className="text-lg font-semibold text-store-text">{detail.name}</h2>
          <p className="text-xs text-store-text-2">
            {detail.publisher.name} · ↓ {detail.downloads} · ★ {rating} · {CATEGORY_LABEL[detail.category]}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-store-text-2">{detail.description}</p>

      <div className="mt-3 flex items-center gap-2">
        {detail.installed ? (
          <span className="rounded-lg border border-store-green px-3 py-1.5 text-xs font-medium text-store-green">
            ✓ 已安装
          </span>
        ) : (
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            安装
          </button>
        )}
        <button
          type="button"
          aria-label={isFavorite ? '取消收藏' : '收藏'}
          onClick={() => toggleFavorite(detail.slug)}
          className={`rounded-lg border px-2 py-1.5 ${
            isFavorite ? 'border-store-red text-store-red' : 'border-store-border text-store-text-2'
          }`}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="mt-4 rounded-lg bg-black px-3 py-2 font-mono text-xs text-store-text-2">
        $ agent-store add {detail.slug}
      </div>

      <div className="mt-4 flex gap-4 border-b border-store-border text-sm">
        {(
          [
            { key: 'overview', label: '概览' },
            { key: 'reviews', label: '评价' },
            { key: 'versions', label: '版本' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pb-2 ${tab === t.key ? 'border-b-2 border-store-accent text-store-text' : 'text-store-text-2'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h3 className="mb-1 text-sm font-medium text-store-text">概述</h3>
            <p className="text-sm text-store-text-2">{detail.description}</p>
          </div>
          {'installHook' in detail && detail.installHook.steps.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-store-text">安装步骤</h3>
              <ul className="flex flex-col gap-1 text-sm text-store-text-2">
                {detail.installHook.steps.map((step, i) => (
                  <li key={i}>
                    ▹{' '}
                    {step.type === 'script'
                      ? `script · ${step.command}`
                      : step.type === 'config'
                        ? 'config · 写入配置'
                        : `file · ${step.dest}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-sm font-medium text-store-text">适用场景</h3>
            <p className="text-sm text-store-text-2">{USE_CASE_COPY[detail.category]}</p>
          </div>
        </div>
      )}

      {tab === 'reviews' && <p className="mt-4 text-sm text-store-text-2">暂无评价</p>}

      {tab === 'versions' && (
        <p className="mt-4 text-sm text-store-text-2">当前版本：v{detail.version}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/DetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/lib/useSelectedDetail.ts apps/cli-gui/src/components/DetailPanel.tsx apps/cli-gui/src/components/__tests__/DetailPanel.test.tsx
git commit -m "feat(cli-gui): add DetailPanel with overview/reviews/versions tabs"
```

---

### Task 9: `InfoSidebar.tsx` — 右侧信息栏

**Files:**
- Create: `apps/cli-gui/src/components/InfoSidebar.tsx`
- Test: `apps/cli-gui/src/components/__tests__/InfoSidebar.test.tsx`

**Interfaces:**
- Consumes: `useSelectedDetail()` from `../lib/useSelectedDetail` (Task 8).
- Produces: `InfoSidebar` component — mounted in `App.tsx` in Task 11 (not yet mounted in this task).

- [ ] **Step 1: Write the failing test**

Create `apps/cli-gui/src/components/__tests__/InfoSidebar.test.tsx`:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import * as rpcModule from '../../lib/rpc'
import { InfoSidebar } from '../InfoSidebar'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function renderSidebar() {
  return render(
    <AppStateProvider>
      <Select slug="filesystem" />
      <InfoSidebar />
    </AppStateProvider>
  )
}

test('renders nothing but the frame with no selection', () => {
  const { container } = renderSidebar()
  expect(container.querySelector('h3')).toBeNull()
})

test('shows install info, tags and resource links for an installed item', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: 'https://docs.example.com', icon: '',
      publisher, tags: ['fs', 'io'], downloads: 388000,
    }),
  })
  renderSidebar()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('安装信息')).toBeInTheDocument())
  expect(screen.getByText('filesystem')).toBeInTheDocument()
  expect(screen.getByText('v0.8.1')).toBeInTheDocument()
  expect(screen.getByText('fs')).toBeInTheDocument()
  expect(screen.getByText('io')).toBeInTheDocument()
  expect(screen.getByText('官网 / 文档')).toBeInTheDocument()
  expect(screen.queryByText('市场')).not.toBeInTheDocument()
})

test('shows the 市场 section (published/updated) for a not-yet-installed catalog item', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: 'desc',
      readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
      configSchema: {},
    }],
  })
  renderSidebar()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('市场')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/InfoSidebar.test.tsx`
Expected: FAIL — cannot find module `../InfoSidebar`.

- [ ] **Step 3: Implement `InfoSidebar.tsx`**

Create `apps/cli-gui/src/components/InfoSidebar.tsx`:

```tsx
import { ExternalLink } from 'lucide-react'
import { useSelectedDetail } from '../lib/useSelectedDetail'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-store-text-3">{label}</dt>
      <dd className="text-store-text">{value}</dd>
    </div>
  )
}

export function InfoSidebar() {
  const detail = useSelectedDetail()

  if (!detail) {
    return <aside className="w-64 shrink-0 border-l border-store-border bg-store-sidebar" />
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-l border-store-border bg-store-sidebar p-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold text-store-text-2">安装信息</h3>
        <dl className="flex flex-col gap-1 text-xs">
          <Row label="标识" value={detail.slug} />
          <Row label="版本" value={`v${detail.version}`} />
          {detail.installed && (
            <Row label="更新时间" value={new Date(detail.updatedAt).toLocaleDateString()} />
          )}
        </dl>
      </div>

      {!detail.installed && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">市场</h3>
          <dl className="flex flex-col gap-1 text-xs">
            <Row label="发布" value={new Date(detail.createdAt).toLocaleDateString()} />
            <Row label="最近发布" value={new Date(detail.updatedAt).toLocaleDateString()} />
          </dl>
        </div>
      )}

      {detail.tags.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">分类</h3>
          <div className="flex flex-wrap gap-1">
            {detail.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-store-panel-2 px-2 py-0.5 text-xs text-store-text-2">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {detail.readmeUrl && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-store-text-2">资源</h3>
          <a
            href={detail.readmeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-store-accent hover:underline"
          >
            <ExternalLink size={12} /> 官网 / 文档
          </a>
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/InfoSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

```bash
git add apps/cli-gui/src/components/InfoSidebar.tsx apps/cli-gui/src/components/__tests__/InfoSidebar.test.tsx
git commit -m "feat(cli-gui): add InfoSidebar with install/market/tags/resource sections"
```

---

### Task 10: 终端面板折叠/展开

**Files:**
- Modify: `apps/cli-gui/src/components/TerminalPane.tsx`
- Modify: `apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx`

**Interfaces:**
- Consumes: `useAppState()` (`terminalExpanded`, `setTerminalExpanded`) from Task 4; `useTerminalLog()` (existing, unchanged).
- Produces: `TerminalPane` now requires an `AppStateProvider` ancestor (breaking change to its test setup only — `App.tsx` already wraps both providers, updated for real in Task 11).

- [ ] **Step 1: Update the failing test**

Replace the full contents of `apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { AppStateProvider } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'
import { TerminalPane } from '../TerminalPane'

afterEach(() => { cleanup() })

function Seed({ children }: { children: React.ReactNode }) {
  const { appendLine } = useTerminalLog()
  useEffect(() => {
    appendLine('$ aas install openai-provider')
    appendLine('✓ 已安装 openai-provider 1.2.0', 'green')
  }, [])
  return <>{children}</>
}

function renderPane() {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Seed>
          <TerminalPane />
        </Seed>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('collapsed by default: log lines are not rendered', () => {
  renderPane()
  expect(screen.queryByText('$ aas install openai-provider')).not.toBeInTheDocument()
})

test('expanding shows all appended lines', () => {
  renderPane()
  fireEvent.click(screen.getByLabelText('展开终端'))
  expect(screen.getByText('$ aas install openai-provider')).toBeInTheDocument()
  expect(screen.getByText('✓ 已安装 openai-provider 1.2.0')).toBeInTheDocument()
})

test('collapsing hides the lines again', () => {
  renderPane()
  fireEvent.click(screen.getByLabelText('展开终端'))
  fireEvent.click(screen.getByLabelText('收起终端'))
  expect(screen.queryByText('$ aas install openai-provider')).not.toBeInTheDocument()
})

test('renders an empty pane with no lines when expanded', () => {
  const { container } = render(
    <AppStateProvider>
      <TerminalLogProvider>
        <TerminalPane />
      </TerminalLogProvider>
    </AppStateProvider>
  )
  fireEvent.click(screen.getByLabelText('展开终端'))
  expect(container.querySelectorAll('[data-terminal-line]')).toHaveLength(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/cli-gui && bun test src/components/__tests__/TerminalPane.test.tsx`
Expected: FAIL — `useAppState must be used within AppStateProvider` (component doesn't call it yet) or missing `展开终端` label.

- [ ] **Step 3: Implement the collapse toggle**

Replace the full contents of `apps/cli-gui/src/components/TerminalPane.tsx`:

```tsx
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useAppState } from '../state/AppState'
import { useTerminalLog, type LineColor } from '../state/TerminalLog'

const COLOR_CLASS: Record<LineColor, string> = {
  default: 'text-store-text-2',
  green: 'text-store-green',
  red: 'text-store-red',
}

export function TerminalPane() {
  const { lines } = useTerminalLog()
  const { terminalExpanded, setTerminalExpanded } = useAppState()

  return (
    <div className="shrink-0 border-t border-store-border bg-black">
      <button
        type="button"
        aria-label={terminalExpanded ? '收起终端' : '展开终端'}
        onClick={() => setTerminalExpanded(!terminalExpanded)}
        className="flex w-full items-center justify-between px-3 py-1.5 font-mono text-xs text-store-text-2 hover:text-store-text"
      >
        终端
        {terminalExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {terminalExpanded && (
        <div className="h-40 overflow-y-auto px-3 pb-3 font-mono text-xs">
          {lines.map((line, i) => (
            <div key={i} data-terminal-line className={COLOR_CLASS[line.color]}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/cli-gui && bun test src/components/__tests__/TerminalPane.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors (note: `App.tsx` still renders `<TerminalPane />` inside both `AppStateProvider` and `TerminalLogProvider`, so the app itself still compiles and runs — only this component's own test file needed the new wrapper).

```bash
git add apps/cli-gui/src/components/TerminalPane.tsx apps/cli-gui/src/components/__tests__/TerminalPane.test.tsx
git commit -m "feat(cli-gui): collapse TerminalPane by default with expand/collapse toggle"
```

---

### Task 11: 组装新布局，移除旧组件，最终自测

**Files:**
- Modify: `apps/cli-gui/src/App.tsx`
- Modify: `apps/cli-gui/src/state/AppState.tsx` (remove `section`/`setSection`)
- Delete: `apps/cli-gui/src/components/Sidebar.tsx`
- Delete: `apps/cli-gui/src/components/InstalledList.tsx`
- Delete: `apps/cli-gui/src/components/BrowseList.tsx`
- Delete: `apps/cli-gui/src/components/__tests__/Sidebar.test.tsx`
- Delete: `apps/cli-gui/src/components/__tests__/InstalledList.test.tsx`
- Delete: `apps/cli-gui/src/components/__tests__/BrowseList.test.tsx`
- Modify: `apps/cli-gui/src/state/__tests__/AppState.test.tsx` (remove `section` assertions)
- Test: `apps/cli-gui/src/__tests__/App.test.tsx` (new file)

**Interfaces:**
- Consumes: `IconRail` (Task 6), `ResourceList` (Task 7), `DetailPanel` (Task 8), `InfoSidebar` (Task 9), `TerminalPane` (Task 10) — all as default layout children of `App.tsx`.

- [ ] **Step 1: Remove `section` from `AppState.tsx`**

In `apps/cli-gui/src/state/AppState.tsx`, delete the `Section` type export, and remove `section`/`setSection` from both the `AppStateValue` interface and the `AppStateProvider` implementation (the `useState<Section>('installed')` line, and the two `section`/`setSection` entries in the returned object literal). The rest of the file (added in Task 4) stays as-is.

- [ ] **Step 2: Update `AppState.test.tsx` to drop `section`**

In `apps/cli-gui/src/state/__tests__/AppState.test.tsx`, remove `section` from the `Probe` component's destructuring and JSX, and delete any assertion lines referencing `section` (there are none beyond the destructure — the file added in Task 4 never asserted on `section`, only on the new fields).

- [ ] **Step 3: Delete the obsolete components and their tests**

```bash
git rm apps/cli-gui/src/components/Sidebar.tsx apps/cli-gui/src/components/InstalledList.tsx apps/cli-gui/src/components/BrowseList.tsx
git rm apps/cli-gui/src/components/__tests__/Sidebar.test.tsx apps/cli-gui/src/components/__tests__/InstalledList.test.tsx apps/cli-gui/src/components/__tests__/BrowseList.test.tsx
```

- [ ] **Step 4: Rewrite `App.tsx`**

Replace the full contents of `apps/cli-gui/src/App.tsx`:

```tsx
import { AppStateProvider } from './state/AppState'
import { TerminalLogProvider } from './state/TerminalLog'
import { TitleBar } from './components/TitleBar'
import { IconRail } from './components/IconRail'
import { ResourceList } from './components/ResourceList'
import { DetailPanel } from './components/DetailPanel'
import { InfoSidebar } from './components/InfoSidebar'
import { TerminalPane } from './components/TerminalPane'

export function App() {
  return (
    <AppStateProvider>
      <TerminalLogProvider>
        <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-store-border-strong bg-store-win text-store-text">
          <TitleBar />
          <div className="flex flex-1 overflow-hidden">
            <IconRail />
            <ResourceList />
            <DetailPanel />
            <InfoSidebar />
          </div>
          <TerminalPane />
        </div>
      </TerminalLogProvider>
    </AppStateProvider>
  )
}
```

- [ ] **Step 5: Write the App smoke test**

Create `apps/cli-gui/src/__tests__/App.test.tsx`:

```tsx
import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../lib/rpc'
import { App } from '../App'

afterEach(() => { cleanup(); mock.restore() })

test('renders the icon rail, resource list, empty detail state, and collapsed terminal', async () => {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'search') return []
    throw new Error(`unexpected RPC in smoke test: ${method}`)
  }) as typeof rpcModule.callRpc)

  render(<App />)

  expect(screen.getByLabelText('浏览商店')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('搜索，或用 @ 过滤…')).toBeInTheDocument()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
  expect(screen.getByLabelText('展开终端')).toBeInTheDocument()
  expect(screen.queryByText('浏览')).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/cli-gui && bun test`
Expected: PASS — every test file in `apps/cli-gui/src` (including this new `App.test.tsx`) is green, and the deleted files' tests no longer run.

- [ ] **Step 7: Type-check**

Run: `cd apps/cli-gui && bun run type-check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/cli-gui/src/App.tsx apps/cli-gui/src/state/AppState.tsx apps/cli-gui/src/state/__tests__/AppState.test.tsx apps/cli-gui/src/__tests__/App.test.tsx
git commit -m "feat(cli-gui): wire IconRail/ResourceList/DetailPanel/InfoSidebar into App, remove tab-based layout"
```

- [ ] **Step 9: Mandatory manual self-test (required by the design goal — not optional)**

This is the "完整实现、不打折" acceptance step. Run it yourself in a browser, not just via automated tests:

```bash
make dev-gui
```

Walk through, in the running window:
1. 分类图标切换（全部/供应商/技能/MCP）过滤已安装与推荐列表。
2. 在搜索框输入 `@` 弹出过滤 token 菜单，选择 `@installed`/`@enabled`/`@disabled`/`@favorites` 后列表按预期变化；清除按钮能重置回全部。
3. 点击已安装项与推荐项都能在中间打开详情面板，右侧信息栏同步显示；三个 tab（概览/评价/版本）都能点击切换。
4. 点击详情面板的心形按钮收藏/取消收藏，点击供应商行的「复制」按钮后已安装分组出现新的 `{slug}-copy` 条目且默认未启用。
5. 底部终端面板默认折叠，点击后展开显示安装/卸载/启用/禁用/复制的操作日志，再次点击收起。

若发现任何一项与设计稿不符或行为异常，记录下来按 Fix-to-Code Protocol 修复并回写到对应任务的源文件，而不是手动改完就结束。全部核对通过后再进入收尾流程（superpowers:finishing-a-development-branch）。
