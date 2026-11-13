#!/usr/bin/env bash
# The AppImage, in a container where nothing else is installed: its aas sidecar is
# the build output byte for byte and runs, its first launch registers the
# agent-store:// handler, and a link then starts the AppImage and installs through
# the bundled sidecar. Writes /out/appimage-*.png and /out/result.txt; exits
# non-zero if a check fails.
set -uo pipefail

OUT=${OUT:-/out}
SETTLE=${SETTLE:-12}
SKILL_ID=github:vercel-labs/skills/find-skills
SKILL_SLUG=skills-find-skills
mkdir -p "$OUT"
: > "$OUT/result.txt"
log() { echo "$*" | tee -a "$OUT/result.txt"; }
shot() { import -window root "$OUT/appimage-$1.png"; }
stop_app() { pkill -x app; sleep 2; }
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
failed=0
check() { if eval "$2"; then log "ok: $1"; else log "FAIL: $1"; failed=1; fi; }

export DISPLAY=:99
# No GPU in the container: without these WebKitGTK paints a black window.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
# No FUSE in the container. Exported so the handler gio starts inherits it.
export APPIMAGE_EXTRACT_AND_RUN=1
Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
sleep 2
eval "$(dbus-launch --sh-syntax)"
export XDG_DATA_HOME=$HOME/.local/share XDG_CONFIG_HOME=$HOME/.config
mkdir -p "$XDG_DATA_HOME/applications"

# Where a user keeps a downloaded AppImage, under the release asset's name.
mkdir -p "$HOME/Applications"
src=$(ls /bundles/*.AppImage)
IMAGE="$HOME/Applications/$(basename "$src" | tr ' ' .)"
cp "$src" "$IMAGE"
log "appimage: $IMAGE"

work=$(mktemp -d)
(cd "$work" && env -u APPIMAGE_EXTRACT_AND_RUN "$IMAGE" --appimage-extract >/dev/null)
SIDECAR=$work/squashfs-root/usr/bin/aas
debdir=$(mktemp -d)
dpkg-deb -x /bundles/*.deb "$debdir"
check "AppImage sidecar is the build output" 'cmp -s "$SIDECAR" /work/apps/cli-gui/src-tauri/binaries/aas-x86_64-unknown-linux-gnu'
check "AppImage sidecar is the deb's" 'cmp -s "$SIDECAR" "$debdir/usr/bin/aas"'
check "AppImage sidecar runs" '"$SIDECAR" search find-skills --kind skill 2>/dev/null | grep -q find-skills'

handler=$(xdg-mime query default x-scheme-handler/agent-store)
check "no agent-store:// handler before the first launch" '[ -z "$handler" ]'

# 1. First launch: register_all writes a user-level handler that runs the AppImage.
"$IMAGE" >"$OUT/appimage-first.log" 2>&1 &
sleep "$SETTLE"
shot 00-first-launch
stop_app
handler=$(xdg-mime query default x-scheme-handler/agent-store)
exec_line=$(grep -h '^Exec=' "$XDG_DATA_HOME/applications/$handler" 2>/dev/null | head -1)
log "scheme handler after first launch: ${handler:-none}, $exec_line"
check "first launch registers agent-store://" '[ -n "$handler" ]'
check "the handler runs the AppImage" '[ "$exec_line" = "Exec=\"$IMAGE\" %u" ]'

# 2. A link starts the AppImage; the install goes through the bundled sidecar.
(gio open "agent-store://install?id=$(enc "$SKILL_ID")" >>"$OUT/open.log" 2>&1 &)
sleep "$SETTLE"
shot 01-link-confirm
# Focus starts on Cancel and loops, so Shift+Tab reaches Install.
xdotool key shift+Tab Return
sleep 15
shot 02-link-installed
stop_app
check "a link to the AppImage installs $SKILL_SLUG" '[ -f "$HOME/.agent-store/skills/$SKILL_SLUG/.agent-store.json" ]'

log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
