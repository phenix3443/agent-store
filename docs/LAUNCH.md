# 发布与增长清单（Go-to-Market）

面向 Claude Code / Codex 用户的独立开发者发布计划。SEO 侧已在代码里落地（每个包页 `generateMetadata`、`sitemap.xml`、`robots.txt`、OG 标签）；这份文档是叙事 + 渠道 + 节奏。

## 定位 / 钩子

一句话：**「一个入口，装齐所有 Agent 能力」——Claude Code / Codex 的技能、MCP、供应商市场 + 本地代理。**

三个差异化卖点（按强弱排）：
1. **可信市场**：每个包经过 LLM 质量+安全审查，带风险徽章、透明披露「装它会跑什么」。（别家没有）
2. **本地代理**：多供应商统一转发 + 失败自动降级 + 熔断健康 + 用量/预算分析。省钱、容灾。
3. **开放贡献**：包即一个 PR，人人可贡献，爬虫自动发现。

## 发布前必须就绪（否则别发）

- [ ] 桌面端**代码签名**（否则 macOS「已损坏」直接劝退）——这是最高优先级
- [ ] 首个正式 **Release** 可下载（已就绪：universal dmg + Windows）
- [ ] 落地页/文档打磨到位，**demo 视频/GIF**（30–60 秒装一个 skill/MCP → 立刻用上）
- [ ] 目录里有 **20–30 个真正好用的包**（不是随机抓的），首页精选
- [ ] （可选）自有域名替代 `*.vercel.app`（对 SEO 与信任有帮助）

## 渠道

**国际（英文）**
- **Show HN**（Hacker News）——标题直白，正文讲"为什么做/技术选择"，作者本人蹲评论区
- **Reddit**：r/ClaudeAI、r/LocalLLaMA、r/ChatGPTCoding
- **X/Twitter**：Claude Code / MCP 圈子很活跃；发 demo 视频 + @ 相关工具作者
- **Product Hunt**：配好 demo、首图、首评
- **MCP / Claude Code 的 awesome-list、Discord**（我们爬过的那些仓的社区）

**国内（中文）**
- **V2EX**（分享创造节点）、**掘金**、**即刻**、**小红书**（截图向）
- Twitter 中文开发者圈、微信群/公众号
- 蹭已有的 "Claude Code 国内使用" 内容生态（claudecn.com 等）

## 需要的素材

- 30–60 秒 **demo 视频**（装一个 MCP/skill → 立刻在 Claude Code 里用上）
- 3–5 张**首图/截图**（商店、桌面端仪表盘、安全审查徽章）
- 一段**中英文 copy**（一句话 + 三句话 + 一段）
- **"Top 10 MCP / Top 10 Claude Code skills"** 这类内容页（既是营销也是 SEO 落地页）

## 节奏

1. **软发布**：先发一两个中文社区（V2EX / 即刻）小范围试水，收反馈修 bug
2. **主发布**：素材齐了同一天打 Show HN + Product Hunt + X + Reddit，作者全程蹲守
3. **持续**：把每个热门包/合集做成可被搜索索引的内容页；鼓励贡献者发 PR 后自发传播（贡献者即传播者）

## 增长循环

- **贡献 → 传播**：作者提包 PR / 上架后会分享，带来流量（registry PR 模式天然利于此）
- **内容 → SEO**：包详情页 + 合集页排 "claude code skills / mcp / 中转" 等词
- **省钱叙事 → 留存**：本地代理的预算/用量分析给用户回来的理由
