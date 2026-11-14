# Project-level skills and MCP servers

Issue [#166](https://github.com/phenix3443/agent-store/issues/166). Agent Store can register project directories, show
what Claude Code and Codex actually use in each one, and install catalog skills and MCP servers into the project's own
files. Those files are meant to be committed, so nothing in them is machine-specific or secret.

Code: `apps/client-core/src/projects/` (the CLI and the desktop client both call it through `Engine`), commands in
`apps/cli/src/commands/projects.ts`.

## Where each agent reads project items

Checked with Claude Code 2.1.325 and codex-cli 0.166.0 in isolated `CLAUDE_CONFIG_DIR` / `CODEX_HOME`.

| | Claude Code | Codex |
| --- | --- | --- |
| Skills | `<project>/.claude/skills/<dir>/SKILL.md`, named by the directory | `.agents/skills/<dir>/SKILL.md` in every directory from the working directory up to the repository root, named by the frontmatter `name` |
| MCP servers | `<project>/.mcp.json`, `mcpServers` | `<project>/.codex/config.toml`, `[mcp_servers.<name>]` |
| When MCP entries apply | After the user approves each server (Claude Code asks on first use; the answer goes to `.claude/settings.local.json` `enabledMcpjsonServers` / `disabledMcpjsonServers`; `enableAllProjectMcpServers` approves all) | Only when the project is trusted: `[projects."<path>"] trust_level = "trusted"` in the user's `config.toml`. A `-c projects…` override does not count |
| Same name as a user entry | The project entry is used instead (local scope in `~/.claude.json` wins over both) | Tables are merged key by key: the project's keys win, user keys it leaves out (`env`, `cwd`) still apply |
| Values from the environment | `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url`, `headers` (per its docs; `${VAR}` in `env` tested). An unset `${VAR}` is reported as `Missing environment variables` by `claude mcp list` | `env_vars = ["VAR"]` forwards a variable to a stdio server; `bearer_token_env_var` and `env_http_headers` for HTTP. No reference syntax inside `args` or `url` |

Codex ignores `model_provider` and `model_providers` in a project file, so providers stay user-level only.

## What Agent Store writes

- **Skills** are copied, not linked: a link into `~/.agent-store` would point nowhere on a teammate's machine. The copy
  goes to `.claude/skills/<name>` and `.agents/skills/<name>`, where `<name>` is the frontmatter name when it is a safe
  directory name, else the slug, so both agents call it the same. No marker file is added to the copy.
- **MCP servers** get one entry per agent, named after the slug. `.mcp.json` keeps every other key; in
  `.codex/config.toml` only our table is rewritten, and the write is refused if anything else would change, so comments
  and other tables survive.
- Every value a user would type becomes a variable reference:
  - a public schema default (not marked secret) is written as is;
  - a required value without one becomes `${NAME}` (Claude Code) or `env_vars` / `bearer_token_env_var` /
    `env_http_headers` (Codex), where `NAME` is the variable the server reads (`x-env`, else the key in upper snake case);
  - an optional value without a default is left out.
- An item Codex cannot express this way (a secret inside a command-line argument or URL, an SSE server) is installed for
  Claude Code only and reported in `skipped`; asking for Codex alone is refused.
- An MCP server that runs files Agent Store downloaded into `~/.agent-store/mcps/<slug>` is refused: teammates do not
  have them.

Nothing is written at user level: no registry entry, no `~/.claude`, no `~/.codex`.

## What is ours

`~/.agent-store/projects.json` lists the registered projects and, per project, what Agent Store installed: each skill
copy's path (relative to the project, so a moved project keeps it) and content hash, and each MCP entry as written.

- An item whose place is taken by something Agent Store did not write is refused; nothing is overwritten.
- Reinstalling replaces our copy or entry while it is unchanged; an edited one needs `--force`.
- Uninstalling removes only our copies and entries, checks every target before removing any, and refuses an edited one
  without `--force`.
- Removing a project only drops it from `projects.json` (and its stored values). Files in the project stay, and are
  shown as the project's own if it is added again.

Projects are identified by their canonical path: a trailing slash or a symlink to the same directory is the same project.
A registered directory that disappears is reported as missing (`exists: false`, doctor `project-missing`); `aas projects
move` points it at the new path and keeps its id and records.

## Keys stay on this machine

The committed files hold variable names only. The values:

1. are stored with `aas projects set-env <project> <NAME>` (value from stdin, never from argv) or
   `Engine.setProjectEnv`, in `~/.agent-store/project-env.json`, mode 0600, keyed by project id;
2. reach the agent's process environment through `aas projects exec <project> -- claude|codex …` (runs in the project
   directory; stored values win over the shell's), or `eval "$(aas projects env <project>)"` in a shell or `.envrc`;
3. are then expanded by Claude Code from `${NAME}`, and forwarded by Codex through `env_vars`.

Checked end to end with a stdio server that exits unless its key is set: `claude mcp list` shows it `Connected` through
`aas projects exec` or `eval`, and reports `Missing environment variables` without them; a Codex run started through
`aas projects exec` hands the server the stored value, a plain run hands it nothing. The `e2e` workflow repeats this with
real model calls (`project:*` checks).

Rejected alternatives: Claude Code's user `settings.json` `env` is expanded into `.mcp.json` too, but it applies to every
project and lives outside Agent Store's state; a project's `.claude/settings.local.json` `env` is not used for the
expansion at all. Codex merges a user-level table of the same name into the project's, which could carry an `env`
value, but that table then also exists in every other directory.

`missingEnv` in `aas projects show` and the doctor's `project-env-missing` mean: a required variable has no stored
value. A variable exported in the user's own shell is not looked at, because the desktop client cannot see it.

## Reading a project

`Engine.getProject` (`aas projects show`) lists every skill and MCP server the agents would load, whoever put it there,
with per-location details: which agent, which file, whether Agent Store installed it and whether it was edited since,
Claude Code's approval, a Claude Code local entry shadowing the shared one, an override of a user-level entry, the
variables the entry reads and which of them have no stored value, and whether Codex trusts the project. Approval is read
from the settings files above; Claude Code additionally wants the folder trusted, which is not checked.

`aas doctor` reports the same data: `project-missing`, `project-item-missing`, `project-item-modified`,
`project-env-missing`, `project-codex-untrusted`, and, for user-level MCP servers, `mcp-shadowed` now also names entries
in registered projects (Codex only when the project is trusted).

## Not done

- Comparing project items with the catalog, syncing in either direction, updating project installs with `aas update`.
- Disabling an item per project; project-level providers (Codex ignores them).
- MCP entries that stay on this machine only (Claude Code's local scope is read, never written).
- Optional MCP values at project level (only required values and defaults are written).
