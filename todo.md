# 需要你手动操作的清单

我（Claude）配不了的、需要你点页面的事项。做完对应项就打勾，OAuth 那几项配完给我个信号，我就把桌面端登录 UI + deep-link 写完并真机验证。

关键常量（下面反复用到）：
- Supabase 项目 ref：`faiygihglitiuqywajyh`
- GitHub App 回调（填在 GitHub）：`https://faiygihglitiuqywajyh.supabase.co/auth/v1/callback`
- 桌面 App 回调（填在 Supabase Redirect URLs）：`agent-store://auth-callback`

---

## A. 立即能做（无依赖）—— ✅ 已完成

- [x] Waffo 询价邮件已发出（→ merchant-support@waffo.com）

---

## B. OAuth 登录（Supabase Auth）

### B1. GitHub OAuth App —— ✅ 已完成
- [x] GitHub App「Agent Store (test)」已存在，回调 URL 正确

### B2. Supabase 启用 GitHub provider —— ✅ 已完成
- [x] 远端 `external_github_enabled = true`（已确认）

### B3. 加桌面端回调 URL —— ✅ 已完成（Claude 通过 Management API 加好）
- [x] `agent-store://auth-callback` 已在 allow list 中

> GitHub 登录后端三件套已齐活，无需再手动操作。
> 备注：若日后桌面端登录报错，回来核对 GitHub provider 的 client_id/secret 是否填全（现在只知 enabled=true）。

### B4. Google 登录 —— ✅ 已启用
- [x] 远端 `external_google_enabled = true`（已确认）

---

## C. API 密钥（webhook 写订阅要用）—— ✅ 已完成（Claude 用 CLI 做的）

- [x] service_role key 已通过 supabase Management API 取出（用 CLI 钥匙串 token，值未外泄）
- [x] 已 `wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env test`（`wrangler secret list` 已确认存在）

---

## D. Waffo 支付（等 KYB 通过 / 拿到凭证后）

- [ ] 在 Waffo Dashboard 创建 Pro **月/年订阅产品**，记下 Product ID
  - 打开：https://pancake.waffo.ai/merchant/dashboard/integration
- [ ] 取 `WAFFO_MERCHANT_ID` 和 RSA 私钥（同上页面 · API & Development）
- [ ] 配 webhook（channel=http），指向：
  `https://as-api-test.phenix3443.workers.dev/api/webhooks/waffo`
  订阅事件：`subscription.activated` / `subscription.payment_succeeded` / `subscription.canceling` / `subscription.canceled` / `subscription.past_due`
- [ ] 设为 Cloudflare Worker secret：
  ```bash
  wrangler secret put WAFFO_MERCHANT_ID --env test
  wrangler secret put WAFFO_PRIVATE_KEY_BASE64 --env test   # cat private.pem | base64 | tr -d '\n'
  wrangler secret put WAFFO_PRODUCT_ID_PRO_MONTHLY --env test
  wrangler secret put WAFFO_PRODUCT_ID_PRO_YEARLY --env test
  ```

---

## E. 桌面 GitHub 登录 —— 代码已全部完成 ✅，只差你点一次授权验证

Claude 已完成并通过编译/单测：Auth 上下文、SettingsModal GitHub 登录按钮 + 升级 CTA、Tauri deep-link（Rust 插件 + `agent-store://` scheme + 权限）、entitlement 同步。`cargo check` + 133 前端测试全过。

**最后的端到端验证（需要你，OAuth 授权只能人工点）：**
```bash
# 让桌面 sidecar 指向已部署的 test API（与远端 Supabase 项目匹配，token 才校验得过）
cd /Users/liushangliang/github/phenix3443/agent-store
AS_STORE_URL=https://as-api-test.phenix3443.workers.dev make dev-gui
```
- [ ] App 起来后：设置 → 账户 → 点「GitHub 登录」→ 浏览器弹出 GitHub 授权 → 点 Authorize → 自动跳回 App
- [ ] 观察：账户显示你的邮箱 + 「已登录」；此时 plan 仍是 free（没订阅）
- [ ] 概览页的「预算与超支告警」仍是锁态（因为 free）——点「升级 Pro」会打开 Waffo checkout（需 D 段 Waffo 配好才有真实产品）

> 说明：登录本身现在就能验证；"升级解锁 Pro" 要等 D 段 Waffo 凭证到位、真买一单后 webhook 回填订阅，`syncEntitlement` 才会把你变 pro。想先纯验证解锁逻辑，可临时 `AS_PLAN=pro` 起 sidecar。
