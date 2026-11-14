---
version: 1
slug: "app-store-page-tsx"
primary_target: "app/store/page.tsx"
related_targets: ["components/DetailDrawer.tsx","app/store/[category]/[slug]/page.tsx"]
---

# 商店列表与详情抽屉

## Scope

- 范围：`/store` 列表页，以及从列表打开的详情抽屉和它的整页形态。访客模式：Operate。
- 访客：已经在用 Claude Code / Codex 的开发者，要判断一个包能不能信、装了会运行什么，然后拿到安装方式。
- 主任务：找到包 → 在抽屉里做决定 → 复制命令或唤起桌面客户端。
- 内容：包名、一句话简介、类别、发布者与级别（作者名链接到上游）、安装量、安装后会执行的内容、安装命令、README。版本历史和评价已去掉（见 DESIGN.md）。
- 约束：Web 端不显示它无法确认的「已装」状态，也不显示没有依据的安全结论。
- 2026-11-13（#159）：全站视觉换成 `DESIGN.md` 的「光谱」方向，下面方向契约里的视觉部分（浅色、直角、图版、套准十字）作废；列表与详情在 #161 按新原型重做，到时重写本文件。
- 2026-11-12（#101）：自动审查去掉，下面方向契约里的审查圆章、审查列和「待审」随之作废，契约其余部分仍然有效；当前做法以 `DESIGN.md` 为准。

## Direction contract

THESIS: 每个包是一张被审过的图版，审查结论是压在上面的一枚圆章。拒绝这类产品的默认排法：深色底、发光强调色、图标卡片网格和轮播。

OWN-WORLD: 设计年鉴的图版页。近白底 #F5F4F6，抽屉面略偏暖 #FAF6F5，墨色 #16181A 不用纯黑，次要文字 #55585C，细线 #C9C7C4，淡紫 #DCDDF3 只用于审查圆章和选区。一套 grotesque 无衬线贯穿标题与正文，包名、命令、数字用等宽，栏目标签是 11px 等宽大写、字距 0.14em。控件直角：主按钮墨色实底，次按钮 1px 描边。

STORY: 访客扫一眼列表就知道哪些包审过、谁发布的；点开一行，在抽屉首屏看到审查结论和安装后会执行的原文，然后复制命令或在桌面客户端中安装。

FIRST VIEWPORT: 1440×900。72px 页头：左侧品牌，居中导航（商店、文档、定价），右侧搜索框与登录。下方左 920px 为列表：56px 筛选条（类别页签带计数、只看已验证开关、排序下拉），其下是 80px 行高的固定六列表格（类别、包、审查、发布者、安装量、复制）。右 520px 为抽屉：四角十字套准标记围出图版，40px 包名，审查结论块右上压着 148px 的淡紫圆章，往下依次是「安装后会执行」、安装命令与 48px 主按钮、README。

FORM: 设计年鉴图版（design-annual-s-plate-section），方向选择中的外来方向，用户选定。seed:d767c26db91db33f。签名交互：审查圆章——圆周文字缓慢转动，悬停时抬起；减少动效偏好下静止。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- 深色主题：这个方向以浅色为本，深色配色要另行推导，尚未决定是否保留深浅切换。
- 手机宽度下抽屉与表格的排法。
- 落地页、文档、定价等其余页面沿用这个视觉体系，各自的版式另定。
