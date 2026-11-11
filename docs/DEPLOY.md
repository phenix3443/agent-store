# 部署

只有一个测试环境，跑在 home-lab 的 k3s 集群上（节点 `vm-149`，美国），公网地址 `https://agent-store-test.panghuli.tech`，经 Cloudflare Tunnel 进集群。商店和 API 共用这个域名，ingress 按路径分流：`/api/auth/*` 给商店，其余 `/api/*` 给 API，其他路径给商店。

| 组件 | 地址 | 镜像 |
|---|---|---|
| 网页商店（含登录） | `https://agent-store-test.panghuli.tech` | `ghcr.io/phenix3443/agent-store-store` |
| API | `https://agent-store-test.panghuli.tech/api/*` | `ghcr.io/phenix3443/agent-store-api` |
| Postgres 18 | 集群内 `postgres:5432` | `postgres:18-alpine` |

部署清单、密钥和入口配置在 home-lab 仓库的 `projects/agent-store/test/`，那里的 README 写了怎么排查。

## 发布流程

1. PR 合入 `main`。
2. `images` 工作流在 GitHub 托管的 runner 上构建两个镜像，推到 ghcr，tag 为 `main-<UTC 时间戳>`。
3. home-lab 的 Flux 扫到新 tag，提交回 home-lab 并滚动更新。
4. API Pod 启动前，初始化容器先跑 `src/migrate.ts`（迁移），再跑 `src/seed.ts`（只在目录为空时导入 `db/seed.sql`）。迁移失败时新版本不会开始接流量。

商店的 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL` 在构建镜像时写进浏览器端代码，改地址要改 `.github/workflows/images.yml` 并重新构建。

## 登录

Better Auth 跑在商店里（`apps/store/lib/auth/server.ts`），用户、会话等表和目录数据在同一个库，表结构由 API 的 drizzle 迁移管理。

- 浏览器和桌面端向商店的 `/api/auth/token` 换一个短期 JWT，调用 API 时放在 `Authorization: Bearer` 里。
- API 用商店的 `/api/auth/jwks` 验签（`AUTH_JWKS_URL`，集群内直连 `http://store:3000`），并校验签发方 `AUTH_ISSUER`。
- 令牌里的 `username` 是 GitHub 登录名，发布者按它对应。
- GitHub OAuth App 的回调地址是 `https://agent-store-test.panghuli.tech/api/auth/callback/github`；Google OAuth 客户端的重定向 URI 是 `https://agent-store-test.panghuli.tech/api/auth/callback/google`。Google 只在配置了 `GOOGLE_CLIENT_ID` 时启用。
- `/auth/login`、`/auth/logout` 在进程内调用 Better Auth，不经 HTTP 请求自己：Pod 里的 `request.url` 是容器的明文地址，拿它拼出来的地址访问不通。
- 改了登录配置（加插件、加用户字段）后，用 Better Auth 的 `getMigrations` 对比一次表结构，再改 `apps/api/src/db/schema.ts` 并生成迁移。

## 支付（Waffo Pancake）

API 已接入：`POST /api/billing/checkout` 建订单，`POST /api/webhooks/waffo` 收 webhook 写 `subscriptions`，`GET /api/me/entitlements` 返回当前套餐。

| 变量 | 用途 |
|---|---|
| `WAFFO_MERCHANT_ID` | 商户 ID |
| `WAFFO_PRIVATE_KEY_BASE64` | RSA 私钥（base64） |
| `WAFFO_PRODUCT_ID_PRO_MONTHLY` / `WAFFO_PRODUCT_ID_PRO_YEARLY` / `WAFFO_PRODUCT_ID_LIFETIME` | 产品 ID |
| `WAFFO_CHECKOUT_SUCCESS_URL` | 付款后跳转。只认这个配置，请求体里的地址会被忽略 |

Waffo 的 webhook 地址是 `https://agent-store-test.panghuli.tech/api/webhooks/waffo`，`apps/api/scripts/waffo-setup.ts` 默认就配这个地址。

## 本地开发

```sh
make setup     # 起本地 Postgres（Docker），迁移并导入种子数据，生成 apps/store/.env.local
make dev-env   # API + 商店 + 桌面端
make seed      # 清空本地库，回到种子数据
```

`apps/store/.env.local` 要填 `BETTER_AUTH_SECRET` 和一个回调指向 `http://localhost:3000/api/auth/callback/github` 的 GitHub OAuth App。

## 测试

- `api` 工作流：API 类型检查、单元测试，再在 Postgres 服务容器上迁移、导入种子数据并跑连库测试（`bun test integration`）。连库测试必须单独一个进程跑：`app.test.ts` 用 `mock.module` 替换了查询模块，Bun 的模块 mock 在同一进程里对所有文件生效。
- `images` 工作流：PR 上只构建不推送，能提前发现 Dockerfile 或 `next build` 的问题。

## 桌面安装包分发

落地页的下载按钮读 `NEXT_PUBLIC_DOWNLOAD_MAC_URL` / `NEXT_PUBLIC_DOWNLOAD_WIN_URL`（未设置时指向 `#`）。安装包的托管位置还没定。
