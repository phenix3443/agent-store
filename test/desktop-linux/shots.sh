#!/usr/bin/env bash
# Screenshots of the real desktop window (Tauri + WebKitGTK on Xvfb, with the
# bundled aas sidecar behind IPC) against the live test catalog, for the
# catalog switch (#125), the skill library (#111), the window shell (#163), the Discover page,
# install dialog and libraries (#164), the welcome, usage and settings pages (#165), projects (#166)
# and backup and sync (#112). Each step is driven by an
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
# Every command line the sidecar is started with, the app's included; checked at the end for
# secret values (#177).
ARGV_LOG=$OUT/sidecar-argv.txt
: > "$ARGV_LOG"
sudo /work/test/desktop-linux/wrap-sidecar.sh "$ARGV_LOG" || { log "FAIL: wrapping the sidecar"; exit 1; }
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
settings_tab 3 6
shot 17c2-settings-backup-not-connected
settings_tab 4
shot 17d-settings-account
settings_tab 5
shot 17e-settings-cli
settings_tab 6
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

# 11. Projects (#166). A registered folder with a skill of its own, plus a skill and the
#     bearer MCP installed into it from aas: the MCP also exists globally, so it overrides
#     that entry, its key has no value on this machine, and Codex does not trust the folder.
PROJ=$HOME/code/demo-app
mkdir -p "$PROJ/.claude/skills/team-notes"
PROJ=$(realpath "$PROJ")
printf -- '---\nname: team-notes\ndescription: Notes the team keeps in the repository\n---\n# Team notes\n' > "$PROJ/.claude/skills/team-notes/SKILL.md"
cli projects add "$PROJ"
cli install "$SKILL_ID" --project "$PROJ"
cli install "$BEARER_MCP_ID" --project "$PROJ"
cli projects show "$PROJ"
check "the project skill is a copy, not a link" '[ -n "$(find "$PROJ/.claude/skills" -mindepth 1 -maxdepth 1 -type d -name "*find*")" ] && [ -z "$(find "$PROJ/.claude/skills" -mindepth 1 -maxdepth 1 -type l)" ]'
check "the project .mcp.json holds a variable reference, not the global token" 'grep -q "\${" "$PROJ/.mcp.json" && ! grep -q "test-token" "$PROJ/.mcp.json"'
KEY=$(printf '["%s"]\n' "$PROJ" | "$SIDECAR" __rpc getProject - | python3 -c 'import json,sys; e=json.load(sys.stdin)["data"]["env"]; print(e[0]["name"] if e else "")')
check "the project MCP reads a variable with no value yet" '[ -n "$KEY" ]'

# The project in the sidebar, then its page through the palette.
"$APP" >"$OUT/app-projects.log" 2>&1 &
sleep "$SETTLE"
point_at_window
shot 21-sidebar-projects
open_project() {
  xdotool key ctrl+k
  sleep 2
  xdotool type --delay 60 'demo-app'
  sleep 2
  xdotool key Return
  sleep 15
}
open_project
shot 22-project-detail
# Scroll the page to the 密钥 block: the key with no value and how agents get it.
xdotool click --repeat 12 5
sleep 1
shot 22b-project-keys-missing
stop_app

# context7 is installed globally, so its link says so and offers a project; the location
# is preselected, then the install writes the project's .mcp.json.
install_link "$NPM_MCP_ID"
xdotool key Tab Return
sleep 3
shot 23-install-location
confirm 20
shot 24-project-install-done
check "context7 written into the project's .mcp.json" 'grep -q "@upstash/context7-mcp" "$PROJ/.mcp.json"'
xdotool key Return
sleep 15
shot 25-project-after-install
point_at_window
xdotool windowsize "$WIN" 960 680
sleep 4
shot 26-narrow-project
stop_app

# The key stored from aas (stdin), and Codex trusting the folder: the page no longer
# warns about either. Neither value nor trust is written into the project.
printf 'tok-project\n' | "$SIDECAR" projects set-env "$PROJ" "$KEY" >>"$OUT/cli.txt" 2>&1
printf '\n[projects."%s"]\ntrust_level = "trusted"\n' "$PROJ" >> "$HOME/.codex/config.toml"
check "the key value stays out of the project" '! grep -rq "tok-project" "$PROJ"'
check "the key value is stored 0600 in ~/.agent-store" '[ "$(stat -c %a "$HOME/.agent-store/project-env.json")" = 600 ] && grep -q "tok-project" "$HOME/.agent-store/project-env.json"'
"$APP" >"$OUT/app-projects-2.log" 2>&1 &
sleep "$SETTLE"
point_at_window
open_project
shot 27-project-trusted-key-stored
stop_app
cli projects show "$PROJ"

# 12. Library gaps (#194). 在文件管理器中显示 goes to the desktop's file manager over D-Bus; a
#     stand-in records what it was asked to show.
REVEAL_LOG=$OUT/reveal.txt
python3 /work/test/desktop-linux/fake-filemanager.py "$REVEAL_LOG" >"$OUT/fake-filemanager.log" 2>&1 &
sleep 2
"$APP" >"$OUT/app-library.log" 2>&1 &
sleep "$SETTLE"
point_at_window
xdotool key ctrl+2
sleep 15
# From the page search: the four filter buttons, select all, the row's checkbox, then the row.
xdotool key slash
xdotool type --delay 60 'legacy'
sleep 2
xdotool key Tab Tab Tab Tab Tab Tab Tab Return
sleep 4
shot 28-skill-pane-library-path
# The row's two switches, the pane's close button and its two switches, then 在文件管理器中显示.
xdotool key Tab Tab Tab Tab Tab Tab Return
sleep 3
shot 28b-skill-revealed
check "在文件管理器中显示 handed the skill's library folder to the file manager" 'grep -q "^items file://$LIB/legacy-skill$" "$REVEAL_LOG"'

# Select both skills, then 停用 › Codex for all of them in one batch.
xdotool key Escape
sleep 1
xdotool key slash ctrl+a BackSpace
sleep 2
xdotool key Tab Tab Tab Tab Tab space
sleep 1
shot 29-bulk-bar
xdotool key Tab Tab Return
sleep 1
xdotool key Down Down Return
sleep 12
shot 29b-bulk-disable-results
check "bulk 停用 › Codex removed the Codex link and kept Claude's" '[ ! -e "$HOME/.codex/skills/legacy-skill" ] && links_to "$HOME/.claude/skills/legacy-skill" "$LIB/legacy-skill"'
xdotool key Escape
sleep 1
stop_app

# 替换现有条目: Claude Code already has its own entry under context7's name. Taking it over needs
# the claude CLI, which tries the restore in a scratch config first.
CLAUDE_CLI=/opt/claude-cli/bin/claude
CTX=$(printf '[]\n' | "$SIDECAR" __rpc list - | python3 -c 'import json,sys; print(next(e["slug"] for e in json.load(sys.stdin)["data"] if e.get("resourceId") == sys.argv[1]))' "$NPM_MCP_ID")
cli uninstall "$CTX"
"$CLAUDE_CLI" mcp add-json --scope user "$CTX" '{"type":"stdio","command":"echo","args":["mine"]}' >>"$OUT/cli.txt" 2>&1
check "the user's own context7 entry is in ~/.claude.json" 'python3 -c "import json,sys; e=json.load(open(sys.argv[1]))[\"mcpServers\"][sys.argv[2]]; sys.exit(e[\"command\"] != \"echo\")" "$HOME/.claude.json" "$CTX"'
export AS_CLAUDE_BIN=$CLAUDE_CLI CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
install_link "$NPM_MCP_ID"
confirm 25
shot 30-takeover-conflict
# Focus is on 跳过 Claude Code; the next button is 替换现有条目.
xdotool key Tab Return
sleep 30
shot 31-takeover-done
check "替换现有条目 saved the user's entry in targets.json" 'python3 -c "import json,sys; p=json.load(open(sys.argv[1]))[\"claude\"][\"previous\"]; sys.exit(p[\"command\"] != \"echo\")" "$HOME/.agent-store/mcps/$CTX/targets.json"'
check "替换现有条目 wrote Agent Store's entry in its place" 'python3 -c "import json,sys; e=json.load(open(sys.argv[1]))[\"mcpServers\"][sys.argv[2]]; sys.exit(\"@upstash/context7-mcp\" not in json.dumps(e))" "$HOME/.claude.json" "$CTX"'
stop_app

# Bulk 卸载 on the MCP page: confirmed, then the entry it replaced is written back.
"$APP" >"$OUT/app-bulk-uninstall.log" 2>&1 &
sleep "$SETTLE"
point_at_window
xdotool key ctrl+3
sleep 20
xdotool key slash
xdotool type --delay 60 'context7'
sleep 2
xdotool key Tab Tab Tab Tab Tab space
sleep 1
xdotool key Tab Tab Tab Return
sleep 2
shot 32-bulk-uninstall-confirm
# The confirmation opens on 取消; 卸载 is next.
xdotool key Tab Return
sleep 25
shot 32b-bulk-uninstall-results
check "bulk 卸载 wrote the user's own entry back to ~/.claude.json" 'python3 -c "import json,sys; e=json.load(open(sys.argv[1]))[\"mcpServers\"][sys.argv[2]]; sys.exit(e[\"command\"] != \"echo\" or e[\"args\"] != [\"mine\"])" "$HOME/.claude.json" "$CTX"'
check "bulk 卸载 removed context7 from the library" '[ ! -e "$HOME/.agent-store/mcps/$CTX" ]'
stop_app
unset AS_CLAUDE_BIN CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

# A project folder that is gone: the page shows what it last read there, read-only.
check "the project page remembered what it last read" '[ -n "$(find "$XDG_DATA_HOME" -path "*agent-store-cli/project-snapshots.json" 2>/dev/null)" ]'
mv "$PROJ" "$PROJ.moved"
"$APP" >"$OUT/app-project-missing.log" 2>&1 &
sleep "$SETTLE"
point_at_window
shot 33-sidebar-project-missing
open_project
shot 33b-project-missing-last-read
stop_app
mv "$PROJ.moved" "$PROJ"

# 13. Backup and sync (#112). A local bare repository is the remote; a second home with its own
#     ~/.agent-store plays the other device through aas. Device A is the window: connect, back up,
#     pull what B pushed, resolve a conflict both ways, restore the snapshot taken before that
#     choice, a secret that stops the backup, and disconnect. The remote must never hold the
#     marker key, the bearer token typed into the install dialog or the project key.
REMOTE_DIR=$(mktemp -d)
REMOTE=$REMOTE_DIR/backup.git
git init --bare -q --initial-branch=main "$REMOTE"
MARK=as-marker-key-7f3a9c2e5b1d
PROVIDER_SLUG=$(printf '[]\n' | "$SIDECAR" __rpc list - | python3 -c 'import json,sys; print(next((i["slug"] for i in json.load(sys.stdin)["data"] if i["category"]=="provider"), ""))')
check "a provider is installed to hold the marker key" '[ -n "$PROVIDER_SLUG" ]'
printf '["%s",{"apiKey":"%s"}]\n' "$PROVIDER_SLUG" "$MARK" | "$SIDECAR" __rpc setConfig - >>"$OUT/cli.txt" 2>&1
remote_has() { git --git-dir="$REMOTE" log --all -p --binary 2>/dev/null | grep -qE "$1"; }
backup_page() { point_at_window; xdotool key ctrl+6; sleep 2; settings_tab 3 "${1:-10}"; }
# The settings tabs scroll with the page; scroll back up before clicking them.
to_top() { xdotool mousemove $((X + WIDTH / 2)) $((Y + HEIGHT / 2)); xdotool click --repeat 20 4; sleep 1; }
palette() { xdotool key ctrl+k; sleep 2; xdotool type --delay 60 "$1"; sleep 2; xdotool key Return; sleep "${2:-25}"; }
HOME_B=$(mktemp -d)
cli_b() { echo "\$ (laptop-b) aas $*" >>"$OUT/cli.txt"; HOME=$HOME_B "$SIDECAR" "$@" >>"$OUT/cli.txt" 2>&1; echo >>"$OUT/cli.txt"; }

"$APP" >"$OUT/app-backup-1.log" 2>&1 &
sleep "$SETTLE"
backup_page
shot 34-backup-not-connected
# From the tab: the panel, then 连接仓库…; the dialog focuses the URL field.
xdotool key Tab Tab Return
sleep 2
xdotool type --delay 30 "$REMOTE"
xdotool key Tab Tab
xdotool type --delay 60 'desk-a'
shot 35-backup-connect-form
xdotool key Return
sleep 15
shot 36-backup-connected
# The connected step focuses 立即备份.
xdotool key Return
sleep 30
shot 37-backup-first-sync
stop_app
check "connect wrote this device's connection" 'grep -q desk-a "$HOME/.agent-store/backup/connection.json"'
check "the first backup pushed a commit by desk-a" '[ "$(git --git-dir="$REMOTE" log -1 --format=%an main 2>/dev/null)" = desk-a ]'
check "the backup holds the skill" 'git --git-dir="$REMOTE" ls-tree -r --name-only main | grep -q "^items/skill/$SKILL_SLUG/"'

# The other device restores the backup, switches the skill off for Claude Code and uploads that.
cli_b backup connect "$REMOTE" --device laptop-b
cli_b backup pull
check "laptop-b restored the skill" '[ -f "$HOME_B/.agent-store/skills/$SKILL_SLUG/SKILL.md" ]'
cli_b disable "$SKILL_SLUG" --for claude
cli_b backup now
"$APP" >"$OUT/app-backup-2.log" 2>&1 &
sleep "$SETTLE"
point_at_window
palette 'backup-pull'
backup_page
shot 38-backup-pulled
stop_app
check "the pull applied laptop-b's change: no Claude link for the skill" '[ ! -e "$HOME/.claude/skills/find-skills" ]'

# Both devices edit the same skill; backing up here finds the conflict.
printf '\nEdited on laptop-b.\n' >> "$HOME_B/.agent-store/skills/legacy-skill/SKILL.md"
cli_b backup now
printf '\nEdited on desk-a.\n' >> "$LIB/legacy-skill/SKILL.md"
"$APP" >"$OUT/app-backup-3.log" 2>&1 &
sleep "$SETTLE"
point_at_window
palette 'backup-now'
backup_page
shot 39-backup-conflict
# Panel, 拉取, 立即备份, the auto-sync switch, 断开…, then the conflict's 处理….
xdotool key Tab Tab Tab Tab Tab Tab Return
sleep 2
shot 40-backup-resolve-dialog
# The first choice has focus; arrows move to 两份都保留. Then 取消, 确定.
xdotool key Down Down
sleep 1
shot 40b-backup-resolve-both
xdotool key Tab Tab Return
sleep 25
shot 41-backup-resolved
check "kept both: the remote version is installed as legacy-skill-laptop-b" '[ -f "$LIB/legacy-skill-laptop-b/SKILL.md" ] && grep -q "Edited on laptop-b" "$LIB/legacy-skill-laptop-b/SKILL.md"'
check "kept both: this machine's version stays" 'grep -q "Edited on desk-a" "$LIB/legacy-skill/SKILL.md"'
check "kept both: the copy is enabled for no agent" '[ ! -e "$HOME/.claude/skills/legacy-skill-laptop-b" ] && [ ! -e "$HOME/.codex/skills/legacy-skill-laptop-b" ]'
# The newest snapshot is the one taken before that choice: Tab to its 恢复…, confirm (focus is on 取消).
to_top
settings_tab 3 6
xdotool key Tab Tab Tab Tab Tab Tab Return
sleep 2
shot 42-backup-restore-confirm
xdotool key Tab Return
sleep 25
shot 43-backup-restored
check "restoring the snapshot undid the choice" '[ ! -e "$LIB/legacy-skill-laptop-b" ]'
xdotool click --repeat 15 5
sleep 1
shot 44-backup-snapshots-history
stop_app

# A key pasted into a skill stops the backup before anything is written; the page names the file.
GH_FAKE=ghp_$(python3 -c 'import random,string; r=random.Random(7); print("".join(r.choice(string.ascii_letters+string.digits) for _ in range(36)))')
printf 'token: %s\n' "$GH_FAKE" > "$LIB/legacy-skill/leaked.md"
"$APP" >"$OUT/app-backup-4.log" 2>&1 &
sleep "$SETTLE"
point_at_window
palette 'backup-now' 20
backup_page
shot 45-backup-secret-found
check "the found key never reached the remote" '! remote_has "$GH_FAKE"'
rm -f "$LIB/legacy-skill/leaked.md"
# 断开…: panel, 拉取, 立即备份, the switch, 断开…; the dialog focuses 取消.
to_top
settings_tab 3 8
xdotool key Tab Tab Tab Tab Tab Return
sleep 2
shot 46-backup-disconnect-confirm
xdotool key Tab Return
sleep 10
shot 47-backup-disconnected
stop_app
check "disconnect removed only this machine's backup folder" '[ ! -e "$HOME/.agent-store/backup" ] && git --git-dir="$REMOTE" rev-parse -q --verify main >/dev/null'
check "the remote never held the marker key, the bearer token or the project key" '! remote_has "$MARK|test-token|tok-project"'
check "the marker key is still set on this machine" 'grep -rqs "$MARK" "$HOME/.agent-store"'
{
  echo "\$ git --git-dir=<remote> log --format='%h %an %s' main"
  git --git-dir="$REMOTE" log --format='%h %an %s' main
  echo
} >>"$OUT/cli.txt" 2>&1

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

check "the desktop client started the sidecar with its arguments on stdin" 'grep -qE "^__rpc [A-Za-z]+ -$" "$ARGV_LOG"'
check "every RPC call kept its arguments off the command line" '! grep "^__rpc" "$ARGV_LOG" | grep -qvE "^__rpc [A-Za-z]+ -$"'
check "no secret value reached a sidecar command line" '! grep -qE "test-token|tok-project|$MARK" "$ARGV_LOG"'

log "result: $([ $failed = 0 ] && echo PASS || echo FAIL)"
[ $failed = 0 ]
