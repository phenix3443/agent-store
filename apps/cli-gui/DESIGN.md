---
name: Agent Store Desktop
description: 桌面客户端的视觉体系：方向 C「光谱」，紫调近黑底，技能、MCP、供应商三种类别色
colors:
  bg: "#0b0a12"
  bg-2: "#100e1a"
  bg-3: "#151322"
  edge: "#221f33"
  panel: "rgba(255, 255, 255, 0.04)"
  panel-2: "rgba(255, 255, 255, 0.065)"
  code: "rgba(0, 0, 0, 0.35)"
  popover: "rgba(22, 20, 36, 0.98)"
  overlay: "rgba(20, 18, 32, 0.98)"
  scrim: "rgba(5, 4, 10, 0.6)"
  fg: "#f3f2f8"
  fg2: "#a5a2b8"
  fg3: "#8683a0"
  line: "rgba(255, 255, 255, 0.09)"
  line-strong: "rgba(255, 255, 255, 0.18)"
  skill: "#b79cff"
  mcp: "#62b8ff"
  provider: "#5fd6a4"
  warn: "#ffb86b"
  bad: "#ff7a90"
typography:
  body:
    fontFamily: "Plus Jakarta Sans, PingFang SC, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.55
  page-title:
    fontFamily: "Plus Jakarta Sans, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.3
  dialog-title:
    fontFamily: "Plus Jakarta Sans, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 800
  label:
    fontFamily: "Plus Jakarta Sans, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  mono:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
rounded:
  control: "10px"
  box: "12px"
  overlay: "16px"
  hero: "18px"
spacing:
  titlebar: "44px"
  sidebar: "204px"
  sidebar-narrow: "56px"
  statusbar: "26px"
  narrow-breakpoint: "1040px"
components:
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    rounded: "9px"
    height: "32px"
  button-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    rounded: "9px"
    height: "32px"
  input:
    backgroundColor: "rgba(0, 0, 0, 0.25)"
    textColor: "{colors.fg}"
    rounded: "9px"
    height: "34px"
  dialog:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.fg}"
    rounded: "{rounded.overlay}"
  menu:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.fg2}"
    rounded: "{rounded.box}"
---

# Design System: Agent Store Desktop

## 概览

桌面客户端用来在本机安装和管理技能、MCP 服务器和模型供应商，目前支持 Claude Code 和 Codex。视觉方向是 #158 确定的方向 C「光谱」：紫调近黑的底，三种类别色（技能紫、MCP 蓝、供应商绿）是界面上唯一的彩色，光效只用在选中和运行中的状态上。网站改版用同一套色值、圆角和字体，桌面端按应用的密度收紧字号和间距。

设计来源是分支 `design/redesign-prototype` 的 `docs/design/mockups/client-app/`：`app.css` 是视觉，`app.js` 是交互，`i18n.js` 是中英文文案，`ux.html` 是交互说明，`INVENTORY.md` 是从代码整理的功能清单。原型和本文冲突时以本文为准，本文没写到的以原型为准。

只有深色主题。界面语言只有中文和英文。

## 设计变量

设计变量写在 `src/globals.css` 的 `:root`，Tailwind 的颜色名在 `tailwind.config.ts`。改值时两处和本文一起改。

### 底色

| 变量 | 值 | 用途 | 边界 |
|---|---|---|---|
| `--bg` | `#0b0a12` | 最深的底，主按钮上的文字 | 不用作大面积的窗口底 |
| `--bg-2` | `#100e1a` | 窗口底 | — |
| `--bg-3`、`--edge` | `#151322`、`#221f33` | 需要不透明的浮起面（如窄窗口下盖在内容上的详情栏） | 能用 `--panel` 叠加时不用它们 |
| `--panel` | 白 4% | 卡片、列表行悬停、默认按钮 | 卡片里不再套 `--panel` 卡片 |
| `--panel-2` | 白 6.5% | 选中的导航项、菜单项高亮、按钮悬停 | — |
| `--code` | 黑 35% | 代码块、命令、日志 | 只放等宽文字 |
| `--popover` | `rgba(22,20,36,.98)` | 菜单、提示条、悬停提示 | — |
| `--overlay` | `rgba(20,18,32,.98)` | 对话框、命令面板 | — |
| `--scrim` | `rgba(5,4,10,.6)` | 对话框背后的遮罩，带 3px 模糊 | — |

### 文字与线

| 变量 | 值 | 用途 | 对比度（在 `--bg-2` / `--panel-2` 上） |
|---|---|---|---|
| `--fg` | `#f3f2f8` | 正文、标题 | 17.2 / 14.8 |
| `--fg2` | `#a5a2b8` | 次要文字、未选中的导航 | 7.7 / 6.6 |
| `--fg3` | `#8683a0` | 说明、计数、占位文字 | 5.2 / 4.5 |
| `--line` | 白 9% | 分隔线、卡片边 | — |
| `--line-strong` | 白 18% | 按钮边、对话框边、虚线空状态 | — |

`--fg3` 在 `--panel-2` 上刚到 4.5:1，不要再往上叠半透明底。禁用态用 45% 不透明度，不另设颜色。

### 类别色与状态色

| 变量 | 值 | 只用于 |
|---|---|---|
| `--skill` | `#b79cff` | 技能：图标瓷砖、类别标签、选中的「技能」导航；Pro 徽标 |
| `--mcp` | `#62b8ff` | MCP；另外是键盘焦点框和输入框聚焦色 |
| `--provider` | `#5fd6a4` | 供应商；另外是「运行中 / 成功」的状态点 |
| `--warn` | `#ffb86b` | 提醒：可更新的点、离线、待配置 |
| `--bad` | `#ff7a90` | 出错、危险操作 |

每个颜色另有 `--<名字>-rgb`（空格分隔的三元组），Tailwind 用它生成透明度（`bg-skill/20`）。元素带 `data-kind="skill|mcp|provider"` 时，`--kind-rgb` 换成对应类别色，组件里写 `text-kind`、`border-kind/35` 就能跟着类别变色。

类别色只表示类别。不把类别色用在等级、审核、推荐这类含义上；目录里的 `verified` 等级用中性色显示。三色渐变 `--brand` 只用在标志和已登录头像上。

在 `--bg-2` 上类别色和状态色的对比度都在 7.6 以上，可以做文字。

### 圆角、字体、动效

- 圆角：控件 10px（按钮、输入框实际 9px，小号 7px），列表和卡片 12px，对话框和命令面板 16px，大的展示面 18px。圆点和徽标是全圆。
- 字体：Plus Jakarta Sans（400–800）做正文和标题，Geist Mono（400–600）做命令、路径、计数、状态栏。两者都用 `@fontsource` 随应用打包，不联网加载。中文落到系统字体（苹方、Noto Sans SC、微软雅黑）。
- 字号：正文 13.5px，页面标题 19px / 800，对话框标题 16px / 800，侧栏分组标题和状态栏 11px 等宽。
- 动效：缓动 `cubic-bezier(.2,.7,.2,1)`；对话框和菜单出现时上移 8px、缩放 0.98，220ms；骨架屏 1.3s 扫光。系统开了「减少动态效果」时全部关闭。

## 窗口外壳

| 区域 | 尺寸 | 内容 |
|---|---|---|
| 标题栏 | 高 44px | macOS 左侧是红黄绿三个按钮，其他平台右侧是最小化、最大化、关闭；标志；居中的搜索入口（打开命令面板，标出 ⌘K / Ctrl K）。整条可拖动，双击空白处最大化 |
| 左侧栏 | 宽 204px | 发现；「本机」分组：技能、MCP、供应商（各带已安装数量，有可更新时带橙点）、用量；「项目」分组：标题点进项目列表，下面每个已登记项目一行（目录不存在时带警示图标），末尾「添加项目」，项目多时这一段单独滚动；底部：设置、本地中转状态（点进供应商）、账户菜单 |
| 主区 | 余下宽度 | 当前页面 |
| 状态栏 | 高 26px | 最近一条操作记录（点开看全部）、目录在线 / 离线、版本号 |

窗口宽度不超过 1040px 时侧栏收成 56px 的图标列：文字标签只留给读屏器，悬停出提示，可更新的点挪到图标右上角，账户只显示头像。「项目」分组收成一个文件夹图标，点进项目列表；有目录不存在的项目时图标右上角带橙点。

快捷键：⌘K / Ctrl K 开关命令面板；⌘1–⌘6 / Ctrl 1–6 依次是发现、技能、MCP、供应商、用量、设置；⌘, / Ctrl , 打开设置；`/` 聚焦当前页的搜索框；`?` 显示快捷键表。对话框或菜单打开时，除命令面板的开关外这些键都不响应。

命令面板分「前往」「操作」「项目」「已安装」「目录」五组。「前往」末尾是项目列表和「查看收藏」（打开发现页的收藏筛选，都没有数字快捷键）；「项目」按名称和路径搜已登记的项目，有输入时才出现。操作只放代码里真实存在的：检查已安装资源的更新、登录 / 退出、添加项目、切换语言、操作记录、本地中转请求日志、快捷键表。原型里的「启动 / 停止中转」现在没有实现，不放。

## 组件取舍

| 能力 | 用什么 | 位置 |
|---|---|---|
| 对话框 | `@radix-ui/react-dialog`，外框统一用 `DialogContent` | `src/components/ui/dialog.tsx` |
| 分页（设置页的六个分页） | `@radix-ui/react-tabs` | `src/components/ui/tabs.tsx` |
| 菜单、语言选择 | `@radix-ui/react-dropdown-menu` | `src/components/ui/menu.tsx` |
| 悬停提示 | `@radix-ui/react-tooltip` | `src/components/ui/tooltip.tsx` |
| 开关（每个 agent 一个） | `@radix-ui/react-switch`，打开时轨道用类别色 | `src/components/ui/switch.tsx` |
| 筛选分段 | 一组 `aria-pressed` 按钮 | `src/components/ui/segmented.tsx` |
| 下拉选择（含安装位置） | 原生 `<select>`，外框同输入框 | `src/components/ui/input.tsx` 的 `Select` |
| 选择目录（添加项目、重新定位） | 系统的目录选择框，`@tauri-apps/plugin-dialog` 2.7 与 `tauri-plugin-dialog` 2.7（2.8 起要 Rust 1.90，`rust-toolchain.toml` 固定 1.85）；权限只开 `dialog:allow-open` | `src/lib/folderPicker.ts`、`src-tauri/capabilities/dialog.json` |
| 命令面板 | `cmdk`，放在 Radix 对话框里（带隐藏标题） | `src/components/shell/CommandPalette.tsx` |
| 提示条 | `sonner`，底部居中，样式改成本文的浮层 | `src/components/ui/toast.tsx` |
| 按钮、输入框、徽标、按键、类别标签 | 自写的薄封装，只管样式变体 | `src/components/ui/` |
| 卡片、统计数字、设置行 | 自写 | `src/components/ui/card.tsx` |
| 分段选择（时间范围、语言、目标 agent） | 自写，一组带 `aria-pressed` 的按钮 | `src/components/ui/segmented.tsx` |
| 用量趋势图 | 自写的 SVG 折线，颜色用设计变量；用量数据是按天汇总的，「今日」只有一个点 | `src/components/UsageTrendChart.tsx` |
| 空状态、加载骨架、转圈、通知条 | 自写 | `src/components/ui/states.tsx` |
| 图标 | 类别和导航图标取自原型，其余用 `lucide-react` | `src/components/ui/icons.tsx` |

弹层、菜单、对话框、命令面板不手写：焦点管理、Esc、方向键和贴边换向由 Radix 和 cmdk 负责。现有底座是 Radix，不引入第二套组件库。

按钮变体：`primary`（亮底深字，一屏最多一个）、`default`、`kind`（带类别色，用在类别相关的操作上）、`danger`、`ghost`；尺寸 32px 和 26px。通知条三种：`warn`、`error`（读屏器立即播报）、`info`。

## 该做与不该做

做：

- 每种能力写进界面之前先在代码里找到实现；没有实现的不写，计划中的标「即将推出」。
- 卡片用细线，不用阴影；只有浮层（菜单、对话框、提示条、命令面板）有阴影。
- 列表的加载用骨架行，空列表用虚线框的空状态，并给出下一步按钮。
- 中英文同时加：`src/i18n/messages.ts` 两种语言的键必须一致，测试会检查。
- 键盘焦点统一是 2px 的 MCP 蓝框。

不做：

- 不写死色值，用设计变量；窗口按钮的红黄绿和关闭按钮悬停的红是平台惯例，例外。
- 不用类别色表示状态或等级。
- 不在卡片里套卡片，不在一块内容下叠两层半透明底。
- 不加亮色主题的分支。
- 不从网络加载字体或图标。

## 页面结构

发现、技能、MCP、供应商四页都是「左边列表、右边详情栏」：详情栏宽 430px，窗口不超过 1040px 时盖在列表上（不透明的 `--bg-3`），Esc 关闭。列表行整行是一个按钮，行尾的开关和按钮浮在它上面。代码在 `src/components/discover/` 和 `src/components/library/`。

所有安装都走同一个对话框 `src/components/install/InstallDialog.tsx`：应用内的「安装」按钮和网页发来的 `agent-store://install` 链接。步骤是：选 agent → 填必填项（只有 MCP 有必填项时）→ 进度 → 完成，另有冲突、失败、已安装和各种无法识别的链接。网页链接打开时焦点在「取消」，回车不会安装。

技能和 MCP 在选 agent 之前多一项「安装位置」：全局（默认）、某个已登记的项目（目录不存在的置灰）、「添加项目…」（在同一个对话框里登记目录，完成后回到这一步并选中它）。选了项目时走 `installToProject`：MCP 不先填必填项，装完后列出本机还没有值的变量，填写的值经 `setProjectEnv` 存到本机，也可以稍后在项目页填；完成页的主按钮是「打开项目」。项目里被改过的副本可以「仍然替换」（`force`）。已全局安装的条目，「已经安装过了」的提示里有「安装到项目…」；从项目页的「添加到这个项目」进入发现页时，发现页顶部提示正在为哪个项目挑选，安装位置预选为这个项目，全局一项标「已安装」并置灰。

项目列表和项目页在 `src/components/projects/`。项目页没有详情栏，分技能、MCP、密钥三块：每一条写明对哪些 agent 生效、来源（由 Agent Store 安装 / 项目自带）、是否被改过，下面逐个 agent 列出写在哪个文件，MCP 另列 Claude Code 的批准状态、本机条目覆盖、Codex 是否因未信任而不读取。与全局同名的 MCP 带「覆盖全局」，点开在行下展开说明。缺少密钥的 MCP 带「缺少密钥」，点开填写；密钥一块列出每个变量的状态，可填写、修改、清除，输入框不回显已存的值，并写明值只在 `aas projects exec` 或 `aas projects env` 启动的 agent 里生效。Codex 未信任项目时顶部提示，并给出可复制的 `~/.codex/config.toml` 两行；客户端不改这项设置。移除项目、重新定位、从项目卸载都先确认，确认框列出会改动和不会改动的内容。

## 用量、设置与首次启动

- 用量页（#165）只读本机 `usage.db` 的按天汇总：一次取近 30 天，「今日」「近 7 天」「近 30 天」在界面里按 UTC 日期筛。汇总数是费用、Tokens、请求数、成功率、模型数；明细按供应商、模型、agent 合并。预算与导出按 `advancedUsageAnalytics` 开放，供应商健康按 `smartRouting` 开放，Free 显示 Pro 说明和升级按钮。本地中转卡片只读：状态、监听地址、今日请求和成功率；启动、停止只能在命令行里做（`aas relay start|stop`），界面不放开关。
- 设置页分通用、Agent、数据、账号、命令行、关于六页。「检查配置一致性」调用 `doctor`（与 `aas doctor` 相同，只读）。「资源更新」检查已安装的资源，不是客户端自身；客户端新版本只给官网下载页。没有跨设备同步，不出现这一项。
- 首次启动介绍：应用数据目录里没有 `agent-store-cli/welcome.json` 时弹出一次，点「开始使用」或按 Esc 后写入，之后不再出现；设置 › 通用里可以重新打开。客户端不检测本机装了哪些 agent，介绍里只列出支持的 agent 和它们的默认配置位置，不显示「已检测到 / 未检测到」。

## 旧变量名

改版前的变量名（`--accent`、`--text-2`、Tailwind 的 `store-*` 等）已随所有页面重做删除，不要再加回来。
