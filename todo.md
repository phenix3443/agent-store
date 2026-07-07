# 需要你手动操作的清单

我（Claude）配不了的、需要你点页面或走审核的事项。做完对应项打勾并给我信号，我接着往下做。

关键常量：
- Supabase 项目 ref：`faiygihglitiuqywajyh`
- 桌面 App 回调：`agent-store://auth-callback`

---

## 1. 桌面端代码签名

### macOS —— ⏳ 已申请 Apple Developer，等审核
- [ ] Apple Developer Program 审核通过（$99/年，**已提交申请，等待中**）
- [ ] 通过后拿到 Developer ID Application 证书 + 公证凭据，给我（走 GitHub Secrets，不进代码）：
      `APPLE_CERTIFICATE`(base64 .p12) / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`
- [ ] 我接进 `.github/workflows/release.yml`，之后 macOS 下载零提示（消除「已损坏」）

### Windows 代码签名 —— 未开始（可选，后续）
- [ ] Windows OV/EV 证书，消除 SmartScreen「未知发布者」

> 现状：v0.1.0 已发版（macOS universal dmg + Windows exe/msi），均为**未签名**构建。
> 未签名的临时打开办法已写进 Release 说明 / 落地页 / 文档（macOS：`xattr -cr "/Applications/Agent Store CLI.app"`）。

---

## 2. Waffo 上真实收款（KYB 过后）
- [ ] Waffo 完成 KYB / 生产资质审核
- [ ] 换 prod 凭证重跑 `scripts/waffo-setup.ts`（`WAFFO_TEST=false`）+ 产品 `.publish()`
- [ ] Worker secret 换成 prod 值（同名，`--env production`）

> test 环境端到端已跑通验证过（付款 → webhook → subscriptions 表 → `/api/entitlements=pro`）。

---

## 3. 桌面 GitHub 登录端到端验证（代码已完成，只差你点一次授权）
```bash
cd /Users/liushangliang/github/phenix3443/agent-store
AS_STORE_URL=https://as-api-test.phenix3443.workers.dev make dev-gui
```
- [ ] 设置 → 账户 → 「GitHub 登录」→ 浏览器授权 → 自动跳回 App
- [ ] 账户显示邮箱 + 「已登录」（此时 plan 仍是 free）

> 想纯验证 Pro 解锁逻辑：临时 `AS_PLAN=pro` 起 sidecar。
