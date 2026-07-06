# 开发与部署 Runbook（本地 / 线上测试 / 线上生产）

三套环境，操作与配置不同。详见 skill `indie-deploy` 与
`docs/superpowers/specs/2026-07-05-deployment-dual-region.md`。

---

## A. 本地开发环境（已就绪，一条命令起）

前提：Docker 运行中；已有 `apps/store/.env.local`（本地 Supabase 的 URL + anon key，`supabase status` 可查）。

| 命令 | 起什么 | 端口 |
|---|---|---|
| `make dev-gui` | 本地 Supabase + 目录 API(apps/api) + 桌面客户端(Tauri)，客户端经 `AS_STORE_URL` 指向本地 API | DB 54321 / API 3001 / app 窗口 |
| `make dev-api` | 本地 Supabase + 目录 API | API 3001 |
| `make dev` | 本地 Supabase + Web 商店(next dev) | web 3000 |
| `make seed` | 重置本地 DB 并灌 seed（`supabase/seed.sql`，含 local/yls/skyapi） | — |

- 数据可随意重置：`make seed`。
- 本地 API 冒烟：`curl "http://127.0.0.1:3001/api/items?category=provider"`。
- 本地绝不连云端；密钥只在 `.env.local`（已 gitignore）。

---

## B. 线上测试环境（核心已上线 ✅，仅剩 web 前端）

通过 headless `claude -p` 子进程驱动 MCP 自动部署完成（绕过"会话中途 MCP 工具不加载"的限制）。

### 已上线 ✅
- **Supabase 测试项目** `agent-store-test`（ref `faiygihglitiuqywajyh`，Singapore 区），已推 migration + seed（含 local/yls/skyapi）。
- **目录 API** 在 Cloudflare Workers：**https://as-api-test.phenix3443.workers.dev**
  - 冒烟：`curl "https://as-api-test.phenix3443.workers.dev/api/items?category=provider"` → 返回 6 个 provider。
  - Supabase URL/anon key 已作为 Worker secret 注入（test 环境）。
- **CLI 指向线上 API** 已验证可用：
  ```bash
  AS_STORE_URL=https://as-api-test.phenix3443.workers.dev \
    bun run apps/cli/src/index.ts __rpc search '[""]'
  ```
- 凭据（URL/anon/db 密码/worker URL）存于本会话 scratchpad 的 `test-env-creds.env`，**未入库**。

> 至此 CLI / 桌面客户端已可对着线上测试 API 工作 —— 测试环境核心可用。

### 仅剩：Web 前端上 Vercel（需你交互授权一次）
Vercel 的 MCP 无"源码部署/建 git 项目"工具，CLI token 又已过期被清。需你二选一:
```bash
! bunx vercel login          # 交互 OAuth
# 或在 Vercel 控制台 Account Settings → Tokens 生成后：
! export VERCEL_TOKEN=xxxx
```
授权后我用 headless 子进程完成：建/连项目（Root Directory = apps/store）、设环境变量（测试 Supabase URL/anon key + 上面的 Worker URL）、部署 preview、验证 200。

---

## C. 线上生产环境（后续完善）
独立 `agent-store-prod` Supabase 项目（无 seed、真实数据、谨慎迁移）；`wrangler deploy --env production`；Vercel Production；自定义域 + Cloudflare 代理；CI/CD（GitHub Actions）；桌面端分发（Releases + R2 镜像 + Tauri updater + 签名）。
