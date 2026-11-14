#!/usr/bin/env bash
# Smoke test of the macOS bundle built by the desktop-smoke workflow, on a GitHub macOS
# runner: install the .dmg like a download, launch, the bundled sidecar, and agent-store://
# links driven by the OS. Writes $OUT/result.txt and screenshots; exits non-zero if a check fails.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
OUT=${OUT:-$ROOT/out}
SETTLE=${SETTLE:-15}
BUNDLE_DIR=${BUNDLE_DIR:-$ROOT/apps/cli-gui/src-tauri/target/universal-apple-darwin/release/bundle}
SKILL_ID=github:vercel-labs/skills/find-skills
SKILL_SLUG=skills-find-skills
MCP_ID=mcp-registry:io.github.upstash/context7
APP="/Applications/Agent Store.app"
mkdir -p "$OUT"
: > "$OUT/result.txt"
STAMP=$(mktemp)
log() { echo "$*" | tee -a "$OUT/result.txt"; }
failed=0
check() { if eval "$2"; then log "ok: $1"; else log "FAIL: $1"; failed=1; fi; }
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
shot() { screencapture -x "$OUT/macos-$1.png" 2>>"$OUT/screencapture.log" || log "screencapture $1 failed"; }
app_pids() { pgrep -x app; }
# Runs a command, killing it after $1 seconds (macOS has no timeout(1)).
bounded() { local t=$1; shift; "$@" & local p=$!; ( sleep "$t"; kill "$p" 2>/dev/null ) & local w=$!; wait "$p"; local rc=$?; kill "$w" 2>/dev/null; return $rc; }
stop_app() { for p in $(app_pids); do kill "$p"; done; sleep 3; }
# Keys go to the frontmost app through System Events (needs Accessibility for this shell).
keys() { osascript -e 'tell application "Agent Store" to activate' -e 'delay 1' -e "tell application \"System Events\" to $1" >>"$OUT/osascript.log" 2>&1; }
confirm() { keys 'key code 48' && sleep 1 && keys 'key code 36'; sleep 20; }
# The live catalog sometimes answers 503 for a moment: if an install did not land, the link is
# opened and confirmed once more. The first attempt's screenshot stays in the artifact.
retry_link() { eval "$2" && return; log "RETRY: $3 did not land; opening the link once more"; open "$1"; sleep "$SETTLE"; confirm; shot "$3-retry"; }
windows_of() { swift "$ROOT/test/desktop-smoke/windows.swift" "$1" 2>>"$OUT/swift.log"; }
new_crash_reports() { find "$HOME/Library/Logs/DiagnosticReports" /Library/Logs/DiagnosticReports -newer "$STAMP" \( -name 'app*' -o -name 'aas*' -o -name 'Agent Store*' \) 2>/dev/null; }

VERSION=$(cd "$ROOT/apps/cli-gui" && bun -e "console.log(require('./src-tauri/tauri.conf.json').version)")
log "expected version: $VERSION"
log "macOS $(sw_vers -productVersion) $(uname -m); Gatekeeper: $(spctl --status 2>&1)"

DMG=$(ls "$BUNDLE_DIR"/dmg/*.dmg | head -1)
log "dmg: $DMG"
check "the dmg was built" '[ -f "$DMG" ]'
[ -f "$DMG" ] || exit 1

# 1. Install like a download: a browser marks the dmg quarantined; the user drags the app
#    into /Applications.
xattr -w com.apple.quarantine "0083;$(printf %x "$(date +%s)");Safari;" "$DMG"
MNT=$(mktemp -d)
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >"$OUT/hdiutil.log" 2>&1 || { log "FAIL: hdiutil attach"; exit 1; }
ditto "$MNT/Agent Store.app" "$APP"
hdiutil detach "$MNT" >>"$OUT/hdiutil.log" 2>&1
check "the dmg holds Agent Store.app" '[ -x "$APP/Contents/MacOS/app" ]'
SIDECAR="$APP/Contents/MacOS/aas"
check "the bundle carries the aas sidecar" '[ -x "$SIDECAR" ]'
check "Info.plist version is $VERSION" '[ "$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")" = "$VERSION" ]'
check "Info.plist declares agent-store://" 'plutil -extract CFBundleURLTypes xml1 -o - "$APP/Contents/Info.plist" | grep -q "<string>agent-store</string>"'
log "app archs: $(lipo -archs "$APP/Contents/MacOS/app"); sidecar archs: $(lipo -archs "$SIDECAR")"
check "the app is universal" 'lipo -archs "$APP/Contents/MacOS/app" | grep -q x86_64 && lipo -archs "$APP/Contents/MacOS/app" | grep -q arm64'
check "the sidecar is universal" 'lipo -archs "$SIDECAR" | grep -q x86_64 && lipo -archs "$SIDECAR" | grep -q arm64'

{
  echo "\$ xattr -l (app, after copying from the quarantined dmg)"; xattr -l "$APP"
  echo "\$ codesign -dv app"; codesign -dv --verbose=2 "$APP" 2>&1
  echo "\$ codesign --verify --deep --strict"; codesign --verify --deep --strict --verbose=2 "$APP" 2>&1
  echo "\$ codesign -dv aas"; codesign -dv --verbose=2 "$SIDECAR" 2>&1
  echo "\$ spctl --assess --type execute"; spctl --assess --type execute -vv "$APP" 2>&1
} >"$OUT/signature.txt" 2>&1
log "spctl: $(spctl --assess --type execute "$APP" 2>&1 | tr '\n' ' ')"
log "quarantine on the installed app: $(xattr -p com.apple.quarantine "$APP" 2>/dev/null || echo none)"
# Known: the bundle itself is unsigned (#196). Turn this into a check once it is signed.
if codesign --verify --deep --strict "$APP" 2>/dev/null; then
  log "ok: the bundle signature verifies"
else
  log "KNOWN (#196): the bundle is not signed: $(codesign --verify --deep --strict "$APP" 2>&1 | tr '\n' ' ')"
fi

# What a user gets on double-clicking the downloaded copy. Escape dismisses the dialog
# (its other button moves the app to the Trash).
# `open` does not return while the dialog is up.
open "$APP" 2>>"$OUT/open.log" &
OPEN_PID=$!
sleep 10
shot gatekeeper-quarantined
log "quarantined app running after open: $([ -n "$(app_pids)" ] && echo yes || echo no)"
log "open returned while the dialog was up: $(kill -0 "$OPEN_PID" 2>/dev/null && echo no || echo yes)"
bounded 30 osascript -e 'tell application "System Events" to tell process "CoreServicesUIAgent" to click button "Done" of window 1' >>"$OUT/osascript.log" 2>&1 \
  || bounded 30 osascript -e 'tell application "System Events" to key code 53' >>"$OUT/osascript.log" 2>&1
sleep 2
shot gatekeeper-dismissed
sleep 2
kill "$OPEN_PID" 2>/dev/null
stop_app
check "the app is still in /Applications after the Gatekeeper dialog" '[ -x "$APP/Contents/MacOS/app" ]'

# What the release notes tell users to run before the first launch.
xattr -cr "$APP"

# 2. The sidecar inside the installed bundle, with throwaway homes.
(cd "$ROOT" && bun test/desktop-smoke/sidecar.ts "$SIDECAR" "$OUT" "$VERSION") || failed=1
if arch -x86_64 /usr/bin/true 2>/dev/null; then
  check "the sidecar's x86_64 slice runs (Rosetta)" '[ "$(arch -x86_64 "$SIDECAR" --version 2>/dev/null)" = "aas $VERSION" ]'
else
  log "skip: no Rosetta on this runner, the x86_64 slices were not run"
fi

# 3. First launch through LaunchServices, like a double click.
# WKWebView only moves Tab focus to buttons with full keyboard access on (off by default).
defaults write NSGlobalDomain AppleKeyboardUIMode -int 3
open "$APP"
sleep "$SETTLE"
PID=$(app_pids | head -1)
log "app pid after launch: ${PID:-none}"
check "the app is running ${SETTLE}s after launch" '[ -n "$PID" ]'
WINS=$(windows_of "${PID:-0}")
log "windows: ${WINS:-none}"
check "the main window is on screen" '[ -n "$WINS" ]'
shot 00-first-launch
sleep 10
check "the app is still running 10s later" '[ -n "$PID" ] && kill -0 "$PID" 2>/dev/null'
stop_app
check "the scheme is registered with LaunchServices" '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump 2>/dev/null | grep -q "agent-store:"'

# 4. Cold start from a link, confirmed with the keyboard: the dialog focuses Cancel,
#    Install is the next button.
open "agent-store://install?id=$(enc "$SKILL_ID")"
sleep "$SETTLE"
shot 01-link-confirm
check "a link starts the closed app" '[ -n "$(app_pids)" ]'
confirm
shot 02-link-installed
retry_link "agent-store://install?id=$(enc "$SKILL_ID")" '[ -f "$HOME/.agent-store/skills/$SKILL_SLUG/.agent-store.json" ]' 02-link-installed
log "skills: $(ls "$HOME/.agent-store/skills" 2>/dev/null | tr '\n' ' ')"
check "a cold-start link installs $SKILL_SLUG" '[ -f "$HOME/.agent-store/skills/$SKILL_SLUG/.agent-store.json" ]'
check "Claude Code gets the skill" '[ -e "$HOME/.claude/skills/find-skills/SKILL.md" ]'
stop_app

# 5. Warm start: the link reaches the running window.
open "$APP"
sleep "$SETTLE"
open "agent-store://install?id=$(enc "$MCP_ID")"
sleep "$SETTLE"
shot 03-warm-confirm
log "instances while warm: $(app_pids | wc -l | tr -d ' ')"
check "a warm link does not start a second instance" '[ "$(app_pids | wc -l | tr -d " ")" = 1 ]'
confirm
shot 04-warm-installed
retry_link "agent-store://install?id=$(enc "$MCP_ID")" 'grep -q "@upstash/context7-mcp" "$HOME/.claude.json" 2>/dev/null' 04-warm-installed
check "a warm link installs context7 for Claude Code" 'grep -q "@upstash/context7-mcp" "$HOME/.claude.json" 2>/dev/null'
stop_app

CRASHES=$(new_crash_reports)
[ -n "$CRASHES" ] && { log "crash reports:"; log "$CRASHES"; while IFS= read -r f; do cp "$f" "$OUT/"; done <<<"$CRASHES"; }
check "no crash report was written" '[ -z "$CRASHES" ]'
log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
