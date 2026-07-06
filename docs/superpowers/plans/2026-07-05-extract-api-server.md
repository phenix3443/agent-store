# 拆分独立 API Server 实施方案

**目标**：把 catalog 读接口从 Next.js（`apps/store`）中拆出，独立为 `apps/api`（Hono + Bun），
让 web 与 CLI 都通过 HTTP 消费它。web 的部署改动从此无法影响 CLI 的数据接口。

**架构（拆分后）**：
```
Supabase ← apps/api (Hono, Railway) ─┬─ CLI (@as/sdk, marketUrl → apps/api)
   ↑ seed.sql                        └─ web (Next.js pages, 后续切到 apps/api)
apps/store 仅保留 auth 写接口 /api/items/create（Supabase Auth cookie，仅 web 用）
```

**契约不变**（由 `@as/sdk` 锁定，CLI 零改动）：
- `GET /api/items?category&q&limit&offset&sort` → `{ items: Item[] }`
- `GET /api/items/:slug` → `{ item: Item }`
- `GET /api/publishers/:slug` → `{ publisher, items }`

## Task 1: 新建 `apps/api`（Hono + Bun）
- `apps/api/package.json`：`@as/api`，deps: `hono`、`@supabase/supabase-js`、`@as/types`
- `apps/api/src/supabase.ts`：普通 `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`（无 next/headers）
- `apps/api/src/db-types.ts`：从 `apps/store/lib/db-types.ts` 复制 `mapItem/mapPublisher/DBItem/DBPublisher`
- `apps/api/src/queries.ts`：`getItems/getItemBySlug/getPublisherBySlug/getPublisherItems`（从 store lib/queries 移植，改用上面的 supabase 客户端）
- `apps/api/src/index.ts`：Hono app + CORS + 三个读路由 + `GET /` 健康检查；`Bun.serve` 监听 `PORT`（默认 3001）
- 测试：路由响应形状与 SDK 契约一致
- 验证：`bun test`、`bunx tsc --noEmit`

## Task 2: CLI 指向 apps/api
- `apps/cli/src/engine.ts`：`createEngine` 读 `AS_MARKET_URL` env 传给 `AASEngineImpl`（→ `AASClient(marketUrl)`），dev 默认 `http://127.0.0.1:3001`
- 验证：起 apps/api，`AS_MARKET_URL=... bun run apps/cli/src/index.ts __rpc search '[""]'` 返回真实目录

## Task 3: 移除 Next.js 读路由，dev 编排
- 删除 `apps/store/app/api/items/route.ts`、`items/[slug]/route.ts`、`publishers/[slug]/route.ts` 及其测试（被 apps/api 取代；web 页面本就走 mock，不受影响）
- 保留 `app/api/items/create`（auth 写，仅 web）
- `apps/store/lib/queries/*` 若仅被上述已删路由使用则一并删除；`lib/supabase/server` 若 create 仍需则保留
- `Makefile` 的 `dev` / `dev-gui`：加启动 `apps/api`，并为 CLI/sidecar 设 `AS_MARKET_URL`
- 验证：`bunx turbo run test type-check` 全绿；起 apps/api + dev-gui，CLI GUI 能看到 local/yls/skyapi

## Task 4（可选，单一数据源）: web 页面切到 apps/api
- `apps/store/app/store/*`、`publisher/*` 从 `import lib/mock` 改为经 `@as/sdk`/fetch 调 apps/api
- `lib/mock` 降级为测试/离线用
- 本任务独立，可在核心拆分验证后再做
