# 首页（`/`）页面说明

> 对应 GitHub Issue #160（总记录 #158）。交互和文案以原型 `docs/design/mockups/site/index.html` 和 `i18n.js` 为准，视觉以 `apps/store/DESIGN.md` 为准（「营销页」一节写了用到的类）。客户端页 `/client`、定价页、下载页用同一组组件，见文末。
> 本文只写用哪个设计变量和类，不写色值和像素。

## 布局

全宽单列，内容宽度 `.wrap`。分节之间不画线，靠分节间距和光分开。

| # | 分节 | 内容 | 交互 |
|---|---|---|---|
| 1 | 首屏 | 居中的主标题「Agent 所需，尽在于此」（中文宽屏一行，700px 以下在逗号处分两行；英文两行，第二行品牌渐变）、一句说明、「已支持 Claude Code、Codex，更多 agent 陆续加入。」、按访客系统的下载主按钮、版本与三系统、命令行 / 所有版本 / 逛商店三个链接。背景是三道光柱和一道弧形地平线 | 无 |
| 2 | 演示 | 两段式标题；客户端窗口里放真实截图，下面四个图标页签：安装、MCP、供应商、用量，再下面一行说明随页签变化 | Radix Tabs，方向键切换 |
| 3 | 装一次 | 左：两段式标题、已支持的 agent、小号下载按钮和「看客户端」；右：功能键盘，四个亮键是一键安装、多 agent、随时开关、网页直装 | 无 |
| 4 | 管得住 | 左：标题、说明、「看客户端怎么管」；右：技能页截图 | 无 |
| 5 | 目录 | 两段式标题和类别切换；横向滚动的十张样本卡，链到各自详情；下面是截至日期的目录数字和「看全部」 | Radix Tabs：技能 / MCP / 供应商 |
| 6 | 收尾 | 大块 `.cta`：标志、两段式标题、下载主按钮、版本和 Pro 起价 | 无 |

### 主次按钮

每屏只有一个主按钮，都是下载：识别出 macOS、Windows 时直接走 `/download/<target>`（跳到最新安装包），Linux 去下载页的 Linux 卡（有 deb、rpm、AppImage 三种），识别不出时写「免费下载」去下载页。第 3 节的下载按钮是小号。

### 截图

- 来自 `test/desktop-linux/marketing.sh` 的 Linux 原生窗口（Xvfb，2 倍绘制），不是浏览器开发页。中文页用中文界面，英文页用英文界面，文件在 `apps/store/public/landing/zh/` 和 `apps/store/public/landing/en/`；重新生成的步骤见 `test/desktop-linux/README.md`。
- 裁掉客户端自己的标题栏、边框和状态栏，放进 `.frame` > `.win` 的窗口外框，16:10 从左上对齐。
- 第 2 节演示窗口的四个页签：安装（安装确认窗口）、MCP（MCP 页和 Context7 详情）、供应商（供应商页，本地代理运行中）、用量（用量页）；第 4 节是窄窗口的技能页。

## 字段映射

| 显示位 | 字段 | 格式 |
|---|---|---|
| 首屏 · 下载按钮 | `desktopOsFromUserAgent(user-agent)` | 见「主次按钮」 |
| 首屏、收尾 · 版本号 | GitHub `releases/latest` 的 `tag_name` | 取不到时不显示版本 |
| 收尾 · Pro 起价 | `formatPrice('monthly')`（`@as/types` 的 `PRICING`） | `$9.99` |
| 目录 · 样本卡 | `listResources({ kind, sort: 'default' }, 0, 10)` 的 `name`、`author.name`、`description` | 说明两行截断；作者缺失写「作者不详」 |
| 目录 · 卡片下半 | 技能：`SKILL.md`、`origin.upstreamId`、`npx skills add` 命令；MCP：第一个 `transports`、`upstreamId`、版本；供应商：`upstreamId`、`aas install` 命令、标签 | 等宽，装饰，`aria-hidden` |
| 目录 · 数字 | 静态：截至 2026-11-13，61,815 个 MCP、8,391 个技能；`catalog-sync.yml` 每 6 小时同步 | API 没有总数接口，数字随文案手动更新 |

## 状态

| 状态 | 长什么样 | 打开方式 |
|---|---|---|
| 加载中 | 不适用：整页服务端渲染，目录和 Release 带 5 分钟缓存 | — |
| 空 | 某个类别取不到样本：货架位置写「目录暂时取不到，稍后再试。」 | `?state=empty` |
| 出错 | Release 取不到：不显示版本号，「所有版本」链到 GitHub 发布页；下载按钮照常（`/download/<target>` 自己降级） | `?state=error` |

## 内容依据

界面上的每句能力都能在代码里找到实现：

| 说法 | 依据 |
|---|---|
| 一次安装，兼容的 agent 都装好 | `client-core/src/engine.ts` 的 `installAndEnable`：对 `compatibleWith` 里的每个工具启用；技能由适配器在安装时启用 |
| 按 agent 单独开关；停用不删设置 | `engine.ts` 的 `enable` / `disable`；MCP 设置留在 `~/.agent-store/mcps/<slug>/config.json`，停用只撤工具配置里的条目 |
| 网页点安装，客户端接手 | `apps/store/lib/desktop-link.ts` 的 `agent-store://install` 链接；`apps/cli-gui/src/components/InstallLinkDialog.tsx` 的确认窗口 |
| 换供应商不用碰环境变量 | 启用供应商时客户端写 `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL` 和 Codex 的 `model_provider`（`client-core/src/config/`） |
| 失败自动换下一家；Free 两家，Pro 不限并避开冷却中的供应商 | `client-core/src/relay/server.ts`（`FREE_MAX_UPSTREAMS`、`smartRouting`） |
| 多 Key 轮换、预算告警、用量导出是 Pro | `relay/server.ts` 的 `keyRotation`；`apps/cli-gui` 的 `ProGate`（`Overview.tsx`、`ProviderConfigPanel.tsx`） |
| 客户端自带 `aas` | `apps/cli-gui/src-tauri/tauri.conf.json` 的 `externalBin` |
| 目录每 6 小时更新 | `.github/workflows/catalog-sync.yml` 的 cron |

不写：装之前看清会运行什么（网页详情只是列出上游登记的内容）、卸载逐字节还原和密钥只存本机（不作为卖点）、跨设备同步（没有实现）、Claude Code 和 Codex 以外的 agent 名字。

## 其他三页

- **客户端 `/client`**：首屏（标题、说明、已支持的 agent、下载、技能页截图）→ 技能软链接示意（`SkillLinks`，Radix Switch 开关两条链接）→ MCP 截图 → 网页直装三步（示例链接由 `installLink()` 生成）→ 本地代理示意（`RelayDemo`，开关让第一家返回 503，看请求改发第二家；减少动效时显示静止的结果）→ 用量截图 → 常见问题（Radix Accordion）→ 收尾。原型里每节标题上的「01 技能」这类编号按 DESIGN.md 的 No Eyebrow Rule 不放。
- **定价 `/pricing`**：按月 / 按年 / 终身买断切换，Free 与 Pro 两张卡，逐项对比表。价格取 `PRICING`；智能路由和多 Key 轮换代码里已按 Pro 实现，标「有」，不标「规划中」。结账沿用 `createCheckout` 打开 Waffo 支付页，不做原型里的独立结账页。
- **下载 `/download`**：三张系统卡，访客的系统排第一并标「推荐」；文件来自 `releases/latest`（`components/marketing/download-rows.ts`），读不到时改用 `/download/<target>` 跳转。下面是首次打开三格、所有版本、装好之后。原型里标题上方的版本小标签按 No Eyebrow Rule 改放到说明下面。

## 验收看哪张图

`store-screenshots` 工作流的 `landing`、`client`、`pricing`、`download`，390、820、1440 三个宽度，中文和英文。截图环境的 User-Agent 是 Linux，所以下载按钮写「下载 Linux 版」，下载页 Linux 卡排第一。
