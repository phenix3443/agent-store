---
name: Agent Store Web
description: Web 商店全站的视觉体系：设计年鉴的图版页
colors:
  paper: "#F5F4F6"
  plate: "#FAF6F5"
  ink: "#16181A"
  ink-2: "#55585C"
  line: "#C9C7C4"
  line-strong: "#8E8C89"
  sel: "#EAEAF4"
  fill: "#ECEAEC"
  red: "#B3261E"
  scrim: "rgba(22, 24, 26, 0.4)"
  dark-paper: "#131517"
  dark-plate: "#1B1D20"
  dark-ink: "#F0EFF2"
  dark-ink-2: "#AEB0B5"
  dark-line: "#3A3D41"
  dark-sel: "#262838"
typography:
  display-xl:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "88px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.03em"
  display-lg:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "72px"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  display-md:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "56px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  display-sm:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.125
    letterSpacing: "-0.015em"
  headline-sm:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title-lg:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.27
  reading:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  display:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.6
  body:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Schibsted Grotesk, Noto Sans SC, PingFang SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.54
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  button:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.14em"
rounded:
  none: "0px"
  seal: "9999px"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "40px"
  row: "80px"
  header: "72px"
  filter-bar: "56px"
  drawer: "520px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "32px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  command-box:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.none}"
  drawer:
    backgroundColor: "{colors.plate}"
    width: "520px"
  table-row-selected:
    backgroundColor: "{colors.sel}"
    height: "80px"
  field:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 12px"
  dialog:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    width: "480px"
---

# Design System: Agent Store Web

适用范围：`apps/store` 全站。商店列表（`/store`）、详情抽屉和整页详情是这套体系的起点（#58），其余页面在 #66 里改到同一套体系：落地页、文档、定价、下载、个人面板、登录弹层、隐私与条款、404 和错误页。2026-11-12（#101）去掉了主题页、发布者页、发布弹层和自动审查的全部界面（审查圆章、小章、「待审」标记、审查列），原因见 `PRODUCT.md`；下文凡是写到它们的地方都已删除。商店的方向契约在 `.impeccable/surfaces/app-store-page-tsx.md`，产品事实在 `PRODUCT.md`。

变量的唯一来源是 `app/globals.css` 的 `:root` 和 `[data-theme='dark']`，Tailwind 通过 `tailwind.config.ts` 引用这些变量（`bg-paper`、`text-ink-2`、`border-line` 等）。本文件的色值和那里一致，改色时两处一起改。

## Overview

**Creative North Star: "图版"**

每个包是一张设计年鉴里的图版：近白的纸、墨色的字、细线分栏。访客是熟悉终端的开发者，这一页的任务是让他在几秒内判断「装了会跑什么」，然后拿到安装方式。所以表现力只花在图版四角的套准十字上，其余部分克制到像一张印刷表格。（2026-11-12 之前图版上还压着一枚淡紫审查圆章，随审查一起去掉，见 #101。）

刻意拒绝这类产品的默认排法：深色底配发光强调色、图标卡片网格、轮播、渐变。

**Key Characteristics:**

- 浅色为本，近白底 `#F5F4F6`，抽屉面略偏暖 `#FAF6F5`
- 墨色 `#16181A` 而不是纯黑，全站只有一个彩色：选区用的淡紫
- 一套 grotesque 无衬线（Schibsted Grotesk）贯穿标题与正文，包名、命令、数字用 JetBrains Mono
- 直角、1px 细线、没有阴影层级
- 固定列宽的表格代替卡片网格

## Colors

整体是纸和墨两种中性色，加一个只给选区用的淡紫。

### Primary

- **墨** (`#16181A`，深色主题 `#F0EFF2`)：正文、标题、主按钮底色、选中行上下线、筛选条底线、套准十字、焦点框。

### Accent

- **选区淡紫** (`#EAEAF4`，深色 `#262838`)：选中行、菜单高亮、悬停底色。文本选中用 `#DCDDF3`（深色 `#3D4070`）。

### Neutral

- **纸** (`#F5F4F6`，深色 `#131517`)：页面底色。
- **图版** (`#FAF6F5`，深色 `#1B1D20`)：抽屉、整页详情、菜单的面。
- **次墨** (`#55585C`，深色 `#AEB0B5`)：次要文字、栏目标签、发布者级别。在纸、图版、选区上都 ≥5.3:1。
- **遮罩** (`rgba(22,24,26,.4)`，深色 `rgba(0,0,0,.6)`)：弹层和窄屏抽屉下面的半透明底，Tailwind 写 `bg-scrim`。变量是十六进制色值，`bg-ink/40` 这类透明度写法不会生效，不要用。
- **细线** (`#C9C7C4`，深色 `#3A3D41`)：行分隔、栏内分隔。
- **强线** (`#8E8C89`，深色 `#6A6D72`)：链接下划线、滚动条。
- **填充** (`#ECEAEC`，深色 `#24272B`)：代码底、少量占位面。
- **错误红** (`#B3261E`，深色 `#F28B82`)：只用于退出登录等破坏性动作和错误文字。

### Named Rules

**The One Colour Rule.** 淡紫是唯一的彩色，只出现在选区上。状态靠形状和文字区分，不靠加色，例如发布者级别：官方是实心小方块，已验证是对勾。

**The Honest State Rule.** 没有评价的包不显示零分；网页端不显示它无法确认的「已安装」状态，也不显示它没有依据的安全结论。

## Typography

**Body / Display Font:** Schibsted Grotesk（`next/font` 自托管）。中文页用思源黑体简体 Noto Sans SC（`next/font` 自托管，按 unicode-range 切片按需加载，变量 `--font-cjk` 只挂在 zh 页上）。
**Mono Font:** JetBrains Mono（`next/font` 自托管）

**Character:** 一种 grotesque 从 88px 页标题用到 13px 说明，靠字号和字重分层；等宽只给真正的代码、命令、数字和栏目标签，不当「技术感」装饰。

### Hierarchy

- **Page title**（400，字距 -0.03em）：每页一个 h1，按页面类型分三档。索引页（商店、定价、下载）手机 44px、平板 56px、桌面 72–88px，右侧或下方放一句说明；文档类（文档、隐私、条款、个人面板）手机 40px、桌面 56px；落地页大标题用 `clamp(60px, 5.4vw, 88px)`，中文不在词内断行（`word-break: keep-all`）。
- **Display**（400，抽屉、整页详情和落地页图版的包名 40px，手机 32px，行高 1.1，字距 -0.025em）。
- **Headline**（400，28px，桌面 40px）：落地页各节标题；32px 用于下载页的平台名；28px 也用于弹层标题。
- **Title large**（400，22px）：文档里的小节、方案名。
- **Reading**（400，16px / 1.75，最长 68ch）：文档和法律页的正文栏（`.doc-body`）。
- **Title**（500，15px）：选中的类别页签、页头当前导航。
- **Body**（400，15px / 24px）：包简介，最长 62ch。
- **Body small**（400，13–14px）：注释、表格次行。
- **Mono**（400–500，13–14px）：包名（列表）、安装命令、「安装后会执行」原文、安装量、版本号。数字列右对齐。大号数字（价格 44px）同样用等宽。
- **Label**（等宽 11px，大写，字距 0.14em，次墨）：栏目标签（安装后会执行、安装命令、规格）、表头、按钮文字（12–13px 同样大写加字距）。

### Named Rules

**The CJK Typesetting Rule.** 上面的字距、大写和等宽标签都是按拉丁字母定的。中、日、韩页面（`:lang(zh|ja|ko)`）上：负字距一律归零，带负字距的标题字重从 400 提到 500；`.label`、`.btn`、`.caps` 改用正文字体、不加字距、不转大写，标签 12px、按钮 14px。规则写在 `globals.css`，新增大号标题照常写 `tracking-[-…]` 就会自动套上；要做等宽大写的小字，用 `.caps`，不要手写 `font-mono uppercase tracking-[0.14em]`。

**The No Eyebrow Rule.** 标题上方不放类别小标签或 kicker。类别已在面包屑「商店 / 技能」里出现，标题自己承担层级。

## Layout

- **页头**：桌面 72px 高，左品牌、居中导航（商店、文档、定价）、右侧搜索框、设置菜单、登录。1024px 以下搜索框换到第二行占满宽度；768px 以下导航也收进菜单（菜单按钮由齿轮换成三横线）。
- **筛选条**：56px 高，左侧类别页签（带计数），右侧「只看已验证」开关、排序下拉、结果数。底边一条墨线。1024px 以下右侧控件换到第二行。
- **表格**：桌面固定五列 `64px / 1fr / 148px / 72px / 92px`（类别、包、发布者、安装量、安装），行高 80px，行内左右 12px。768px 以下变成堆叠行：类别标签、包名、简介、发布者与安装量，按钮在右上。（审查列 2026-11-12 去掉，见 #101。）
- **抽屉**：从 1024px 起抽屉占右侧 520px，盖在页头之下，列表在左侧保留自己的一栏（`body:has([data-item-drawer]) .store-shell` 右侧让出 `520px + 2.5rem`）；1024px 以下抽屉全宽并带半透明遮罩。
- **整页详情**：和抽屉同一个 `ItemDetail` 组件，居中，图版框加四角套准十字。
- **边距**：手机 16px，桌面 40px。
- **断点**：`md` 768px（手机判定，与 `lib/use-phone.ts` 一致）、`lg` 1024px（抽屉并排）。触屏设备不论宽度都按手机处理。

- **页面骨架**：所有页面左右边距一致（手机 16px、桌面 40px），不居中收窄成一栏；分区之间用一条墨线（`border-ink`）断开，分区内部用细线。
- **索引页页首**：大号 h1 在左，一句说明在右下对齐（`lg` 起两栏），下接墨线。商店页的页首较矮（h1 72px，`pt-10 pb-6`），不把筛选条推出首屏。
- **文档类页面**：桌面左侧 13rem 目录栏（sticky，右侧一条细线），右侧是 68ch 的阅读栏；1024px 以下目录收进正文顶部的 `<details>`。法律页只有阅读栏。
- **落地页**（#75 梳理内容）：首屏左侧是大标题、简介和唯一的主按钮「浏览商店」；右侧是桌面客户端栏（客户端做什么、未签名提示与放行步骤链接、各平台下载按钮、价格链接），未签名提示放在下载按钮之前。往下依次是「先从这几个包看起」（一张图版 + 商店表格）、本地代理的一段简短说明，两节上方各有一条墨线，首屏自己不再画底线。包数只出现在入口链接上（「浏览全部 N 个包」），类别计数留给商店页签。实现细节（监听地址、Level 与切换条件）不上落地页，写在文档页（`/docs#relay`、`#levels`）。2026-11-12（#101）去掉了「按要做的事找」一节和讲 registry、PR 发布的内容。下载按钮由一个平台数组生成，加平台只加一项。服务端按 User-Agent 识别访问者的桌面系统：识别出 macOS、Windows 或 Linux 时只给该平台一个下载按钮，下面一行小字写「根据你的系统推荐」并把其他平台列成文字链接；手机、平板、ChromeOS 和识别不出时，三个平台按钮并列。下载按钮始终是次按钮，首屏唯一的主按钮仍是「浏览商店」。
- **页脚**：全站统一，上方一条墨线，左侧品牌与一句说明，右侧三组链接（产品、资源、条款）。

## Elevation & Depth

平面体系，靠细线和面色区分层次，不用阴影表达层级。只有两处例外：登录弹层下面铺 `--scrim` 遮罩；弹出菜单和安装提示浮层有一道向下的柔和投影（`0 12px 28px -12px rgba(22,24,26,.35)`）表示浮在页面之上。

### Named Rules

**The Flat Plate Rule.** 底面是平涂色，不加纸纹、斜面、浮雕来模仿实物材质。（2026-11-11 #66 评审提过加纸张颗粒，没有采纳：颗粒会落在 13px 次墨文字下面，降低实际对比度，截图和压缩后变成噪点；淡到不影响可读性时，在多数屏幕上又看不出来。）

## Shapes

- 控件、输入框、抽屉、菜单一律直角。
- 圆形只给品牌圆点。
- 套准十字：15px 的十字细线，放在图版四角外 8px。
- 线宽：分隔 1px；选中页签、导航当前项底线 2px；抽屉左边 1px 墨线。

## Components

### Buttons

- **Primary**（`.btn .btn-primary`）：墨底纸字，48px 高，直角，等宽 13px 大写加字距（中日韩页面见 CJK Typesetting Rule）。悬停变次墨底。每屏最多一个（抽屉里的「在桌面客户端中安装」，手机上是「复制命令」）。
- **Secondary**（`.btn`）：1px 墨线描边，透明底，32px（行内「安装」按钮）或 48px（「下载桌面客户端」）。悬停反色为墨底。
- **Focus**：全局 `:focus-visible` 为 2px 墨色外框，偏移 2px。放在会裁切溢出的滚动容器里时（类别页签）改为内收 2px，并给元素留至少 8px 左右内边距，框不能压到文字。

### Fields

`.field`：40px 高，1px 强线描边，图版底，直角；悬停描边变次墨，聚焦变墨并带全局焦点框。标签放在上方，13px 次墨，不用占位文字代替标签。链接、命令类字段用等宽。

### Dialogs

登录用 Radix Dialog：图版底、1px 墨线框、四角套准十字、直角，标题 28px，下面一句 14px 次墨说明，底部操作区上方一条墨线、主按钮在右。遮罩用 `bg-scrim`。登录弹层里 GitHub 是主按钮，Google 是次按钮（保留 Google 标志的原色，这是品牌要求，不算新增颜色）；底部的服务条款和隐私政策是真链接。

### Segmented toggle

定价页的「按月 / 按年」：1px 墨线框里两段，选中段墨底纸字，用 `aria-pressed` 表达。

### Fact list

`<dl>` 两栏：左侧 Label 样式的栏名，右侧正文；第一行上方墨线，其余细线。值能跳转时整段是带下划线的链接。落地页不再使用（#75 删掉了「概况」表和本地代理的 Level 表）。

### Featured plate

落地页上的单个包：和抽屉同一套图版（四角十字、图版底），只放帮人决定要不要点开的信息：类别、包名 40px、发布者与级别、安装量、简介的第一句，以及「查看详情」按钮。「安装后会执行」和安装命令留在详情里。图版放推荐排序的第一个包（按发布者级别和安装量）。

落地页上的简介（图版和下面的表格）只取作者原文的第一句（`lib/item-meta.ts` 的 `leadSentence`，用 `Intl.Segmenter` 断句），不按字数截断；上游的描述常是 skill 写给 agent 的触发说明，并在固定长度处被截断，整段放上来会停在半个词上。

### README

第三方 README 经 `rehype-raw` 解析其中的 HTML，再由 `rehype-sanitize`（GitHub 的白名单）清理，所以 `<div align="center"><img>` 这类页首能正常显示，脚本、事件属性、`javascript:` 链接不会进页面。相对路径的图片无法解析，直接不显示。

### Category tabs

无底色的文字页签，未选中次墨，选中墨色 500 字重加 2px 底线；计数用等宽 12px 次墨。用 `aria-pressed` 表达选中。

### Inputs

搜索框 36px 高，1px 细线描边，图版底，聚焦时描边变墨。占位文字次墨。快捷键 `/` 和 ⌘K / Ctrl+K 聚焦搜索框。

### Command box

1px 墨线框、纸底，`$` 提示符为次墨。命令用等宽 14px，**完整显示，必要时换行**，不用横向滚动截断。桌面上「复制命令」按钮放在框内右侧；手机上框内不放按钮，主按钮本身就是「复制命令」，位于框下方。

### Detail drawer

Radix Dialog。顶栏 56px：左侧面包屑（单行，超长截断），右侧收藏、展开为整页、关闭。640px 以下「展开为整页」只留图标，文字放进 `aria-label`。内容顺序固定：包名、作者与发布者级别 → 简介 → 安装后会执行（上方一条墨线）→ 安装命令与按钮 → 规格 → README → 版本历史 → 评价。作者名链接到上游：技能链到 GitHub 的 owner 页，`io.github.*` 命名空间的 MCP 链到 GitHub owner，其他 MCP 命名空间链到其域名；拿不到就只显示名字，不加链接（`lib/item-meta.ts` 的 `authorHref`）。

### Publisher tier

用形状区分，不用颜色：官方是实心小方块，已验证是对勾，社区没有符号。

## Do's and Don'ts

### Do:

- **Do** 新增颜色前先问能不能用形状或文字表达；确实要加，先在方向契约里写明理由。
- **Do** 每个界面在 390px、820px、1440px 三个宽度下用真实的中文和英文文案各检查一遍。
- **Do** 数字列用等宽、右对齐。
- **Do** 把浏览器自带部分（选中色、焦点框、滚动条、链接下划线偏移）都按本文件的变量设置。

### Don't:

- **Don't** 在标题上方放类别小标签或 eyebrow。
- **Don't** 用卡片网格、图标卡片、轮播排包列表。
- **Don't** 显示没有依据的审查或安全结论，也不显示「已安装」。
- **Don't** 用横向滚动隐藏命令或包名的关键部分。
- **Don't** 给控件加圆角或阴影层级。
- **Don't** 给中文加负字距或大写加宽字距的等宽样式。
- **Don't** 用 `docs/ui/Agent Store.dc.html` 的旧外观约束网页商店；它只作为旧外观参考。
- **Don't** 在页面里写死色值（分享图 `opengraph-image.tsx` 例外：Satori 读不到 CSS 变量，那里重复一份浅色主题的值）。
- **Don't** 写没有依据的说法，例如「通常远超订阅费」；规划中的功能标「规划中」。
