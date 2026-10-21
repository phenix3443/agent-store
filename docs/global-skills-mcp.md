# Global Skills and MCP management for Claude Code and Codex: current state and phase-one plan

Status: draft plan (SOL-901). No code changes yet.

Goal: get each of Claude Code and Codex to recognize and use user-level (global) Skills and MCP servers installed by Agent Store, designing and passing acceptance for each tool separately. Unify code only where a real shared pattern shows up; no forced abstraction up front. Phase one does not cover project-level configuration.

## 1. Evidence and versions

| Item | Value |
| --- | --- |
| Claude Code | `2.1.80 (Claude Code)` (`/Users/lsl/.local/bin/claude`) |
| Codex CLI | `codex-cli 0.163.0` (`/opt/homebrew/bin/codex`) |
| agent-store base | `d7c27d6` (main) |
| registry base | `8c4a806` (`phenix3443/registry`) |
| Verified | 2026-10-21, macOS, isolated `HOME`/`CLAUDE_CONFIG_DIR`/`CODEX_HOME` (temp dir under `/tmp`); the real global config on this machine was not touched |

Items tagged [exp] in this doc come from the isolated experiment in §1.1; [doc]/[src] cite official docs or source (see §3).

### 1.1 Isolated experiment (reproducible)

```sh
T=$(mktemp -d); mkdir -p $T/home $T/claude $T/codex
export HOME=$T/home CLAUDE_CONFIG_DIR=$T/claude CODEX_HOME=$T/codex
# Skills: one each in a tool's own directory and in the shared ~/.agents/skills
mkdir -p $CLAUDE_CONFIG_DIR/skills/as-hello $HOME/.agents/skills/as-agents-hello $CODEX_HOME/skills/as-codex-hello
# (each SKILL.md has name/description frontmatter)
# MCP: a minimal stdio echo server (python3, no dependencies)
claude mcp add --scope user as-echo -- python3 -I $T/echo_mcp.py
codex  mcp add as-echo -- python3 -I $T/echo_mcp.py
```

Observations:

1. **Claude Code user-level skills**: read from `$CLAUDE_CONFIG_DIR/skills/<name>/SKILL.md` (default `~/.claude/skills`). The `system/init` event of `claude -p --output-format stream-json --verbose` emits `skills: [... "as-hello"]` **before** the model call, so it shows up even with an invalid `ANTHROPIC_API_KEY`. Claude does **not** read `~/.agents/skills` (`as-agents-hello` was not listed). Once the symlink `$CLAUDE_CONFIG_DIR/skills/as-agents-hello -> ~/.agents/skills/as-agents-hello` is created, it is recognized (**symlinks are followed**).
2. **Claude Code user-level MCP**: `claude mcp add --scope user` writes to the top-level `mcpServers` of `$CLAUDE_CONFIG_DIR/.claude.json` (`{"type":"stdio","command","args","env"}` / `{"type":"http","url"}`) and automatically creates a backup under `$CLAUDE_CONFIG_DIR/backups/`. `claude mcp list` reports `✓ Connected`; the init event reports `mcp_servers:[{"name":"as-echo","status":"connected"}]` and the tool `mcp__as-echo__echo`.
3. **Codex user-level skills**: read from both `$CODEX_HOME/skills` and **`$HOME/.agents/skills`** (roots `r0`/`r1` in `codex debug prompt-input`); a skill directory symlinked into `~/.agents/skills` is also recognized. `codex app-server`'s `skills/list` returns `scope:"user"` with the resolved real path. Only the exact `SKILL.md` filename is recognized (a lowercase `skill.md` was not picked up on the case-insensitive APFS volume).
4. **Codex user-level MCP**: `codex mcp add` writes `[mcp_servers.<name>]` (`command`/`args`/`[...env]` or `url`) to `$CODEX_HOME/config.toml` and **preserves the existing comments and formatting**. `codex mcp list --json` shows the parsed config; `codex app-server`'s `mcpServerStatus/list` actually starts the server and returns `serverInfo` plus `tools.echo` (no login required).

Conclusion: for both tools, "recognized" can be checked in an isolated environment without a model call. "Actually usable" (the model calls the skill/tool) needs a real model call, which goes in the real-environment acceptance step (§6).

## 2. Current state of agent-store / registry

Paths are relative to `apps/client-core/src/`.

### 2.1 Skills

- Install: `engine.ts:70-98` fetches the item → `~/.agents/skills/<slug>/` (`paths.ts:11,18-30`, `AS_HOME` default `~/.agents`) → runs `installHook.steps` (`installer/hook-runner.ts`: a `file` step downloads a single URL) → writes `manifest.json` → updates `~/.agents/registry.json`.
- Enable: `config/claude.ts:89-97` and `config/codex.ts:180-188` **copy** `<item>/skill.md` to `<tool>/skills/<slug>/SKILL.md`; disable/uninstall is `rm -rf`.
- Package engine: `agent-package-engine.ts:344-360` also copies just one file, into `skills/<publisher>.<name>#<id>/SKILL.md`; no disable/uninstall.
- Listing/detection only reads `registry.json` (`engine.ts:231-237`); real directories are never scanned.

### 2.2 MCP

- `config/mcp.ts` builds `{type:'stdio'|'http'|'sse', ...}`; `serverCommand` is split on single spaces (`:45-53`), so quoted arguments break; values the user set via `as config` never reach `env`.
- Claude: read-merge-write of `mcpServers` in `.claude.json` (`claude.ts:35-69`, mode 0600, no backup).
- Codex: the whole `config.toml` is rewritten with `@iarna/toml` (`codex.ts:61-64`), **dropping comments**, with no backup; the entry carries the Claude-only fields `type`/`headers`, and `sse` is allowed.
- On a parse failure both `readClaudeJson`/`readConfig` return `{}`, and the next write **overwrites the whole file** (`claude.ts:37-43`, `codex.ts:44-59`).
- Directory overrides: `AS_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_CONFIG_DIR` (the project's own variable; real Codex reads `CODEX_HOME`).

### 2.3 Registry

- `schema/package.schema.json`: `installHook.steps[]` (`script`/`config`/`file`) plus free-form `metadata`.
- Current packages: 10 skills (all `compatibleWith:["claude"]`, all with `metadata.source{repo,ref,path}`); 8 MCPs (6 stdio, 2 http, all `["claude","codex"]`, none with headers).

### 2.4 Tests

- Unit tests (bun) cover the config read/write in `config/__tests__/{claude,codex}.test.ts` and `__tests__/engine.test.ts`, but `codex.test.ts:52-59` asserts the Codex-incompatible `type` field.
- `test/e2e/verify.ts` runs the real `claude --print`/`codex exec` with isolated directories and checks tokens; it needs real provider keys.
- `scripts/local-e2e.sh` and the Docker fixture still check the old layout (`settings.json`, flat `skills/*.md`) and fail against the current code.

### 2.5 Gaps

| # | Gap | Impact |
| --- | --- | --- |
| G1 | Skills are installed by copying a single `SKILL.md` only | Multi-file skills (`scripts/`, `references/`) lose content |
| G2 | Codex skills are copied into `~/.codex/skills` while the store sits in `~/.agents/skills` | Contradicts the `~/.agents/skills` convention, which Codex reads natively; same-name skills can appear twice |
| G3 | Claude skills are copies, not symlinks | Contradicts `docs/codex-claude-shared-guidance-design.md`; updates go stale |
| G4 | A config parse failure silently overwrites the whole file | Can wipe out the user's `.claude.json` / `config.toml` |
| G5 | Rewriting Codex `config.toml` drops comments; entry fields are wrong (`type`, `headers`, `sse`) | Damages user config; http headers don't take effect |
| G6 | List/state relies only on `registry.json` | Drift from what is on disk goes unseen |
| G7 | No acceptance that the tools actually recognize/use the install; old scripts are broken | No proof the goal is met |
| G8 | Package names contain `.`/`#` | Odd tool names (`mcp__a.b#c__x`); Codex compatibility unverified |
| G9 | Registry skills don't declare `codex` | Codex can't install them through the store |
| G10 | `serverCommand` split on spaces; config values not injected into `env` | MCPs that take arguments or need keys are unusable |

## 3. How each tool manages things (official docs)

Docs consulted 2026-10-21. Tags: [doc] = official docs, [src] = source code, [exp] = this machine's experiment (§1.1), [inf] = inference.

### 3.1 Claude Code

- Personal skills: `~/.claude/skills/<name>/SKILL.md`; with `CLAUDE_CONFIG_DIR` set, every `~/.claude` path moves under that directory [doc: [skills](https://code.claude.com/docs/en/skills), [claude-directory](https://code.claude.com/docs/en/claude-directory)] [exp].
- Frontmatter fields are all optional, and `name` defaults to the directory name; but to stay Codex-compatible we always write `name` + `description` [doc].
- A skill entry can be a symlink to a directory elsewhere, and the same target is loaded only once [doc] [exp].
- Skill directories are watched, so edits apply in the current session; a brand-new top-level skills directory needs `/reload-skills` [doc].
- MCP user scope: the top level of `~/.claude.json`; local scope sits under `projects[path]`, project scope in `.mcp.json`. Precedence is local > project > user, with same-name entries replaced whole [doc: [mcp](https://code.claude.com/docs/en/mcp)].
- With `CLAUDE_CONFIG_DIR` set, the file is `$CLAUDE_CONFIG_DIR/.claude.json` [exp]; the docs don't state this filename.
- CLI: `claude mcp add|add-json|get|list|remove --scope user` [doc] [exp].
- Field shapes: stdio `{type,command,args,env}`; http/sse `{type,url,headers}`, with sse deprecated. `${VAR}` expansion is supported [doc].
- Headless check: `claude -p --output-format stream-json --verbose`. The first `system/init` event includes `tools`, `mcp_servers[{name,status}]`, `skills`, `slash_commands`, `plugins` [doc: [headless](https://code.claude.com/docs/en/headless), [agent-sdk](https://code.claude.com/docs/en/agent-sdk/typescript)] [exp].
- Proof a skill was used: a `tool_use` with `name:"Skill"`; for MCP, `name` is `mcp__<srv>__<tool>` [inf].
- `--bare` skips skills/MCP and is not usable for this acceptance [doc].

### 3.2 Codex CLI

- User skill root documented as `$HOME/.agents/skills` [doc: [build-skills](https://learn.chatgpt.com/docs/build-skills.md)].
- The code also scans `$CODEX_HOME/skills`, annotated "Deprecated user skills location ... kept for backward compatibility" [src: [host_roots.rs](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs)] [exp].
- `~/.agents/skills` uses `$HOME`, not `CODEX_HOME` [src] [exp].
- SKILL.md must include `name` and `description`; symlinked skill folders are supported [doc] [exp].
- Per-skill disable: in `config.toml`, `[[skills.config]] path="/abs/SKILL.md" enabled=false`, effective after a Codex restart [doc].
- MCP: `[mcp_servers.<name>]` in `$CODEX_HOME/config.toml`.
  - stdio keys: `command/args/env/env_vars/cwd`.
  - streamable HTTP keys: `url/bearer_token_env_var/http_headers/env_http_headers`.
  - common keys: `startup_timeout_sec/tool_timeout_sec/enabled/required/enabled_tools/disabled_tools`.
  - **No SSE** [doc: [mcp](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)] [src: [mcp_cmd.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs)].
- `codex mcp add` preserves comments in `config.toml` [exp]; it can only express `--env`/`--url`/`--bearer-token-env-var`/OAuth options [exp].
- Headless use: `codex exec --json --ephemeral --skip-git-repo-check`. The event stream's `item.completed` with `type:"mcp_tool_call"` carries `{server,tool,arguments,result,error,status}` [src: [exec_events.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs)].
- There is no skill-use event, so a skill is checked with a sentinel token [inf].
- Recognition without a model call: `codex app-server` methods `skills/list` and `mcpServerStatus/list` [exp; experimental interface].

## 4. Reference implementations

| Project | Stack / activity | Claude Code / Codex targets | Approach | Reuse | Drop |
| --- | --- | --- | --- | --- | --- |
| [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) | Tauri 2 + Rust core + CLI, MIT, v1.42.2, last commit 2026-10-21 | Skills: `~/.claude/skills`; `~/.codex/skills` (deprecated path), with `~/.agents/skills` only scanned; ignores `CLAUDE_CONFIG_DIR`/`CODEX_HOME`; **no MCP** | Central library + SQLite; symlink by default (copy as fallback); classify targets with `symlink_metadata`; `ReplacePolicy` refuses to delete real directories; content hash | **Reuse**: symlink + per-target deploy-mode record, refuse to overwrite non-managed directories, scan and adopt externally installed skills | Codex target path is outdated; desktop app + git merge engine is too heavy; a SQLite fact source would duplicate our registry.json |
| [congwa/skill-manager](https://github.com/congwa/skill-manager) | Tauri 2, v1.0.1, last commit 2026-02-25 (inactive), no LICENSE file | Claude `.claude/skills`; Codex `~/.codex/skills`; no MCP | Skill content lives in the SQLite database; deploy by copying; sha256 checksum + file watcher to detect drift; back up before overwriting | **Reuse**: checksum drift detection (synced/changed/missing), automatic backup before overwrite | DB as the fact source, copy-based deploy, unclear license; same `~/.skills-manager` directory as the previous project, so they may collide |
| [MediaPublishing/mcp-manager](https://github.com/MediaPublishing/mcp-manager) | Node/Express web UI, MIT, last commit 2024-12-17 (inactive) | Targets only Claude **Desktop** and Cline; does not target Claude Code `~/.claude.json` or Codex | Master `config.json` projected to each client; disable = delete; whole-file overwrite; hard-coded tool list | **Reuse**: only the idea of one master list projected to each tool with per-tool enable/disable | Whole-file overwrite with no backup, plaintext secrets, wrong targets |

Takeaways:

1. Neither skill reference handles Codex's `~/.agents/skills` correctly or the config-directory variables; we use the official paths verified in §1.1.
2. None of the three can serve as a base for Claude Code / Codex MCP management; MCP writes go through the official CLIs (§5).
3. Reuse ideas only, not code: both skill references are Rust/Tauri, while this repo's client-core is TypeScript/bun.

## 5. Design

Shared principles (both tools follow them independently; this is not a shared abstraction):

- **The canonical skill store is `~/.agents/skills/<name>/`**, matching the existing `~/.agents/skills` convention and `docs/codex-claude-shared-guidance-design.md`. Agent Store writes only the directories it installed itself; each one carries the marker file `.agent-store.json` (source, version, content hash). Directories without a marker belong to the user: never overwrite or delete them, and report a conflict on a name clash.
- **Write config through the official CLI first** (`claude mcp add-json/remove --scope user`, `codex mcp add/remove`). The CLI handles backups, format preservation, and future format changes. Fall back to file edits only for fields the CLI doesn't support, and then always: abort the write on a parse failure, write atomically (temp file + rename), and back up to `~/.agents/agent-store/backups/<ts>/` first.
- **Detection is based on the tools' own view**: "installed" comes from the files we wrote, while "recognized" comes from each tool's own interface (§1.1) and is shown in `as doctor` / the acceptance script.
- Name normalization: the skill/MCP name exposed to a tool is `^[a-z0-9-]{1,60}$` (the registry slug). Package-engine names `<publisher>.<name>#<id>` are converted to `<publisher>-<name>-<id>` (only for new installs; old entries keep their name until the PR6 migration).

### 5.1 Claude Code

| Object | Location | Enable | Disable/uninstall | Recognition check |
| --- | --- | --- | --- | --- |
| Skill | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<name>` → symlink → `~/.agents/skills/<name>` | Create the symlink; if the target exists and is not our symlink → conflict, no write | Remove only symlinks that point into our store | `init.skills` contains `<name>` |
| MCP | `${CLAUDE_CONFIG_DIR:-~}/.claude.json` `mcpServers.<name>` | `claude mcp add-json --scope user <name> '<json>'` | `claude mcp remove --scope user <name>` | `claude mcp get <name>` is Connected; `init.mcp_servers[].status=="connected"` |

- When the `claude` binary is unavailable, fall back to editing `.claude.json` safely as described above (keep the current `claude.ts` logic, but fix G4: abort on parse failure, write atomically, back up).
- JSON fields: stdio `{type,command,args,env}`; http/sse `{type,url,headers}`.

### 5.2 Codex

| Object | Location | Enable | Disable/uninstall | Recognition check |
| --- | --- | --- | --- | --- |
| Skill | `~/.agents/skills/<name>` (read natively by Codex; **nothing is written to `~/.codex/skills` anymore**) | Done once installed into the store | Uninstall deletes the store directory; for "disable in Codex only" see open question Q1 | `codex app-server` `skills/list` has `scope:"user"` and `name==<name>` |
| MCP | `${CODEX_HOME:-~/.codex}/config.toml` `[mcp_servers.<name>]` | `codex mcp add <name> [--env K=V] -- <cmd> <args...>` / `--url <url> [--bearer-token-env-var X]` | `codex mcp remove <name>` | `mcpServerStatus/list` returns the server's `tools` |

- Codex fields: stdio `command/args/env`; http `url/bearer_token_env_var/http_headers`. **SSE is not supported**; a manifest that declares only `sse` is marked `compatibleWith` without codex.
- Fields the CLI can't express (`http_headers`, `startup_timeout_sec`) are out of phase one; no current registry package uses them.
- Remove the `CODEX_CONFIG_DIR` → `CODEX_HOME` mismatch: read `CODEX_HOME` first, keeping `CODEX_CONFIG_DIR` as a compatibility alias.

### 5.3 Skill content install (both tools)

- Prefer `metadata.source{repo,ref,path}`: download that subdirectory's tarball (GitHub `codeload` tar.gz, extracting only `path/`) into a temp directory, check that `SKILL.md` exists and its frontmatter has `name`/`description`, then atomically rename it to `~/.agents/skills/<name>`.
- Fall back to a single-file `file` step, and write it as `SKILL.md` (uppercase).
- Updates replace the whole directory; when the content hash has changed (the user edited it locally), require `--force`.

### 5.4 Migrating existing installs

- The old layout (`~/.agents/skills/<slug>/skill.md + manifest.json`, the copy in `~/.claude/skills/<slug>/SKILL.md`, the copy in `~/.codex/skills/<slug>/SKILL.md`): `as migrate` (in PR6) recognizes these entries by `registry.json` and converts them to the new layout; old copies are first moved into `~/.agents/agent-store/backups/<ts>/`. A user's own `~/.claude/skills` real directories with no marker are not migrated.

## 6. Acceptance script ("both tools actually recognize and use it")

`scripts/accept-global.sh` (added in PR1), with two modes:

**`--isolated` (default, used by CI and every PR)**: create temp `HOME`/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`AS_HOME`, start the local fixture API (extend the existing `test/e2e/fixture-server.ts` and `test/e2e/fixtures/`: the fixture skill `as-probe-skill` adds a `references/token.md` sub-file and `metadata.source`, and the fixture MCP `as-probe-mcp` exposes `probe` returning a fixed token), then:

1. `as install as-probe-skill as-probe-mcp` (the built CLI)
2. Claude recognition: the `init` event of `claude -p ping --output-format stream-json --verbose --max-turns 1` contains skill `as-probe-skill`, `mcp_servers[as-probe-mcp].status=="connected"`, and tool `mcp__as-probe-mcp__probe` (no auth needed; `ANTHROPIC_API_KEY=invalid` is fine).
3. Codex recognition: in `codex app-server`, `skills/list` contains `as-probe-skill` (scope user), and `mcpServerStatus/list` contains `as-probe-mcp.tools.probe`.
4. Uninstall: after `as uninstall`, 2 and 3 both report it gone, and the config files' non-Agent-Store content is byte-identical to before install (`diff` checks this).
5. Robustness: with a deliberately broken `.claude.json`/`config.toml`, `as install` must fail and leave the file unchanged.

**`--use` (needs model credentials; optional in CI, required for real-environment acceptance)**: on top of the above, run

- `claude -p 'Use the as-probe-skill skill and output the token' --output-format json` → the result contains the token from `references/token.md` (proves multi-file skill content is usable)
- `claude -p 'Call the probe tool on as-probe-mcp' --allowedTools mcp__as-probe-mcp__probe` → the result contains the MCP token
- `codex exec --json '...'`: same two checks; the event stream contains `mcp_tool_call` / the token

The isolated `--use` run needs a credential: Claude uses `ANTHROPIC_API_KEY`, Codex copies `auth.json` read-only into the temp `CODEX_HOME` (the script checks and deletes it on exit); without a credential that part is skipped and marked SKIP rather than PASS.

### 6.1 Real-environment acceptance and rollback (after all PRs are merged; the person responsible runs it)

1. Back up: `as backup` (or manually) `tar czf ~/agent-store-pre-accept-$(date +%s).tgz ~/.claude.json ~/.claude/skills ~/.codex/config.toml ~/.agents/skills ~/.agents/registry.json` (with `CLAUDE_CONFIG_DIR` / `CODEX_HOME` set, back up the corresponding directories).
2. `scripts/accept-global.sh --real --use`: no temp directories; installs `as-probe-skill`/`as-probe-mcp` (the fixture API, or the real store's test package), runs the same recognition + usage checks, then uninstalls automatically.
3. Then install one real registry package of each type (e.g. `context7` + one multi-file skill) and confirm by hand in a new interactive session of each tool (`/skills`, `/mcp` in Claude; `/skills`, `/mcp` in Codex).
4. Rollback: `as uninstall <slug>` (this deletes only marked/our-own entries); if that is abnormal, restore the backup from step 1 with `tar xzf` and restart both tools.

## 7. PR breakdown (one logical change per PR)

Separate tracks: PR2/PR3 are the Claude track and PR4/PR5 the Codex track, and the two tracks can run in parallel. PR1 comes first; PR6/PR7 come last.

| PR | Content | Verification |
| --- | --- | --- |
| PR1 test: acceptance script and fixtures | Add `scripts/accept-global.sh` (isolated/use/real) and the multi-file fixture skill plus the probe MCP; delete/replace the stale `scripts/local-e2e.sh` checks. On the current code it is **expected to fail** on multi-file content/uninstall cleanliness (recorded as the baseline) | Run `--isolated` locally and record which items fail; shellcheck |
| PR2 fix(client-core): Claude config safe writes | `.claude.json` aborts on parse failure, writes atomically, backs up; MCP goes through `claude mcp add-json/remove --scope user` (falls back to the file when the binary is missing) | bun unit tests (broken JSON is not overwritten, other keys preserved); acceptance Claude MCP items pass |
| PR3 feat(client-core): Claude skill symlinks + full-directory install | Install the whole skill directory from `metadata.source` into `~/.agents/skills/<name>` (with marker); Claude enables via a symlink, removes only its own symlinks on disable, reports conflicts | Unit tests: tarball extraction, conflicts, symlink removal; acceptance Claude skill items (including `--use` reading the sub-file) pass |
| PR4 fix(client-core): Codex MCP via codex CLI + field mapping | `codex mcp add/remove`; correct fields (no `type`/`headers`, sse marked incompatible); `CODEX_HOME` first; safe fallback writes keep comments (no full rewrite) | Unit tests: the generated command line, the field mapping; a comment-preservation test; acceptance Codex MCP items pass |
| PR5 feat(client-core): Codex skills from `~/.agents/skills` | Stop writing to `~/.codex/skills`; Codex enable = present in the store; registry skills that pass get `codex` added (registry repo change goes in its own PR5b) | Acceptance Codex skill items pass; `skills/list` has no duplicate same-name skills |
| PR6 feat(cli): migrate + doctor | `as migrate` converts the old layout; `as doctor` compares registry.json against the real view of both tools; package-engine name normalization | Unit tests on old-layout fixtures; `--isolated` passes after migration |
| PR7 refactor: extract real shared parts | Only once PR2–PR5 are merged, and based on actually duplicated code (expected: the safe-write tool, skill store, marker); can be dropped if there is no real shared part | Full unit tests + `accept-global.sh --isolated` all pass |

Each PR: `pnpm lint && pnpm type-check && pnpm test` plus the `accept-global.sh --isolated` items for that PR.

## 8. Risks

- **Concurrent writes**: a running Claude Code also writes `.claude.json`; going through `claude mcp` reduces conflicts, and the fallback writes are atomic, but a concurrent overwrite can't be fully ruled out → in real acceptance, close the interactive sessions first.
- **Unstable interfaces**: Codex `app-server` is marked experimental and its method names may change; the Claude init event field names are not a contract either. The acceptance script pins the versions of both tools and prints the versions on failure.
- **Shared `~/.agents/skills` directory**: many skills here are maintained by hand or by other tools (e.g. skills-manager), so a name clash is possible; enforce the marker and conflict rules.
- **This machine's current real state**: `~/.claude/skills` holds 95 real directories (copies, not symlinks) and `~/.agents/skills` holds 110 entries (counted 2026-10-21 by `ls`, without reading contents); they have no marker, so they count as user-owned and are not migrated; only a same name produces a conflict notice.
- **Credentials**: `--use` needs model credentials; copying `auth.json` must stay inside the temp directory and be cleaned up at exit.
- **Different environment on agent machines**: in this machine's Paperclip runs, `CLAUDE_CONFIG_DIR`/`CODEX_HOME` point to agent profiles, so real-environment acceptance must state which `HOME` it targets.

## 9. Open questions

- Q1: Does Codex need "disable in Codex only, keep in Claude"? It can be done with `[[skills.config]] enabled=false` (§3.2), but needs a format-preserving TOML edit plus a Codex restart. Recommendation: not in phase one; in phase one, a skill's enable/disable acts on both tools together (Claude via the symlink, Codex via the store directory), and the UI says so plainly.
- Q2: When `CLAUDE_CONFIG_DIR` is not set, should skills go to `~/.claude/skills` and MCP to `~/.claude.json` (the default)? Recommended yes.
- Q3: Whether a skill without `metadata.source` (single file) is still accepted: recommend accepting it while the registry validator emits a warning.
- Q4: Whether the `--use` acceptance runs in CI (needs secrets): recommend running it only by hand in phase one.
