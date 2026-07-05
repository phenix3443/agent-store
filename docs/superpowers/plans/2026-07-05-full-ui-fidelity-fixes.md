# Full UI Fidelity Fixes — Implementation Plan

Ground truth for every task: `docs/ui/Agent Store.dc.html` (the `isCli` branch, lines ~470-1364,
plus script logic ~1370-2260). Read the cited line ranges directly before implementing — do not
rely on this plan's paraphrase alone for exact copy/colors/spacing.

Source audit: see task notification from the "Exhaustive UI mockup vs implementation diff" agent
run on 2026-07-05 (full findings list). This plan converts that audit into tasks, highest-impact
first. Where the mockup computes a value that is never rendered anywhere in its own template
(`cli.term`, `proxy.onOpenLog`, `cli.nav`/`isBrowse`/`isUpdates`), treat that as dead mockup state
— do not build UI for it, and remove any React feature that was invented around it.

## Global constraint

Design file wins on any conflict with current implementation (standing user instruction). Remove
invented UI/features that have no basis in the rendered mockup output, even if already shipped.

---

### Task 1: Global chrome — TitleBar, IconRail, CategoryIcon, remove TerminalPane

**Files:** `apps/cli-gui/src/components/TitleBar.tsx`, `IconRail.tsx`, `CategoryIcon.tsx`,
`TerminalPane.tsx` (delete), `App.tsx`, `apps/cli-gui/src/index.css` (or wherever `--store-*` vars
live), `apps/cli-gui/tailwind.config.*`.

1. Delete `TerminalPane.tsx` entirely; remove its import/usage from `App.tsx`. Mockup's `state.term`
   is computed but never rendered anywhere in the template — this component has no mockup basis.
2. `TitleBar.tsx`: traffic-light dots use hardcoded macOS hex `#ff5f57`/`#febc2e`/`#28c840`
   (mockup:476-478), not theme tokens. Add the small hexagon logo svg before the title text
   (mockup:481 — read the actual svg path). Height 44px, not 40px (mockup:474).
3. `IconRail.tsx`: rail buttons 42×42 in a 58px column (mockup:522-534), not 36×36/56px. Add the
   3px active-bar indicator (`position:absolute; left:-8px`, accent color) for the active item —
   currently missing entirely. Icons must use the mockup's own stroke paths (`icon()` method,
   mockup:1388-1401), not lucide substitutes — read the exact `<path>` data and inline as SVG.
   Settings avatar gradient: `linear-gradient(135deg, #7c82ff, #b06ad9)` (mockup:537), not
   `#7c82ff, #4b4fc7`.
4. `CategoryIcon.tsx` + wherever `TYPE.provider.color` is themed: provider category color must be
   `#58a6f0` (blue), distinct from generic `--accent` purple (mockup:1372-1376). Add/update a CSS
   var (e.g. `--store-provider`/`--store-provider-soft`) following the existing `--accent-soft`
   pattern, and use it everywhere `provider` category is colored (rail, cards, list icons, badges)
   — grep all current uses of `bg-store-accent`/`text-store-accent` gated on `category === 'provider'`
   and repoint them.

**Verify:** `bun run type-check`, `bun test` in `apps/cli-gui`, then real screenshot of the rail
and title bar compared side-by-side against the mockup rendered in a browser (open the `.dc.html`
file directly if chrome-devtools MCP is available; otherwise compare against the exact line-range
values cited above).

**Commit:** `fix(cli-gui): match title bar, icon rail, and category colors to design file`

---

### Task 2: Overview screen rewrite

**Files:** `apps/cli-gui/src/components/Overview.tsx`, `UsageTrendChart.tsx`.

Mockup reference: lines 1116-1250 (layout), 2131-2145 (stat/status logic).

1. Remove the `<h1>概览</h1>` page title — mockof has none; content starts directly with the trend
   card in a `max-width:1000px` centered column.
2. Fix section order/nesting: (1) trend card, (2) 3-up resource-type cards, (3) two-column grid
   `1.4fr/1fr` where the **left column contains the proxy card AND the 最近请求 card stacked**,
   right column contains only the 可更新 card. Currently 最近请求 is a separate bottom section —
   move it to nest under the proxy card in the left column.
3. 可更新 card: always render the card + header with a real `onClick` "全部" link (currently a
   dead `<span>`); only the list body is conditional on `hasUpdates`, matching mockup:1222-1245.
4. Proxy status: label `已停止` (not `未运行`) when stopped (mockup:2143); status dot always
   renders, just recolors between `var(--green)` and `var(--text-3)` — don't hide it entirely when
   stopped (mockup:1181-1184).
5. "模型分布" stat cell uses purple `#a874e0` on `rgba(168,116,224,0.12)` — distinct from the
   accent color reused by "总费用" (mockup:2131-2136). Add a dedicated color pairing, don't reuse
   `bg-store-accent-soft`.
6. Fix the trend-period bug: switching 今日/近7天/近30天 currently only changes the 4 stat numbers
   below — the chart itself is hardcoded to `last7Days` regardless of `trendPeriod`
   (`Overview.tsx:138`). Wire the chart to the selected period's data.
7. `UsageTrendChart.tsx`: rebuild to match mockup's real chart (lines 1135-1148) — 680×190 area,
   dashed gridlines, y-axis tick labels, x-axis date labels, a stroked dot per data point
   (`#5d5fef` line, `rgba(93,95,239,0.10)` area fill), height 116px. This is a real chart, not a
   bare sparkline — read the exact SVG/path generation logic in the mockup script and port it.

**Verify:** type-check, tests, then real screenshot of Overview compared against mockup structure
(open `.dc.html` in a browser if possible for a literal side-by-side).

**Commit:** `fix(cli-gui): rebuild Overview layout, trend chart, and status copy to match design`

---

### Task 3: ResourceList (list panel) rewrite

**Files:** `apps/cli-gui/src/components/ResourceList.tsx`.

Mockup reference: lines 540-676 (list panel), 556-585 (filter dropdown), 2079 (FOPTS labels).

1. Remove the persistent "Claude Code / Codex" segmented tab bar at the top of the list column
   (`ResourceList.tsx:224-239`) — no such top-level app-switcher exists in the mockup's list panel;
   `cli.apps` only appears nested inside the filter dropdown's "目标应用" sub-section.
2. Search input: text color `var(--accent)`, mono font (mockup:544-546) — currently default color,
   no mono class.
3. Add a standalone funnel "筛选过滤" icon button next to search (mockup:552-554) that opens the
   filter dropdown — don't rely solely on typing `@`.
4. Rebuild the filter dropdown into 3 labeled sections matching mockup:556-585 exactly: "发现"
   (featured/popular/recent/recommended), "状态" (installed/updates/enabled/disabled), "目标应用"
   (claude/codex rows with active checkmark). Remove the invented "favorites"(收藏) token (not in
   mockup's CLI filter menu); add missing "精选"(featured)/"推荐"(recommended) tokens. Fix the
   "可更新" label (mockup:2079 `FOPTS.updates`) — currently mislabeled "有更新".
5. Installed-section header copy: "已添加" (mockup:592), not "已安装".
6. Local "内置 Provider" row: add the 30×30 colored icon box (accent-soft bg, accent relay glyph)
   before the "local"+"内置" text (mockup:598-600) — currently text-only.
7. Installed item rows (mockup:626-644): add a 30×30 colored category-glyph icon box, mono-font
   bold name, and an amber outdated-dot next to the name when the item is outdated. Remove the
   invented "已启用/已禁用" toggle pill and "编辑"/"更新" per-row buttons
   (`ResourceList.tsx:348-397`) — the mockup's rendered list rows only show name/author/type plus
   (for providers) a "+" duplicate icon and "×" uninstall icon. Enable/disable and edit happen in
   the detail panel, not the list row.
8. Child-config connector: approximate the mockup's per-row "elbow" connector (border-left +
   border-bottom + border-radius span, mockup:614/648) instead of one flat wrapping `border-l`.

**Verify:** type-check, tests (update any test asserting the removed tab bar / removed row
buttons), real screenshot comparison.

**Commit:** `fix(cli-gui): rebuild list panel filters and row styling to match design`

---

### Task 4: DetailPanel + InfoSidebar deep fixes

**Files:** `apps/cli-gui/src/components/DetailPanel.tsx`, `InfoSidebar.tsx`.

Mockup reference: lines 996-1074 (detail header/tabs), 1796-1823 (`genReadme`), 1047-1074
(`reviewsFor`/`genVersions`), 1080-1107 (info sidebar).

1. Render the real 84×84 category-glyph icon (`detail.softBg`/`detail.color`, mockup:996-997) —
   currently a blank 48×48 grey box.
2. Header badges: support a "已验证" tier badge in addition to "官方" (any `tierKey !== 'community'`
   shows a tier badge, mockup:999). Status badge (已发布/审核中/已拒绝) is **always visible**
   (not gated on `!installed`), styled as a border-only pill (`border:1px solid statusColor`, no
   fill) — currently filled `bg-store-green-soft` and wrongly gated.
3. Meta line: add review count — `★ {rating} ({reviews})` (mockup:1008), currently drops the count.
4. Overview tab content (mockup:1796-1823) must include, in order: 概述, 安装 (a second code block
   repeating the install command — currently missing), 安装步骤, 适用场景, then type-specific facts
   (供应商: 支持的模型; mcp: 传输方式 + 启动命令/服务地址; skill: 下载地址), then footer lines
   类型/维护者/当前版本. Currently only 概述/安装步骤/适用场景 render — add the rest.
5. Implement the Reviews tab for real: average-score summary card (big number, star glyphs, review
   count, "写评价" button) plus 3 generated review cards (avatar/username/star-rating/date/text),
   per `reviewsFor` (mockup:1047-1062). Currently a static "暂无评价" stub.
6. Implement the Versions tab for real: styled list of 3 versions each with version number,
   "latest" badge, note, date, per `genVersions` (mockup:1063-1074). Currently a static one-liner.
7. `InfoSidebar.tsx`: add a bottom-border divider under each section heading (mockup:1080 pattern).
   Add the always-shown 4th "安装信息" row (`detail.metaLabel`: 延迟/大小/工具 depending on type,
   accent-colored, mockup:1081-1084). Make "更新时间" always show (not gated on `installed`,
   mockup:1083). Make "市场" section always render (not gated on `!installed`, mockup:1086-1090).
   "分类" chips: prepend the category type label (供应商/技能/MCP) as the first chip, styled as a
   border-only pill (not filled) — current tags-only filled-pill list is missing this and uses the
   wrong style. "资源" section: render the mockup's decorative row list per type (providers:
   [官网/文档, Marketplace 页面]; skill/mcp: [官网/文档, 源码仓库(GitHub), Marketplace 页面],
   mockup:1097-1107) instead of a single real link.

**Verify:** type-check, tests (rewrite fixtures/assertions for the new tab content and sidebar
sections), real screenshot comparison for a provider, a skill, and an mcp item.

**Commit:** `fix(cli-gui): implement full detail panel content and info sidebar per design`

---

### Task 5: LocalProviderDetail fixes

**Files:** `apps/cli-gui/src/components/LocalProviderDetail.tsx`.

Mockup reference: lines 694-708 (parent/root view), 712-741 (child view).

1. Parent (`local` root) view: remove the invented bottom stats row
   (`127.0.0.1 · N 个配置 · M 个运行中`) and "查看代理日志" button (current lines 57-66) — the
   mockup's `isParent` block renders only the header + one description paragraph, nothing else.
   Fix icon (72×72 box, real leaf-glyph svg per mockup:696-698, not lucide `RadioTower`) and name
   font (24px/780 weight/mono, mockup:701).
2. Child (single config) view: back button is icon-only (32×32, `title="返回 local"`, no visible
   text, mockup:712-714) — remove the visible "local" text label next to the arrow. Make the name
   an inline-editable `<input>` with hover/focus underline styling, prefixed by a `local /`
   breadcrumb directly beside it (mockup:715-719) — currently a static non-editable `<h2>` with the
   breadcrumb rendered separately as a "‹ local" link. This requires wiring an actual rename RPC
   call if one doesn't already exist — check `apps/cli-gui/src/lib/rpc.ts` for a rename/update
   method; if none exists, add one following the existing local-config update pattern.
3. Fix sub-copy under the header: "启用后自动将所选客户端的请求转发到此端口，无需手动配置。"
   (mockup:720), not the current wording.
4. Add the missing "适用客户端" (target-app) selector: Claude/Codex icon-toggle buttons (54×46px)
   to choose which client this local config applies to (mockup:729-735) — entirely absent
   currently.
5. Status label wording: `运行中`/`已停止` (mockup:723), not `运行中`/`已停用`.
6. Remove the extra trailing helper sentence under the port input
   ("把 Claude / Codex 的 base URL 指向 http://127.0.0.1:{port} 即可接入这份配置。") — mockup's
   child-config port section (lines 736-741) has no such text.

**Verify:** type-check, tests, real screenshot of both parent and child local-provider views.

**Commit:** `fix(cli-gui): match local provider detail views to design (parent + child)`

---

### Task 6: ProviderEditModal → inline panel restructure

**Files:** `apps/cli-gui/src/components/ProviderEditModal.tsx` (likely renamed to
`ProviderConfigPanel.tsx` or similar since it's no longer a modal — check callers), wherever it's
invoked from (`DetailPanel.tsx` / `ResourceList.tsx` / `LocalProviderDetail.tsx` — grep usages),
`apps/cli-gui/src/lib/rpc.ts` if new fields need new RPC plumbing.

Mockup reference: lines 769-932 (`cli.showConfig` inline panel), 1671/1680 (optional field schema),
2255-2256 (warning-banner conditions).

This is the largest single restructure in this plan — budget it as its own task, potentially split
into two implementer dispatches (structural conversion, then field-completeness) if it proves too
large for one pass.

1. Convert from a Radix Dialog popup (`max-w-lg` centered overlay) to an inline full-panel view
   that replaces the main content column in place, matching `cli.showConfig` (mockup:769-932,
   `max-width:620px`, sticky header). This changes how it's invoked — it should render in
   `DetailPanel`'s content area (or wherever `main`'s `showConfig` state lives) rather than as an
   overlay.
2. Add the editable config-name `<input>` at the top (`cli-config-name`, required, inline error
   "请先填写配置名称" if empty, mockup:774-777) — entirely missing today.
3. Add the autosave status indicator ("自动保存中…" / "已自动保存" with checkmark) beside the name
   field (mockup:779-782) — replace the current transient "配置已保存" text-after-save with a
   real in-progress/done two-state indicator.
4. Replace the current red inline errors with the mockup's non-blocking amber warning banners and
   exact copy: "尚未选择适用客户端，此配置已保存但不会对任何 CLI 生效" /
   "尚未填写 API 密钥，此配置已保存但暂时无法使用" (mockup:785-790, conditions at 2255-2256).
5. Add required-field red asterisk markers on labels (`fd.isRequired`, mockup:795) and the
   "（不可修改）" readonly annotation on the 供应商名称 field.
6. Add hover-triggered help tooltips ("?" icon showing `fd.help` text on hover, mockup:795/845
   pattern) for baseUrl/endpoint/upstreamProtocol/authType/level fields.
7. Add the missing "供应商名称" readonly field and "图标" select field (options:
   默认/anthropic/openai/google/adobe) to the optional/"更多设置" section (mockup:1671, 1680).
8. Remove the invented "定价页面链接"/"解析定价"/per-model pricing rows section
   (`ProviderEditModal.tsx:300-349`) — no basis in the mockup's `PROVIDER_FORM` schema. If this
   backs a real, separately-required feature not covered by the design, flag it explicitly instead
   of silently deleting backend RPC support — but remove the UI surface.
9. Advanced section (模型白名单/模型映射/可用性监控) already matches reasonably — just add the
   missing tooltip affordance, no structural change needed there.

**Verify:** type-check, full test suite update (this will break most existing
`ProviderEditModal.test.tsx` assertions that expect a dialog), real screenshot comparison.

**Commit:** `fix(cli-gui): convert provider config editor from modal to inline panel per design`

---

### Task 7: SettingsModal rewrite

**Files:** `apps/cli-gui/src/components/SettingsModal.tsx`.

Mockup reference: lines 1256-1358 (full settings modal), `settings.tabs` definition (~1223).

1. Layout: 620×440 two-pane modal with a left sidebar nav (168px, `var(--sidebar)` bg) listing 3
   tabs vertically, content on the right (mockup:1256-1264) — replace the current single-column
   `max-w-sm` layout with horizontal pill tabs.
2. Tab set: 账户(Account) / 通用(General) / 关于(About) — replace the current 账户/语言 tabs.
   Language selection moves inside 通用 as a dropdown (see below), not a standalone top-level tab.
3. 账户 tab: avatar-gradient circle with initial, "you@dev"-style name, status dot +
   已登录/未登录 text, 登录/退出登录 button, a separate "订阅计划" card ("Pro · 无限私有资源" +
   "PRO" badge), explanatory paragraph about sync benefits (mockup:1274-1296). Currently a single
   static "未登录" line — build out the full content (login/logout can be stubbed against existing
   RPCs if no auth backend exists yet — check `apps/cli-gui/src/lib/rpc.ts` for what's available;
   flag if no backing RPC exists rather than fabricating one).
4. 通用 tab: theme toggle row (🌙/☀️ icon + "当前：暗色/亮色模式" + "切换" link), default-target-app
   row, language dropdown row (mockup:1299-1342) — entirely absent today. Theme switching may need
   new state/persistence if none exists; check for an existing theme mechanism first.
5. 关于 tab: app icon, "Agent Store CLI" title, version string, 文档/GitHub/检查更新 links
   (mockup:1345-1358) — entirely absent today.
6. Language list styling: label + secondary caption (e.g. "简体中文"/"即将支持"), accent checkmark
   for the active language, inside the 通用 tab's dropdown (mockup:1325-1339) — not a flat top-level
   button list.

**Verify:** type-check, tests, real screenshot of all 3 tabs.

**Commit:** `fix(cli-gui): rebuild settings modal with sidebar nav and full tab content per design`

---

### Task 8: ProxyLogModal fixes

**Files:** `apps/cli-gui/src/components/ProxyLogModal.tsx`.

Mockup reference: lines 494-512.

1. Title: "本地代理 · 请求日志" (mockup:497), not "代理请求日志".
2. Add the missing subtitle line: `{proxy.addr} · 按 Level 顺序转发，失败自动降级` (mockup:498).
3. Add a colored status dot per row (7×7 circle, `e.statusColor`, mockup:505) — currently no dot.
4. Fix row layout/column order to match mockup exactly: `dot · time(58px) · app(92px, bold) ·
   model(mono, flex) · → provider(accent mono) · [降级 badge if fallback] · ms(right, 52px)`
   (mockup:503-512). Replace fallback-as-inline-text-suffix with an amber pill badge
   (`background: rgba(240,179,74,0.16)`, mockup:510), and add the "→" separator before the
   provider slug.
5. Modal width: 620px fixed (mockup:494), not `max-w-2xl` (672px).

**Verify:** type-check, tests, real screenshot comparison.

**Commit:** `fix(cli-gui): match proxy log modal copy, layout, and status indicators to design`

---

### Task 9: Final whole-branch visual verification

After all 8 tasks land: launch `make dev-gui` with realistically seeded data (providers, skills,
mcp items, local configs with children, some outdated/favorited/disabled items to exercise every
badge/empty-state path). Take real native-window screenshots (via `screencapture`, per this
session's established technique — always re-query window `{position, size}` immediately before
each capture, and remember screenshots are captured at 2x retina scale so click coordinates must be
halved relative to image pixel offsets) of every screen touched by Tasks 1-8: Overview, providers
list (empty/populated/child-tree), a provider detail, a skill detail, an mcp detail, local
parent+child views, provider config edit panel, settings (all 3 tabs), proxy log modal. Compare
each against the corresponding mockup section. Fix any remaining discrepancy found before reporting
this plan complete — do not defer to "future polish" without explicit sign-off from the user.
