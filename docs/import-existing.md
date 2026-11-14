# Detecting agents and importing what the user already has

Issue [#193](https://github.com/phenix3443/agent-store/issues/193). On first launch the desktop client says which agents
are on the machine, lists the skills and user-level MCP servers the user set up without Agent Store, and takes over the
ones the user checks. An import can be undone.

Code: `apps/client-core/src/agents.ts` (detection) and `apps/client-core/src/import/` (`scan.ts`, `apply.ts`,
`redact.ts`), reached through `Engine`; commands in `apps/cli/src/commands/import.ts`; the guide in
`apps/cli-gui/src/components/WelcomeDialog.tsx`. Types: `packages/types/src/imports.ts`.

## Detection

| Field | How |
| --- | --- |
| `binary` | The executable the engine runs: `AS_CLAUDE_BIN` / `AS_CODEX_BIN` when set (`''` means none), else `claude` / `codex` on `PATH` |
| `version` | First line of `<binary> --version`, 5 s timeout |
| `configDir` | `CLAUDE_CONFIG_DIR` or `~/.claude`; `CODEX_HOME` or `~/.codex` |
| `mcpConfigPath` | `.claude.json` (in `CLAUDE_CONFIG_DIR` when set, else `~`); `$CODEX_HOME/config.toml` |
| `detected` | A binary or the config directory |

Nothing is refused for an agent that is not detected. Without its CLI the engine edits the MCP config file itself, and
`--replace` (taking over a same-name entry) is refused because its restore check runs the CLI. Skills never need the
CLI. A config directory that does not exist is created on the first write.

`aas doctor` prints the detection first. Two findings come from it: `agent-not-found` (something is enabled for an
agent that was not detected) and `agent-cli-missing` (an MCP server is enabled for an agent whose CLI is not on `PATH`).

## Scan

Read-only. Where it looks:

| | Skills | MCP servers |
| --- | --- | --- |
| Claude Code | `$CLAUDE_CONFIG_DIR/skills/*` | `mcpServers` at the top of `.claude.json` |
| Codex | `$CODEX_HOME/skills/*` and `~/.agents/skills/*` | `[mcp_servers.*]` in `config.toml` |

Project-level entries are not scanned; the project page shows them (`docs/project-scope.md`).

Left out: directories starting with `.`, entries without an exact-case `SKILL.md`, paths recorded in a registry
deployment, links into `~/.agent-store/skills`, and MCP names some `targets.json` records.

A skill that is listed but cannot be imported:

| `reason` | Why |
| --- | --- |
| `symlink` | The entry is a link (a dotfiles checkout, say). Importing would move where edits land, so it is left to the user |
| `external-link` | A link inside the skill points outside it; relative links would break in the library |
| `has-marker` | It already holds `.agent-store.json` |
| `too-large` | More than 2000 files |
| `unreadable` | It could not be read |

Grouping: places with the same directory name and the same content hash, at most one per agent, form one candidate
(`skill:<dir>`). Otherwise each place is its own candidate (`skill:<dir>@claude`, `@codex`, `@agents`), imported as a
separate library item and deployed only where it was. MCP entries are grouped by name (`mcp:<name>`); the Claude and
Codex entries of one name become one item that keeps each agent's entry.

### Catalog lookup

Unless `--offline` (`{ offline: true }` over RPC), each candidate's name is searched in the catalog. Only names are
sent. A skill matches exactly when every file's git blob sha equals the catalog's file list; the import then records
the catalog `resourceId` and version, so `aas update` works on it. A same-name skill with other content is reported but
imported as a local item. MCP matches (by npm / PyPI package or remote URL) are only reported: an imported MCP entry is
always local, because a catalog entry's launch is built from its config form and would drop the user's own arguments.

When the catalog cannot be reached, `catalogChecked` is false and nothing is matched.

### What a scan shows of an MCP entry

Env and header values are never shown, only their names. In `args`, the value of a flag whose name contains key,
token, secret, password, auth, credential, bearer or cookie is `***`, as is a bare argument that looks like a token
(24+ characters of letters and digits, no `/`). URLs lose their query values and user info. A config file that does not
parse is listed in `problems` with a fixed message that never quotes the file.

`lossyKeys` lists keys the agent's CLI cannot write back (`timeout` in a Claude entry; anything but `command`, `args`,
`env`, `url` and `bearer_token_env_var` in a Codex table). Importing keeps them. A disable and enable through the CLI
would drop them; without the CLI the file edit keeps a Claude entry exactly and refuses a Codex table it cannot
rewrite.

## Import

Everything runs under `~/.agent-store/imports.lock`. The scan is taken again first; an id it no longer offers is an
error and nothing is written.

`~/.agent-store/imports/<import-id>/` (0700) holds `import.json` (0600), written before anything moves and after each
step, the skill originals, and copies of the `.claude.json` / `config.toml` an MCP entry was read from.

**Skill.** For each candidate:

1. Copy the first place into a staging directory in the library, keeping links, modes and timestamps; check its
   content hash equals the scanned one; write the marker; rename it to `~/.agent-store/skills/<slug>`. The slug is the
   directory name, with `-2`, `-3` … when it is taken. The deployment keeps the original directory name, so the agents
   see the same name.
2. Add the registry entry: version `local` (or the catalog version on an exact match), `imported: { importId, at }`.
3. For each place: rename the original into the import directory (on another filesystem: copy, check the hash, remove
   the original), put a link to the library in its place (a copy where links fail), record the deployment.

**MCP server.** The agent configs are not written. `~/.agent-store/mcps/<slug>/manifest.json` (0600) keeps each
agent's entry as it was (`localEntries`) and its name (`entryName`, when it is not the slug); `targets.json` records
it as written by Agent Store (`previous: null`); the registry marks it enabled for those agents. From then on the usual
ownership rules apply (`docs/global-skills-mcp.md` §5.5): disable removes the entry while it still equals what was
recorded, and enable writes the saved entry back as it was, not rebuilt from a config form.

If a step fails, everything this import did so far is put back by the undo below and the error is reported; the record
ends as `rolled-back`.

## Undo

`aas import undo [<import-id>]`, the latest applied import by default. Every item is checked first. When one would
destroy something the import did not put there, nothing is changed and the error lists them:

| Conflict | When | `--force` |
| --- | --- | --- |
| `occupied` | Something other than the import's link or copy is at a skill's place | Still refused |
| `backup-missing` | The original is no longer in the import directory | Still refused |
| `modified` | The library copy changed (edited through the link, or updated from the catalog) | The edited copy is moved to `imports/<id>/kept/<slug>`, the original is put back |
| `changed` | An MCP entry differs from the imported one | The entry is left as it is now |

Then: MCP entries removed since the import are written back as they were (a direct file edit; a Codex table holding
values other than strings cannot be written this way and the undo stops with the reason), the link or copy at each
skill place is removed and the original renamed back, the library copy, `mcps/<slug>/` and the registry entries are
removed, and the config copies (they hold secrets) are deleted. Each step is recorded, so a run that stops part way is
finished by the next.

**What comes back byte for byte.** A skill original is only renamed, so its content, modes and timestamps are as before
(across filesystems it is copied with `preserveTimestamps`; directory timestamps may differ, not tested). An MCP config file is not written by the
import, nor by the undo while the entry is still there, so if nothing else changed it in the meantime it is identical.
An entry that was disabled after the import is written back as an entry (`result: entry`); the rest of the file is
reformatted by that write. `src/import/__tests__/import.test.ts` compares the whole tree (paths, types, modes,
content, link targets, mtimes) and both config files before the import and after the undo.

## Commands and RPC

```
aas import scan [--json] [--offline]
aas import apply <id>... | --all [--offline]
aas import undo [<import-id>] [--force]
aas import list
```

RPC methods: `detectAgents`, `importScan`, `importApply`, `importUndo`, `listImports` (the Tauri capability only
allows method names made of letters).

## Not covered

- Project-level skills and MCP entries.
- Skills that are links.
- macOS and Windows have not been run. On macOS a GUI app gets a short `PATH` without Homebrew or `~/.local/bin`, so
  the sidecar may not find `claude` / `codex` even when a terminal does; detection then reports no CLI and MCP writes go
  through the file edit, the same as before this change.
