# Web Store Redesign — Design Spec

## Background

`ui/Agent Store.dc.html` + `ui/README.md` is a high-fidelity design reference for two surfaces (Web Store, CLI GUI client) bundled together in one HTML prototype for demo purposes. `apps/market` already exists as a working Next.js 14 (App Router) app with a Supabase backend, real routes (`/`, `/store`, `/store/[category]/[slug]`, `/publisher/[name]`, `/submit`, `/dashboard`), and a "Raycast Store" visual style — completely different from the new design's visual language and overlay-based interaction model (drawers, modals, carousel).

This spec covers **redesigning `apps/market` in place** to match the new design, with mock data instead of live Supabase queries. It does **not** cover implementing the CLI GUI client (see "CLI — plan only" section).

## Scope

**In scope:**
- Visual redesign of `apps/market` to match `Agent Store.dc.html` design tokens, layout, and copy (Simplified Chinese, with i18n path for English).
- Browse experience: header, featured carousel, category tabs, sort, search, item grid.
- Detail drawer, publisher drawer, publish modal (dynamic field schema).
- Favorites / install-state / publish, mocked entirely client-side (no real install, no Supabase writes).
- Mock data layer replacing `lib/queries/*` calls in the touched pages.

**Out of scope (this pass):**
- Reconnecting to real Supabase data (existing query layer is left untouched, to be rewired in a later pass).
- The CLI GUI client (Tauri/Electron desktop app) — see "CLI — plan only" below. The existing terminal `apps/cli` is unaffected.
- `/dashboard` page — stays as-is, not part of the new design.

## Stack additions

- `@radix-ui/react-dialog` — drawer/modal primitives (detail drawer, publisher drawer, publish modal).
- `lucide-react` — icon set, replacing the design's inline SVGs.
- `next-intl` — zh/en i18n, configured in **no-URL-prefix mode** (locale resolved from a cookie/header, not a `/zh/...` path segment) so existing routes (`/store`, `/store/[category]/[slug]`, etc.) are unaffected.
- No new dependency for theming — dark/light is a `data-theme` attribute on `<html>` toggled by a small client component, persisted to `localStorage`, matching the design's approach.

## Design tokens → Tailwind

Replace the `ray-*` color palette in `apps/market/tailwind.config.ts` with the new token set, sourced from CSS custom properties defined in `app/globals.css` under `:root` (dark, default) and `[data-theme="light"]` (light overrides), per the token tables in `ui/README.md`:

- Surfaces: `wall`, `win`, `sidebar`, `content`, `chrome`, `panel`, `panel-2`
- Borders: `border`, `border-strong`
- Text: `text`, `text-2`, `text-3`
- Semantic: `accent`, `accent-soft`, `green`, `amber`/`star`, `red`
- Category accents: skill (green), mcp (amber), provider (blue `#58a6f0`)
- Publisher tier colors: official (amber), verified (blue), community (gray)

Typography: system sans stack for UI text, JetBrains Mono (Google Fonts) for code/URLs/IDs/mono chips, per the sizing/letter-spacing notes in the README.

## Routing model

Overlays are implemented as **intercepting + parallel routes** so they're linkable, shareable, and browser-back-friendly, while still rendering as drawers/modals over the grid:

- `app/store/page.tsx` — main browse page (header, featured carousel, category tabs, sort, search, grid). Becomes the effective home for the store surface.
- `app/@drawer/(.)store/[category]/[slug]/page.tsx` — intercepts navigation from a card click, renders `DetailDrawer` over the current page.
- `app/store/[category]/[slug]/page.tsx` — unchanged, full-page fallback for direct load / refresh / shared links.
- `app/@drawer/(.)publisher/[name]/page.tsx` — same pattern for the publisher profile drawer, over `app/publisher/[name]/page.tsx`.
- Publish modal: no separate route. Opened via the header's "发布" button, state reflected in `?publish=1` (shareable/deep-linkable, closable via scrim/Esc/browser-back). `app/submit/page.tsx` is deleted — its logic moves into the modal.
- `app/dashboard/page.tsx` — untouched.

## Component architecture

New/rewritten under `apps/market/components/`:

| Component | Purpose |
|---|---|
| `Header` | Logo, nav (探索/文档), 发布 button, avatar |
| `FeaturedCarousel` | Auto-advancing (5s) featured items, badges, prev/next/dots, pauses on hidden tab / overlay open |
| `CategoryTabs` | 探索/供应商/技能/MCP (restyle of existing) |
| `SortSelect` | 全部/最近新增/最流行/评分最高 |
| `SearchInput` | Restyle of existing, filters by id/desc/tags |
| `ItemCard` | Restyle: type icon, tier badge, star rating, download count, tag chips, favorite heart, install-state pill |
| `ItemGrid` | Grid layout wrapper |
| `DetailDrawer` | Radix `Dialog` styled as right-side sheet; tabs (readme/config/reviews); type-specific fields (provider models, MCP transport/command/url/headers) |
| `PublisherDrawer` | Radix `Dialog`, right-side sheet; author info, tier, their items |
| `PublishModal` | Radix `Dialog`, centered; type selector drives dynamic field set |
| `ThemeToggle` | Flips `data-theme`, persists to `localStorage` |
| `LangSwitcher` | zh/en only enabled; other languages shown disabled ("即将支持") |

Supporting modules:
- `lib/publish-field-schemas.ts` — mirrors the design's `FIELD_SCHEMAS`: per-type (provider/skill/mcp) field list with `when(vals)` conditional visibility.
- `lib/mock/items.ts`, `lib/mock/publishers.ts` — static fixtures typed as `Item[]` / `Publisher[]` (from `@aas/types`), covering all three categories, tiers, ratings, tags — modeled on the design's `BASE_PKGS`.

## Client-side mock state

A single `ClientStateProvider` (React context, wraps the store layout), backed by `localStorage`:

- `favorites: Record<string, boolean>` — toggled by the card/drawer heart icon.
- `installed: Record<string, boolean>` — toggled by the Install/Uninstall button; purely a display-state flip, no engine/API call.
- `userItems: Item[]` — items created via the Publish modal, prepended to the mock catalog for the current session.

This directly stands in for the design's `favorites` / `installed` / `userPkgs` state, without the CLI-side install/terminal-log behavior (that belongs to the real CLI, not the web mock).

## Data flow

Pages call `lib/mock/items.ts` / `lib/mock/publishers.ts` directly (not `lib/queries/*`) for this pass. Function signatures intentionally mirror the existing query layer (`getItems(opts)`, `getFeaturedItems()`, `getItemBySlug(slug)`, etc.) so a later pass can swap the import back to Supabase-backed queries with no component changes.

## Error handling & testing

- No new error-handling surface: mock data is always present, so empty/error states only need the existing "no items found" pattern.
- Component tests (bun test + testing-library, matching existing `__tests__` convention) for: `ItemCard` (favorite/install toggle), `CategoryTabs`, `SearchInput`, `PublishModal` (dynamic field visibility), `ClientStateProvider` (localStorage persistence).
- No e2e/route-interception tests added in this pass — existing `page.test.tsx` files are updated to reflect the new markup where they'd otherwise fail.

## CLI — plan only (not implemented this pass)

The design's "CLI 客户端" is a GUI desktop app mockup (macOS-style window, sidebar nav, installed-items list with per-app enable toggles, live terminal pane, provider-config modal) — distinct from the already-working terminal `apps/cli` (install/uninstall/config/enable/list/search/sync, built on `@aas/client-core`'s `AASEngine` interface).

Future direction (for later, separate scoping):
- Both the terminal CLI and a future GUI client should keep depending on the same `AASEngine` interface (`packages/types` + `apps/client-core`) — no HTTP/API layer needed between them, since both run locally against `~/.agents`, `~/.claude`, `~/.codex`.
- The GUI client would be a new `apps/cli-gui` (Tauri, given the existing Bun/TS toolchain and the desire for a small native binary) that imports `@aas/client-core` directly, mirroring the design's screens (installed/browse/updates/favorites nav, agent-app switcher, terminal log view, provider edit modal, settings modal with account/language tabs).
- This becomes its own design spec + plan when prioritized; not part of this implementation pass.
