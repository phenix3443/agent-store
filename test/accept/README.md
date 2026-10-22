# Global Skills/MCP acceptance

`scripts/accept-global.ts` checks that Claude Code and Codex actually recognize
and use the global Skills and MCP servers Agent Store installs. The plan and the
meaning of each item are in [docs/global-skills-mcp.md](../../docs/global-skills-mcp.md) §6.

```sh
pnpm --filter=@as/types --filter=@as/sdk --filter=@as/client-core build
bun scripts/accept-global.ts                 # --isolated: temp homes, no credentials
bun scripts/accept-global.ts --only recognition,mcp-env
bun test scripts/accept-global               # the harness's own unit tests
```

Exit codes: `0` every required item passed, `1` any FAIL, `2` INCOMPLETE (a
required item was skipped, for example `--use` without credentials).

- `fixtures/probes-repo/` is served as a codeload-shaped tarball; its skill keeps
  its token in `references/token.md`, so finding it proves the whole directory
  was installed.
- `fixtures/as-probe-mcp.mjs` is a dependency-free stdio MCP server whose `probe`
  tool returns a token, the `PROBE_TOKEN` value, and its argv.
- `probes.ts` defines the probe packages; `../e2e/fixture-store.ts` serves them
  through the API's `mapItem`.

`--use` (U1–U4) needs model credentials: `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN` (+ `ANTHROPIC_BASE_URL`) for Claude, and an `auth.json`
under `$AS_ACCEPT_CODEX_AUTH_HOME`, `$CODEX_HOME` or `~/.codex` for Codex,
copied into the temp `CODEX_HOME` and deleted with it.

`--real` targets the invoking user's real directories. Follow §6.2 exactly:
`--real --preflight`, then `--real --backup --root <new dir>`, then
`--real [--use] --root <same dir>` (restores automatically), and
`--real --restore --root <same dir>` if anything was interrupted.
