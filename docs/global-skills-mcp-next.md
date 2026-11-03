# Global Skills and MCP: next step after phase one

Decision for [#50](https://github.com/phenix3443/agent-store/issues/50). Code read at main
`6642394b9a55649257b1b3986dc903a433cdcdfc` (includes #42–#49). Plan: [`docs/global-skills-mcp.md`](global-skills-mcp.md),
revision 4 ([`231c73d`](https://github.com/phenix3443/agent-store/blob/231c73d2808b613b09ae33420b9f6d18a30e7772/docs/global-skills-mcp.md)).

**Decision: leave the code as delivered.** No refactor or feature PR follows from this document. The remaining
open items are deployment, data and credential problems; none of them is fixed by changing client code.

## 1. What phase one actually delivered

Four separate things, each with its own evidence:

| | Status | Evidence |
| --- | --- | --- |
| Code delivery | PR1–PR8 merged (#42–#49); #41 closed | `git log` at `6642394` |
| Recognition | Both tools see what Agent Store installs | U1–U4 real-environment run: [#41 comment 6436248523](https://github.com/phenix3443/agent-store/issues/41#issuecomment-6436248523) (65/0/0) |
| Actual use | Both tools used `context7` and the multi-file `skills-algorithmic-art`, read `templates/` from the installed directory | Same run, plus the run through the live test API with no overlay: [#41 comment 6446749741](https://github.com/phenix3443/agent-store/issues/41#issuecomment-6446749741) |
| Cleanup | Uninstall left `~/.agents/skills/` and `~/.claude/skills/` empty; `--restore` put user entries back; `as doctor` clean | Both comments above |

Both runs happened in a container with its own home, not on a live user config. The live-API run used an
egress proxy because of a GitHub anonymous rate limit; catalog data and skill content were untouched.

## 2. Shared code today

PR8 (#49) already extracted what was duplicated. At `6642394`:

- `apps/client-core/src/config/safe-file.ts`: parse-or-abort (`ConfigParseError`, `readJsonObject`), `atomicWriteFile`,
  `backupFile`. Used by `claude-mcp.ts`, `codex-mcp.ts`, `claude.ts`, `codex.ts` and `mcp-targets.ts`.
- `apps/client-core/src/config/mcp-ownership.ts`: the §5.5 rules once (`targets.json` claims, `--replace` takeover,
  put-back on a failed swap, restore on disable, sync). Each tool plugs in through `McpEntryStore`.
- `apps/client-core/src/config/mcp-compare.ts`, `mcp-targets.ts`, `mcp-errors.ts`, `cli-runner.ts`: comparison rule,
  claims file, error types, CLI invocation.
- `apps/client-core/src/skills/store.ts`: the skill store (`installSkillContent`, `removeSkillContent`, marker,
  `contentHash`, `isLoneSkillMd`). `migrate.ts` and `doctor.ts` import from it.

## 3. What stays per tool, and why

| | Claude Code | Codex |
| --- | --- | --- |
| MCP file | `.claude.json` (JSON), `claude-mcp.ts` | `config.toml` (TOML text edit keeps outside comments), `codex-mcp.ts` |
| MCP CLI | `claude mcp add-json/remove --scope user` | `codex mcp add/remove` argv; only `command/args/env/url/bearer_token_env_var` are restorable, so a key check runs before the trial |
| Skill visibility | Symlink `skills/<slug>` → store, `skills/claude-link.ts` | Reads `~/.agents/skills` natively; no link |
| Skill identity | `<slug>` | frontmatter `name`; `doctor` warns when another Codex-visible skill has the same name |
| Disable | Per tool (remove link) | No per-tool disable in phase one (§5.4) |

These differ in file format, CLI contract and discovery model. #49 already looked at merging file access and the
trial round-trip and kept them apart because a shared helper "would only move parameters around". I agree after
reading both files: the per-tool code is the part that knows each tool, which is the point of the per-tool design.

## 4. Candidate checked and rejected

One small duplication is left: the directory swap with rollback (stage → rename current aside → rename stage in →
put back on failure) appears in `skills/store.ts:238-250` (install) and `migrate.ts:67-79` (legacy conversion).
They are about 12 lines each and differ in one detail: if the put-back itself fails, `migrate.ts` keeps the scratch
directory and names the original's location in the error, while `store.ts` throws the put-back error and the
original stays at `<stage>.old` in the store without being named.

Not worth a PR now:

- No data is lost in either path; only the error text differs, and only after two renames on the same filesystem
  have failed in a row. Nothing in the acceptance runs or issues shows this happening.
- A shared helper would touch install and migrate together for ~10 lines saved, and both paths would need their
  failure tests re-run.

Revisit if a third copy appears, or if a user reports a failed install whose original they could not find.

## 5. Q5 (runtime names)

Claude lists the skill as `skills-algorithmic-art` (directory), Codex as `algorithmic-art` (frontmatter). In the
live-API run both tools still loaded the skill and read its `templates/` in the usage step, and `doctor` checks each
tool's own name. No issue or acceptance step shows the mismatch causing a failure. Keep the slug directory and the
tools' own naming conventions, as §9 Q5 recommends. Revisit with real user reports, not before.

## 6. Open items that are not code changes

Recorded as unresolved. This document does not fix or claim to fix any of them.

- **Provider e2e 401.** The `e2e` workflow fails at `claude:mcp` with `API Error: 401 Invalid token`
  ([run 40463005741](https://github.com/phenix3443/agent-store/actions/runs/40463005741), main `6642394`). This is the
  `E2E_PROVIDER_*` credential, not the global Skills/MCP code; the credential-free `accept` workflow passes on the
  same SHA ([run 40463005761](https://github.com/phenix3443/agent-store/actions/runs/40463005761)).
- **Skipped test deployments.** `deploy-api` and `deploy-store` on `workflow_run` only deploy after a successful
  e2e, so they were skipped for `6233499` and `6642394`
  ([40465005042](https://github.com/phenix3443/agent-store/actions/runs/40465005042),
  [40465004876](https://github.com/phenix3443/agent-store/actions/runs/40465004876)). The test API was deployed by a
  manual dispatch ([40533943545](https://github.com/phenix3443/agent-store/actions/runs/40533943545)); the store was not.
- **Production catalog.** On 2026-11-03, `GET https://as-api.phenix3443.workers.dev/api/items/skills-algorithmic-art`
  returns `compatibleWith: ["claude"]` and no `source` (`updatedAt` 2026-07-13). The test API returns
  `["claude","codex"]` with `source`. Production users therefore still get single-file installs and Codex refusals
  until the API and registry data are deployed to production. That needs the owner's production deployment
  decision, not a client change.

Fixing the 401 means a working provider credential, and the production catalog needs a production deployment.
Both are outside this issue's authorization. If either is wanted, open a separate issue for it.

## 7. What stays protected

Nothing changes in code, so all phase-one protections stay as delivered: unmarked directories and user MCP entries
are never touched, malformed configs abort the write, writes are atomic with backups, `--replace` is refused unless
the trial round-trip passes, and each tool keeps its own lifecycle (§5.4, §5.5). Merging this document does not
authorize any implementation.
