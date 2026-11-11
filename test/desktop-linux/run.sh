#!/usr/bin/env bash
# Opens agent-store:// install links the way a browser hands them to the OS
# (gio, as GNOME and most desktops do), against the real catalog, and
# screenshots each step into /out.
# Exits non-zero if the confirmed install did not land on disk.
set -uo pipefail

APP=/work/apps/cli-gui/src-tauri/target/release/app
OUT=${OUT:-/out}
SLUG=${SLUG:-superpowers-brainstorming}
CATEGORY=${CATEGORY:-skill}
SETTLE=${SETTLE:-10}
mkdir -p "$OUT"
: > "$OUT/result.txt"
log() { echo "$*" | tee -a "$OUT/result.txt"; }
shot() { import -window root "$OUT/$1.png"; }
stop_app() { pkill -x app; sleep 2; }
# xdg-open's generic fallback (no desktop session here) cannot run a quoted Exec
# path and fails silently, so go through gio like a real desktop.
open_link() { (gio open "$1" >>"$OUT/open.log" 2>&1 &); sleep "$SETTLE"; }

export DISPLAY=:99
# No GPU in the container: without these WebKitGTK paints a black window.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export XDG_DATA_HOME=$HOME/.local/share XDG_CONFIG_HOME=$HOME/.config
mkdir -p "$XDG_DATA_HOME/applications"

# 1. First launch registers the scheme handler (register_all on Linux).
"$APP" >"$OUT/app-first.log" 2>&1 &
sleep "$SETTLE"
shot 00-first-launch
log "scheme handler: $(xdg-mime query default x-scheme-handler/agent-store)"
stop_app

# 2. Cold start from a link: confirm dialog, then confirm with the keyboard.
#    Focus starts on the first button and loops, so Shift+Tab reaches Install.
open_link "agent-store://install?slug=$SLUG&category=$CATEGORY"
shot 01-cold-confirm
xdotool key shift+Tab Return
sleep 15
shot 02-after-confirm
if [ -d "$HOME/.claude/skills" ] && ls "$HOME/.claude/skills" | grep -q .; then
  log "installed: $(ls "$HOME/.claude/skills" | tr '\n' ' ')"
  installed=1
else
  log "installed: nothing under ~/.claude/skills"
  installed=0
fi
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

# 5. Warm start: the client is already running when the link arrives.
#    Expected on Linux until #68: a second instance handles the link.
"$APP" >"$OUT/app-warm.log" 2>&1 &
sleep "$SETTLE"
open_link "agent-store://install?slug=context7&category=mcp"
shot 06-warm
log "instances while warm: $(pgrep -xc app)"
stop_app

log "result: $([ $installed = 1 ] && echo PASS || echo FAIL)"
[ $installed = 1 ]
