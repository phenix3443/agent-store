# Agent Rules

## Provider switching / local proxy features

Before designing or implementing anything related to provider switching, local HTTP
proxying for Claude Code / Codex, config injection/restore, or model mapping — first
check whether these reference implementations already solved it:

- https://github.com/Rogers-F/code-switch-R (Go/Wails; local relay on `providerrelay.go`,
  config injection/restore in `claudesettings.go`/`codexsettings.go`/`proxystate.go`)
- https://github.com/farion1231/cc-switch (Tauri/Rust; proxy engine under
  `src-tauri/src/proxy/`, direct-injection path in `services/provider/mod.rs`)

If either repo (or a local checkout of either) is available, read the relevant source
before proposing a new design. Prefer adapting their proven approach over inventing one
from scratch — only deviate where this repo's stack or scope genuinely requires it, and
say so explicitly.

## UI source of truth

The web store (`apps/store`) and the desktop client follow different design sources.

**Web store.** Since 2026-11-11 (issue #58) the web store has its own visual system.
Before implementing or reviewing any web store screen, read `apps/store/DESIGN.md`
(tokens, layout, components, do's and don'ts) and `apps/store/PRODUCT.md` (product
facts). Since #158 the site is being redone in direction C; the interaction and copy
reference is the prototype in `docs/design/mockups/site/` on branch
`design/redesign-prototype`. The old direction contract for the store list and detail
drawer is in `apps/store/.impeccable/surfaces/`; its visual part no longer applies.
Tokens live in `apps/store/app/globals.css`; change them there and in `DESIGN.md`
together. `docs/ui/Agent Store.dc.html` is only a record of
the old look for the web store and no longer constrains it. Since #66 every web store
page uses the new system; do not restyle any of them back toward the old mockup.

**Desktop client.** Since #163 (2026-11-13) the desktop client is being rebuilt on the
redesign's direction C. Read `apps/cli-gui/DESIGN.md` (tokens, window shell, components,
do's and don'ts) before implementing or reviewing any desktop screen. The interaction and
copy source is the approved prototype on the `design/redesign-prototype` branch,
`docs/design/mockups/client-app/` (`app.css`, `app.js`, `i18n.js`, `ux.html`,
`INVENTORY.md`); read its source, not a memory of it. Tokens live in
`apps/cli-gui/src/globals.css`; change them there and in `DESIGN.md` together. Screens not
yet rebuilt (#164, #165) still carry the old layout from `docs/ui/Agent Store.dc.html`;
that file no longer constrains new work.

## Tests that touch the DOM

When a matcher fails, Bun prints its values with `Bun.inspect`, which walks a happy-dom
node into the whole window. One failing `expect(document.activeElement).toBe(el)` in
`apps/store` wrote about 1 GB of output, grew the test process to about 5 GB and took the
host down (2026-11-12). The `test-setup.ts` of `apps/store` and `apps/cli-gui` override
`Bun.inspect.custom` on `Node.prototype` to print a short tag. Keep that override, and copy
it into any new package that tests against happy-dom.

Run test suites, builds and screenshots in GitHub Actions, not on a shared host: a
runaway test then takes down only its runner. `.github/workflows/unit.yml` type-checks and
tests the packages a change affects, `apps/api` included.

## UI implementation sign-off

Any UI work (Web Store or the desktop client, whether new or modified) is not done until
it has passed a visual code review — actually run the app and look at it, don't just rely
on unit tests or code review of the diff. Unit tests mock RPC/data layers and will not
catch integration-layer breakage (e.g. a Tauri permission/capability misconfiguration that
silently drops all data) or visual drift from the design (missing badges, wrong spacing,
placeholder states that don't match the mockup).

Required steps before calling UI work complete:
1. Actually run the app (`pnpm dev` for the web store; `make dev-gui` for the desktop
   client) with real or realistically seeded data — not just the empty state.
2. Compare rendered screens against the design reference side by side, screen by screen:
   `apps/store/DESIGN.md` for the web store, `apps/cli-gui/DESIGN.md` and the prototype
   for the desktop client. For the web store, check every changed screen at 390px, 820px and
   1440px, in both Chinese and English (the only two locales). The web store has only a
   dark theme since #159.
3. For the desktop client specifically, take a real screenshot of the native window
   (e.g. via `screencapture` on macOS) rather than only checking the underlying dev-server
   page in a browser — a plain browser tab has no Tauri IPC bridge, so RPC-backed data and
   real end-to-end behavior can look fine in tests while being silently broken in the
   actual app.
4. Fix any discrepancy found (functional or visual) before reporting the work as done —
   don't defer it to "future polish" without saying so explicitly and getting sign-off.
