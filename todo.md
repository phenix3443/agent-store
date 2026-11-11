# 需要你手动操作的清单

我（Claude）配不了的、需要你点页面或走审核的事项。做完对应项打勾并给我信号，我接着往下做。

关键常量：
- Supabase 项目 ref：`faiygihglitiuqywajyh`
- 桌面 App 回调：`agent-store://auth-callback`

---

## 1. 桌面端代码签名

### macOS —— ⏳ 已申请 Apple Developer，等审核（**CI 已预接线，只等证书**）
- [x] CI 已接入 `.github/workflows/release.yml`（引用好 6 个 `APPLE_*` secret，空值时仍出未签名包）
- [ ] Apple Developer Program 审核通过（$99/年，**已提交申请，等待中**）
- [ ] 通过后在 GitHub 仓库 Settings → Secrets and variables → Actions 添加这 6 个（加完下次发版自动签名+公证）：
      - `APPLE_CERTIFICATE` — Developer ID Application 证书导出的 .p12 再 base64：`base64 -i cert.p12 | pbcopy`
      - `APPLE_CERTIFICATE_PASSWORD` — 导出 .p12 时设的密码
      - `APPLE_SIGNING_IDENTITY` — 形如 `Developer ID Application: 你的名字 (TEAMID)`
      - `APPLE_ID` — 你的 Apple ID 邮箱
      - `APPLE_PASSWORD` — App 专用密码（appleid.apple.com 生成，**非**登录密码）
      - `APPLE_TEAM_ID` — 10 位 Team ID

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
AS_STORE_URL=https://agent-store-test.panghuli.tech make dev-gui
```
- [ ] 设置 → 账户 → 「GitHub 登录」→ 浏览器授权 → 自动跳回 App
- [ ] 账户显示邮箱 + 「已登录」（此时 plan 仍是 free）

> 想纯验证 Pro 解锁逻辑：临时 `AS_PLAN=pro` 起 sidecar。
