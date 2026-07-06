# Handoff: Agent Store — 桌面 CLI 客户端 + Web 商店

## Overview
**Agent Store** 是一个面向 AI 编码工具(Claude Code / Codex)的「应用商店 + 本地管理客户端」。它有两个可切换的顶层界面(surface):

1. **Web 端 · Store** — 浏览器里的市场页,用于发现、搜索、发布 **技能(skill) / MCP / 供应商(provider)**,查看详情、评价、版本、作者主页。
2. **CLI 客户端** — 一个 macOS 桌面应用外观的窗口,管理本机已安装的资源、消耗仪表盘,以及一个内置的**本地代理供应商 `local`**:把 Claude / Codex 的 base URL 指向 `127.0.0.1:<端口>`,请求经本地按优先级(Level)转发到上游供应商,失败自动降级。

整个原型是**单文件 Design Component**(`Agent Store.dc.html`),运行时由 `support.js`(一个轻量的模板 + 类组件运行时,思路与 React class component 一致)驱动。

## About the Design Files
本包中的 `.dc.html` 文件是**用 HTML 制作的高保真设计参考**——它展示最终的外观、布局、交互与状态流转,**不是**要直接搬进生产环境的代码。任务是:**在目标代码库的现有技术栈中重新实现这些界面**(React / Vue / SwiftUI / Electron / 原生等),沿用该项目既有的组件库、状态管理与设计规范。如果还没有前端环境,则为该项目选择最合适的框架并据此实现。

`support.js` 是这个原型自用的迷你运行时,**不要**照搬到生产代码;它只是让设计能在浏览器里跑起来。用它来理解**组件的 props/state 结构和渲染逻辑**即可。

## Fidelity
**高保真(hifi)**。颜色、排版、间距、圆角、阴影、交互态都是最终值,请按下方 Design Tokens 与各屏描述像素级还原,只把样式承载方式换成目标代码库的既有体系。

---

## 顶层结构

页面垂直居中,深色渐变墙纸背景(`--wall`)。从上到下:

- **顶部切换器**(居中胶囊):`Web 端 · Store` / `CLI 客户端` 两段式开关 + 右侧主题切换按钮(🌙/☀️,切换 dark/light)。
- **主体**:根据 surface 显示 Web 商店 或 CLI 窗口。

两个 surface 共享同一套 provider/skill/mcp 数据与「已安装」状态,互相同步(在 Web 端安装 → CLI 端「已添加」里出现,反之亦然)。

---

## 网站信息架构（当前 · raycast.com 式）

Web 端是一个**多页站点，共享同一套顶部导航 chrome**（这是核心一致性原则，参考 raycast.com）。所有子页面都在 1200×764 的窗口壳内、导航之下渲染：

- **持久顶部导航**（每页都有，样式一致）：左 Logo（点击回落地页）、中部 `商店 / 文档 / 定价`（当前页高亮为 accent 色）、右侧 `发布`（**仅在商店页显示**）+ 登录态区（未登录=「登录」按钮；登录后=头像，点开下拉：我的主页 / 设置 / 退出登录）。
- **视图路由**：`web.view ∈ { landing, store, docs }`，外加详情抽屉（`web.sel`）、作者主页抽屉（`web.profile`）、以及模态（登录 / 发布 / 设置）。landing/store/docs 互斥地在窗口内渲染，导航常驻。
- **浏览动线（漏斗）**：落地页（讲清价值）→ 商店（浏览/搜索）→ 详情抽屉（决定）→ 安装 → CLI 端使用。

### 落地页（`/`）滚动叙事
从上到下：Hero（徽章 + 74px 紧字距大标题 + 副标题 + 下载 Mac/Windows 按钮）→ 命令面板产品视觉 mock → 三栏「为什么选择」特性 → 「热门资源」商店 teaser（3 张卡，点击进商店详情）→ 页脚（产品/资源/公司三列 + 版权）。**注意：Hero 是唯一下载区，不要再加重复的底部 CTA。**

### 商店（`/store`）
筛选行（排序 / 分类 chip：供应商·技能·MCP·收藏 / 仅验证开关 / 搜索）+ 三列卡片网格。顶部导航额外显示「发布」。

### 详情抽屉（点卡片）
右侧滑入抽屉：图标/名称/作者/验证徽章、`agent-store add <id>` 命令、统计四宫格、`安装到 CLI 客户端` 主按钮、**`操作 ⌘K` 按钮**、README/评价/版本 Tab。

### 文档（`/docs`）
**左侧章节导航栏 + 右侧内容**两栏布局。点左栏章节平滑滚动到对应段落（`docs-scroll` 容器 + `docsec-<num>` 锚点，用 getBoundingClientRect 差值设置 scrollTop，不用 scrollIntoView）。

### ⌘K Action Panel（贯穿交互原语）
详情打开时按 `⌘K` 或点「操作」按钮，右下角浮出操作面板（Raycast 式）：安装（↵）/ 收藏（⌘F）/ 复制安装命令（⌘C）/ 查看作者主页，底部有 `↑↓ 选择 · ↵ 执行 · esc 关闭` 键盘提示。`Escape` 关闭。

### 一致性红线（务必遵守）
1. 每个子页面都用**同一套持久导航**，不得让某页自带独立/重复导航或遮住它。
2. 同一动作（如下载）**全站只保留有意义的一处入口**，避免重复 CTA。
3. `发布` 仅商店页；登录默认**未登录**，点击弹出 GitHub / Google 登录弹窗。

---

## Screen 1 — Web 端 · Store

宽约 1180–1248px 的市场页,单列滚动。

**顶部**
- 地址栏样式的伪 URL 条:`🔒 agent-store.dev /explore`(选中某项时变 `/p/<id>`,看作者主页时 `/@<author>`)。
- 右上:`探索` / `文档` 导航 + 主发布按钮。

**精选轮播(featured carousel)**
- 大卡横向轮播,自动播放(打开任意弹层或切到 CLI 时暂停;手动翻页会重置计时)。底部圆点指示 + 左右箭头。展示包名(mono 字体)、`官方` 徽章、简介、下载量 ★评分、版本号。

**筛选行**
- 左:排序切换 `最流行 / 评分最高`。
- 中:分类 chip —— `探索(all) / 供应商 / 技能 / MCP / 收藏`。
- 右:`仅验证` 开关 + `搜索…` 输入框。

**卡片网格**(3 列,`gap:12px`)
- 每卡:类型图标(圆角方块,底色=类型 soft 色)、包名(mono、700)、`已验证` ✓、作者、类型标签、简介、下载/评分/版本 stat 行、收藏 ♥、安装按钮。

**详情抽屉 / 页**(点卡片打开)
- 头部:图标、名称、作者、验证徽章、`安装` 主按钮、♥收藏。
- Tab:`README(概述)` / `评价` / `版本`。
- README 由 `genReadme()` 生成(概述、能力清单、安装命令 `agent-store add <id>`、供应商列支持的模型 / MCP 列传输方式与命令 / 技能列下载地址)。
- 右栏:分类标签、更新/发布/发布时间、资源链接(官网、源码、Marketplace)。
- provider 详情为**只读信息页**(不含配置表单)。

**发布弹窗**(顶部发布按钮)
- 类型分段:`供应商 / 技能 / MCP`。
- 动态表单字段随类型变化;`确认发布` 后该包以 `审核中(pending)` 状态加入用户自己的列表并跳转其详情。

**作者主页**(点作者名)/ **设置弹窗**(账户 / 通用 / 关于;通用含主题、界面语言中/英切换)。

---

## Screen 2 — CLI 客户端

一个 **macOS 窗口**:圆角 14px、深色、投影 `--shadow`;顶部 46px 标题栏(左侧红/黄/绿交通灯 + 居中标题 `⌾ Agent Store CLI`)。窗口内三栏布局:

### 左侧导航栏(58px)
竖排图标:`浏览商店 / 更新 / (概览/仪表盘)`。图标激活时 `--accent-soft` 背景 + `--accent` 前景。

### 中栏 —— 列表面板(320px,`--sidebar` 背景)
从上到下:
1. **顶部头**:当前应用切换(Claude Code / Codex 下拉)、区块标题、筛选漏斗按钮。
2. **搜索框**。
3. **本地代理 `local` 状态条**(仅在「供应商」筛选或全部时显示):图标 + `local` + `内置` 徽章 + 摘要(`N 个配置 · M 个运行中`);行右侧 `+` 新建 local 配置。其**子配置**以缩进树形列出:小圆点(运行=绿,停=灰)、配置名、`:端口`、行右侧 **× 删除按钮**(与其它配置一致;至少保留 1 份,删到最后一份时不可再删)。
4. **已添加**(此前叫「已安装」——**语义是"已添加的 provider / API key 配置"**)分组:每行图标、包名(mono)、可更新时的琥珀色小圆点、作者·类型;provider 行右侧有 `+`(基于该 provider 再建一份子配置)与 `×`(移除);provider 的多份子配置以缩进树形展开,每个子配置行右侧 `×` 删除。
5. **推荐**分组:未安装的项 + 所有 provider(provider 始终显示,便于随时新建配置)。

### 右栏 —— 详情 / 内容(`--content` 背景,可滚)
按当前选中对象切换,四种互斥内容(**同一时刻只显示一种**):

- **概览仪表盘**(默认 / 概览导航):`消耗趋势` 折线图 + 时间段切换(今日/近7天/近30天);统计卡(总费用、总 Tokens、总请求数、模型分布);资源计数卡(供应商 / 技能 / MCP,单行紧凑);`local` 运行卡(监听地址、今日请求、成功率、运行开关);`可更新` 列表;`最近请求` 日志(应用、模型→供应商、耗时、状态码,绿=2xx 红=5xx)。
- **商店详情**(点推荐/浏览里的普通资源):Web 端详情页的 CLI 版。
- **供应商信息页**(点 `local` 父项或某 provider 父项):只读——名称、作者、简介、监听地址/配置数/运行数、支持模型、标签等。
- **配置编辑表单**(点某个具体子配置):可编辑字段(见下)。
- **local 子配置详情**(点 `local` 的某份监听配置):面包屑 `local / <名>`、可改配置名、右上运行状态 + 开关、可改**监听端口**(`127.0.0.1:<port>`)、接入说明。

**Provider 配置表单字段**(`defaultProviderConfig`,`必填 / 可选 / 高级` 三档)
- 供应商名称、API 地址(baseUrl)、官网、**API 密钥(核心必填,保存时校验非空)**、端点(endpoint)、上游协议(默认「自动检测」)、认证方式、模型白名单/映射、优先级分组(Level 1–10,数字越小越优先)、可用性监控(健康检查开关)、CLI 覆盖(claude / codex 目标)。
- 底部:`新增子配置` + `保存`;保存成功停留在表单并弹出绿色 `配置已保存` toast(~2.6s 自动消失);API 密钥为空时阻止保存并提示。

**终端反馈**:多处操作(登录、安装、复制、新建/删除配置)向内置终端追加一行带色文本(命令灰、成功绿 `✓`、失败红),保留最近 6 行。

---

## Interactions & Behavior
- **Surface 切换**:顶部胶囊即时切换 Web/CLI,状态保留。
- **主题**:dark/light 通过 `[data-theme]` 切换,所有颜色走 CSS 变量。
- **精选轮播**:自动播放;任意弹层打开或切到 CLI 时暂停;手动翻页重置计时。
- **安装/卸载**:Web 与 CLI 双向同步;安装 provider 后(CLI 内)自动打开其配置表单。
- **provider 子配置**:`duplicateProvider()` 复制父配置(清空 name),API Key 置空,追加为父项下的子行并打开编辑。
- **local 配置**:`addLocalConfig()` 自动分配未占用端口(18100 起 +100);`removeLocalConfig()` 保底至少 1 份;`toggleLocalConfig()` 切换运行态。
- **保存校验**:API 密钥必填,空则拦截。
- **弹层**:详情抽屉、发布、设置、作者主页——点遮罩关闭;进入动画 `omDrawer / omPop / omFade`。
- **i18n**:界面语言中/英实时切换(设置 → 通用),覆盖全部文案、按钮、分类、状态、占位符、tooltip 与拼接文本;日/韩为「即将支持」。

## State Management
核心 state(见 `state = {…}`):
- `surface`('web'|'cli')、`theme`('dark'|'light')、`uiLang`('zh'|'en')。
- `web`:`{ cat, q, sel, detailTab, profile, verified, sort }`。
- `cli`:`{ app('claude'|'codex'), section, listFilter, filter, view, trendRange, … }`。
- `installed`:`{ [id]: { ver, apps:{claude,codex}, config? } }` —— 已添加资源 + provider 配置。
- `providerParents`:子配置 id → 父 provider id 的映射(树形展开用)。
- `dupPkgs / userPkgs`:复制出的子配置包 / 用户发布的包。
- `localConfigs`:`[{ id, name, port, running, reqs, success }]`。
- `localSel / cliEditId / cliInfoId / proxySelected`:右栏当前选中对象(四种内容互斥的判定依据)。
- `term`:终端最近 6 行日志。
- 弹层开关:`publishOpen / settingsOpen / proxyLogOpen / langMenuOpen / appMenuOpen / filterMenuOpen`。

渲染层(`renderVals()`)把 state 派生成模板需要的扁平数据 + 事件处理器;`decorate()` 给每个包补齐类型色、图标、stat 行、tier 徽章等。

## Design Tokens

**字体**
- Sans:`-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif`
- Mono(包名 / 端口 / 命令):`'JetBrains Mono', ui-monospace, 'SF Mono', monospace`(Google Fonts 引入,400/500/600/700)

**颜色 — Dark(默认)**
- 墙纸 `--wall`: `radial-gradient(130% 120% at 26% -12%, #2c2647 0%, #16161c 52%, #0b0b0f 100%)`
- 面板:`--win #17171b` · `--sidebar #1e1e24` · `--content #141417` · `--chrome #1e1e24` · `--panel #23232a` · `--panel-2 #2b2b32`
- 边框:`--border rgba(255,255,255,.08)` · `--border-strong rgba(255,255,255,.15)`
- 文字:`--text #edeef1` · `--text-2 #9a9aa6` · `--text-3 #64646e`
- 强调:`--accent #7c82ff` · `--accent-soft rgba(124,130,255,.16)`
- 语义:`--green #3ad29f` · `--amber/--star #f0b34a` · `--red #f3675f`
- 终端:`--term-bg #0c0c10`

**颜色 — Light(`[data-theme="light"]`)**
- `--win #fff` · `--sidebar #f4f4f7` · `--content #fbfbfc` · `--panel #fff` · `--panel-2 #f5f5f8`
- `--text #191920` · `--text-2 #5d5d68` · `--text-3 #9797a2`
- `--accent #5b54e8` · `--green #16a06a` · `--amber #cf8a16` · `--red #e0483f`
- 边框 `rgba(0,0,0,.09)` / `rgba(0,0,0,.16)`

**类型色**(供应商/技能/MCP 图标底色)
- skill: `#3ad29f` (soft `rgba(58,210,159,.16)`)
- mcp: `#f0b34a` (soft `rgba(240,179,74,.16)`)
- provider: `#7c82ff`(accent)

**半径**:卡片/面板 11–14px;chip/按钮 6–10px;胶囊/开关 999px。
**阴影**:`--shadow: 0 34px 90px rgba(0,0,0,.62)`(light: `…,.22`)。
**动效**:`omFade / omDrawer(translateX 30→0) / omPop(translateY 10 + scale .985) / omBlink(光标闪烁)`,时长约 180–260ms。
**滚动条**:9px,thumb `rgba(130,130,150,.32)` 圆角 6px。

## Assets
无外部图片。所有图标为**内联 SVG**(1.3–1.6 stroke,圆角线帽);类型图标为纯色圆角方块 + 字形。头像用色板 `AVATAR_COLORS = ['#7c82ff','#3ad29f','#f0b34a','#58a6f0','#c07cf0','#f3675f']`。字体来自 Google Fonts(JetBrains Mono)。示例包/评价/日志均为组件内的**演示数据**(`BASE_PKGS`、`PROXY_LOG` 等),接真实后端时替换。

## Files
- `Agent Store.dc.html` — 完整设计(模板 + 逻辑类 + tokens),单文件。
- `support.js` — 原型运行时(仅供本地打开预览;**勿**搬入生产)。

直接双击 `Agent Store.dc.html` 即可在浏览器打开查看全部界面与交互。
