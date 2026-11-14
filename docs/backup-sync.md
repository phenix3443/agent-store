# Backup and sync between devices

Issue [#112](https://github.com/phenix3443/agent-store/issues/112). Agent Store backs up what is installed on this machine to
a Git repository the user owns, and brings the changes made on other devices back in. There is no server-side sync;
this is the only way settings move between machines.

Code: `apps/client-core/src/backup/` (the CLI and the desktop client both call it through `Engine`), commands in
`apps/cli/src/commands/backup.ts`, types in `packages/types/src/backup.ts`.

## Connecting

```
aas backup connect <git-url> [--branch <b>] [--device <name>] [--username <u>] [--token-stdin]
```

- **Remote:** any Git remote works: HTTPS, SSH, a self-hosted server, a local path. Agent Store runs the system `git`,
  so SSH keys, credential helpers and proxies the user has set up apply as they are.
- **HTTPS token:** `--token-stdin` reads it from stdin, never from the command line.
  - It is stored in `~/.agent-store/backup/credentials.json` (mode 0600).
  - It reaches git only through an environment variable read by a credential helper given on the command line, so it is
    in neither argv nor `.git/config`.
  - A `user:token@` in a pasted HTTPS URL is moved there too.
  - A token with an SSH remote is refused.
- **Branch:** the remote's default branch, else `main`.
- **Repository contents:** the branch must be empty or already hold an Agent Store backup (`agent-store-backup.json`).
  Anything else is refused and nothing is left behind.
- **Device:** the name defaults to the host name. It is the author of every commit this device makes.
- **No sync yet:** connecting copies nothing in either direction.
  - On a new machine, `aas backup pull` installs what the backup holds.
  - `aas backup now` merges both ways.

GitHub sign-in that creates the repository is not available; create a private repository and connect to its URL.

## What is in the backup

```
agent-store-backup.json                 {"format":"agent-store-backup","schema":1}
items/<skill|mcp|provider>/<slug>/
  state.json                            enabled flag per agent
  content/item.json                     version, catalog id, compatible agents, duplicate's parent,
                                        manifest and config without secrets (MCP servers, providers)
  content/files/                        skills: the whole library directory
```

Every installed item is in it: skills, MCP servers and providers, duplicated providers included. JSON is written with
sorted keys, so the same state gives the same files on every device.

Never in it:

- **Provider credentials:** `apiKey`, `apiKeys`, `token`.
- **Secret config values:** any config value marked `x-secret`, `x-bearer`, `writeOnly` or `format: password` in the
  item's schema, or named like a key, token, secret, password, credential, authorization, cookie or session.
- **Agent Store's own secret files:** the relay token, `project-env.json`, the backup credentials.
- **Other tools' files:** Agent Store does not read the agents' own files for the backup, `auth.json` and settings
  included.
- **Machine-local state:**
  - deployment records;
  - MCP `targets.json` (it holds the written entries, secret values included);
  - files an MCP install hook downloaded (they are fetched again from the manifest);
  - usage data, relay ports and state, the catalog cache, the plan, the budget.
- **Registered projects:** their paths belong to one machine, their items are committed in the project's own repository,
  and their stored values are secrets.
- **Excluded skill files:** inside a skill directory, `.git`, `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa` and
  similar, `auth.json`, `credentials.json`, `project-env.json`, and files only their owner can read.
  - The owner-only rule applies only when `SKILL.md` itself is readable by others, and not on Windows.
  - Excluded files are listed in the results and in `status`.

Skills over 100 MB stay on the machine that has them:

- **Placeholder:** the backup holds a placeholder for the skill, and `status` lists it as kept local.
- **Content:** a placeholder never replaces real content, and remote content is never written over a local skill that is
  over the limit.
- **Other devices:** a device without the skill reports it as not available and does not delete it from the backup.

### Secret check

Before anything is written to the repository, every exported file is checked for two things:

1. **Known values:** every value taken out above, the relay token, the stored project values and the backup token, when
   at least 8 characters long.
2. **Key formats:** Anthropic and OpenAI `sk-` keys, GitHub tokens, AWS access key ids, Slack tokens, Google API keys,
   PEM private keys. Placeholders such as `sk-xxxx…` do not count.

A hit stops the whole operation before any Git object is created. The error names the item and file and what was found,
never the value. `status` shows the same finding.

## Syncing

| Command | What it does |
| --- | --- |
| `aas backup now` | Snapshot, export, fetch, merge, commit on top of the remote, push, then apply what came from the remote |
| `aas backup pull` | Fetch, merge, apply remote changes; local changes stay for the next `now` |
| `aas backup status [--fetch]` | Connection, last sync, local changes, conflicts, missing keys, failures, local-only items; `--fetch` counts remote commits not applied yet |
| `aas backup log [--limit N]` | Backup commits with the device that made each |

From the CLI, sync runs only when one of these commands runs. The desktop client can also sync on its own while it is open; see [For the desktop client](#for-the-desktop-client).

### How items are merged

The merge is per item, not per line. It compares three versions of each item: the last synced commit, this machine's
export and the fetched remote.

**Parts.** Each item has two parts, compared by their Git object ids:

- the content (`content/`);
- the enabled flags (`state.json`).

For each part:

| This machine | Remote | Result |
| --- | --- | --- |
| changed | unchanged | this machine's version |
| unchanged | changed | the remote's version |
| changed | changed, to the same | that version |
| changed | changed, differently | the item is in conflict |

So a skill edited on one device and switched off for Codex on another ends up edited and off.

**Deletions.**

- Removed on one side and unchanged on the other: removed.
- Removed on one side and changed on the other: conflict.

**First sync** (no common commit yet, or the remote history was rewritten):

- An item on one side only is taken.
- An item on both sides that differs is a conflict.

Nothing is treated as deleted.

**Commits and push.**

- History stays linear: the new commit's parent is the remote head.
- A rejected push fetches and merges again, up to three times.
- A branch that disappeared from the remote after a sync is refused, so an emptied remote cannot uninstall everything.

### Applying remote changes

Remote changes go through the same engine calls as a manual install, enable or uninstall, so the ownership rules for
tool files hold. The backup is the source, not the store.

- **Skills** are written from the backup files into the library and deployed to the agents they are enabled for.
- **MCP servers and providers** are installed or updated from the backup's manifest.
  - Their config becomes the backup's values plus this machine's own secret values.
  - A key set on this machine survives remote changes.

After applying, the item is exported again. If it still differs from the backup, it is listed as failed and the remote
version is applied again on the next sync. A half-applied item is never uploaded as a local change or a removal.

### Missing keys

An item that is enabled in the backup but cannot be enabled here is installed and left disabled:

- a provider without a key (`no-key`);
- an MCP server missing a required value (`needs-config`).

It is listed under missing keys with the command to set it. Until it is enabled here, this machine keeps reporting it as
enabled in the backup, so it never uploads a disable nobody chose. An enable that fails for another reason, such as the
relay not starting, is handled the same way and listed as failed.

## Conflicts

- **While pending:**
  - this machine keeps its own version;
  - the remote keeps the remote version;
  - every other item keeps syncing.
- **Listed by:** `aas backup conflicts` and `status` list each conflicting item with what differs and the device that last
  changed it.

```
aas backup resolve <item> local|remote|both        <item>: slug or <kind>/<slug>
```

- `local`: this machine's version is uploaded by the next `now`.
- `remote`: the remote version is installed here.
- `both`: this machine's version stays, and the remote one is installed as `<slug>-<device>` (numbered if taken) and
  enabled nowhere. Both are uploaded by the next `now`.

Every choice first takes a snapshot; `resolve` prints the command that restores it. A conflict also clears itself when
both sides become equal.

## Snapshots

A snapshot is a commit of this machine's export under `refs/agent-store/snapshots/<id>` in the local repository. It holds
no secrets and is never pushed. The last 30 are kept.

- **When one is taken:** before `now`, `pull`, `resolve` and `restore`. When nothing changed since the newest snapshot,
  that one is reused.
- `aas backup snapshots` lists them.
- **`aas backup restore <id>`:**
  1. snapshots the current state;
  2. makes this machine match the snapshot: installs, updates, removes and switches items, keeping this machine's secret
     values.

  The next `now` uploads the result.

## Disconnecting

`aas backup disconnect` forgets the connection on this device only. It deletes `~/.agent-store/backup/`: the local
repository, its snapshots and the stored token. The remote repository is left as it is, and connecting again finds the
backup.

Revoking a sign-in and deleting the remote are not done by Agent Store.

## Local files

```
~/.agent-store/backup/repo.git           bare repository (fetched backup, snapshots)
~/.agent-store/backup/connection.json    remote, branch, device
~/.agent-store/backup/credentials.json   HTTPS token, 0600
~/.agent-store/backup/state.json         last synced commit, pending conflicts, missing keys, failures
~/.agent-store/backup.lock               one backup operation at a time, across the CLI and the desktop client
```

## For the desktop client

The `Engine` methods are:

- `getBackupStatus`;
- `connectBackup`;
- `backupNow`, `pullBackup`;
- `resolveBackupConflict`;
- `listBackupSnapshots`, `restoreBackupSnapshot`;
- `listBackupHistory`;
- `disconnectBackup`.

The client passes RPC arguments over stdin (`aas __rpc <method> -`), so the token given to `connectBackup` never
reaches argv. Errors carry `code` (class name) and `reason`:

| `reason` | Cause |
| --- | --- |
| `not-connected` | this device is not connected |
| `already-connected` | this device is already connected |
| `foreign-repo` | the remote branch holds something that is not an Agent Store backup |
| `unsupported-schema` | the backup was written in a format this version does not read |
| `token-needs-https` | a token was given for a remote that is not HTTPS |
| `no-conflict` | there is no pending conflict for that item |
| `no-snapshot` | there is no snapshot with that id |
| `ambiguous` | the slug matches more than one conflict; name it as `<kind>/<slug>` |
| `secret-found` | the export holds a secret; nothing was written |
| `export-failed` | an item could not be exported |
| `apply-failed` | a remote change could not be applied |
| `git-missing` | `git` is not on the PATH |
| `busy` | another backup operation holds `~/.agent-store/backup.lock` |
| `auth-failed` | git: the remote refused the credentials or SSH key (`GitError`) |
| `host-key` | git: the SSH host key is not trusted yet (`GitError`) |
| `not-found` | git: no such repository, or no access to it (`GitError`) |
| `network` | git: the remote could not be reached (`GitError`) |

The four `GitError` reasons are read from git's and ssh's English messages; any other git failure has no reason.

### In the desktop client

Settings › Backup & sync (`apps/cli-gui/src/components/backup/`) covers connecting (new backup or restore from an
existing one), status, conflicts, missing keys, snapshots, history and disconnecting. Automatic sync runs in the client,
since the CLI has no resident process:

- after a change made through the client (install, enable, config, update, bulk actions…) has been quiet for about 2 minutes, it backs up;
- every 10 minutes it checks the remote: local changes are backed up, a remote ahead is pulled;
- it starts after the first sync the user runs, never before, and can be switched off;
- it waits while one of the client's own changes is still running, and queues every backup call so the client never races
  itself for the lock; when the CLI holds the lock it tries again on the next round;
- failures back off (up to 32 times the interval) and show in the status bar, without pop-ups.

## Not done

- **Automatic sync from the CLI**; only the desktop client syncs on its own.
- **First-launch choice** between starting fresh and restoring; the client's backup page has a restore entry instead.
- **GitHub sign-in** with an automatically created private repository.
- **Disconnecting further:** revoking authorization, deleting the remote.
- **Registered projects** in the backup.
