# CLI 客户端完整对齐设计稿 Design

**Goal:** 把 `apps/cli-gui` 对齐到 `docs/ui/Agent Store.dc.html`「CLI 客户端」的完整设计——不只是列表/详情页，还包括此前遗漏的仪表盘（概览）、内置 `local` 供应商（多监听端口 + 按优先级降级路由）、更丰富的供应商编辑表单、以及代理请求日志。

## 背景

深入通读设计稿源码（`docs/ui/Agent Store.dc.html` 全文 2256 行）后发现，此前的 GUI 对齐工作只覆盖了设计稿里"点击分类图标浏览资源"这一条路径，遗漏了设计稿的默认首页——一个完整的仪表盘（消耗趋势图、供应商/技能/MCP 计数、本地代理运行状态、最近请求、可更新列表），以及一个把"本地代理"本身建模成"内置 Provider"的完整子系统（支持多个命名的监听端口、每个上游供应商有优先级分组、失败自动降级）。这与之前跟你确认过的"local provider 抽象"「功能 A/B」是同一件事——**设计稿里已经把这两个功能的完整交互设计出来了**，不需要再单独 brainstorming 从零设计，直接照设计稿实现即可。

同时发现设计稿本身有几处"画出来了但没接线"的死代码（详见下方"忠实复刻 vs 修正"）：显式保存按钮未接入校验逻辑（全靠自动保存，未校验必填项）、代理请求日志弹窗没有真实入口、"CLI 覆盖"高级设置只有占位注释没有内容。这些不是产品意图的一部分，是设计稿本身未完工的部分。

## 范围决策

### 忠实复刻 vs 修正（逐项裁定）

- **自动保存无校验 + 显式保存路径未接线**：修正。真实软件里"必填项校验"不能完全绕过，我们会保留自动保存（体验一致），但把 `saveCliEdit` 的校验逻辑接回真实触发点——保存前校验 `targets`（至少一个）和 `apiKey`（非空），校验失败时用设计稿已经画好的红色错误态展示，不阻塞自动保存本身对已填字段的持久化。
- **代理请求日志弹窗没有真实入口**：修正。仪表盘"最近请求"卡片的"查看全部"、以及 local 供应商详情面板，都会接上打开这个弹窗的入口（设计稿画好了弹窗 UI，只是漏连按钮）。
- **"CLI 配置覆盖" 高级设置**：不做。设计稿里这块只有一行占位注释，从未设计出具体字段，本次不臆造内容，按"不做的事"处理。
- **"local" 内置供应商固定端口 18100**：改为可配置，不强行对齐这个具体数字。我们现有 relay 默认端口是 18780，已经在其他功能（Provider Local Relay）里跑通并写入过安装文档；改成 18100 只是外观数字对齐，没有用户可见价值，反而有改错现有测试/文档的风险。默认配置沿用 18780，用户可在"本地代理"里新增/修改端口。
- **"最近请求"/"消耗趋势"里的数字**：改为真实数据。设计稿里这些是硬编码假数字（`$0.01`、`1,284` 等），我们已经有单独批准的用量统计 spec（`docs/superpowers/specs/2026-07-05-usage-cost-tracking-design.md`），仪表盘直接读那套真实数据，不搬硬编码假数字过来。
- **"可更新" 列表**：改为真实数据源。设计稿把"更新"塞进 `listFilter=updates`（对已加载的已安装列表按版本比对过滤），不是单独的导航目的地或单独 RPC——**这与我们当前实现不一致，需要改正**：当前 `apps/cli-gui` 把"更新"做成了 IconRail 上的独立导航项、单独调 `checkUpdates` RPC。按设计稿改回："更新"不再是 IconRail 图标，改为 `listFilter` 的一个值（复用已有的 `@` 过滤 token 菜单），点击某一行的"更新"按钮仍然调用真实的 `update(slug)` RPC，只是入口位置调整为符合设计稿。

### 不做的事（YAGNI）

- 不做"CLI 配置覆盖"高级设置区块（设计稿本身没设计出内容）。
- 不做完整的熔断器状态机（Closed/Open/HalfOpen，cc-switch 的实现）——按设计稿文案"失败自动降级"实现最简单版本：某优先级的供应商请求失败（超时或 5xx）时，直接尝试下一优先级，不做失败计数窗口/半开探测这类复杂状态管理。这是本次故意的范围裁剪，如果后续发现某个供应商频繁抖动导致体验差，再单独加熔断器是清晰的后续任务。
- 不做 i18n（设计稿的英文翻译层是这个 mockup 自己的实现细节，我们的 GUI 本来就是纯中文，不需要迁移这层）。
- 不做 Overview 卡片里从未渲染的死字段（`appRows`、`errorCount` 等）。

## 架构

这次改动分四块，按依赖顺序实现：**(1) 供应商多级优先级路由引擎 → (2) 本地代理多端口管理 → (3) 供应商编辑表单重构 → (4) 仪表盘/概览页 + 代理请求日志弹窗**。仪表盘依赖用量统计（已有独立 spec，需要先出 plan 并实现）和优先级路由的"最近请求"数据。

### 1. 供应商多级优先级路由引擎

**现状**：`apps/client-core/src/engine.ts` 的 `enable(slug, target)` 是互斥的——启用一个供应商会自动禁用同 target 下其他已启用的供应商，`relay/server.ts` 的 `findActiveProviderForTarget` 只找唯一一个 `enabledFor[target] === true` 的条目。

**改动**：
- `packages/types` 的 `InstalledItem`（以及 provider 专属的本地 `config.json`）新增 `level?: number`（1-10，默认 1，数字越小优先级越高，对应设计稿"优先级分组"）。
- `engine.enable(slug, target)` **去掉互斥逻辑**——允许同一 target 下多个 provider 同时 `enabledFor[target] = true`，只要求它们不共享同一个 `level`？不，设计稿允许同 level 也可以有多个（未强制唯一），去掉这条限制，多个 provider 可以同时启用，按 level 分组排序。
- `relay/server.ts` 新增 `findOrderedProvidersForTarget(registry, target)`：返回所有 `enabledFor[target] === true` 的 provider，按 `level` 升序排序（同 level 内保持注册顺序，不做轮询，YAGNI）。
- `relay/forward.ts` 新增 `forwardWithFailover(path, body, orderedTargets, fetchImpl)`：依次尝试每个 provider 的连接信息转发请求，命中以下条件视为失败并尝试下一个：网络异常/超时、HTTP 5xx；其余状态码（包括 4xx）直接返回，不切换供应商（避免把用户自己的请求错误误判为供应商故障）。全部尝试失败后返回最后一次的响应。
- 每次实际发生"降级"（用的不是第一个候选）都要产出一条可供仪表盘/日志使用的记录：`{ target, model, providerSlug, fallback: boolean, latencyMs, statusCode, timestamp }`。这条记录复用用量统计已经设计的 `request_logs` 表（新增 `is_fallback` 列），不重复建表。

### 2. 本地代理多端口管理

**现状**：`startRelayServer({ aasHome, port })` 只支持单一固定端口（默认 `RELAY_PORT=18780`），由 CLI 的 `__relay-daemon` 隐藏子命令启动一个实例。

**改动**：
- 新增 `apps/client-core/src/relay/local-configs.ts`：管理 `{aasHome}/relay-configs.json`（`Array<{ id, name, port, enabled }>`），默认种子一条 `{ id: 'default', name: '默认', port: 18780, enabled: true }`。提供 `listLocalConfigs`/`addLocalConfig`（自动找下一个空闲端口，从种子端口起每次 +100）/`removeLocalConfig`（至少保留一条，不允许删空）/`updateLocalConfig`（改名字/端口）/`setLocalConfigEnabled`。
- daemon 进程（`apps/cli/src/index.ts` 的 `__relay-daemon`）改为读取 `relay-configs.json`，为每条 `enabled: true` 的配置各起一个 `Bun.serve` 实例（复用同一套路由/转发逻辑，只是监听端口不同）。新增/删除/启停配置时通过现有 RPC 通知 daemon 重启对应端口（简单做法：daemon 每隔几秒重新读取一次配置文件并对比差异，增/删/改对应的 serve 实例——不引入进程间信号机制）。
- CLI/RPC 新增：`listLocalConfigs`、`addLocalConfig`、`removeLocalConfig`、`updateLocalConfig(id, {name?, port?})`、`toggleLocalConfig(id)`。

### 3. 供应商编辑表单重构

替换现有 `ProviderEditModal.tsx`（目前是裸的 configSchema 驱动表单）为设计稿的三段式表单：

**必填字段**：
- `targets`（适用客户端）：两个图标按钮（Claude Code / Codex），点击直接调用现有 `enable`/`disable` RPC（不新增字段，直接复用 `enabledFor`）。
- `apiKey`（API 密钥）：文本输入。

**更多设置**（默认折叠）：`baseUrl`（API 地址）、`homepage`（官网地址，新字段）、`endpoint`（API 端点覆盖，新字段）、`upstreamProtocol`（自动检测/openai_chat/claude_messages/codex_responses，新字段）、`authType`（沿用现有）、`customHeader`（沿用现有 `authType: {header}` 语义，UI 单独一行）、`level`（优先级 1-10，新字段）。

**高级设置**（默认折叠）：模型白名单（新字段 `whitelist: string[]`，支持 `claude-*`/`anthropic/claude-*` 前缀匹配，relay 转发前校验请求模型是否在白名单，不在白名单直接拒绝转发）、模型映射（沿用现有 `modelMapping`，UI 改成设计稿的行编辑样式）、可用性监控开关（新字段 `healthCheck: boolean`，本次只存储该布尔值，不实现真正的定期健康检查轮询——建 UI 但先不接后端轮询逻辑，避免范围进一步扩大；这个决定明确记录在"不做的事"里）。

保存机制：自动保存（500ms 防抖，编辑任意字段后落盘）+ 保存前校验（`targets` 至少一个、`apiKey` 非空，校验失败在对应字段显示红色错误态，但仍然保存已填字段——不阻塞autosave，只阻塞“配置已保存”成功提示）。

### 4. 仪表盘（概览）+ 代理请求日志弹窗

**IconRail 改动**：移除现有的"更新"图标（改为 `listFilter` 的 `@updates` token，见上文范围决策），新增"概览"图标（网格图标，`navView: 'overview'`），作为默认视图（`AppState` 里 `navView` 的默认值从 `'browse'` 改成 `'overview'`）。

**新组件 `Overview.tsx`**（`navView === 'overview'` 时替代 `ResourceList` + `DetailPanel` + `InfoSidebar` 整个三栏区域，占满主区域）：
- 消耗趋势卡片：复用用量统计的 `queries.ts`（`getDailySummary`），今日/近7天/近30天三个粒度的费用/Tokens/请求数，加一个简单的 SVG 折线图（不引入图表库，手写 polyline，参考设计稿的画法）。
- 供应商/技能/MCP 计数卡片：来自现有 `list()` RPC 结果按 category 计数，点击跳转到 `navView: 'browse'` 并设置对应的 `categoryFilter`。
- 本地代理状态卡片：显示第一个（或"默认"）本地配置的运行状态、监听地址、真实的今日请求数/成功率（来自用量统计当日汇总）。点击进入 local 供应商详情。
- 最近请求：最近 5 条 `request_logs`（来自用量统计明细表），降级的请求在路由文字后追加"（降级）"。"查看全部"打开代理请求日志弹窗。
- 可更新列表：复用已有的 `checkUpdates` RPC 结果，最多显示 4 条，"更新"按钮调用真实 `update(slug)`。

**`ProxyLogModal.tsx`**（新组件）：展示最近 N 条 `request_logs`（时间/客户端/模型/供应商/降级标记/延迟），从仪表盘"查看全部"和 local 供应商详情面板两处可以打开。

**local 供应商详情**（`DetailPanel.tsx` 扩展，或新分支）：父视图（多端口配置列表 + 总运行状态）、子视图（单个端口配置的名称/端口可编辑 + 启停开关），复用第 2 部分的 `listLocalConfigs`/`updateLocalConfig`/`toggleLocalConfig` RPC。

## 真实环境自测

- 用你机器上 code-switch-R 已配置的 `yls`/`yls-me`/`skyapi` 真实 API Key（从 `~/.code-switch/codex.json`、`~/.code-switch/claude-code.json` 读取，仅本地测试使用，不写入仓库）在隔离的 `AS_HOME` 下安装两个 provider 条目，分别设不同 `level`，验证：两者同时启用时优先级高的先被尝试；把 level 高的 baseUrl 改错（制造 5xx/超时），验证自动降级到 level 低的确实生效，且 `request_logs` 记录 `is_fallback: true`。
- `make dev-gui` 实际跑一遍仪表盘：确认消耗趋势/供应商计数/本地代理状态/最近请求都是真实数据而不是设计稿里的硬编码假数字。
- 按 `AGENTS.md` 的 UI sign-off 规则做完整视觉走查，逐屏对照设计稿。
