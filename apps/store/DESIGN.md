---
name: Agent Store Web
description: 商店列表与详情抽屉的视觉体系：设计年鉴的图版页，审查结论是一枚圆章
colors:
  paper: "#F5F4F6"
  plate: "#FAF6F5"
  ink: "#16181A"
  ink-2: "#55585C"
  ink-3: "#63666A"
  line: "#C9C7C4"
  line-strong: "#8E8C89"
  lilac: "#DCDDF3"
  sel: "#EAEAF4"
  fill: "#ECEAEC"
  red: "#B3261E"
  dark-paper: "#131517"
  dark-plate: "#1B1D20"
  dark-ink: "#F0EFF2"
  dark-ink-2: "#AEB0B5"
  dark-line: "#3A3D41"
  dark-sel: "#262838"
typography:
  display:
    fontFamily: "Schibsted Grotesk, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Schibsted Grotesk, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.6
  body:
    fontFamily: "Schibsted Grotesk, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Schibsted Grotesk, PingFang SC, Noto Sans SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.54
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
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
  review-stamp:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.ink}"
    rounded: "{rounded.seal}"
    size: "148px"
---

# Design System: Agent Store Web

适用范围：`apps/store` 的商店列表（`/store`）、详情抽屉和它的整页形态，以及沿用同一套变量的页头、菜单、合集页。落地页、文档、定价等页面还没改到这套体系（见 GitHub Issue #58 的 Later）。方向契约在 `.impeccable/surfaces/app-store-page-tsx.md`，产品事实在 `PRODUCT.md`。

变量的唯一来源是 `app/globals.css` 的 `:root` 和 `[data-theme='dark']`，Tailwind 通过 `tailwind.config.ts` 引用这些变量（`bg-paper`、`text-ink-2`、`border-line` 等）。本文件的色值和那里一致，改色时两处一起改。

## Overview

**Creative North Star: "被审过的图版"**

每个包是一张设计年鉴里的图版：近白的纸、墨色的字、细线分栏，审查结论是压在图版上的一枚淡紫圆章。访客是熟悉终端的开发者，这一页的任务是让他在几秒内判断「能不能信、装了会跑什么」，然后拿到安装方式。所以表现力只花在两处：抽屉四角的套准十字，和那枚圆章；其余部分克制到像一张印刷表格。

刻意拒绝这类产品的默认排法：深色底配发光强调色、图标卡片网格、轮播、渐变。

**Key Characteristics:**

- 浅色为本，近白底 `#F5F4F6`，抽屉面略偏暖 `#FAF6F5`
- 墨色 `#16181A` 而不是纯黑，全站只有一个彩色：审查圆章和选区用的淡紫
- 一套 grotesque 无衬线（Schibsted Grotesk）贯穿标题与正文，包名、命令、数字用 JetBrains Mono
- 直角、1px 细线、没有阴影层级
- 固定列宽的表格代替卡片网格

## Colors

整体是纸和墨两种中性色，加一个只给审查结论用的淡紫。

### Primary

- **墨** (`#16181A`，深色主题 `#F0EFF2`)：正文、标题、主按钮底色、选中行上下线、筛选条底线、套准十字、焦点框。

### Accent

- **审查淡紫** (`#DCDDF3`)：只用于审查圆章和列表里的小章（两种主题都保持这个淡色，章上的字始终是 `#16181A`）。浅色主题下圆章用 `mix-blend-mode: multiply` 让细线透出来，深色主题改为 `normal`，否则会溶进底色。
- **选区淡紫** (`#EAEAF4`，深色 `#262838`)：选中行、菜单高亮、悬停底色。文本选中用 `#DCDDF3`（深色 `#3D4070`）。

### Neutral

- **纸** (`#F5F4F6`，深色 `#131517`)：页面底色。
- **图版** (`#FAF6F5`，深色 `#1B1D20`)：抽屉、整页详情、菜单的面。
- **次墨** (`#55585C`，深色 `#AEB0B5`)：次要文字、栏目标签、发布者级别。在纸、图版、选区上都 ≥5.3:1。
- **三墨** (`#63666A`，深色 `#9A9CA1`)：只给旧页面的 `--text-3` 用，新组件不再引用。
- **细线** (`#C9C7C4`，深色 `#3A3D41`)：行分隔、栏内分隔。
- **强线** (`#8E8C89`，深色 `#6A6D72`)：链接下划线、滚动条。
- **填充** (`#ECEAEC`，深色 `#24272B`)：代码底、少量占位面。
- **错误红** (`#B3261E`，深色 `#F28B82`)：只用于退出登录等破坏性动作和错误文字。

### Named Rules

**The One Colour Rule.** 淡紫是唯一的彩色，只出现在审查圆章、小章和选区上。状态靠形状和文字区分，不靠加色：「有提醒」是墨色描边三角，「待审」是虚线圆，「已审」是淡紫章。（2026-11-11 曾给三角加过琥珀色，评审认定没有依据，已改回墨色。）

**The Honest Pending Rule.** 没有审查数据的包一律显示「待审」，不显示圆章；没有评价的包不显示零分；网页端不显示它无法确认的「已安装」状态。

## Typography

**Body / Display Font:** Schibsted Grotesk（`next/font` 自托管，中文回落到 PingFang SC / Noto Sans SC）
**Mono Font:** JetBrains Mono（`next/font` 自托管）

**Character:** 一种 grotesque 从 40px 包名用到 13px 说明，靠字号和字重分层；等宽只给真正的代码、命令、数字和栏目标签，不当「技术感」装饰。

### Hierarchy

- **Display**（400，抽屉和整页详情的包名 40px，手机 32px，行高 1.1，字距 -0.025em）：每屏只有一个。
- **Title**（500，15px）：选中的类别页签、页头当前导航。
- **Body**（400，15px / 24px）：包简介，最长 62ch。
- **Body small**（400，13–14px）：审查摘要、注释、表格次行。
- **Mono**（400–500，13–14px）：包名（列表）、安装命令、「安装后会执行」原文、安装量、版本号。数字列右对齐。
- **Label**（等宽 11px，大写，字距 0.14em，次墨）：栏目标签（审查结论、安装命令、规格）、表头、按钮文字（12–13px 同样大写加字距）。

### Named Rules

**The No Eyebrow Rule.** 标题上方不放类别小标签或 kicker。类别已在面包屑「商店 / 技能」里出现，标题自己承担层级。

## Layout

- **页头**：桌面 72px 高，左品牌、居中导航（商店、文档、定价）、右侧搜索框、发布、设置菜单、登录。1024px 以下搜索框换到第二行占满宽度；768px 以下导航也收进菜单（菜单按钮由齿轮换成三横线）。
- **筛选条**：56px 高，左侧类别页签（带计数），右侧「只看已验证」开关、排序下拉、结果数。底边一条墨线。1024px 以下右侧控件换到第二行。
- **表格**：桌面固定六列 `64px / 1fr / 104px / 148px / 72px / 92px`（类别、包、审查、发布者、安装量、安装），行高 80px，行内左右 12px。768px 以下变成堆叠行：类别标签、包名、简介、发布者与安装量、审查状态，按钮在右上。
- **抽屉**：从 1024px 起抽屉占右侧 520px，盖在页头之下，列表在左侧保留自己的一栏（`body:has([data-item-drawer]) .store-shell` 右侧让出 `520px + 2.5rem`）；1024px 以下抽屉全宽并带半透明遮罩。
- **整页详情**：和抽屉同一个 `ItemDetail` 组件，居中，图版框加四角套准十字。
- **边距**：手机 16px，桌面 40px。
- **断点**：`md` 768px（手机判定，与 `lib/use-phone.ts` 一致）、`lg` 1024px（抽屉并排）。触屏设备不论宽度都按手机处理。

## Elevation & Depth

平面体系，靠细线和面色区分层次，不用阴影表达层级。只有两处例外：弹出菜单和安装提示浮层有一道向下的柔和投影（`0 12px 28px -12px rgba(22,24,26,.35)`）表示浮在页面之上；圆章悬停时抬起并带 `drop-shadow(0 10px 10px rgba(22,24,26,.22))`。

### Named Rules

**The Flat Plate Rule.** 底面是平涂色，不加纸纹、斜面、浮雕来模仿实物材质。

## Shapes

- 控件、输入框、抽屉、菜单一律直角。
- 圆形只给两样：审查圆章（148px，手机 112px，旋转 -13°）和列表里的小章（24px，旋转 -10°）；品牌圆点。
- 套准十字：15px 的十字细线，放在图版四角外 8px。
- 线宽：分隔 1px；选中页签、导航当前项底线 2px；抽屉左边 1px 墨线。

## Components

### Buttons

- **Primary**（`.btn .btn-primary`）：墨底纸字，48px 高，直角，等宽 13px 大写加字距。悬停变次墨底。每屏只有一个（抽屉里的「在桌面客户端中安装」，手机上是「复制命令」）。
- **Secondary**（`.btn`）：1px 墨线描边，透明底，32px（行内「安装」按钮）或 48px（「下载桌面客户端」）。悬停反色为墨底。
- **Focus**：全局 `:focus-visible` 为 2px 墨色外框，偏移 2px。放在会裁切溢出的滚动容器里时（类别页签）改为内收 2px，并给元素留至少 8px 左右内边距，框不能压到文字。

### Category tabs

无底色的文字页签，未选中次墨，选中墨色 500 字重加 2px 底线；计数用等宽 12px 次墨。用 `aria-pressed` 表达选中。

### Inputs

搜索框 36px 高，1px 细线描边，图版底，聚焦时描边变墨。占位文字次墨。快捷键 `/` 和 ⌘K / Ctrl+K 聚焦搜索框。

### Command box

1px 墨线框、纸底，`$` 提示符为次墨。命令用等宽 14px，**完整显示，必要时换行**，不用横向滚动截断。桌面上「复制命令」按钮放在框内右侧；手机上框内不放按钮，主按钮本身就是「复制命令」，位于框下方。

### Detail drawer

Radix Dialog。顶栏 56px：左侧面包屑（单行，超长截断），右侧收藏、展开为整页、关闭。640px 以下「展开为整页」只留图标，文字放进 `aria-label`。内容顺序固定：包名与发布者级别 → 简介 → 审查结论（右上压圆章）→ 安装后会执行 → 安装命令与按钮 → 规格 → README → 版本历史 → 评价。

### Review stamp（签名组件）

148px 淡紫圆章，内圈细线，中央是结论字（「已审」），外圈 `REVIEWED · AGENT STORE` 沿圆周缓慢转动（48 秒一圈）。悬停时抬起并略微转正；`prefers-reduced-motion` 下静止。只在审查通过（低风险且无提醒）时出现。

### Publisher tier

用形状区分，不用颜色：官方是实心小方块，已验证是对勾，社区没有符号。

## Do's and Don'ts

### Do:

- **Do** 新增颜色前先问能不能用形状或文字表达；确实要加，先在方向契约里写明理由。
- **Do** 每个界面在 390px、820px、1440px 三个宽度下用真实文案（含西班牙文这类长文案）检查一遍。
- **Do** 数字列用等宽、右对齐。
- **Do** 把浏览器自带部分（选中色、焦点框、滚动条、链接下划线偏移）都按本文件的变量设置。

### Don't:

- **Don't** 在标题上方放类别小标签或 eyebrow。
- **Don't** 用卡片网格、图标卡片、轮播排包列表。
- **Don't** 在没有审查数据时显示圆章或「已审」，也不显示「已安装」。
- **Don't** 用横向滚动隐藏命令或包名的关键部分。
- **Don't** 给控件加圆角或阴影层级。
- **Don't** 用 `docs/ui/Agent Store.dc.html` 的旧外观约束网页商店；它只作为旧外观参考。
