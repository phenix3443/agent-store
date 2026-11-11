# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

已经在用 Claude Code 或 Codex 的开发者。熟悉终端和 AI 编码工具，来这里找可信的技能（skill）、MCP 服务、模型供应商（provider），并尽快装上。

## Product Purpose

Agent Store 是 Claude Code / Codex 的「应用商店 + 本地管理客户端」。本文件只覆盖 Web 端（`apps/store`）：浏览、搜索、查看详情与评价、发布，以及把访客带到安装和桌面客户端。

Web 端的浏览动线是：落地页讲清价值 → 商店浏览与搜索 → 详情抽屉里做决定 → 安装 → 在桌面客户端里使用。

## Positioning

- 目录是公开的 git registry：每个包一份清单，经 PR 加入，CI 校验 schema 和安装地址。
- 装进来的东西会被 agent 执行，所以详情页写明安装后会运行什么。规划中每个包都有 LLM 质量与安全审查；截至 2026-11-11 审查还没有运行，目录里的包全部显示「待审」，页面不能把审查说成已有的安全保证。
- 配套的本地代理把 Claude Code / Codex 指向本机，按优先级跨供应商转发、失败自动降级，并统计用量与预算。

## Operating Context

- 访客从浏览器进入，安装动作最终落在本机的 Claude Code / Codex 或桌面客户端上。
- Web 端与桌面客户端共享同一套技能 / MCP / 供应商数据和「已安装」状态。
- 页面：落地页、商店（分类、搜索、排序、已验证筛选）、详情与作者主页（抽屉形式）、主题（`/topics`，替代原来的合集，`/collections` 永久重定向到这里）、文档、定价、下载、个人面板、登录、隐私与条款。

## Capabilities and Constraints

- 技术栈：Next.js 15（App Router）、React 18、Tailwind CSS 3、Radix Dialog、lucide-react、next-intl。
- 界面语言：中文、英文、日文、韩文、西班牙文（`messages/`）。
- 支持深色与浅色主题切换。
- 定价分 Free 与 Pro，价格和权益以 `@as/types` 的 `PRICING` 和定价页为准。
- 术语：技能（skill）、MCP、供应商（provider）、本地代理（local relay）、发布者（publisher）、已验证（verified）。
- 2026-11-11 决定：Web 端视觉整体重做。`docs/ui/Agent Store.dc.html` 对 Web 端只作为旧外观的参考，不再约束新视觉；产品事实、内容、功能和页面动线保留。桌面客户端是否跟随这套视觉体系尚未决定（见 GitHub Issue #58），在决定之前仍以 `docs/ui/Agent Store.dc.html` 为准。Web 端的视觉体系写在 `DESIGN.md`。
- 2026-11-11 决定：Web 端的「安装」先尝试唤起桌面客户端；唤不起时复制安装命令并提示下载客户端。Web 端不显示「已装」这类它无法确认的状态。
- 2026-11-11 决定：详情抽屉承担安装决定。首屏放发布者级别、审查结论、安装后会执行的内容、安装命令；README 和版本历史往下滚；可展开为整页。
- 2026-11-11 决定（#75）：落地页先讲用途，再给浏览入口，下载客户端是第二个入口。依据是上面的浏览动线（落地页 → 商店 → 详情 → 安装 → 客户端）和原则 4。落地页不展示实现与维护流程（registry、PR、CI、监听地址、Level），这些写在文档页；安装包未签名的提示放在下载按钮之前。
- 视觉方向已选定并写入 `DESIGN.md`，本文件不重复记录。

## Brand Commitments

- 产品名：Agent Store。
- 标志：仓库根目录 `assets/logo.png`。

## Evidence on Hand

- 发布文案：`docs/LAUNCH-COPY.md`（一句话、三句话、各渠道版本）。
- 演示脚本：`docs/DEMO-SCRIPT.md`。
- 旧界面参考：`docs/ui/Agent Store.dc.html`，`docs/ui/screens/*.png`（已知有过时内容）。
- 没有：用户证言、客户标志、使用量数据、媒体报道、演示视频。后续工作不得编造。
- 文案里已公开承认的现状：桌面端安装包暂未签名，目录规模还小。

## Product Principles

1. 帮访客尽快判断「这个包能不能信、装了会跑什么」，然后装上。
2. 透明先于包装：审查结论、安装内容、现有短板如实写明。
3. 面向熟手：不解释终端和 agent 的基本概念，信息密度优先于引导。
4. Web 端负责发现和决定，使用发生在本机，页面要把人顺利交给安装步骤。
