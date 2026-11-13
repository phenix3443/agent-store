#!/usr/bin/env bash
# Opens agent-store:// install links the way a browser hands them to the OS
# (gio, as GNOME and most desktops do), against the real catalog, and
# screenshots each step into /out.
# Installs the .deb, checks the .rpm carries the same untouched sidecar, then
# drives the links. Exits non-zero if a check fails: a confirmed install did not
# land on disk, a link opened a second instance, or a bundled sidecar is broken.
set -uo pipefail

OUT=${OUT:-/out}
SLUG=${SLUG:-superpowers-brainstorming}
CATEGORY=${CATEGORY:-skill}
WARM_SLUG=${WARM_SLUG:-superpowers-executing-plans}
SETTLE=${SETTLE:-10}
mkdir -p "$OUT"
: > "$OUT/result.txt"
log() { echo "$*" | tee -a "$OUT/result.txt"; }
shot() { import -window root "$OUT/$1.png"; }
stop_app() { pkill -x app; sleep 2; }
# xdg-open's generic fallback (no desktop session here) cannot run a quoted Exec
# path and fails silently, so go through gio like a real desktop.
open_link() { (gio open "$1" >>"$OUT/open.log" 2>&1 &); sleep "$SETTLE"; }
skill_installed() { [ -f "$HOME/.agent-store/skills/$1/.agent-store.json" ]; }
failed=0
check() { if eval "$2"; then log "ok: $1"; else log "FAIL: $1"; failed=1; fi; }

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
# The package's .desktop declares the scheme; no launch needed yet.
handler=$(xdg-mime query default x-scheme-handler/agent-store)
log "scheme handler after install: ${handler:-none}"
check "deb registers agent-store:// on install" '[ -n "$handler" ]'
# The sidecar is a bun-compiled binary with its script appended; any bundler that
# rewrites it (patchelf) breaks it silently.
check "installed sidecar runs" '"$SIDECAR" search brainstorming 2>/dev/null | grep -q brainstorming'
rpmdir=$(mktemp -d)
(cd "$rpmdir" && rpm2cpio /bundles/*.rpm | cpio -idm --quiet)
check "rpm carries the same sidecar as the deb" 'cmp -s "$rpmdir/usr/bin/aas" "$SIDECAR"'
# The app binary itself differs per bundle (tauri stamps the bundle type into it).
check "rpm carries the app and declares agent-store://" '[ -x "$rpmdir/usr/bin/app" ] && grep -qs "x-scheme-handler/agent-store" "$rpmdir"/usr/share/applications/*.desktop'
log "app: $APP, sidecar: $SIDECAR"

# 1. First launch (register_all on Linux writes a user-level handler).
"$APP" >"$OUT/app-first.log" 2>&1 &
sleep "$SETTLE"
shot 00-first-launch
handler=$(xdg-mime query default x-scheme-handler/agent-store)
log "scheme handler after first launch: ${handler:-none}"
[ -n "$handler" ] && log "handler Exec: $(grep -h '^Exec=' "$XDG_DATA_HOME/applications/$handler" /usr/share/applications/"$handler" 2>/dev/null | head -1)"
check "agent-store:// has a handler" '[ -n "$handler" ]'
stop_app

# 2. Cold start from a link: confirm dialog, then confirm with the keyboard.
#    Focus starts on the first button and loops, so Shift+Tab reaches Install.
open_link "agent-store://install?slug=$SLUG&category=$CATEGORY"
shot 01-cold-confirm
xdotool key shift+Tab Return
sleep 15
shot 02-after-confirm
log "skills: $(ls "$HOME/.claude/skills" 2>/dev/null | tr '\n' ' ')"
check "cold-start link installs $SLUG" 'skill_installed "$SLUG"'
stop_app

# 3. The same link again: already installed, nothing new happens.
open_link "agent-store://install?slug=$SLUG&category=$CATEGORY"
shot 03-already-installed
stop_app

# 4. Unknown package and a malformed link: a notice, no install.
open_link "agent-store://install?slug=does-not-exist"
shot 04-not-found
stop_app
open_link "agent-store://install"
shot 05-invalid
stop_app

# 5. Warm start: the client is already running when the link arrives. The link
#    must reach the running window (single instance), and confirming installs it.
"$APP" >"$OUT/app-warm.log" 2>&1 &
sleep "$SETTLE"
open_link "agent-store://install?slug=$WARM_SLUG&category=skill"
shot 06-warm-confirm
instances=$(pgrep -xc app)
log "instances while warm: $instances"
check "warm link does not start a second instance" '[ "$instances" = 1 ]'
xdotool key shift+Tab Return
sleep 15
shot 07-warm-after-confirm
check "warm link installs $WARM_SLUG in the running window" 'skill_installed "$WARM_SLUG"'
stop_app

log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
