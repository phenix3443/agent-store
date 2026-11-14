#!/usr/bin/env bash
# Build and run the desktop client as a packaged debug .app for local dev.
#
# `tauri dev` runs an UNBUNDLED binary, which macOS LaunchServices does not treat
# as the registered handler for the agent-store custom scheme — so install links
# never reach the running dev window. Instead we build a debug bundle
# with a dev-only identity (com.aas.cli-gui.dev + agent-store-dev://, via
# tauri.dev.conf.json), register it, and run it directly. macOS then delivers
# agent-store-dev:// links to THIS running instance.
#
# Trade-off vs `tauri dev`: no frontend hot-reload — re-run `make dev` to pick up
# UI changes. The Rust/frontend builds are incremental, so re-runs are fast.
#
# Build-time env (baked into the frontend): VITE_STORE_URL (the store the app links
# to). Runtime env (read by the running app): AS_HOME, AS_STORE_URL, AS_AUTH_URL,
# CLAUDE_CONFIG_DIR, CODEX_CONFIG_DIR — inherited from the caller (the Makefile).
set -euo pipefail
cd "$(dirname "$0")/.."   # apps/cli-gui

APP="src-tauri/target/debug/bundle/macos/Agent Store Dev.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

echo "▸ building frontend (store=$VITE_STORE_URL)…"
pnpm build

echo "▸ building debug .app bundle (dev identity)…"
bun run prepare:tauri
bun run build:sidecar
pnpm exec tauri build --debug --bundles app --config src-tauri/tauri.dev.conf.json

echo "▸ registering $APP with LaunchServices…"
"$LSREGISTER" -f "$APP"

echo "▸ launching dev app…"
exec "$APP/Contents/MacOS/app"
