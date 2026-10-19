# Waffo Legal Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish factually accurate bilingual legal pages with site-wide legal/support discovery, encode the checks in the onboarding skill, deploy the corrected storefront, and update the merchant-review record.

**Architecture:** A shared server-rendered `Footer` is mounted in the root layout so every public route exposes legal and support links. Terms and Privacy remain server pages and select Chinese or English content from the request locale; all non-Chinese locales use the complete English legal text. Focused Bun/Testing Library tests lock down crawler-visible links, locale semantics, provider disclosures, pricing, and removal of unsupported claims.

**Tech Stack:** Next.js 15, React 18, next-intl, Bun test, Testing Library, Tailwind CSS, Cloudflare Workers/Wrangler, Markdown Agent Skill.

## Global Constraints

- Do not invent operator identity, governing law, business address, refund windows, or Waffo contractual responsibilities.
- Production deployment means the corrected public site only; do not activate Waffo production credentials or perform a real charge.
- Preserve the established document layout and design-file conventions.
- Show one legal-document language at a time and use `mailto:agent-store@panghuli.tech` for contact.
- Preserve unrelated worktree changes, especially `.claude/skills/waffo-pancake/SKILL.md`.

---

### Task 1: Shared Legal And Support Footer

**Files:**
- Create: `apps/store/components/Footer.tsx`
- Create: `apps/store/components/__tests__/Footer.test.tsx`
- Modify: `apps/store/app/layout.tsx`
- Modify: `apps/store/app/page.tsx`

**Interfaces:**
- Produces: `Footer(): JSX.Element`, a server-renderable component with `/terms`, `/privacy`, and `mailto:agent-store@panghuli.tech` links.
- Consumes: request locale through `getLocale()` and existing Next.js `Link`.

- [x] Write `Footer.test.tsx` to render the component and assert the three exact `href` values and visible labels.
- [x] Run the focused footer test before implementation; expect failure because `Footer` does not exist.
- [x] Implement `Footer`, using Chinese labels for `zh` and English labels for other locales.
- [x] Mount it after the route content in `app/layout.tsx` and remove the home-only footer from `app/page.tsx` so links occur once.
- [x] Run the focused test; expect all footer assertions to pass.

### Task 2: Bilingual Terms And Privacy

**Files:**
- Create: `apps/store/app/terms/__tests__/page.test.tsx`
- Create: `apps/store/app/privacy/__tests__/page.test.tsx`
- Modify: `apps/store/app/terms/page.tsx`
- Modify: `apps/store/app/privacy/page.tsx`

**Interfaces:**
- Each page consumes `getLocale(): Promise<string>` and renders a single `<article lang="zh-CN|en">`.
- Legal content represents paragraphs and bullet lists without HTML strings.

- [x] Write Terms tests for Chinese and English rendering, USD 9.99/99/199 pricing, 14-day trial, automatic renewal, tax-included wording, cancellation/refund support path, lifetime purchase, and `mailto:` contact.
- [x] Write Privacy tests for Chinese and English rendering, Neon/Cloudflare/Vercel/GitHub/Google/Waffo, review and billing metadata, local usage fields and 30-day detail retention, `us-east-1`, manual account-deletion request, and absence of cross-device sync claims.
- [x] Run both page tests; expect failures on missing English content and inaccurate current statements.
- [x] Replace Terms content with matched Chinese/English fact sets, conditionally describing Waffo production activation and retaining explicit operator/jurisdiction confirmation language.
- [x] Replace Privacy content with matched Chinese/English fact sets, correct processor/data/storage/retention disclosures, and no unsupported sync or self-service deletion claims.
- [x] Run both focused test files; expect all assertions to pass.

### Task 2A: Public Claim Consistency

**Files:**
- Modify: `apps/store/app/docs/page.tsx`
- Modify: `apps/store/components/LoginModal.tsx`
- Create: `apps/store/app/docs/__tests__/page.test.tsx`
- Create: `apps/store/components/__tests__/LoginModal.test.tsx`

- [x] Add failing tests for the remaining unsupported cross-device synchronization claims.
- [x] Replace the claims with accurate local-management and account-entitlement wording.
- [x] Make the login modal's Terms and Privacy references functional links.
- [x] Run the focused tests and search public source for remaining unsupported claims.

### Task 3: Onboarding Skill Regression Rule

**Files:**
- Modify: `/Users/liushangliang/.codex/skills/waffo-merchant-onboarding/references/legal-checklist.md`
- Modify: `/Users/liushangliang/.codex/skills/waffo-merchant-onboarding/SKILL.md`

**Interfaces:**
- The skill's legal audit workflow must verify homepage discoverability, not only direct legal URL availability.

- [x] Add a checklist requiring visible homepage/footer links to Terms, Privacy, and an effective support channel; require representative public-page checks and exact `href` verification.
- [x] Add deployment verification that reads back `/`, `/pricing`, `/terms`, and `/privacy`, follows footer links, and distinguishes HTTP availability from discoverability.
- [x] Run the skill validator `python3 /Users/liushangliang/.agents/skills/skill-creator/scripts/quick_validate.py /Users/liushangliang/.codex/skills/waffo-merchant-onboarding`; expect validation success.

### Task 4: Repository Verification And Visual Review

**Files:**
- No additional source files expected.

**Interfaces:**
- Consumes Tasks 1-2 and produces evidence suitable for deployment.

- [x] Run `pnpm --filter @as/store test`; expect all store tests to pass.
- [x] Run `pnpm --filter @as/store type-check`; expect zero TypeScript errors.
- [x] Run `pnpm --filter @as/store lint`; expect zero lint errors.
- [x] Run the OpenNext production build; expect a successful Next.js and Cloudflare bundle.
- [x] Start `pnpm --filter @as/store dev` on an unused port and inspect `/`, `/pricing`, `/terms`, and `/privacy` at desktop and mobile widths.
- [x] Verify no overflow, clipping, overlap, duplicate footers, mixed-language documents, broken mail links, or inaccessible language controls.

### Task 5: Production Store Deployment And Readback

**Files:**
- Modify only if the existing deployment manifest requires a durable legal-page setting; no credential changes are authorized.

**Interfaces:**
- Uses the repository's existing `@as/store` Cloudflare deployment command and authenticated Wrangler session.

- [x] Confirm `wrangler --version`, authenticated account, production target, and clean intended deployment diff.
- [x] Run the existing production store deployment command from the product repository.
- [x] Read back `https://agent-store.panghuli.tech/`, `/pricing`, `/terms`, `/privacy`, and `/docs`; expect HTTP 200 and current deployed content.
- [x] Confirm the homepage and pricing footer expose `/terms`, `/privacy`, and `mailto:agent-store@panghuli.tech`.
- [x] Do not change Waffo production secrets, products, webhooks, or billing mode.

### Task 6: Merchant Review Record

**Files:**
- Modify: `/Users/liushangliang/github/phenix3443/obsidian/agent-store/docs/WAFFO-MERCHANT-REVIEW.md`

**Interfaces:**
- Consumes verified source and production evidence from Tasks 1-5.
- Produces one standalone Waffo copy/paste chapter followed by internal evidence and remaining blockers.

- [x] Consolidate website, pricing, Terms, Privacy, support, operator, product, and delivery answers under one Waffo form chapter without duplicate answer blocks elsewhere.
- [x] Mark legal-page and discoverability findings resolved only when production readback proves them.
- [x] Preserve unresolved operator identity, governing law, final refund policy, anonymous purchase binding, refund entitlement, cancellation UI, and Waffo production activation as blockers.
- [x] Run `git diff --check` in both repositories and verify only intended files changed.
