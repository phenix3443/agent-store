---
name: Agent Store Web
description: Web 商店全站的视觉体系：光谱（方向 C）
colors:
  bg: "#0B0A12"
  bg-2: "#100E1A"
  bg-3: "#151322"
  edge: "#221F33"
  panel: "rgba(255, 255, 255, 0.04)"
  panel-2: "rgba(255, 255, 255, 0.065)"
  panel-3: "rgba(255, 255, 255, 0.12)"
  code: "rgba(0, 0, 0, 0.35)"
  well: "rgba(0, 0, 0, 0.25)"
  nav: "rgba(15, 13, 24, 0.88)"
  win: "rgba(20, 18, 32, 0.82)"
  pop: "rgba(20, 18, 32, 0.98)"
  scrim: "rgba(5, 4, 10, 0.66)"
  fg: "#F3F2F8"
  fg-2: "#A5A2B8"
  fg-3: "#8683A0"
  line: "rgba(255, 255, 255, 0.09)"
  line-strong: "rgba(255, 255, 255, 0.18)"
  line-hover: "rgba(255, 255, 255, 0.3)"
  skill: "#B79CFF"
  mcp: "#62B8FF"
  provider: "#5FD6A4"
  warn: "#FFB86B"
  bad: "#FF7A90"
  glow-skill: "#8B6CFF"
  glow-mcp: "#2F8DFF"
  glow-provider: "#22B889"
typography:
  hero:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "clamp(38px, 6.2vw, 76px)"
    fontWeight: 800
    lineHeight: 1.14
  h1:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "clamp(34px, 4.8vw, 58px)"
    fontWeight: 800
    lineHeight: 1.18
  h2:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "clamp(26px, 3.4vw, 42px)"
    fontWeight: 800
    lineHeight: 1.25
  h3:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
  lede:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "clamp(16px, 1.5vw, 18.5px)"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  body-sm:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
  nav:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "14.5px"
    fontWeight: 500
    lineHeight: 1
  button:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1
  button-sm:
    fontFamily: "Plus Jakarta Sans, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  control: "10px"
  card: "18px"
  frame: "28px"
  pill: "9999px"
spacing:
  gutter: "clamp(16px, 4vw, 32px)"
  content: "1160px"
  nav-width: "1080px"
  nav-height: "58px"
  nav-offset: "12px"
  section: "clamp(72px, 10vw, 140px)"
components:
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    typography: "{typography.button}"
    rounded: "12px"
    height: "44px"
    padding: "0 18px"
  button-primary-sm:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.bg}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "22px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "26px"
    padding: "0 10px"
  kbd:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-2}"
    typography: "{typography.label}"
    rounded: "7px"
    height: "24px"
    padding: "0 6px"
  nav-bar:
    backgroundColor: "{colors.nav}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.card}"
    height: "58px"
    width: "1080px"
  nav-link-current:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    typography: "{typography.nav}"
    rounded: "{rounded.control}"
  menu:
    backgroundColor: "{colors.pop}"
    textColor: "{colors.fg}"
    rounded: "16px"
    width: "230px"
    padding: "8px"
  mobile-menu:
    backgroundColor: "{colors.pop}"
    textColor: "{colors.fg}"
    rounded: "22px"
---

# Design System: Agent Store Web

适用范围：`apps/store` 全站。2026-11-13 起网站按方向 C「光谱」整体改版（总记录 #158），交互和文案的参照是分支 `design/redesign-prototype` 上的原型 `docs/design/mockups/site/`，视觉取自其中的 `proto.css`，三个方向的样片在 `docs/design/tiles/tiles.html`。

改版分四步：#159 落设计变量、字体、全站外壳（顶部导航、页脚、页面背景）和基础组件；#160 首页、客户端、定价、下载；#161 商店列表、搜索、详情；#162 登录、个人面板、文档、法律页、404。各页面的版式在对应 Issue 里写进本文件；还没改到的页面保持原有结构，只换成下面的变量（见「旧变量名」）。产品事实在 `PRODUCT.md`。

变量的唯一来源是 `app/globals.css` 的 `:root`，Tailwind 通过 `tailwind.config.ts` 引用这些变量（`bg-bg`、`text-fg-2`、`border-line`、`bg-skill/10` 等）。本文件的值和那里一致，改值时两处一起改。分享图 `app/opengraph-image.tsx` 读不到 CSS 变量，那里重复了一份，改色时也要改。

## Overview

**Creative North Star: "光谱"**

紫调近黑的底上，三种类别色各占一段光谱：技能紫、MCP 蓝、供应商绿。光效和动效用足：页面顶部有缓慢漂移的三色光晕，主按钮悬停时一道光扫过，品牌标志是三根高低不同的彩色柱子。访客是在用 Claude Code 或 Codex 的开发者，界面先让人看清是哪一类东西，再给出安装方式。

参考站是 raycast.com：学它的版式、节奏和质感，不用它的名称、标志、配色、文案和素材。

**Key Characteristics:**

- 只有深色主题。底色 `#0B0A12`，浮层和抽屉用不透明的 `#100E1A`
- 文字三级：`#F3F2F8` 正文与标题，`#A5A2B8` 次要，`#8683A0` 注释与标签
- 三种类别色只用来标类别，外加由三者组成的品牌渐变
- 面是半透明白（4% / 6.5%）叠在底色上，靠 1px 半透明白线分隔
- 圆角：控件 10px，卡片 18px，大外框 28px
- 字体：Plus Jakarta Sans 贯穿标题与正文，标题用 800；包名、命令、数字、标签用 Geist Mono

## Colors

### Ground

- **底** (`--bg` `#0B0A12`)：页面底色，`:root` 声明 `color-scheme: dark`。
- **底 2** (`--bg-2` `#100E1A`)：需要不透明的面：详情抽屉、登录弹层。
- **底 3** (`--bg-3` `#151322`)：品牌标志的底，更深一级的不透明面。
- **边** (`--edge` `#221F33`)：不透明的分隔边，用在不能叠半透明线的地方。

### Surfaces

- **面** (`--panel` `rgba(255,255,255,.04)`)：卡片、徽标、次按钮的底，导航链接悬停。
- **面 2** (`--panel-2` `rgba(255,255,255,.065)`)：悬停与选中：导航当前项、菜单高亮、次按钮悬停。
- **面 3** (`--panel-3` `rgba(255,255,255,.12)`)：分段切换的选中项、行内代码底、骨架的高光。
- **井** (`--well` `rgba(0,0,0,.25)`)：输入框、搜索框的底，比周围更暗。
- **代码底** (`--code` `rgba(0,0,0,.35)`)：代码块。
- **导航底** (`--nav` `rgba(15,13,24,.88)`)：顶部导航条，配 20px 背景模糊。
- **窗口底** (`--win` `rgba(20,18,32,.82)`)：营销页上画出的客户端窗口（`.win`）。
- **弹出底** (`--pop` `rgba(20,18,32,.98)`)：下拉菜单、窄屏菜单。
- **遮罩** (`--scrim` `rgba(5,4,10,.66)`)：弹层下面的半透明底，窄屏菜单再加背景模糊。

### Text

- **文字** (`--fg` `#F3F2F8`)：正文、标题、主按钮底色。在底色上 17.7:1。
- **次文字** (`--fg-2` `#A5A2B8`)：说明、导航未选中项、页脚链接。在底色上 7.9:1，在面 2 上 7.0:1。
- **注释** (`--fg-3` `#8683A0`)：标签、页脚栏名、占位文字、版权行。在底色上 5.4:1，在面 2 上 4.7:1，不要放在比面 2 更亮的面上。

### Lines

- **细线** (`--line` `rgba(255,255,255,.09)`)：卡片边、行分隔、导航条边、页脚分隔。
- **强线** (`--line-strong` `rgba(255,255,255,.18)`)：次按钮、输入框、菜单边，链接下划线，滚动条。
- **悬停线** (`--line-hover` `rgba(255,255,255,.3)`)：次按钮、输入框悬停时的边。

### Category

- **技能** (`--skill` `#B79CFF`)、**MCP** (`--mcp` `#62B8FF`)、**供应商** (`--provider` `#5FD6A4`)：各自另有 `--*-rgb`（空格分隔的三元组），Tailwind 写 `bg-skill/10`、`border-mcp/40` 这样的透明度。元素上写 `data-kind="skill|mcp|provider"` 时，`--kind` 和 `--kind-rgb` 换成该类别的值，`.kind`、`.kind-pill`、`.btn-kind` 跟着变色；没有 `data-kind` 时默认是 MCP 蓝。
- **光晕色**（`--glow-skill` `139 108 255`、`--glow-mcp` `47 141 255`、`--glow-provider` `34 184 137`）：比类别色更深更饱和，只用于背景光晕，不用于文字。
- **品牌渐变** (`--brand`)：`120deg`，技能紫 → MCP 蓝（55%）→ 供应商绿。用于头像底和 `.text-grad` 渐变文字。

### State

- **警示** (`--warn` `#FFB86B`，另有 `--warn-rgb`)、**错误** (`--bad` `#FF7A90`)：警示和错误文字、退出登录等破坏性动作。警示色还用于详情里的下架、弃用提示框（`.notice`），需要填写的值和技能里的可执行文件。

### Named Rules

**The Category Colour Rule.** 三种类别色只用来标出技能、MCP、供应商这三类东西（类别标签、类别页签、按类别的按钮和光晕），和由三者组成的品牌元素（标志、品牌渐变、背景光晕）。不要拿某一个类别色当通用强调色：焦点框和选区例外，用 MCP 蓝。营销页上并列的一组装饰（首页四个功能键、下载页三个系统卡、首次打开三格）按光谱各取一色，当作品牌光谱，不表示类别。

**The Honest State Rule.** 没有数据的安装量显示「—」，不显示零；网页端不显示它无法确认的「已安装」状态，也不显示它没有依据的安全结论。

**The One Theme Rule.** 只有深色主题，没有浅色主题和切换入口。不要写 `prefers-color-scheme` 分支或 `[data-theme]` 选择器。

## Typography

**Body / Display Font:** Plus Jakarta Sans（`next/font/google` 自托管，变量 `--font-sans`）。中文页用思源黑体简体 Noto Sans SC（`next/font/google`，可变字重，按 unicode-range 切片按需加载，变量 `--font-cjk` 只挂在 zh 页上）。
**Mono Font:** Geist Mono（`next/font/google`，变量 `--font-mono`）。

**Character:** 标题用 800 的粗体压住深色底，正文 16px / 1.65 留足行距；等宽只给代码、命令、包名、数字和小标签。

### Hierarchy

- **Hero**（800，`clamp(38px, 6.2vw, 76px)`，行高 1.14，`text-wrap: balance`）：首页大标题，每站一个。
- **H1**（800，`clamp(34px, 4.8vw, 58px)`，行高 1.18）：各页页首标题。第二行用次文字或注释色写成两段式标题。
- **H2**（800，`clamp(26px, 3.4vw, 42px)`，行高 1.25）：页内分节标题。
- **H3**（700，20px，行高 1.4）：卡片标题、小节。
- **Lede**（400，`clamp(16px, 1.5vw, 18.5px)` / 1.7，次文字色，最长 60ch）：标题下的一句说明。
- **Body**（400，16px / 1.65）。
- **Body small**（400，14px）：页脚链接、卡片正文。
- **Caption**（400，12.5px）：版权行、注释。
- **Nav**（500，14.5px）：顶部导航链接和「登录」。
- **Button**（700，15px；小号 14px）。
- **Label**（`.label`，Geist Mono 500，12.5px，注释色）：栏目标签、表头。不转大写、不加字距。
- **Code**（Geist Mono 400，13.5px / 1.7）：命令和代码块。

### Named Rules

**The CJK Typesetting Rule.** 中、日、韩页面（`:lang(zh|ja|ko)`）上，带负字距的元素（类名里有 `tracking-[-…]`）字距一律归零，未写 `font-semibold` 的再从 400 提到 500。规则写在 `globals.css` 末尾，不放进 `@layer`，所以能盖过字距工具类。页脚的大字「Agent Store」写了 `lang="en"`，保留它的负字距。

**The No Eyebrow Rule.** 标题上方不放类别小标签或 kicker。

## Layout

- **内容宽度**：`min(1160px, 100% - 2 × 边距)`，居中。边距 `clamp(16px, 4vw, 32px)`，手机 16px、宽屏 32px。
- **分节间距**：`clamp(72px, 10vw, 140px)`。
- **断点**：`lg` 1024px 是导航的分界：以上显示居中导航、搜索框、语言和登录，以下收进菜单。`md` 768px 是手机判定（与 `lib/use-phone.ts` 一致），页脚在它以下改两栏。抽屉并排也从 `lg` 起。

### 顶部导航

`components/Header.tsx`。悬浮的圆角条：`position: sticky`，距顶 12px，宽 `min(1080px, 100% - 24px)`，高 58px，圆角 18px，细线边，导航底色加 20px 背景模糊和一道向下的投影 `0 10px 40px rgba(0,0,0,.35)`。吸顶时条的下沿在 70px，详情抽屉和文档目录从 72px 起，不和它重叠。

- **左**：品牌（三色柱标志 + 「Agent Store」，800，16px），链到首页。悬停时三根柱子换一次高度。
- **中**（`lg` 起）：商店、客户端、文档、定价，三栏网格的中间一栏，整体居中。链接 14.5px 次文字色，悬停加面底，当前项（`aria-current="page"`，按路径前缀判断）面 2 底加文字色。「客户端」链到 `/client`。
- **右**：`lg` 起依次是搜索框（160px，`xl` 起 208px）、语言切换、登录（未登录）或头像菜单（已登录）、「下载」小号主按钮；`lg` 以下只留「下载」、搜索按钮和菜单按钮（各 38px 方形，细线边）。搜索按钮和菜单按钮打开同一个菜单。
- **语言切换**：一个按钮，显示另一种语言（中文页显示「EN」，英文页显示「中文」），`aria-label` 是「界面语言：English」这类完整说法，`lang` 写目标语言。点了写 `locale` cookie 并刷新。
- **头像菜单**：Radix DropdownMenu。头像是品牌渐变底的圆，等宽粗体首字母。菜单顶部是用户名和邮箱，下面是个人面板、退出登录（错误色）。
- **窄屏菜单**：Radix Dialog，从顶部展开的面板（距四周 8px，圆角 22px，弹出底，强线边），下面铺遮罩加模糊。顶部一行是品牌和关闭按钮；正文依次是搜索框（44px）、四个导航项、细线、登录（或个人面板与退出登录）、界面语言一行、整宽主按钮「下载桌面客户端」。每项 48px 高、17px 600，当前项面 2 底。点任何链接或提交搜索都会关掉菜单。

### 页脚

`components/SiteFooter.tsx`。上方一条细线，和页面内容之间留 96px（`lg` 起 128px）。四栏网格 `1.5fr 1fr 1fr 1fr`：品牌与一句话说明（最长 34ch），产品（商店、客户端、定价、下载）、资源（文档、命令行 aas、所有版本、源代码）、条款（隐私政策、服务条款）三组链接，栏名 12.5px 600 注释色，链接 14px 次文字色。`md` 以下品牌占整行，三组两栏排。底部一行细线隔开，左边版权，右边「已支持 Claude Code、Codex，更多 agent 陆续加入。」。最下面是一行 `clamp(64px, 17vw, 236px)` 的大字「Agent Store」，从 10% 白渐隐到透明，`aria-hidden`，被页脚的 `overflow: hidden` 裁去底部。

### 页面背景

`app/layout.tsx` 在页面最上方铺一层 760px 高的光晕（`.aurora`）：三团 62vmax 的径向渐变，分别是技能紫、MCP 蓝、供应商绿的光晕色，不透明度 .28，各自 22–26 秒来回漂移；上面叠一层 56px 的 4% 白网格，网格用径向遮罩只留中上部；整层从 40% 处向下渐隐到透明。光晕在 `-z-10`、`pointer-events: none`，自己 `overflow: hidden`，不会撑出横向滚动。页面里的区块不铺底色时都能透出这层光。

### 营销页（#160）

首页 `/`、客户端 `/client`、定价 `/pricing`、下载 `/download` 共用一组类，写在 `globals.css` 的 Marketing 段，组件在 `components/marketing/`。

- **容器与节奏**：`.wrap` 是内容宽度；`.section` 用分节间距，`.section-tight` 是它的 0.6 倍。`.split` 是 5:7 的两栏，文字在左；`.split-rev` 是 7:5，文字画在右边。900px 以下都改单栏，文字在上。
- **标题**：`.h-hero`、`.h1`、`.h2` 按上面的字阶；第二句写在 `.dim` 里，换行并用注释色。英文标题字距 -0.03em、行高 1.1；中文不加负字距。`.lede` 是标题下的一句说明，`.cap` 是等宽注释行。
- **首页首屏**（`.hero`）：居中，三道彩色光柱（`.beams`）从底部升起，被一道弧形地平线（`.horizon`）截住。主标题中文宽屏一行、700px 以下在逗号处分两行并去掉逗号；英文两行。下面依次是说明、「已支持 Claude Code、Codex」一句、按访客系统给出的下载主按钮、版本与三系统、命令行 / 所有版本 / 逛商店三个链接。
- **客户端窗口**（`.frame` > `.win`）：28px 外框，背后一团呼吸的三色光（`.frame-one` 配 `data-kind` 时只用该类别色）；里面是带三个圆点和标题的窗口条。窗口里放客户端的真实截图（`public/landing/`，Linux 版原生窗口），统一裁成 16:10、从左上对齐；或者放按真实行为画的示意（技能软链接、本地代理转发），标题里写明「示意」。
- **演示坞**（`.dock`）：首页窗口下的一排 56px 图标页签（Radix Tabs），选中项用该页签的类别色渐变底；下方一行说明随选中项变化（`aria-live`）。
- **功能键盘**（`.keys`）：6 列（1100px 以下 4 列）的键帽，四个功能是跨两列的亮键（`.key-hot`），其余是空白键帽，`aria-hidden`。
- **目录货架**（`.shelf` / `.tall`）：横向滚动的高卡片，上半是名称、作者、两行说明，下半用记录本身的字段（技能的 `SKILL.md` 与仓库路径、MCP 的传输方式与名称、供应商的 `aas install` 命令）斜着画出来。类别切换用 `.seg`。
- **收尾**（`.cta`）：28px 圆角、底 2 色的大块，里面有一层光晕、64px 的标志、两段式标题、下载主按钮和版本价格注释。
- **定价**：`.seg` 切换按月 / 按年 / 终身买断；Free 卡是普通面，Pro 卡（`.plan-pro`）用紫蓝渐变底和光。对比表 `.cmp`，Free 没有的项写「—」（读屏读「无」）。价格只从 `@as/types` 的 `PRICING` 取。
- **下载**：三张系统卡（`.os-card`），访客的系统排第一并加 `data-recommended` 的亮底和「推荐」；每个文件一行 `.file-link`，带扩展名和大小。首次打开是三格并排的说明，macOS 一格有命令和复制按钮。

### 商店列表

`app/store/page.tsx`，宽度同内容宽度。自上而下：

- **页首**：H1 两段，「商店」一行，次一行注释色写目录规模；下面是宽搜索栏；再下面一行左边排序、右边类别，都是 `.seg`。类别不写数量：`/api/resources` 分页返回，没有总数。`sm`（640px）以下两排按钮换成一个按钮「全部 · 推荐」，点开是从底部升起的 Radix Dialog（24px 上圆角，底 2，强线上边），里面是类别和排序两组单选，点了立即生效，底部整宽主按钮「查看结果」关掉它。
- **热门**：只在没有搜索、类别和排序时出现。按安装量取前 4 个，四张卡片（`lg` 以下两列），卡片里依次是名次与类别、包名与作者、安装量。悬停上移 3px，边和底换成类别色。
- **列表标题**：左边是搜索词（「「q」的结果」）、类别名或「全部」，右边是计数和「清除筛选」链接（有搜索、类别或非默认排序时显示）。
- **列表**（`.store-rows` / `.store-row`，`components/ResourceRows.tsx`）：18px 圆角的外框里一行一个包，行间细线。按列表自身的宽度（容器查询）排：900px 起六列：类别方块、名称、说明、安装量、星标、安装按钮；560–900px 说明换到第二行，星标收起；560px 以下方块缩到 38px，两个数字列收起，安装量改写在名称下那一行的右端。名称下那一行是类别标签（只在「全部」里）、作者和已验证标记。说明只取第一句，最多两行。悬停或该行的详情抽屉打开时，左边出现 3px 的类别色竖条，底色从类别色 12% 向右渐隐。整行是一个链接（名称链接的 `::after` 盖住整行），安装按钮在它上面单独可点。
- **加载更多**：滚到底自动加载，满 200 行后改成居中的「加载更多」按钮；加载失败时按钮变成「重试」，上面一行错误色说明。
- **状态**：加载中是 6 行骨架；没有结果和目录出错都画在同一个外框里，居中的标题、一句说明和一个按钮（清除筛选 / 重试），出错时 `role="alert"`。`?state=loading|empty|error` 直接打开这些状态，供截图和评审；`?state=empty&supplement=offer|searching|none|unavailable` 打开补搜的各个状态。
- **补搜**（`components/StoreSupplement.tsx`，#152）：部署开启了补搜、搜索词符合 API 的触发规则（只针对技能或全部类别，本地没有结果、结果太少或都不相关）时，在列表下方出现一张卡片，先说清会把搜索词发给哪些第三方技能目录、只发送搜索词，访客点「发送并查找」之后才发请求。之后依次是查找中（转圈）、找到（能装的照列表行画，没收录的画成指向原站点的链接行，标出站点名）、没有找到、暂时查不了（带重试）。API 回答 `disabled` 或 `not_needed` 时整块不出现；页面用空搜索词探测是否开启，空搜索词不会发给任何站点。
- **目录来源**：页尾三格，技能、MCP、供应商各写数量和来源，下面一行注明数字的日期和更新频率。

### 条目详情

整页 `app/store/[category]/[...id]/page.tsx` 和抽屉 `app/@drawer/(.)store/…` 用同一个 `components/ItemDetail.tsx`，整页 `layout="page"`，抽屉 `layout="drawer"`。

- **整页**：面包屑（商店 / 类别 / 包名，注释色 14px），页首是 68px 类别方块、H1 包名（800，`clamp(28px, 4vw, 44px)`）、一行元信息（类别胶囊、「发布者」加作者链接、已验证）和完整说明。下面是一排数字格（安装量、GitHub 星标、版本、更新于，只列有值的，底 2 填格、细线分隔、18px 圆角外框）。再下面两栏：左边是安装内容（上游登记的命令、地址、需要填写的值、文件来源）、技能的文件列表、README 或技能内容；右边 380px 是安装卡片和规格卡片，`lg` 起吸顶（`top: 92px`），以下排到左栏前面。
- **安装卡片**（`.install-card`，配 `data-kind`）：类别色 20% 到透明的斜向渐变底、38% 的边和一道类别色的光。依次是整宽主按钮「在桌面客户端中安装」、一句说明、「安装命令」标题行（右侧是「复制命令」小按钮）和代码块（`.code-block`：代码底、细线边、折行不横滚）、命令由哪个工具执行的说明、「下载桌面客户端」链接。手机上主按钮直接复制命令，标题行不再放复制按钮。
- **抽屉**：Radix Dialog，底 2，`sm` 起距右、上、下各 10px，宽 `min(520px, 100% - 20px)`，24px 圆角，强线边；`lg` 起从 82px 开始，不挡导航条，列表在左边留出抽屉的宽度。手机上占满屏。头部左边「展开为整页」（普通链接，整页加载绕过拦截路由），右边关闭。内容单栏：页首（方块 44px、标题 26px、说明最多 5 行）、数字格、安装卡片、规格、安装内容、文件、README。
- 卡片标题 17px 700，右侧用注释色等宽小字写内容的出处（「上游登记」「摘自上游」）。

## Elevation & Depth

层次靠面色深浅和细线区分，浮在页面上的东西才用投影和光：

- 导航条：`0 10px 40px rgba(0,0,0,.35)`。
- 下拉菜单：`0 24px 70px rgba(0,0,0,.6)`。
- 窄屏菜单：`0 0 120px rgba(0,0,0,.7)`。
- 主按钮：内描 1px 40% 白，外加一道 MCP 蓝的光 `0 8px 28px`（28%），悬停时加强到 42%。
- 背景光晕见「页面背景」。

## Shapes

- 控件（按钮、输入框、搜索框、导航链接、38px 图标按钮）：10px；主按钮 44px 高时 12px。
- 卡片：18px；导航条也是 18px。
- 大外框（产品截图外框等）：28px。
- 菜单 16px，窄屏菜单 22px，详情抽屉和底部面板 24px，分段切换的外框 14px，徽标和类别标签全圆角，按键提示 7px。
- 线宽一律 1px；按键提示底边 2px。

## Motion

- 缓动 `--ease`：`cubic-bezier(.2,.7,.2,1)`，Tailwind 写 `ease-out`（`tailwind.config.ts` 把它改成了这条曲线）。
- 颜色与底色切换 150–200ms；按钮位移 180ms；主按钮扫光 700ms；标志柱子 300ms；背景光晕 22–26 秒循环。
- 主按钮悬停上移 1px，按下下移 1px。
- `prefers-reduced-motion: reduce` 时关掉所有动画和过渡。

## Components

### Buttons

- **Primary**（`.btn .btn-primary`）：文字色底、底色字，44px 高，12px 圆角，700 15px。悬停上移 1px、光加强，一道紫蓝渐变的光从左扫到右。小号加 `.btn-sm`：36px、10px 圆角、14px，导航里的「下载」用小号。每屏最多一个。
- **Secondary**（`.btn`）：面底，强线边，36px 高，10px 圆角，700 14px。悬停面 2 底、悬停线边。
- **Category**（`.btn .btn-kind`，配 `data-kind`）：该类别色 16% 的底、50% 的边，悬停 26% / 70%。
- **Disabled**：50% 不透明，不位移。

### Fields

`.field`：40px 高，井底，强线边，10px 圆角，14px。悬停变悬停线；聚焦时边变成 75% 的 MCP 蓝，外加 4px 14% 的 MCP 蓝光圈，不再叠焦点框。占位文字注释色。标签放在上方，不用占位文字代替标签。

### Search

`components/SearchInput.tsx`：导航里的搜索框，36px 高，井底，细线边，悬停强线边，聚焦同 `.field`。左边放大镜（加载中换成转圈），右边 `/` 按键提示（`sm` 起显示）。`/`、⌘K、Ctrl+K 聚焦它；有弹层打开时不响应。在商店页边输边搜，其他页按回车跳到商店。

商店页用同一个组件的 `variant="page"`：宽搜索栏 `.searchbar`，60px 高，18px 圆角，导航底色，强线边，17px 输入字，20px 放大镜；聚焦时 75% 的 MCP 蓝边、5px 13% 的光圈和一道向下的蓝光。它带 `data-store-search`，页面上有它时，导航里带 `data-nav-search` 的搜索框、窄屏的搜索按钮和菜单里的搜索框都隐藏（`globals.css` 用 `body:has()` 判断），同一页不出现两个搜索框。

### Cards

`.card`：面底，细线边，18px 圆角，22px 内边距。

### Badges

- **Chip**（`.chip`）：26px 高，全圆角，面底，细线边，12.5px 次文字色。
- **类别标签**（`.kind`，配 `data-kind`）：类别色 600 12.5px，前面一个 7px 的发光小方块。加 `.kind-pill` 变成 24px 的胶囊：类别色 10% 底、40% 边。
- **按键提示**（`.kbd`）：24px，强线边、底边 2px，7px 圆角，Geist Mono 12px 次文字色。

### Segmented

`.seg`：一排互斥的按钮（营销页配 Radix Tabs，商店配 `role="group"` 加 `aria-pressed`）。外框面底、细线边、14px 圆角、4px 内边距，放不下时横向滚动（不显示滚动条）；按钮 34px 高、10px 圆角、600 14px 次文字色，选中时面 3 底加一圈细线；按钮写了 `data-kind` 的，选中时换成该类别色 20% 的底、45% 的内描边和一道类别色的光。焦点框画在按钮里面，不被滚动裁掉。

### Tiles

`.kind-tile`（配 `data-kind`）：商店和详情里的类别图标方块，44px、12px 圆角，类别色由 30% 到 6% 的斜向渐变底、38% 的边和一道 18% 的光，图标用类别色。`.kind-tile-lg` 是详情页首的 68px、20px 圆角。技能、MCP、供应商的图标是 lucide 的 Layers、Network、Server（`components/KindTile.tsx`）。

### Skeleton

`.sk`：加载中的占位条，8px 圆角，面 2 和面 3 之间来回扫的渐变，1.3 秒一圈。

### Menus

`.menu` / `.menu-item` / `.menu-label` / `.menu-separator`，配 Radix DropdownMenu：弹出底，强线边，16px 圆角，8px 内边距，最小宽 230px；菜单项 40px 高、9px 圆角、14.5px，高亮时面 2 底。

### Links

`.link`：强线色下划线，偏移 3px；悬停时字和下划线都变文字色。

### Focus

全局 `:focus-visible`：2px MCP 蓝外框，偏移 3px，6px 圆角。选区是 35% 的 MCP 蓝。

## 旧变量名

还没改版的页面里仍写着上一套体系的类名。`tailwind.config.ts` 把它们指到新变量，页面重做时换成新名字，没有引用后删掉：

| 旧名 | 现在指向 |
|---|---|
| `paper` | `--bg` |
| `plate` | `--bg-2` |
| `ink` | `--fg`；用作边框色（`border-ink`）时是 `--fg-3`，以免整条分隔线亮成正文色 |
| `ink-2` | `--fg-2` |
| `on-ink` | `--bg` |
| `sel` | `--panel-2` |
| `fill` | `--panel` |
| `danger` | `--bad` |

`.plate` / `.plate-mark`（图版四角的套准十字）是上一套的装饰，现在画成强线色，随用到它的页面一起去掉。

## Do's and Don'ts

### Do:

- **Do** 每个界面在 390px、820px、1440px 三个宽度下，用真实的中文和英文文案各检查一遍。
- **Do** 数字列用等宽、右对齐。
- **Do** 按类别着色时写 `data-kind`，让 `--kind` 接管，不要把类别色写死在组件里。
- **Do** 通用交互（菜单、弹层、页签、开关、提示）用项目里的 Radix 组件，只改样式。

### Don't:

- **Don't** 加浅色主题、主题切换或 `prefers-color-scheme` 分支。
- **Don't** 在页面里写死色值；需要新的值先加变量，写进本文件。分享图例外，见开头。
- **Don't** 把某个类别色当成通用强调色。
- **Don't** 在 `<body>` 上写 `overflow-x: hidden`：它会盖住横向溢出，截图脚本就查不出来了。
- **Don't** 在标题上方放类别小标签或 eyebrow。
- **Don't** 给中文加负字距。
- **Don't** 用横向滚动隐藏命令或包名的关键部分。

## 用户界面的信息范围

- 界面上每一项产品能力的说法都要能在代码里找到实现；没做的不写，或标「即将推出」。原型里的收藏、网页上显示「已安装」、独立结账页是提案，没有实现，不做。
- 目前只支持 Claude Code 和 Codex，统一写「已支持 Claude Code、Codex，更多 agent 陆续加入」，不写其他 agent 的名字。
- 商店列表和详情不展示聚合平台标签或上游标识；保留作者、实际源码链接、安装命令等帮助用户判断与操作的信息。
