#!/usr/bin/env bash
# The desktop client's screenshots for the website (apps/store/public/landing/<lang>/),
# in Chinese and English. A fresh home gets real catalog items installed through the
# sidecar, OpenRouter enabled behind a running local relay, and relay usage from
# seed-usage.ts. The window is drawn at 2x and each shot is cropped to the page inside
# the client's title bar, border and status bar. README.md says how the PNGs become the
# site's WebP files.
# Writes /out/marketing/<lang>/<shot>.png, raw/ (uncropped) and result.txt; exits
# non-zero if a check fails.
set -uo pipefail

OUT=${OUT:-/out/marketing}
SETTLE=${SETTLE:-12}
SCALE=2
# Page area (logical px, 16:10) of each shot; Window.tsx in apps/store holds these times SCALE.
WIDE=(1056 660)
# The MCP shot has the detail pane open; narrower, the list loses its names.
MCP_PAGE=(1280 800)
NARROW=(800 500)
# Client chrome around the page: 1px border, a 38px title bar (its bottom line included)
# and a 27px status bar (its top line included).
TOP=38
BOTTOM=27
SKILLS=(
  github:vercel-labs/skills/find-skills
  github:anthropics/skills/frontend-design
  github:obra/superpowers/brainstorming
  github:obra/superpowers/systematic-debugging
  github:mattpocock/skills/tdd
  github:mattpocock/skills/grill-me
)
MCPS=(
  mcp-registry:io.github.upstash/context7
  mcp-registry:io.github.microsoft/playwright-mcp
  mcp-registry:io.github.ChromeDevTools/chrome-devtools-mcp
)
MCP_DETAIL=mcp-registry:io.github.upstash/context7
INSTALL_PREVIEW=github:vercel-labs/agent-browser/agent-browser
# Not a real key: the providers page needs one to count OpenRouter as set up.
PLACEHOLDER_KEY=placeholder-not-a-real-key

mkdir -p "$OUT/raw"
: > "$OUT/result.txt"
: > "$OUT/seed.log"
log() { echo "$*" | tee -a "$OUT/result.txt"; }
failed=0
check() { if eval "$2"; then log "ok: $1"; else log "FAIL: $1"; failed=1; fi; }
stop_app() { pkill -x app; sleep 2; }
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
open_link() { (gio open "$1" >>"$OUT/open.log" 2>&1 &); sleep "$SETTLE"; }
install_link() { open_link "agent-store://install?id=$(enc "$1")"; }
rpc() { printf '%s\n' "$2" | "$SIDECAR" __rpc "$1" - 2>>"$OUT/seed.log" | tee -a "$OUT/seed.log"; }
slug_of() { python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "{}"); print((d.get("data") or {}).get("slug", ""))'; }

export DISPLAY=:99
# No GPU in the container: without these WebKitGTK paints a black window.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_SCALE=$SCALE
Xvfb :99 -screen 0 2600x1800x24 >/dev/null 2>&1 &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export XDG_DATA_HOME=$HOME/.local/share XDG_CONFIG_HOME=$HOME/.config
mkdir -p "$XDG_DATA_HOME/applications" "$HOME/.claude" "$HOME/.codex"

sudo dpkg -i /bundles/*.deb >"$OUT/install.log" 2>&1 || { log "FAIL: dpkg -i"; exit 1; }
PKG=$(dpkg-deb -f /bundles/*.deb Package)
APP=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/app$')
SIDECAR=$(dpkg -L "$PKG" | grep -m1 -E '^/usr/bin/aas$')
locale -a >>"$OUT/seed.log" 2>&1
check "the zh_CN and en_US locales exist" 'locale -a | grep -qi "^zh_CN.utf8$" && locale -a | grep -qi "^en_US.utf8$"'

# 1. What a user has after a while: skills and MCP servers on for both agents (one of each
#    off for Codex), OpenRouter with a key on for Codex (the only agent it supports) through
#    the local relay, the relay running, two weeks of usage.
for id in "${SKILLS[@]}" "${MCPS[@]}"; do
  slug=$(rpc installAndEnable "[\"$id\"]" | slug_of)
  check "installed $id${slug:+ as $slug}" '[ -n "$slug" ]'
  case "$id" in
    */grill-me | */chrome-devtools-mcp) "$SIDECAR" disable "$slug" --for codex >>"$OUT/seed.log" 2>&1 ;;
  esac
done
provider=$(rpc install '["builtin:openrouter"]' | slug_of)
check "installed OpenRouter" '[ -n "$provider" ]'
rpc setConfig "[\"$provider\",{\"apiKey\":\"$PLACEHOLDER_KEY\",\"baseUrl\":\"https://openrouter.ai/api/v1\"}]" >/dev/null
rpc enable "[\"$provider\",\"codex\"]" >/dev/null
# The relay itself: on for an agent, that agent's API URL points at it. Its key is the
# marker the client's provider pane saves for it.
relay=$(rpc install '["builtin:local"]' | slug_of)
rpc setConfig "[\"$relay\",{\"apiKey\":\"built-in\"}]" >/dev/null
rpc enable "[\"$relay\",\"codex\"]" >/dev/null
check "Codex goes through the local relay to OpenRouter" '"$SIDECAR" list 2>/dev/null | grep -E "^($provider|$relay) " | grep -c "✓" | grep -q 2'
"$SIDECAR" relay start >>"$OUT/seed.log" 2>&1
check "the local relay runs" '"$SIDECAR" relay status | grep -q running'
(cd /work && bun test/desktop-linux/seed-usage.ts "$HOME/.agent-store" "$provider")
check "seeded relay usage" '[ -f "$HOME/.agent-store/usage.db" ]'
"$SIDECAR" list >>"$OUT/seed.log" 2>&1

win() {
  WIN=$(xdotool search --onlyvisible --name 'Agent Store' | head -1)
  eval "$(xdotool getwindowgeometry --shell "$WIN")"
}
# The pointer rests on the title bar's empty middle: keys go to the window under it (no
# window manager here), nothing in the page shows a hover, and the title bar is cropped away.
size_page() {
  win
  xdotool windowsize "$WIN" $(((${1} + 2) * SCALE)) $(((${2} + TOP + BOTTOM) * SCALE))
  sleep 4
  win
  xdotool mousemove $((X + WIDTH - 200 * SCALE)) $((Y + 18 * SCALE))
  xdotool windowfocus "$WIN" 2>/dev/null || true
}
launch() {
  env LANG="$2" LC_ALL="$2" LANGUAGE="$3" "$APP" >"$OUT/app-$1.log" 2>&1 &
  sleep "$SETTLE"
  win
}

# 2. The one-time welcome, closed once so no shot shows it.
launch welcome zh_CN.UTF-8 zh_CN:zh
check "the window is drawn at ${SCALE}x" '[ "$WIDTH" = $((1200 * SCALE)) ]'
xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT - 60 * SCALE))
xdotool key Return
sleep 2
stop_app

shot() {
  local raw=$OUT/raw/$lang-$1.png dst=$OUT/$lang/$1.png want=${2}x${3}
  win
  import -window root "$raw"
  convert "$raw" -crop "$((WIDTH - 2 * SCALE))x$((HEIGHT - (TOP + BOTTOM) * SCALE))+$((X + SCALE))+$((Y + TOP * SCALE))" +repage "$dst"
  check "$lang/$1.png is $want" '[ "$(identify -format "%wx%h" "$dst")" = "$want" ]'
}

# 3. Each shot in Chinese, then in English. The client follows the system language until
#    one is picked in Settings, so each run only sets the locale.
for lang in zh en; do
  mkdir -p "$OUT/$lang"
  if [ "$lang" = zh ]; then launch "$lang" zh_CN.UTF-8 zh_CN:zh; else launch "$lang" en_US.UTF-8 en_US:en; fi
  size_page "${WIDE[@]}"
  w=$((WIDE[0] * SCALE)) h=$((WIDE[1] * SCALE))
  xdotool key ctrl+2
  sleep 15
  shot skills $w $h
  # An installed item's link says so; its button opens the item in its library.
  size_page "${MCP_PAGE[@]}"
  install_link "$MCP_DETAIL"
  xdotool key Tab Return
  sleep 15
  shot mcp $((MCP_PAGE[0] * SCALE)) $((MCP_PAGE[1] * SCALE))
  size_page "${WIDE[@]}"
  xdotool key ctrl+4
  sleep 15
  shot relay $w $h
  xdotool key ctrl+5
  sleep 10
  shot usage $w $h
  install_link "$INSTALL_PREVIEW"
  sleep 3
  shot install $w $h
  xdotool key Escape
  sleep 2
  size_page "${NARROW[@]}"
  xdotool key ctrl+2
  sleep 15
  shot skills-narrow $((NARROW[0] * SCALE)) $((NARROW[1] * SCALE))
  stop_app
done
check "the install preview was cancelled" '! "$SIDECAR" list 2>/dev/null | grep -q agent-browser'

log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
