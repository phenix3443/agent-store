# 部署方案：国内 + 国际双可达（Cloudflare 前置，不备案）

**决策前提（用户拍板）**：不做 ICP 备案；以 Cloudflare 为核心。目标：国内与国际都能访问。

## 一、诚实的前提说明

不备案 + Cloudflare = 大陆访问是**尽力而为（best-effort）**：
- Cloudflare 标准套餐会把大陆流量路由到**境外边缘**（香港 / 东京 / 新加坡），不是境内 PoP（境内 PoP 需 Enterprise + China Network，而 China Network 仍要 ICP 备案）。
- 实测体感：大陆 → 港/日/新 约 50–150ms，通常可用，偶有 GFW 抖动。**对开发者工具够用**，但不如备案境内 CDN 稳。
- 升级路径（若将来国内体验成为硬需求）：ICP 备案 + Cloudflare China Network，或叠加一个境内 CDN。属于**未来决策**，现在不做。

## 二、总体架构（一切走 Cloudflare 边缘）

```
                      Cloudflare (DNS / CDN / SSL / WAF, 全球边缘 + 大陆尽力而为)
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                                ▼
  Web 商店 (Next.js)            Catalog API (apps/api, Hono)        下载 / 对象存储
  Vercel 源站                   Cloudflare Workers（Hono 原生）      Cloudflare R2
  (Cloudflare 代理在前)         常驻无冷启动、全球边缘               桌面安装包 + 更新清单
        │                               │
        └───────────────┬───────────────┘
                        ▼
                 Supabase (Singapore/Tokyo, DB + Auth)
                 仅被 Worker/服务端访问，终端用户不直连
```

**关键分层红利**：终端用户（含大陆）只打到 **Cloudflare 边缘**；边缘的 Worker 再去连 Supabase（云到云，快）。所以 **Supabase 在国内直连慢不影响终端用户**——用户永远不直连 Supabase。

## 三、各面的选型

### 1. Catalog API（apps/api）→ Cloudflare Workers ★核心红利
- Hono 本就是 Workers 优先框架，`apps/api` 几乎零重构即可上 Workers。
- 常驻无冷启动 → 对 CLI 命令行调用体验最好；全球边缘 → 大陆尽力而为但优于美区源站。
- **需要的代码适配**（部署时）：
  - 新增 Workers 入口 `apps/api/src/worker.ts`：`export default app`（保留 `index.ts` 的 `Bun.serve` 供本地开发）。
  - `getSupabase()` 改为从 **Hono context 的 env 绑定**取密钥，而非 `process.env`（Workers 无 process.env）；本地仍走 process.env。
  - 加 `wrangler.toml`；密钥用 `wrangler secret`（SUPABASE_URL / SUPABASE_ANON_KEY）。
- 备选（更少代码改动）：Fly.io / Railway 常驻容器（同一份 Bun 代码），Cloudflare 代理在前。牺牲"边缘"，换"零适配"。

### 2. Web 商店（Next.js）→ Vercel 源站 + Cloudflare 代理在前
- Next.js 14 App Router + Supabase SSR 用到 Node 运行时（构建已警告 supabase-js 的 `process.version` 不兼容 Edge），因此**不建议**硬塞 Cloudflare Pages 的 Edge 运行时。
- 最稳：Vercel 跑 Next.js（Node 运行时、Next 支持最好），Cloudflare 在 DNS 层代理到 Vercel 源站 → 拿到 Cloudflare 的边缘缓存 + 大陆尽力而为路由。
- 备选（全 Cloudflare 单厂商）：`@cloudflare/next-on-pages` 上 Cloudflare Pages，但需处理 Edge 运行时对 Supabase/Node API 的限制，工作量更大。

### 3. 数据库 / 鉴权 → Supabase（Singapore 或 Tokyo 区）
- 选亚太区，兼顾国内与全球；Supabase 无大陆区，这是务实最优。
- 仅 Worker/Next 服务端访问，用户不直连。
- 已在用 Supabase Auth（GitHub OAuth 发布鉴权），不引入 Clerk。

### 4. 桌面客户端（Tauri）分发 —— 文档漏掉、本项目最特殊的一面
- 安装包：**GitHub Releases（全球）+ 镜像到 Cloudflare R2（大陆经 Cloudflare CDN 尽力而为）**。
- Tauri 自动更新：`latest.json` 更新清单放 R2 / Workers，走 Cloudflare 边缘，双区可达。
- 签名（无论区域都必须）：macOS 公证（Apple Developer $99/年）+ Windows 代码签名证书（约 $100–400/年）。
- 商店站提供"下载"页，实际文件走 R2/Cloudflare（比 GitHub 在大陆更可达）。

### 5. 对象存储 → Cloudflare R2
- 先用于桌面安装包；将来 package 图标 / readme 上传再复用。当前图标是 dicebear 外链，YAGNI，暂不引入用户上传。

### 6. LLM 中转（local/yls/skyapi relay）
- 跑在用户本机（CLI 客户端内），**不部署**，与本方案无关。

## 四、其余取舍（相对原文档）
- 监控先只上 **Sentry**（错误）；PostHog / Better Stack 等有用户后再加。
- CI/CD：GitHub Actions —— web 部 Vercel、api 用 `wrangler deploy`、桌面端用 `tauri-action` 出 Releases + 传 R2。
- 邮件 Resend、支付 Stripe/微信：到商业化阶段再接。

## 五、分阶段落地
1. **P0 全球先通**：Vercel(web) + Workers(api) + Supabase(SG) + Cloudflare DNS/SSL；桌面端 GitHub Releases + Tauri updater。
2. **P1 大陆尽力而为**：域名接 Cloudflare 代理；安装包镜像 R2；验证大陆实测延迟/可达。
3. **P2 按需增强**：若大陆体验不达标，再评估备案 + China Network / 境内 CDN。

## 六、代码侧待办（本方案要求的改动，另立计划实施）
- `apps/api`：加 Workers 入口 + `wrangler.toml`；`getSupabase` 支持从 env 绑定取值。
- `apps/store`：修复 `next build` 的 i18n 可移植性错误（已在本次修复：tsconfig `declaration:false`），确保可上 Vercel。
- 新增 CI：`wrangler deploy`（api）、`tauri-action`（桌面端）、Vercel 集成（web）。
- 桌面端：配置 Tauri updater endpoint + 签名/公证密钥（放 GitHub Actions secrets）。
