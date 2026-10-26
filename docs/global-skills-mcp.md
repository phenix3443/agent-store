# Global Skills and MCP management for Claude Code and Codex: current state and phase-one plan

Status: draft plan (SOL-901), revision 4. Revision 4 addresses [#41 comment 6321009403](https://github.com/phenix3443/agent-store/issues/41#issuecomment-6321009403) and the Board decision of 2026-10-22: `--replace` uses the same rule for both tools, a trial round-trip with the installed CLI before any write, so Claude entries that `add-json` cannot restore are rejected too; explicit empty `args`/`env` are equal to their absence under a defined comparison rule (§5.5, §1.1-6). Revision 3 addressed [#41 comment 6320891210](https://github.com/phenix3443/agent-store/issues/41#issuecomment-6320891210): Codex `--replace` only adopts entries the CLI can restore exactly, and rejects the rest before writing (§5.2, §5.5). Revision 2 addressed the review in [#41 comment 6320613986](https://github.com/phenix3443/agent-store/issues/41#issuecomment-6320613986): the source contract goes through the real API (§5.3), the skill lifecycle is explicit (§5.4), MCP ownership and rollback are covered (§5.5, §6.2), G10 is assigned (§5.6), and the acceptance script detects failures (§6). No code changes yet.

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
4. **Codex user-level MCP**: `codex mcp add` writes `[mcp_servers.<name>]` (`command`/`args`/`[...env]` or `url`) to `$CODEX_HOME/config.toml` and keeps comments and formatting **outside** the `mcp_servers` tables. Inside them it rewrites the whole section: comments above or inline in any `[mcp_servers.*]` table, including unrelated servers, are dropped, while values are kept (rechecked 2026-10-22 with `add`, `remove` and re-`add`). `codex mcp list --json` shows the parsed config; `codex app-server`'s `mcpServerStatus/list` actually starts the server and returns `serverInfo` plus `tools.echo` (no login required).

5. **Skill identity differs between the tools** (2026-10-22, same isolated setup): the directory `as-dir-x` with frontmatter `name: fm-x` shows up in Claude Code as `as-dir-x` (both `init.skills` and `slash_commands`), but Codex lists it as `fm-x` (`codex debug prompt-input`: `fm-x: probe x (file: r0/as-dir-x/SKILL.md)`). So Claude takes the directory name and Codex takes the frontmatter `name`. Registry skills hit this: the slug `skills-canvas-design` has frontmatter `name: canvas-design`.
6. **What each MCP CLI writes back** (2026-10-22, same isolated setup, `claude mcp add-json --scope user p '<json>'` then reading `.claude.json`; `codex mcp get p --json` on a hand-written `config.toml`):
   - Claude 2.1.80 keeps `type`, `command`, `args`, `env`, `url`, `headers`, `headersHelper` and `oauth` as given, empty `args: []`/`env: {}`/`headers: {}` included. It **drops** keys outside its schema (`timeout`, and in review an `unknown` key, and `env` on an http entry), with exit 0. `{"command":"node"}` comes back as `{"command":"node","args":[]}`.
   - codex-cli 0.163.0 reports the same effective config for `command="node", args=[], env={}` and for `command="node"` alone, except `env` is `{}` vs `null`; `args` is `[]` in both. Restoring through `codex mcp add p -- node` writes only `command` (review).

Conclusion: for both tools, "recognized" can be checked in an isolated environment without a model call. "Actually usable" (the model calls the skill/tool) needs a real model call, which goes in the real-environment acceptance step (§6).

## 2. Current state of agent-store / registry

Paths are relative to `apps/client-core/src/`.

### 2.1 Skills

- Install: `engine.ts:70-98` fetches the item → `~/.agents/skills/<slug>/` (`paths.ts:11,18-30`, `AS_HOME` default `~/.agents`) → runs `installHook.steps` (`installer/hook-runner.ts`: a `file` step downloads a single URL) → writes `manifest.json` → updates `~/.agents/registry.json`.
- Enable: `config/claude.ts:89-97` and `config/codex.ts:180-188` **copy** `<item>/skill.md` to `<tool>/skills/<slug>/SKILL.md`; disable/uninstall is `rm -rf`.
- Package engine: `agent-package-engine.ts:344-360` also copies just one file, into `skills/<publisher>.<name>#<id>/SKILL.md`; no disable/uninstall.
- Listing/detection only reads `registry.json` (`engine.ts:231-237`); real directories are never scanned.
- API contract: `apps/api/src/db-types.ts:73-78` maps a skill to `contentUrl` only, and `SkillItem` (`packages/types/src/items.ts:66-70`) has no source field. So `StoreClient.getItemBySlug` never returns `metadata.source`, and `test/e2e/fixture-server.ts` serves raw objects that skip `mapItem`.
- CLI: `apps/cli/src/commands/install.ts:9` handles only `args[0]`, and its `catch` prints the error and returns. The process exits 0 when an install fails.

### 2.2 MCP

- `config/mcp.ts` builds `{type:'stdio'|'http'|'sse', ...}`; `serverCommand` is split on single spaces (`:45-53`), so quoted arguments break; values the user set via `as config` never reach `env`.
- Claude: read-merge-write of `mcpServers` in `.claude.json` (`claude.ts:35-69`, mode 0600, no backup).
- Codex: the whole `config.toml` is rewritten with `@iarna/toml` (`codex.ts:61-64`), **dropping comments**, with no backup; the entry carries the Claude-only fields `type`/`headers`, and `sse` is allowed.
- On a parse failure both `readClaudeJson`/`readConfig` return `{}`, and the next write **overwrites the whole file** (`claude.ts:37-43`, `codex.ts:44-59`).
- Directory overrides: `AS_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_CONFIG_DIR` (the project's own variable; real Codex reads `CODEX_HOME`).

### 2.3 Registry

- `schema/package.schema.json`: `installHook.steps[]` (`script`/`config`/`file`) plus free-form `metadata`.
- Current packages: 10 skills (all `compatibleWith:["claude"]`, all with `metadata.source{repo,ref,path}`); 8 MCPs (6 stdio, 2 http, all `["claude","codex"]`, none with headers).
- In all 10 skills `metadata.source.path` points to a **file** (`.../<dir>/SKILL.md`), not a directory, and `ref` is the branch `main` rather than a commit.
- None of the 8 MCPs declares `configSchema.properties`. The stdio commands are all `npx -y <pkg>` with no quoting. `biel-ai`'s URL contains the template `{project_slug}`, but nothing ever fills it in.

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
| G11 | API/SDK don't expose `source`; registry `source.path` is a file path | A full-directory install can't get its source through the production API |
| G12 | MCP add/remove is unconditional by name | Can overwrite or delete a same-name MCP the user configured themselves |
| G13 | `as install` takes one slug and exits 0 on failure | Scripts and acceptance can't detect failures |
| G14 | Claude names a skill by its directory, Codex by its frontmatter `name` | The same skill has different names in the two tools; recognition checks by slug are wrong for Codex |

## 3. How each tool manages things (official docs)

Docs consulted 2026-10-21. Tags: [doc] = official docs, [src] = source code, [exp] = this machine's experiment (§1.1), [inf] = inference.

### 3.1 Claude Code

- Personal skills: `~/.claude/skills/<name>/SKILL.md`; with `CLAUDE_CONFIG_DIR` set, every `~/.claude` path moves under that directory [doc: [skills](https://code.claude.com/docs/en/skills), [claude-directory](https://code.claude.com/docs/en/claude-directory)] [exp].
- Frontmatter fields are all optional, and `name` defaults to the directory name; but to stay Codex-compatible we always write `name` + `description` [doc].
- The skill name the tool shows comes from the **directory name**, even when the frontmatter `name` is different (2.1.80) [exp §1.1-5]; see the [naming reference](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name).
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
- The skill name the tool shows comes from the frontmatter `name`, not the directory name [exp §1.1-5].
- Per-skill disable: in `config.toml`, `[[skills.config]] path="/abs/SKILL.md" enabled=false`, effective after a Codex restart [doc].
- MCP: `[mcp_servers.<name>]` in `$CODEX_HOME/config.toml`.
  - stdio keys: `command/args/env/env_vars/cwd`.
  - streamable HTTP keys: `url/bearer_token_env_var/http_headers/env_http_headers`.
  - common keys: `startup_timeout_sec/tool_timeout_sec/enabled/required/enabled_tools/disabled_tools`.
  - **No SSE** [doc: [mcp](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)] [src: [mcp_cmd.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs)].
- `codex mcp add/remove` preserve comments in `config.toml` outside `mcp_servers`, but drop comments inside any `[mcp_servers.*]` table [exp]; it can only express `--env`/`--url`/`--bearer-token-env-var`/OAuth options [exp].
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

Shared principles. Each tool follows them on its own; they are not a shared abstraction.

- **The canonical skill store is `~/.agents/skills/<slug>/`**, matching the existing convention and `docs/codex-claude-shared-guidance-design.md`. Agent Store writes only directories it installed itself. Each one carries the marker `.agent-store.json` with `{slug, version, source{repo,ref,resolvedSha,path}, contentHash, runtimeNames{claude,codex}}`. Directories without a marker belong to the user: Agent Store never overwrites or deletes them, and reports a conflict on a name clash.
- **Write config through the official CLI first** (`claude mcp add-json/remove --scope user`, `codex mcp add/remove`). Ownership and conflicts are decided by Agent Store's own preflight (§5.5), never by the CLI. Fall back to file edits only when the binary is missing, and then always: abort the write on a parse failure, write atomically (temp file + rename), and back up to `~/.agents/agent-store/backups/<ts>/` first.
- **Detection is based on the tools' own view**: "installed" comes from the files we wrote, and "recognized" comes from each tool's own interface (§1.1), checked by the per-tool resolved identity (§5.3).
- **Name rules**:
  - The install directory and MCP entry name are the registry slug (`^[a-z0-9-]{1,60}$`).
  - Skill frontmatter is **kept as the source wrote it, never rewritten**. So the Claude identity is `<slug>` (directory) and the Codex identity is the frontmatter `name`; both are recorded in the marker as `runtimeNames`.
  - Package-engine names `<publisher>.<name>#<id>` are converted to `<publisher>-<name>-<id>` for new installs only; old entries keep their name until the PR7 migration.

### 5.1 Claude Code

| Object | Location | Identity | Recognition check |
| --- | --- | --- | --- |
| Skill | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/<slug>` → symlink → `~/.agents/skills/<slug>` | `<slug>` | `init.skills` contains `<slug>` |
| MCP | `${CLAUDE_CONFIG_DIR:-~}/.claude.json` top-level `mcpServers.<slug>` | `<slug>`, tools `mcp__<slug>__*` | `init.mcp_servers[name==<slug>].status=="connected"` |

- Without `CLAUDE_CONFIG_DIR`, the defaults are `~/.claude/skills` and `~/.claude.json` (Q2, accepted in review).
- JSON fields: stdio `{type,command,args,env}`; http/sse `{type,url,headers}`. When the `claude` binary is missing, the fallback is the safe file edit above (fixes G4).

### 5.2 Codex

| Object | Location | Identity | Recognition check |
| --- | --- | --- | --- |
| Skill | `~/.agents/skills/<slug>` (read natively; **nothing is written to `~/.codex/skills` anymore**) | frontmatter `name` | `app-server` `skills/list` has `scope:"user"`, `name==runtimeNames.codex`, and a path that resolves to our directory |
| MCP | `${CODEX_HOME:-~/.codex}/config.toml` `[mcp_servers.<slug>]` | `<slug>` | `mcpServerStatus/list` returns the server's `tools` |

- Codex fields: stdio `command/args/env`; http `url/bearer_token_env_var`. **SSE is not supported**: an sse-only manifest is rejected for codex with a clear error.
- Fields the CLI can't express (`http_headers`, `startup_timeout_sec`) are out of phase one; no current registry package uses them. A manifest that needs them is rejected for codex.
- The same limit applies to **existing** user entries: `codex mcp add` rebuilds the whole table and resets any field it has no flag for (seen in review with codex-cli 0.163.0: `http_headers` and `startup_timeout_sec` dropped, `enabled=false` turned into `true`, exit 0). So `--replace` only adopts an entry that the CLI can write back exactly; see §5.5. The same rule covers Claude, whose `add-json` drops keys outside its schema (§1.1-6).
- Read `CODEX_HOME` first and keep `CODEX_CONFIG_DIR` as a compatibility alias.

### 5.3 Skill source contract and content install (fixes G1, G11, G14)

**API/SDK contract** (PR2):

- `SkillItem` gets `source?: { repo: string; ref: string; dir: string }` in `packages/types`. `dir` is a repo-relative **directory** path.
- `mapItem` (`apps/api/src/db-types.ts`) reads `metadata.source` and normalizes it:
  - a `path` ending in `/SKILL.md` is changed to its parent directory (all 10 current packages);
  - an empty string means the repo root;
  - `..`, absolute paths, and backslashes make the field drop out (it is then omitted, not guessed).
- `contentUrl` stays for the single-file fallback. The SDK needs only the type change, because `StoreClient` returns `Item`.
- The registry validator gets a warning for file-shaped paths. Changing the manifests themselves is a separate registry PR (PR2b) and not required, because the API normalizes either form.

**Client install** (PR4):

1. Resolve `ref` to a commit (`GET https://api.github.com/repos/<repo>/commits/<ref>` → `sha`, or read the top directory `<repo>-<sha>` of the codeload tarball).
2. Download `https://codeload.github.com/<repo>/tar.gz/<sha>` into a temp directory and extract only `<dir>/`. Reject symlinks pointing outside `<dir>`, absolute entries, and anything over 20 MB.
3. Check that `SKILL.md` (exact case) exists and its frontmatter has `name` and `description`. Record `runtimeNames = {claude: slug, codex: frontmatter.name}`.
4. Codex identity collision check: if another `SKILL.md` visible to Codex (`~/.agents/skills/*`, `$CODEX_HOME/skills/*`) already uses the same frontmatter `name`, fail with a conflict error. Override with `--force`.
5. Write the marker, then atomically rename the directory to `~/.agents/skills/<slug>`.
6. When `source` is absent, fall back to the single file from `contentUrl`, written as `SKILL.md` (Q3, accepted).

Updates replace the whole directory. If the content hash differs from the marker (a local edit), the update needs `--force`.

**Verification that uses production shapes**:

- `apps/api` unit test: the real record `skill/skills-canvas-design.json` from registry `8c4a806` goes through `mapItem` and gives `source.dir=="skills/canvas-design"`.
- The e2e fixture server builds its responses through the same `mapItem` from DB-row-shaped records instead of raw objects, so no field can exist that production doesn't return.
- The fixture serves a codeload-shaped tarball whose skill has `references/token.md`. The installed `~/.agents/skills/<slug>/references/token.md` must exist, and the `--use` step reads the token from it.

### 5.4 Skill lifecycle (fixes the Q1 contradiction)

Facts that bind the design:

- Content lives in `~/.agents/skills` (the convention), and Codex reads that directory natively. So **installed ⇒ visible to Codex**.
- The only Codex-side off switch is `[[skills.config]] enabled=false`, which is out of phase one.

Supported operations in phase one:

| Operation | Effect | `enabledFor` | Notes |
| --- | --- | --- | --- |
| `install <slug>` | Content into `~/.agents/skills/<slug>` (§5.3); then create the Claude symlink | `codex:true`, `claude:true` | A skill whose `compatibleWith` lacks `codex` is **rejected** ("~/.agents/skills is shared with Codex"). PR2b adds `codex` to the registry skills that pass validation; that PR merges before PR4 ships |
| `install <slug> --target codex` | Content only, no Claude symlink | `codex:true`, `claude:false` | |
| `install <slug> --target claude` | **Rejected** for skills | — | Codex would see the skill anyway; the error says so and suggests `--target codex` + `enable claude`, or a plain install |
| `enable <slug> claude` | Create the symlink; conflict if `~/.claude/skills/<slug>` exists and isn't our symlink | `claude:true` | Re-enable after disable is the same operation |
| `disable <slug> claude` | Remove only our symlink; **content stays** | `claude:false` | |
| `enable <slug> codex` | No-op when installed | `codex:true` (already) | |
| `disable <slug> codex` | **Rejected** (`CodexSkillDisableUnsupported`: "uninstall to remove the skill from Codex") | unchanged | Deferred to a later phase via `[[skills.config]]` |
| `uninstall <slug>` | Remove our Claude symlink, then the content directory (marker matches; hash changed → needs `--force`), then the registry entry | entry removed | |
| `sync` | Claude: recreate a missing symlink when `claude:true`. Codex: report the content as missing (no rewrite) | not changed by sync | Drift goes to `as doctor` |

Partial failure:

- Install writes in this order: staged content → rename → registry entry `{codex:true, claude:false}` → symlink → `claude:true`.
- A symlink failure leaves the registry truthful (`claude:false`), and the CLI exits non-zero naming the step. `as enable <slug> claude` recovers.
- Any failure before the rename leaves no trace: the temp directory is deleted.

Callers:

- The CLI enable/disable commands surface the rejection as a non-zero exit.
- The RPC path (`commands/rpc.ts`) returns the error to the caller.
- The desktop client calls enable/disable only from `ProviderConfigPanel.tsx:175` (providers). There is no skill toggle, so **phase one changes no UI**, and the design-file requirement does not apply. A future skill toggle must first be added to `docs/ui/Agent Store.dc.html`.

Acceptance for both tools, run by `accept-global --isolated`:

1. install
2. Claude and Codex both recognize the skill
3. `disable claude` → Claude no longer lists it, Codex still does
4. `disable codex` → rejected, exits non-zero, state unchanged
5. `enable claude` → recognized again
6. `install --target claude` → rejected
7. uninstall → neither tool lists it, and the directory and symlink are gone
8. Partial failure: a pre-existing real directory `~/.claude/skills/<slug>` makes the symlink step fail. Expect a non-zero exit, a registry with `claude:false`, Codex still recognizing the skill, and the user's directory untouched.

Each tool's view is re-read in a fresh process after every step; that is the "restart".

### 5.5 MCP ownership and conflicts (fixes G12)

Each tool is independent: `enable <slug> <tool>` adds that tool's entry and `disable` removes it. Ownership is recorded per tool in `~/.agents/mcps/<slug>/targets.json`:

```json
{ "claude": { "name": "<slug>", "written": { ...exact entry we wrote... }, "previous": null },
  "codex":  { "name": "<slug>", "written": { ... }, "previous": null } }
```

- **Preflight before every write.** Read the current user-scope entry for the name from the file, read-only: `.claude.json` `mcpServers.<name>` and the `config.toml` table `mcp_servers.<name>`. `written` is the entry as read back right after our own write, so later comparisons see what the CLI actually stored. Then:
  - absent → add it and record `written`;
  - equal to our `written` → no-op;
  - different and not ours → **fail with a conflict** and write nothing. `--replace` is the explicit adopt flow: save the existing entry to `previous`, then write ours. Restoring `previous` must be lossless, so `--replace` only proceeds after the restorability check below.
- **Comparison rule (both tools).** Every "equal" in this section (preflight, disable, setConfig, post-restore) compares the **canonical form** of an entry: the parsed value with these keys removed when they are empty: `args: []`, `env: {}`, and (Claude only) `headers: {}`. Nothing else is normalized: key order is ignored as in any JSON/TOML parse, but types, values and every other key, unknown keys included, must match exactly. The rule exists because both CLIs write these empties differently from how a user may have written them, with no change in behavior:
  - codex-cli 0.163.0 drops `args = []` and `env = {}` on restore, and `codex mcp get --json` reports `args: []` for both the explicit and the absent form (`env` is `{}` vs `null`; both mean no extra variables) (§1.1-6);
  - Claude 2.1.80 `add-json` turns `{"command":"node"}` into `{"command":"node","args":[]}` (§1.1-6).
  An empty value with any other key (for example `enabled_tools = []` or `headers = {}` in Codex) is not normalized: it is an unsupported key and is rejected below.
- **`--replace` restorability, checked before any write.** The same three steps apply to each tool, run with the installed CLI version:
  1. **Snapshot.** `previous` is the raw value read from the file, not from a CLI wrapper that fills in defaults: for Claude the JSON value of `.claude.json` `mcpServers.<name>`; for Codex the TOML table `mcp_servers.<name>` (sub-tables such as `.env` included) parsed read-only from `config.toml`. It is stored as JSON in `targets.json` together with the CLI version.
  2. **Restore command.** Build the exact command that would put `previous` back. Claude: `claude mcp add-json --scope user <name> '<previous as JSON>'`. Codex: `codex mcp add <name> -- <command> <args...>` with one `--env K=V` per entry, or `--url <url>` plus `--bearer-token-env-var` when set. For Codex the command can only carry `command`, `args` (array of strings), `env` (string map), `url` and `bearer_token_env_var` (and not both `command` and `url`); any other key (`http_headers`, `env_http_headers`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled` even when `true`, `cwd`, `env_vars`, `enabled_tools`/`disabled_tools`, OAuth settings, unknown keys) means the entry is **not restorable** and step 3 is skipped.
  3. **Trial round-trip.** Run the restore command in a scratch root (fresh temp `HOME`, `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, same timeout as §6), read the entry back from the scratch file, and compare its canonical form with that of `previous`. The scratch root is deleted afterwards. This catches what a static key list would miss, such as `add-json` silently dropping unknown keys (`timeout`, `unknown`; review case and §1.1-6), and it follows the CLI's real behavior if a later version changes it.
  If step 2 or 3 fails, `--replace` **fails before writing**: it names the keys that cannot be restored (the canonical diff), the real config file stays byte-identical, and the user can resolve it by hand (rename or remove their entry) and run enable again. Otherwise the takeover proceeds.
- **Restore** (on disable/uninstall/`--force`) runs the same restore command against the real config, reads the entry back, and requires it to equal `previous` under the comparison rule. If it doesn't, Agent Store exits non-zero, keeps `previous` in `targets.json`, and prints the saved value so nothing is lost.
- Agent Store does **not** edit `.claude.json` or `config.toml` itself to restore an entry while the binary is present. The file-edit path in §5 stays limited to a missing binary; in that case `--replace` is refused, because the trial needs the CLI. This keeps one write mechanism per tool and avoids a second writer that would have to preserve comments.
- **Disable/uninstall.** Read the entry again:
  - equal to `written` → remove it and, if `previous` is set, restore it;
  - edited externally (differs) or already gone → do not remove anything, exit non-zero with "changed outside Agent Store", and leave `enabledFor` unchanged. `--force` removes it anyway and still restores `previous`.
- **setConfig resync**: replace the entry only when it still equals `written`; otherwise fail the same way.
- **Shadowing**: a same-name Claude local/project-scope entry, or a Codex profile override, shadows the user entry. `as doctor` warns about it; phase one doesn't change those scopes.
- **Tests**:
  - PR3/PR5 unit tests: user entry already exists → conflict and file byte-identical; `--replace` → previous restored on uninstall; external edit → uninstall refuses and keeps it; setConfig on a drifted entry → refused; the comparison rule (`args: []`/`env: {}`/Claude `headers: {}` equal their absence; `args: ["x"]`, `env: {K: ""}`, an empty unsupported key, a changed type, or any extra key are **not** equal); the restore command built from a snapshot; a trial whose read-back differs → rejection with the real file byte-identical; the post-restore check failing when the CLI output differs. PR5 adds the restorable/not-restorable matrix for every Codex key listed above.
  - Every `accept-global --isolated` case below seeds the config with an unrelated server next to the probe (Claude `mcpServers.other`; Codex `[mcp_servers.other]` plus a top-level key with a comment). "Restored" means: the probe entry equals the seed under the comparison rule, the unrelated server deep-equals its seed, and for Codex the comment outside `mcp_servers` is still in the file (comments inside `mcp_servers` are not checked, because the CLI drops them, §1.1-4). For Claude this is a comparison of the `mcpServers` subtree, not whole-file byte equality, because Claude rewrites its own runtime keys.
  - Claude (PR3):
    1. **Not restorable**: the review case, `mcpServers.<probe> = {"type":"http","url":"https://example.invalid/mcp","headers":{"X-Test":"preserve-me"},"unknown":"keep"}`. `enable --replace` exits non-zero and names `unknown`; `.claude.json` is byte-identical (sha256) before and after. A second seed, an http entry with `env` and an unknown key, is rejected the same way.
    2. **Restorable**: a stdio entry with an argument containing a space and an `env` value with a space; an http entry with `headers`; and `{"command":"node"}` with no `type` or `args` (accepted under the comparison rule although the CLI adds `args: []`). Each is restored after `enable --replace` then `disable`, and again with `uninstall` instead of `disable`.
    3. **Failing probe**: a restorable seed, then `enable --replace` with a probe whose server command exits immediately. Recognition reports FAIL, the `finally` cleanup still disables the probe and restores the seed, and the script exits 1, not 0.
  - Codex (PR5):
    1. **Not restorable**: the review case, `[mcp_servers.<probe>]` with `url`, `http_headers={"X-Test"="preserve-me"}`, `startup_timeout_sec=37`, `enabled=false`. `enable --replace` exits non-zero, lists those three keys, and `config.toml` is byte-identical (sha256) before and after.
    2. **Restorable**: a table with `command`, `args` (one with a space), and `env`; a `url` + `bearer_token_env_var` table; a command-only table; and the **explicit-empty** table `command="node"`, `args=[]`, `env={}`. Each is restored after `enable --replace` then `disable`, and again with `uninstall`. For the explicit-empty table the check also asserts that the raw restored table is `command="node"` only and that `codex mcp get --json` reports the same `command`/`args` as for the seed, so the accepted difference is exactly the documented one.
    3. **Failing probe**: as for Claude; the script exits 1.
  - On the current code, PR1 records these as expected FAIL in the baseline.

### 5.6 MCP arguments and configuration (fixes G10)

**Arguments** (PR3 for the shared builder in `config/mcp.ts`):

- When the manifest has `metadata.command` + `metadata.args[]`, use them as given.
- Otherwise tokenize `serverCommand` with POSIX shell-word rules: single and double quotes, backslash escapes, **no** expansion.
- Reject unbalanced quotes and shell operators (`|`, `&`, `;`, `>`, `<`, `$(`, backticks) with a clear error rather than guessing.
- The resulting `command`/`args` array is passed to `claude mcp add-json` as JSON and to `codex mcp add -- <cmd> <args...>` as separate argv elements, so no shell re-splitting happens.

**Config → environment/auth binding:**

- A `configSchema.properties.<key>` may declare `x-env: "<ENV_NAME>"` (default `<KEY>` upper-snake). Values from `as config` (`config.json`) are injected:
  - stdio → `env` (Claude `env`, Codex `--env K=V`);
  - http → `{key}` placeholders in `url` are substituted;
  - an `x-bearer: true` property → Claude `headers.Authorization: Bearer <v>`, and for Codex `bearer_token_env_var=<ENV_NAME>` (the value stays in the user's environment; `as config` prints the variable to export).
- **Required but missing values**: `enable` fails before writing anything ("run `as config <slug>`"). Install still succeeds, and the CLI install exits non-zero with that message only when an enable was requested.
- Unsupported (rejected with a clear error): http headers for Codex other than bearer, sse for Codex, and values containing newlines.
- **Secret handling**: values are written into the tool config in plaintext (the current behavior for env too). `.claude.json` stays 0600, and `config.toml` is set to 0600 when we create it. This is noted in §8.
- **Verification**: a fixture MCP `as-probe-mcp-env` started as `node "<dir with space>/probe-env.mjs" --greeting "hello world"`, whose `probe` returns `$PROBE_TOKEN` + argv. `as config` sets `PROBE_TOKEN` (required). Checks:
  - before config, enable fails;
  - after config, both tools' recognition check lists `probe`;
  - `--use` (§6) checks that the returned text contains the token and `hello world` as one argument.

## 6. Acceptance script ("both tools actually recognize and use it")

`scripts/accept-global.ts` (added in PR1, run with `bun`). It is TypeScript rather than shell so it can bound every child process (`AbortSignal.timeout`, default 90 s per call), parse JSON events, and speak the `app-server` JSON-RPC. Rules:

- Every step records `PASS`/`FAIL`/`SKIP` with its command, exit code, and a stderr excerpt. Results print as JSON with separate `recognition`, `lifecycle`, and `usage` sections.
- **Exit codes**: 0 only if every required item passed; 1 on any FAIL; 2 (`INCOMPLETE`) if a required item was skipped.
- Installs run one slug per command (`as install as-probe-skill`, then `as install as-probe-mcp`, then `as install as-probe-mcp-env`). The script asserts each exit code.
- **Prerequisite in PR1**: `as install` (and enable/disable/uninstall) exits non-zero on failure. Multi-slug install stays out of scope; the usage message says one slug.
- On any failure or signal, a `finally` handler uninstalls the probes (isolated: deletes the temp root; real: runs §6.2 restore) and prints what it cleaned up.

**`--isolated`** (default; CI and every PR; recognition + lifecycle only):

- Temp `HOME`/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`AS_HOME`, plus the fixture API (built through `mapItem`, §5.3) serving the codeload-shaped tarball.
- Steps:
  1. Install the probes.
  2. Claude recognition: the `init` event of `claude -p ping --output-format stream-json --verbose --max-turns 1` (`ANTHROPIC_API_KEY=invalid` is fine) contains skill `as-probe-skill`, `mcp_servers[as-probe-mcp].status=="connected"`, and tool `mcp__as-probe-mcp__probe`.
  3. Codex recognition: `codex app-server` `skills/list` contains the probe's `runtimeNames.codex` with a path resolving to our directory; `mcpServerStatus/list` has `as-probe-mcp.tools.probe`.
  4. The skill lifecycle sequence from §5.4, the MCP conflict/`--replace`/external-edit sequence from §5.5, and the G10 fixture from §5.6.
  5. Uninstall: the tools no longer list anything, and the non-Agent-Store content of the config files is byte-identical to before install.
  6. Failure paths, each asserting a non-zero exit **and** byte-identical files:
     - a broken `.claude.json`;
     - a broken `config.toml`;
     - an unreachable store URL;
     - a tool binary that hangs (a stub on `PATH` that sleeps): the timeout fires, the step reports FAIL, and the script still cleans up.

**`--use`** (needs model credentials; manual only in phase one, Q4). Four usage checks:

- U1: Claude reads the skill's `references/token.md` token.
- U2: Claude calls `mcp__as-probe-mcp__probe` (`--allowedTools`).
- U3: `codex exec --json --ephemeral` returns the skill token.
- U4: the Codex event stream contains `mcp_tool_call{server:"as-probe-mcp",status:"completed"}` and the token.

The env/argument probe from §5.6 rides on U2/U4. Missing credentials make U1–U4 `SKIP`, so the exit code is 2 and the run **does not count as accepted**. Credentials: Claude uses `ANTHROPIC_API_KEY`; Codex gets `auth.json` copied read-only into the temp `CODEX_HOME`, and it is deleted in `finally`.

The CI result therefore means recognition + lifecycle only. Final acceptance needs a `--real --use` run with U1–U4 all `PASS`.

### 6.1 Identity of the run

The script prints the tool versions, `HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `AS_HOME` it targets, and refuses `--real` when any of them points inside a temp or Paperclip agent-profile directory unless `--i-mean-this-home` is given.

### 6.2 Real-environment acceptance and rollback (after all PRs are merged; the person responsible runs it)

Close interactive Claude Code and Codex sessions first, because both rewrite their config files.

1. **Preflight**: `bun scripts/accept-global.ts --real --preflight`. It fails if any probe name already exists in:
   - `~/.agents/skills`
   - `${CLAUDE_CONFIG_DIR:-~/.claude}/skills`
   - `.claude.json` `mcpServers` / `codex mcp get --json`
   - `~/.agents/registry.json`
2. **Backup**: `bun scripts/accept-global.ts --real --backup --root ~/.agents/agent-store/accept-backup/<ts>` (the root is explicit and printed; it must not exist yet). It stores:
   - `manifest.json`: whether each config file existed, its sha256, and the top-level entry list of both skills directories (name, type, symlink target, and a content hash for real directories, so restore can tell which ones changed);
   - copies of `.claude.json`'s `mcpServers` subtree, the whole `config.toml`, and `registry.json`;
   - `skills.tar` of both skills directories with symlinks preserved.
3. **Run**: `bun scripts/accept-global.ts --real --use --root <same root>`. It installs the probes from the fixture API or the real store's test package, runs recognition, lifecycle and U1–U4, uninstalls, then runs the restore check (step 5).
4. **Real packages**: install one real registry package of each type (for example `context7` and one multi-file skill). Confirm by hand in a new interactive session of each tool (`/skills` and `/mcp` in both). Then uninstall them.
5. **Restore**: `bun scripts/accept-global.ts --real --restore --root <root>` (also run automatically by `finally`):
   - Remove top-level entries in both skills directories that are **not** in the manifest. It removes only symlinks or marker directories; anything else is listed and the restore stops for a human decision.
   - Re-extract entries that are in the manifest but missing or whose hash changed, from `skills.tar`.
   - Write the saved `mcpServers` subtree back into `.claude.json` atomically (other keys untouched), and restore `config.toml` and `registry.json`. Any of the three files that did not exist before (per the manifest) is deleted instead, `.claude.json` included.
   - Re-list everything and diff against the manifest: skill entries by name, type, target and content hash; `config.toml` and `registry.json` by sha256; `.claude.json` by a deep-equal of `mcpServers` only, since Claude may have changed its own runtime keys. Exit 0 only if all of these match.
6. Restart both tools. If step 5 reports a difference, the backup root still has everything for a manual fix. The root is kept until the person responsible deletes it.

## 7. PR breakdown (one logical change per PR)

PR1 comes first. PR2/PR2b are the shared source contract. PR3/PR4 are the Claude track and PR5/PR6 the Codex track, which can run in parallel once PR2 is merged. PR7/PR8 come last.

| PR | Content | Verification |
| --- | --- | --- |
| PR1 test+fix(cli): acceptance harness and exit codes | `scripts/accept-global.ts` (isolated/use/real, timeouts, `finally` cleanup, result JSON); the fixture API builds responses through `mapItem`; probe fixtures; replace the stale `scripts/local-e2e.sh` checks. CLI install/enable/disable/uninstall exit non-zero on failure. On the current code the multi-file, lifecycle, conflict and G10 items are **expected to FAIL** (recorded as the baseline) | CLI unit tests for exit codes; `--isolated` run showing the failure-path items detected (hanging stub, broken config, unreachable store); recorded baseline |
| PR2 feat(api,types): skill source contract | `SkillItem.source{repo,ref,dir}`; `mapItem` normalization (§5.3) | API unit test on the real `skills-canvas-design.json` record; invalid paths dropped |
| PR2b registry: normalize skill sources and add codex | Registry repo. `source.path` becomes a directory; add `codex` to skills that pass validation; validator warns on file paths | Registry `validate.ts`; spot-check the API output after sync |
| PR3 fix(client-core): Claude MCP safe writes, ownership, args/config | `.claude.json` parse-abort/atomic/backup; `claude mcp add-json/remove --scope user`; preflight + `targets.json` (§5.5); shell-word args and config→env/url/bearer (§5.6, shared builder) | Unit tests: conflict, comparison rule, `--replace` trial/rejection/restore and post-restore check, external edit, broken JSON, tokenizer, required config; acceptance Claude MCP + G10 items pass, including the three Claude `--replace` cases in §5.5 |
| PR4 feat(client-core): skill store + Claude symlinks + lifecycle | §5.3 install (tarball, marker, runtimeNames, collision check); §5.4 operations for Claude and the codex rejections; `itemDir` for skills keeps `~/.agents/skills/<slug>` | Unit tests: extraction safety, conflicts, lifecycle matrix, partial failure; acceptance Claude skill + lifecycle items pass |
| PR5 fix(client-core): Codex MCP via codex CLI, fields, ownership | `codex mcp add/remove`; correct fields (no `type`/`headers`, sse rejected); `CODEX_HOME` first; the same preflight/ownership as PR3 for Codex; raw-table snapshot, the `--replace` restorability check (key set + trial round-trip) and CLI-based restore with the post-restore check under the comparison rule (§5.5); config binding through `--env`/`--bearer-token-env-var` | Unit tests: generated argv, field mapping, conflict/restore, restorability key matrix, explicit-empty vs absent, comment preservation in the fallback; acceptance Codex MCP + G10 items pass, including the three Codex `--replace` cases in §5.5 |
| PR6 feat(client-core): Codex skills from `~/.agents/skills` | Stop writing `~/.codex/skills`; Codex recognition by `runtimeNames.codex` | Acceptance Codex skill + lifecycle items pass; `skills/list` has no duplicates |
| PR7 feat(cli): migrate + doctor | `as migrate` converts the old layout (old copies moved into the backups directory first); `as doctor` compares registry.json/markers/targets.json with both tools' real view and warns on shadowing; package-engine name normalization | Unit tests on old-layout fixtures; `--isolated` passes after migration |
| PR8 refactor: extract the real shared parts | Only after PR3–PR6 are merged, and based on code that is actually duplicated (expected: safe write, preflight/ownership, skill store); dropped if there is no real duplication | Full unit tests + `--isolated` all pass |

Each PR runs `pnpm lint && pnpm type-check && pnpm test` plus its `accept-global --isolated` items. Final acceptance is §6.2 with U1–U4 all PASS.

## 8. Risks

- **Concurrent writes**: a running Claude Code also writes `.claude.json`. Going through `claude mcp` reduces conflicts and the fallback writes are atomic, but a concurrent overwrite can't be ruled out. Real acceptance closes interactive sessions first, and restore touches only the `mcpServers` subtree.
- **Unstable interfaces**: Codex `app-server` is marked experimental; the Claude init fields and the directory-vs-frontmatter naming (§1.1-5) are not contracts either. The script prints both versions on failure, and the naming behavior is re-checked in `--isolated`.
- **Codex sees every installed skill**: there is no per-tool Codex disable in phase one (§5.4), and installs of skills not declared Codex-compatible are rejected.
- **Unpinned sources**: registry `ref` is a branch; we pin the resolved SHA in the marker, but a reinstall can pick up new upstream content. Updates require `--force` when local content changed.
- **Shared `~/.agents/skills`**: many skills there are maintained by hand or by other tools, so name and frontmatter-name clashes are possible. The marker, conflict and collision rules apply.
- **This machine's current real state**: `~/.claude/skills` holds 95 real directories and `~/.agents/skills` 110 entries (counted 2026-10-21 by `ls`, contents not read). They have no marker, so they count as user-owned and are never migrated or removed.
- **Codex drops comments inside `mcp_servers`**: any `codex mcp add/remove`, ours included, removes comments in `[mcp_servers.*]` tables (§1.1-4). Values are kept and the real-acceptance restore (§6.2) puts back the whole `config.toml`; for normal use this is documented as a known CLI behavior, not worked around.
- **CLI write-back changes between versions**: what `add-json` and `codex mcp add` keep is observed behavior (§1.1-6), not a contract. The `--replace` trial runs with the installed CLI each time and the post-restore check repeats it, so a change shows up as a refused takeover or a non-zero restore with `previous` kept, never as a silent loss. The comparison rule is the only normalization; widening it needs a plan change.
- **Secrets in plaintext config**: MCP env values end up in `.claude.json`/`config.toml` (0600). Bearer tokens for Codex stay in an environment variable instead.
- **Credentials for `--use`**: `auth.json` copies stay in the temp directory and are deleted in `finally`.
- **Agent machines**: Paperclip runs point `CLAUDE_CONFIG_DIR`/`CODEX_HOME` at agent profiles; §6.1 refuses those for `--real`.

## 9. Decisions and open questions

- Q1 (resolved by §5.4): no per-tool Codex skill disable in phase one; `disable codex` and `install --target claude` are explicit rejections, and Claude enable/disable is independent.
- Q2 (accepted in review): default paths `~/.claude/skills` and `~/.claude.json` when `CLAUDE_CONFIG_DIR` is unset.
- Q3 (accepted in review): single-file skills without `source` are still installed, and the registry validator warns.
- Q4 (accepted in review): `--use` runs by hand in phase one; final acceptance requires U1–U4 PASS.
- Q5 (owner, non-blocking): skills keep their source frontmatter, so Claude shows `skills-canvas-design` while Codex shows `canvas-design`. The alternative is to name the install directory after the frontmatter `name` so both match, at the cost of more clashes with user directories. Recommendation: keep the slug directory in phase one and revisit with real usage.
