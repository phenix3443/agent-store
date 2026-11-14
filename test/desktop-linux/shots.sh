#!/usr/bin/env bash
# Screenshots of the real desktop window (Tauri + WebKitGTK on Xvfb, with the
# bundled aas sidecar behind IPC) against the live test catalog, for the
# catalog switch (#125), the skill library (#111), the window shell (#163), the Discover page,
# install dialog and libraries (#164) and the welcome, usage and settings pages (#165). Each step is driven by an
# agent-store:// link, the keyboard, or aas itself, and checked on disk.
# Writes /out/NN-*.png, /out/result.txt and /out/cli.txt; exits non-zero if a
# check fails.
set -uo pipefail

OUT=${OUT:-/out}
SETTLE=${SETTLE:-12}
SKILL_ID=github:vercel-labs/skills/find-skills
SKILL_SLUG=skills-find-skills
NPM_MCP_ID=mcp-registry:io.github.upstash/context7
BEARER_MCP_ID=mcp-registry:ai.admux/admux
SSE_MCP_ID=mcp-registry:io.github.humanjesse/textarttools-mcp
PROVIDER_ID=builtin:openrouter
mkdir -p "$OUT"
: > "$OUT/result.txt"
: > "$OUT/cli.txt"
log() { echo "$*" | tee -a "$OUT/result.txt"; }
shot() { import -window root "$OUT/$1.png"; }
stop_app() { pkill -x app; sleep 2; }
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
open_link() { (gio open "$1" >>"$OUT/open.log" 2>&1 &); sleep "$SETTLE"; }
install_link() { open_link "agent-store://install?id=$(enc "$1")"; }
# A web link's dialog focuses Cancel; the primary button is the next one.
confirm() { xdotool key Tab Return; sleep "${1:-15}"; }
# The finished install focuses its primary button (查看 / 打开配置).
# The library pages read every installed entry through the sidecar, one process per call.
open_result() { xdotool key Return; sleep "${1:-15}"; }
# No window manager in the container: keys go to the window under the pointer.
point_at_window() {
  WIN=$(xdotool search --onlyvisible --name 'Agent Store' | head -1)
  eval "$(xdotool getwindowgeometry --shell "$WIN")"
  xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT / 2))
  xdotool windowfocus "$WIN" 2>/dev/null || true
}
cli() { echo "\$ aas $*" >>"$OUT/cli.txt"; "$SIDECAR" "$@" >>"$OUT/cli.txt" 2>&1; echo >>"$OUT/cli.txt"; }
failed=0
check() { if eval "$2"; then log "ok: $1"; else log "FAIL: $1"; failed=1; fi; }
links_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }

export DISPLAY=:99
# No GPU in the container: without these WebKitGTK paints a black window.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export XDG_DATA_HOME=$HOME/.local/share XDG_CONFIG_HOME=$HOME/.config
mkdir -p "$XDG_DATA_HOME/applications"

# Up to 0.2.1 the package was agent-store-cli, owning the same /usr/bin/app and
# /usr/bin/aas. A stand-in for it must give way when the new package is installed.
old=$(mktemp -d)
mkdir -p "$old/DEBIAN" "$old/usr/bin"
printf '#!/bin/sh\n' > "$old/usr/bin/app"; cp "$old/usr/bin/app" "$old/usr/bin/aas"; chmod 755 "$old/usr/bin/app" "$old/usr/bin/aas"
printf 'Package: agent-store-cli\nVersion: 0.2.1\nArchitecture: amd64\nMaintainer: test\nDescription: stand-in for the old package\n' > "$old/DEBIAN/control"
dpkg-deb --build "$old" "$old.deb" >/dev/null && sudo dpkg -i "$old.deb" >"$OUT/install-old.log" 2>&1 || { log "FAIL: installing the agent-store-cli stand-in"; exit 1; }
sudo dpkg -i /bundles/*.deb >"$OUT/install.log" 2>&1 || { log "FAIL: dpkg -i"; exit 1; }
check "the deb replaces the old agent-store-cli package" '! dpkg -s agent-store-cli >/dev/null 2>&1'
check "the rpm obsoletes agent-store-cli" 'rpm -qp --obsoletes /bundles/*.rpm 2>/dev/null | grep -q "^agent-store-cli"'
PKG=$(dpkg-deb -f /bundles/*.deb Package)
APP=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/app$')
SIDECAR=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/aas$')
LIB=$HOME/.agent-store/skills

# 0. What an older Agent Store left in ~/.agents: a marked skill linked into Claude
#    (Codex read it natively), and a skill of another tool that must stay put.
(cd /work && bun test/desktop-linux/seed-old-home.ts "$HOME")
check "seeded the old ~/.agents layout" '[ -f "$HOME/.agents/registry.json" ] && links_to "$HOME/.claude/skills/legacy-skill" "$HOME/.agents/skills/legacy-skill"'

# 1. First launch: the app's first sidecar call moves ~/.agents to ~/.agent-store,
#    and the welcome opens once. Enter (focus is on 开始使用) closes it for good.
"$APP" >"$OUT/app-first.log" 2>&1 &
sleep "$SETTLE"
shot 00-first-launch-welcome
WIN=$(xdotool search --onlyvisible --name 'Agent Store' | head -1)
eval "$(xdotool getwindowgeometry --shell "$WIN")"
xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT - 60))
xdotool key Return
sleep 2
shot 00b-first-launch-discover
stop_app
check "the welcome was recorded as seen" '[ -n "$(find "$XDG_DATA_HOME" -path "*agent-store-cli/welcome.json" 2>/dev/null)" ]'
check "migration moved the registry" '[ -f "$HOME/.agent-store/registry.json" ] && [ ! -e "$HOME/.agents/registry.json" ]'
check "migrated skill is in the library" '[ -f "$LIB/legacy-skill/SKILL.md" ] && [ ! -e "$HOME/.agents/skills/legacy-skill" ]'
check "Claude link points at the library" 'links_to "$HOME/.claude/skills/legacy-skill" "$LIB/legacy-skill"'
check "Codex got its own link (it used to read ~/.agents/skills)" 'links_to "$HOME/.codex/skills/legacy-skill" "$LIB/legacy-skill"'
check "another tool's skill in ~/.agents was left alone" '[ -f "$HOME/.agents/skills/users-own/SKILL.md" ]'

# 2. A web store link with an id: the confirmation shows the install preview.
install_link "$SKILL_ID"
shot 01-skill-confirm
confirm
shot 02-skill-install-done
open_result
shot 02b-skill-library-detail
check "skill library copy has the marker" '[ -f "$LIB/$SKILL_SLUG/.agent-store.json" ]'
check "Claude deployment links to the library" 'links_to "$HOME/.claude/skills/find-skills" "$LIB/$SKILL_SLUG"'
check "Codex deployment links to the library" 'links_to "$HOME/.codex/skills/find-skills" "$LIB/$SKILL_SLUG"'
check "nothing went into the shared ~/.agents/skills" '[ ! -e "$HOME/.agents/skills/find-skills" ] && [ ! -e "$HOME/.agents/skills/$SKILL_SLUG" ]'

# 3. Search on Discover: `/` focuses the page's search field.
point_at_window
xdotool key ctrl+1
sleep 2
xdotool key slash
sleep 1
xdotool type --delay 60 'playwright'
# Each RPC is a fresh sidecar process; the search waits for one plus the API.
sleep 15
shot 03-search-playwright
stop_app

# 4. Disable Codex for the skill from aas; the desktop shows it per tool.
cli disable "$SKILL_SLUG" --for codex
check "aas disable --for codex removed only the Codex link" '[ ! -e "$HOME/.codex/skills/find-skills" ] && links_to "$HOME/.claude/skills/find-skills" "$LIB/$SKILL_SLUG"'
install_link "$SKILL_ID"
shot 04-already-installed
xdotool key Tab Return
sleep 15
shot 05-skill-detail-codex-off
stop_app

# 5. MCP from an npm package: the preview names the npx launch.
install_link "$NPM_MCP_ID"
shot 06-mcp-npm-confirm
# Cancel leaves the entry selected on Discover behind the dialog.
xdotool key Escape
sleep 6
shot 06b-discover-detail
install_link "$NPM_MCP_ID"
confirm
shot 07-mcp-npm-install-done
open_result
shot 07b-mcp-library-detail
stop_app
check "context7 written to Claude as npx" 'grep -q "@upstash/context7-mcp" "$HOME/.claude.json"'

# 6. A remote MCP that needs a bearer token: the dialog asks for it, then saves it.
install_link "$BEARER_MCP_ID"
shot 08-mcp-bearer-confirm
confirm 4
shot 08b-mcp-bearer-fields
xdotool type --delay 40 'test-token'
xdotool key Return
sleep 20
shot 09-mcp-bearer-install-done
open_result
shot 09b-mcp-bearer-config
stop_app

# 7. An SSE-only remote: Claude only; Codex is refused with the reason.
install_link "$SSE_MCP_ID"
shot 10a-mcp-sse-confirm
confirm
shot 10-mcp-sse-install-done
stop_app
check "SSE server written to Claude" 'grep -q "\"textarttools-mcp\"" "$HOME/.claude.json"'
check "SSE server not written to Codex" '! grep -q "textarttools-mcp" "$HOME/.codex/config.toml" 2>/dev/null'

# 8. A built-in provider opens its config page.
install_link "$PROVIDER_ID"
shot 11-provider-confirm
confirm
shot 12a-provider-install-done
open_result
shot 12-provider-config
stop_app

# 9. The installed list, opened from the 已经安装过了 notice.
install_link "$NPM_MCP_ID"
xdotool key Tab Return
sleep 15
shot 13-installed-list
# The status bar's activity button sits right after the detail pane, so once it has focus
# Shift+Tab reaches the pane's last control, 卸载.
eval "$(xdotool getwindowgeometry --shell "$(xdotool search --onlyvisible --name 'Agent Store' | head -1)")"
xdotool mousemove $((X + 120)) $((Y + HEIGHT - 13)) click 1
sleep 2
shot 13b-activity-log
xdotool key Escape
sleep 1
xdotool key shift+Tab Return
sleep 2
shot 13c-uninstall-confirm
xdotool key Escape
sleep 1
stop_app
check "cancelled uninstall left context7 installed" 'grep -q "@upstash/context7-mcp" "$HOME/.claude.json"'

# 10. The window shell, driven by its shortcuts: sidebar counts, the command
#     palette, the usage page on seeded relay usage, each settings tab, the
#     shortcut list and the narrow window with the icon-only sidebar.
(cd /work && bun test/desktop-linux/seed-usage.ts "$HOME/.agent-store")
check "seeded relay usage" '[ -f "$HOME/.agent-store/usage.db" ]'
"$APP" >"$OUT/app-shell.log" 2>&1 &
sleep "$SETTLE"
point_at_window
shot 14-shell-discover
xdotool key ctrl+2
sleep 15
shot 14b-skills-library
xdotool key ctrl+3
sleep 15
shot 14c-mcp-library
xdotool key ctrl+4
sleep 15
shot 14d-providers
xdotool key ctrl+k
sleep 2
xdotool type --delay 60 'find'
sleep 3
shot 15-command-palette
xdotool key Escape
sleep 1
xdotool key ctrl+5
sleep 8
shot 16-usage
xdotool key ctrl+6
sleep 2
shot 17-settings-general
# The settings tabs sit 118px below the title bar's top edge; focus the first and
# arrow along (Radix Tabs activates the focused tab).
settings_tab() {
  xdotool mousemove $((X + 204 + 22 + 20)) $((Y + 118)) click 1
  sleep 1
  for _ in $(seq "$1"); do xdotool key Right; sleep 0.3; done
  sleep "${2:-2}"
}
settings_tab 1
# Tab leaves the tab list for the panel, then reaches 开始检查.
xdotool key Tab Tab Return
sleep 10
shot 17b-settings-agents-doctor
settings_tab 2 4
shot 17c-settings-data
settings_tab 3
shot 17d-settings-account
settings_tab 4
shot 17e-settings-cli
settings_tab 5
shot 17f-settings-about
xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT / 2))
xdotool key question
sleep 1
shot 18-shortcuts
xdotool key Escape
xdotool key ctrl+1
xdotool windowsize "$WIN" 960 680
sleep 4
shot 19-narrow-window
xdotool key ctrl+5
sleep 8
shot 20-narrow-usage
stop_app

cli search find-skills --kind skill
cli info "$SKILL_ID"
cli info "$SKILL_SLUG"
cli enable textarttools-mcp --for codex
cli list
cli doctor
{
  echo "\$ ls -l ~/.claude/skills ~/.codex/skills ~/.agents/skills"
  ls -l "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.agents/skills"
  echo
  echo "\$ ~/.claude.json mcpServers"
  python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])).get("mcpServers"), indent=2))' "$HOME/.claude.json"
  echo
  echo "\$ cat ~/.codex/config.toml"
  cat "$HOME/.codex/config.toml"
} >>"$OUT/cli.txt" 2>&1

log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
