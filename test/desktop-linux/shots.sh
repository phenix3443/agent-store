#!/usr/bin/env bash
# Screenshots of the real desktop window (Tauri + WebKitGTK on Xvfb, with the
# bundled aas sidecar behind IPC) against the live test catalog, for the
# catalog switch (#125) and the skill library (#111). Each step is driven by an
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
# Focus starts on Cancel and loops, so Shift+Tab reaches Install.
confirm() { xdotool key shift+Tab Return; sleep "${1:-15}"; }
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

sudo dpkg -i /bundles/*.deb >"$OUT/install.log" 2>&1 || { log "FAIL: dpkg -i"; exit 1; }
PKG=$(dpkg-deb -f /bundles/*.deb Package)
APP=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/app$')
SIDECAR=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/aas$')
LIB=$HOME/.agent-store/skills

# 0. What an older Agent Store left in ~/.agents: a marked skill linked into Claude
#    (Codex read it natively), and a skill of another tool that must stay put.
(cd /work && bun test/desktop-linux/seed-old-home.ts "$HOME")
check "seeded the old ~/.agents layout" '[ -f "$HOME/.agents/registry.json" ] && links_to "$HOME/.claude/skills/legacy-skill" "$HOME/.agents/skills/legacy-skill"'

# 1. First launch: the app's first sidecar call moves ~/.agents to ~/.agent-store.
"$APP" >"$OUT/app-first.log" 2>&1 &
sleep "$SETTLE"
shot 00-first-launch-overview
stop_app
check "migration moved the registry" '[ -f "$HOME/.agent-store/registry.json" ] && [ ! -e "$HOME/.agents/registry.json" ]'
check "migrated skill is in the library" '[ -f "$LIB/legacy-skill/SKILL.md" ] && [ ! -e "$HOME/.agents/skills/legacy-skill" ]'
check "Claude link points at the library" 'links_to "$HOME/.claude/skills/legacy-skill" "$LIB/legacy-skill"'
check "Codex got its own link (it used to read ~/.agents/skills)" 'links_to "$HOME/.codex/skills/legacy-skill" "$LIB/legacy-skill"'
check "another tool's skill in ~/.agents was left alone" '[ -f "$HOME/.agents/skills/users-own/SKILL.md" ]'

# 2. A web store link with an id: the confirmation shows the install preview.
install_link "$SKILL_ID"
shot 01-skill-confirm
confirm
shot 02-skill-installed-detail
check "skill library copy has the marker" '[ -f "$LIB/$SKILL_SLUG/.agent-store.json" ]'
check "Claude deployment links to the library" 'links_to "$HOME/.claude/skills/find-skills" "$LIB/$SKILL_SLUG"'
check "Codex deployment links to the library" 'links_to "$HOME/.codex/skills/find-skills" "$LIB/$SKILL_SLUG"'
check "nothing went into the shared ~/.agents/skills" '[ ! -e "$HOME/.agents/skills/find-skills" ] && [ ! -e "$HOME/.agents/skills/$SKILL_SLUG" ]'

# 3. Search in the store list (the window has no decorations and sits at 0,0).
WIN=$(xdotool search --onlyvisible --name 'Agent Store' | head -1)
eval "$(xdotool getwindowgeometry --shell "$WIN")"
xdotool mousemove $((X + 58 + 150)) $((Y + 44 + 34)) click 1
sleep 1
xdotool type --delay 60 'playwright'
sleep 6
shot 03-search-playwright
stop_app

# 4. Disable Codex for the skill from aas; the desktop shows it per tool.
cli disable "$SKILL_SLUG" --for codex
check "aas disable --for codex removed only the Codex link" '[ ! -e "$HOME/.codex/skills/find-skills" ] && links_to "$HOME/.claude/skills/find-skills" "$LIB/$SKILL_SLUG"'
install_link "$SKILL_ID"
shot 04-already-installed
xdotool key Tab Return
sleep 6
shot 05-skill-detail-codex-off
stop_app

# 5. MCP from an npm package: the preview names the npx launch.
install_link "$NPM_MCP_ID"
shot 06-mcp-npm-confirm
confirm
shot 07-mcp-npm-after-install
stop_app
check "context7 written to Claude as npx" 'grep -q "@upstash/context7-mcp" "$HOME/.claude.json"'

# 6. A remote MCP that needs a bearer token: the config page opens.
install_link "$BEARER_MCP_ID"
shot 08-mcp-bearer-confirm
confirm
shot 09-mcp-bearer-config
stop_app

# 7. An SSE-only remote: Claude only; Codex is refused with the reason.
install_link "$SSE_MCP_ID"
confirm
shot 10-mcp-sse-after-install
stop_app
check "SSE server written to Claude" 'grep -q "\"textarttools-mcp\"" "$HOME/.claude.json"'
check "SSE server not written to Codex" '! grep -q "textarttools-mcp" "$HOME/.codex/config.toml" 2>/dev/null'

# 8. A built-in provider opens its config page.
install_link "$PROVIDER_ID"
shot 11-provider-confirm
confirm
shot 12-provider-config
stop_app

# 9. The installed list, opened from the 已经安装过了 notice.
install_link "$NPM_MCP_ID"
xdotool key Tab Return
sleep 6
shot 13-installed-list
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
