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
| 左侧栏 | 宽 204px | 发现；「本机」分组：技能、MCP、供应商（各带已安装数量，有可更新时带橙点）、用量；底部：设置、本地中转状态（点进供应商）、账户菜单 |
| 主区 | 余下宽度 | 当前页面 |
| 状态栏 | 高 26px | 最近一条操作记录（点开看全部）、目录在线 / 离线、版本号 |

窗口宽度不超过 1040px 时侧栏收成 56px 的图标列：文字标签只留给读屏器，悬停出提示，可更新的点挪到图标右上角，账户只显示头像。

快捷键：⌘K / Ctrl K 开关命令面板；⌘1–⌘6 / Ctrl 1–6 依次是发现、技能、MCP、供应商、用量、设置；⌘, / Ctrl , 打开设置；`/` 聚焦当前页的搜索框；`?` 显示快捷键表。对话框或菜单打开时，除命令面板的开关外这些键都不响应。

命令面板分「前往」「操作」「已安装」「目录」四组。操作只放代码里真实存在的：检查已安装资源的更新、登录 / 退出、切换语言、操作记录、本地中转请求日志、快捷键表。原型里的「启动 / 停止中转」「添加项目」现在没有实现，不放。

## 组件取舍

| 能力 | 用什么 | 位置 |
|---|---|---|
| 对话框 | `@radix-ui/react-dialog`，外框统一用 `DialogContent` | `src/components/ui/dialog.tsx` |
| 菜单、语言选择 | `@radix-ui/react-dropdown-menu` | `src/components/ui/menu.tsx` |
| 悬停提示 | `@radix-ui/react-tooltip` | `src/components/ui/tooltip.tsx` |
| 开关（每个 agent 一个） | `@radix-ui/react-switch`，打开时轨道用类别色 | `src/components/ui/switch.tsx` |
| 筛选分段 | 一组 `aria-pressed` 按钮 | `src/components/ui/segmented.tsx` |
| 下拉选择 | 原生 `<select>`，外框同输入框 | `src/components/ui/input.tsx` 的 `Select` |
| 命令面板 | `cmdk`，放在 Radix 对话框里（带隐藏标题） | `src/components/shell/CommandPalette.tsx` |
| 提示条 | `sonner`，底部居中，样式改成本文的浮层 | `src/components/ui/toast.tsx` |
| 按钮、输入框、徽标、按键、类别标签 | 自写的薄封装，只管样式变体 | `src/components/ui/` |
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

## 尚未迁移的页面

用量是改版前的概览页，设置也未改完，由 #165 重做。它们用的旧变量名（`--accent`、`--text-2` 等，Tailwind 的 `store-*`）在 `globals.css` 里映射到新值；这些页面重做完后删掉旧名字。新代码不要再用旧名字。
