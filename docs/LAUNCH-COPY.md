# 发布文案（可直接粘贴，按需微调）

> 换掉占位链接：商店 `https://agent-store-alpha.vercel.app`、registry `https://github.com/awesome-agent-store/registry`。有域名后统一替换。

---

## 一句话

- **EN**: Agent Store — a curated marketplace of skills, MCP servers, and model providers for Claude Code & Codex, plus a local relay that saves money and fails over between providers.
- **中**: Agent Store —— Claude Code / Codex 的技能、MCP、模型供应商**精选市场**，外加省钱又容灾的**本地代理**。

## 三句话（elevator）

- **EN**: Discover and one-click install the skills, MCP servers, and providers that extend your AI coding agent — all from one place. Every package is a single manifest reviewed via PR and scanned by an LLM for quality + safety. A local relay routes your requests across providers with automatic failover and usage/budget analytics.
- **中**: 一个入口，发现并一键安装扩展你 AI 编码 agent 的技能、MCP 与供应商。每个包都是一份清单，走 PR 审核 + LLM 质量/安全扫描。本地代理跨供应商转发、自动降级，带用量与预算分析。

---

## Show HN

**Title:** `Show HN: Agent Store – a marketplace of skills/MCP/providers for Claude Code`

**Body:**
```
I've been using Claude Code and Codex a lot, and installing skills, MCP servers,
and wiring up providers was scattered and manual. So I built Agent Store: one
place to discover and one-click install them, plus a local relay.

A few choices I think are interesting:

- The catalog is a public git registry — each package is one JSON manifest, added
  via PR. CI validates the schema and checks that install URLs resolve; a crawler
  also proposes popular packages as PRs. No PAT anywhere: contributions come
  through your own GitHub session or the built-in Actions token.

- Because you're installing things an agent will run (skills are instructions it
  follows, MCP servers run npx code), every package gets an LLM quality + safety
  review, and the detail page discloses exactly what will run.

- The local relay points Claude Code/Codex at 127.0.0.1, forwards to your
  configured providers by priority, fails over on errors (with a circuit breaker),
  and tracks usage + budget.

Honest caveats: the desktop build is currently unsigned (Gatekeeper will warn),
and the catalog is still small. Would love feedback on the model and what packages
you'd want.

Store: <link>   Registry: <link>
```

---

## Product Hunt

- **Tagline (60 chars):** `Install any skill, MCP, or provider for your coding agent`
- **Description:**
  ```
  Agent Store is a curated marketplace for Claude Code, Codex, and other AI coding
  agents. Discover and one-click install skills, MCP servers, and model providers.
  Every package is reviewed via PR + an LLM quality/safety scan, and a local relay
  routes across providers with automatic failover, usage and budget analytics.
  ```
- **Maker's first comment:** 见 Show HN body，去掉 "Show HN" 语气，加一句"AMA / 想要哪些包告诉我"。

---

## X / Twitter 帖（串）

1. 🧩 一直在用 Claude Code + Codex，但装 skill / MCP / 配供应商太散、太手动。于是做了 **Agent Store**：一个入口一键装齐 + 本地代理。<demo 视频>
2. 目录是个**开放的 git registry**：每个包一份清单，走 PR。CI 校验、爬虫自动提新包、还有 **LLM 质量+安全审查**——因为你装的是 agent 会执行的东西。
3. **本地代理**把请求跨供应商转发、失败自动降级（带熔断），还有用量/预算分析。省钱 + 容灾。
4. 早期项目、桌面端暂未签名，想要什么包/功能欢迎砸过来 👇 <link>

---

## 国内（V2EX「分享创造」/ 即刻 / 掘金）

**标题：** 做了个 Claude Code / Codex 的「应用商店 + 本地中转」，一键装 skill/MCP/供应商

**正文：**
```
自己常用 Claude Code 和 Codex，装技能、配 MCP、接中转都挺散的，就做了 Agent Store：

- 一个入口，一键装技能 / MCP / 模型供应商
- 目录是开放的 git registry，每个包一份清单走 PR，还有爬虫自动发现 + LLM 质量/安全审查
- 内置本地中转：把 baseURL 指向本机，按优先级跨供应商转发、失败自动降级，带用量和预算分析（省钱 + 容灾）

还早，桌面端暂时没签名（首次打开 macOS 会提示，README 有解决办法）。目录还在扩，想要哪些包/中转欢迎留言。
商店：<link>  仓库：<link>
```
（掘金可扩成带截图的图文；小红书走"3 步装好一个 Claude Code 技能"截图向。）

---

## 需要配套的素材（非文案）

- 30–60s **demo 视频/GIF**：搜一个 MCP → 安装 → 在 Claude Code 里立刻用上
- 首图：商店网格 / 桌面端仪表盘 / 安全审查徽章
- OG 图（1200×630）——目前 OG 只有文字，配张图点击率更高
