# 落地页（`/`）页面说明

> 对应 GitHub Issue #102。分节结构参照 skillsmanager.dev（2026-11-12 看过），视觉以 `apps/store/DESIGN.md` 为准：纸和墨、直角、细线分栏、每屏一个主按钮。只借结构，不借它的配色、字体、插画和文案。
> 本文只写用哪个设计变量，不写色值和像素；需要新值先回 DESIGN.md 加。

## 布局

- 布局模式：全宽单列，左右边距同全站（手机 `gutter-phone`，桌面 `gutter-desktop`）。分节之间一条墨线（`border-ink`），分节内部用细线（`border-line`）。
- 区块顺序：

| # | 分节 | 内容 | 交互 |
|---|---|---|---|
| 1 | 首屏 | 左：一句承诺（`display-xl` 档 clamp）、简介、主按钮「浏览商店」、按系统推荐的下载（次按钮，未签名提示在按钮之前）、三条可信点；右：桌面客户端真实截图，放在图版框里（四角套准十字） | 无 |
| 2 | 装了会写到哪 | 左：目录里的一个真实包；中：`aas install <slug>`；右：Claude Code 和 Codex 各自被写入的文件与键 | Radix Tabs：技能 / MCP / 供应商 |
| 3 | 命令行也能装 | 一个命令框，`$` 次墨，输出是 `aas` 的真实输出 | Radix Tabs：search / install / enable |
| 4 | 功能 | 四格：技能、MCP 配置与按工具启用、供应商与本地代理、用量与预算。每格一张原生窗口截图局部、一个标题、两行说明 | 无 |
| 5 | 包从哪来 | 左：三个来源（官方 MCP Registry、GitHub 技能仓库经 skills.sh 发现、内置供应商列表），由定时任务同步进我们的目录；右：两个工具（Claude Code、Codex）和它们被写入的路径 | 无 |
| 6 | 常见问题 | 五问，答案与实际行为一致 | Radix Accordion，可同时展开多条 |
| 7 | 下载 | 每个系统一栏：文件名、大小、推荐文件；版本号与全部版本链接；未签名提示 | 无 |

- 从哪些成品页面块起手：本项目不用 shadcn blocks（底座是 Radix + 自有 CSS 类，见 `DESIGN.md`）。交互件用 `@radix-ui/react-tabs`、`@radix-ui/react-accordion`，焦点、方向键、`aria-*` 由库负责。

### 主次按钮

- 首屏唯一的主按钮是「浏览商店」（`.btn-primary`），下载是次按钮（`.btn`），按 DESIGN.md「落地页」一节。
- 第 7 节下载区不放主按钮：每个文件是一行链接，推荐文件用文字「推荐」标出，不加颜色。

### 截图的处理

- 截图来自 `test/desktop-linux/Dockerfile` 构建的 Linux 原生窗口（Xvfb + xdotool），不是浏览器开发页。
- 桌面端是深色界面，放进浅色页面时：外框 1px 墨线、图版底留白（`plate` 面 + 内边距），首屏截图加四角套准十字；不加阴影、不加圆角，和 Flat Plate Rule 一致。
- 截图文件在 `apps/store/public/landing/`，WebP，裁成局部，`next/image` 用 `unoptimized` 直接输出。
- 用量截图里的数字来自截图时经本地代理发给容器内测试上游的请求（真实代理、真实记账，上游是假的），页面文案写明了这一点。

## 字段映射

| 显示位 | 字段 | 格式 |
|---|---|---|
| 首屏 · 推荐下载按钮 | `desktopOsFromUserAgent(user-agent)` | 识别出 mac / win / linux 时一个按钮，其余系统列成文字链接；识别不出时三个按钮并列 |
| 第 2 节 · 左侧包 | `getItems({ category })` 第一项的 `name`、`slug`、`compatibleWith` | 包名正文，slug 等宽；只列它声明支持的工具，不支持的工具写一行「不支持」；取不到时显示 `<slug>` 占位，三行路径照常显示 |
| 第 2 节 · 写入路径 | 静态，来自 `apps/client-core`（见下表） | 等宽，完整显示，可换行 |
| 第 3 节 · 终端输出 | 静态（`components/landing/terminal-sessions.ts`），2026-11-12 在 `test/desktop-linux` 容器里对测试目录真实运行 `aas` 的输出 | 等宽，原样保留空格；CLI 输出格式变了要重新采集 |
| 第 7 节 · 文件名、大小 | GitHub `releases/latest` 的 `assets[].name`、`assets[].size` | 大小按 MiB，十以下保留一位小数 |
| 第 7 节 · 推荐文件 | `lib/latest-release.ts` 的 `recommended`：`.dmg`、`-setup.exe`，与 `/download/<target>` 跳转的文件一致 | 文字「推荐」 |
| 第 7 节 · 推荐系统 | `desktopOsFromUserAgent` | 该栏标「根据你的系统推荐」 |
| 第 7 节 · 版本号 | `tag_name` | 等宽 |

### 写入路径的依据

| 类别 | Claude Code | Codex | 代码 |
|---|---|---|---|
| 技能 | `~/.claude/skills/<slug>` 软链接到 `~/.agents/skills/<slug>/` | 直接读 `~/.agents/skills/<slug>/` | `client-core/src/adapters/skill.ts`、`skills/claude-link.ts`、`skills/store.ts` |
| MCP | `~/.claude.json` 的 `mcpServers.<name>`（user scope） | `~/.codex/config.toml` 的 `[mcp_servers.<name>]` | `config/claude-mcp.ts`、`config/codex-mcp.ts` |
| 供应商 | `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_AUTH_TOKEN`（值是本地代理地址和代理 token） | `~/.codex/config.toml` 的 `model_provider = "aas-relay"` 与 `[model_providers.aas-relay]` | `config/claude.ts`、`config/codex.ts`、`adapters/provider.ts` |
| 供应商密钥 | 不写进工具配置，存在 `~/.agents/providers/<slug>/config.json`（0600） | 同左 | `engine.ts`、`config/safe-file.ts` |

## 状态

| 状态 | 长什么样 | 打开方式 |
|---|---|---|
| 加载中 | 不适用：整页服务端渲染，目录和 Release 都在服务端取，带 5 分钟缓存 | — |
| 空 | 目录取不到包：第 2 节左侧显示 `<slug>` 占位，其余照常 | `?state=empty` |
| 出错 | Release 取不到：第 7 节写「暂时读不到最新版本」，链接到 GitHub 发布页和 `/download`；首屏下载按钮照常（它走 `/download/<target>`，那里自己降级） | `?state=error` |

## 异常检查表

| # | 情况 | 处理 | 理由 |
|---|---|---|---|
| 1 | 慢 | 做 | Release 请求 5 秒超时，超时按出错处理；目录和 Release 都缓存 5 分钟（`revalidate: 300`） |
| 2 | 空的三种 | 做 | 只有「从没有过数据」一种：目录为空时第 2 节用占位 slug；本页没有搜索和筛选 |
| 3 | 错的三种 | 做 | 只有网络错：Release 取不到时降级到发布页链接；本页没有业务错和权限 |
| 4 | 部分成功 | 做 | Release 里缺某个系统的文件时，那一栏不显示，其余照常；全缺时按出错处理 |
| 5 | 极值 | 做 | 文件名和路径等宽、允许断行（`break-all`），不横向滚动；大小统一 MiB |
| 6 | 提交中 | 不适用 | 本页没有表单和提交 |
| 7 | 断网 | 不适用 | 页面是静态内容，断网后已加载的内容照常可读；下载链接是外部地址 |
| 8 | 数据过期 | 不做 | 缓存 5 分钟内发了新版本，页面会显示上一版，点下去仍能下载那一版；`/download/<target>` 同样缓存 5 分钟 |

## 内容依据

每句话都必须是现在成立的事实（`PRODUCT.md`）。可信点和常见问题答案的依据：

| 说法 | 依据 |
|---|---|
| 装之前能看到要运行什么、写入什么 | 网页详情的「安装后会执行」（`apps/store/lib/install-preview.ts`）；桌面端链接安装的确认框（`apps/cli-gui/src/components/InstallLinkDialog.tsx`，默认焦点在「取消」） |
| 卸载后配置逐字节还原 | `apps/client-core/src/__tests__/round-trip.test.ts`（#104）：技能、MCP、供应商 × Claude Code、Codex，安装→启用→停用→卸载后逐字节比较；JSON 按两空格缩进重写，其他缩进会被重新排版 |
| 密钥只在本机、0600 | `config/safe-file.ts`、`engine.ts`（#83） |
| 本地代理要 token、只听 127.0.0.1 | `relay/token.ts`、`relay/server.ts`（#89） |
| 失败切换条件 | `relay/forward.ts`、`usage/health-classify.ts`：连接失败、401/403、429、5xx 换下一家；免费版最多两家 |
| 预算是 Pro 功能 | `apps/cli-gui/src/components/Overview.tsx` 的 `ProGate` |

## 验收看哪张图

- 390、820、1440 三个宽度，浅色和深色，中文和英文，整页截图；User-Agent 分别为 macOS、Windows、手机。
