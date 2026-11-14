# Real-agent e2e harness

Proves, in an isolated Docker container, that a package installed through Agent
Store is actually **discovered and used** by the real agents — Claude Code and
Codex — not just written to disk.

## What it does

1. A [fixture server](./fixture-server.ts) serves two deterministic packages via
   the real store API shape:
   - `e2e-probe-skill` — a skill whose body tells the agent to reply `E2E_SKILL_OK`.
   - `e2e-probe-mcp` — a stdio MCP exposing an `e2e_probe` tool that returns `E2E_MCP_OK`.
2. [`verify.ts`](./verify.ts) installs both through the actual `as` CLI (which
   auto-enables them for `claude` and `codex`), configures each agent's provider
   from the mounted keys, then runs:
   - `claude --print …` and `codex exec …` with prompts that force the skill / MCP,
   - asserting the fixed probe tokens appear in the output.

3. Project level (#166): installs the skill and `e2e-probe-keyed-mcp` (a stdio MCP
   that refuses to start without `E2E_PROBE_KEY` and returns `E2E_KEYED_<key>`)
   into a fresh git repo with `aas install --project`, stores the key with
   `aas projects set-env`, checks the committed files hold no key and nothing was
   written at user level, then runs both agents through `aas projects exec` and
   expects the skill token and the keyed token. `claude mcp list` through
   `aas projects exec` is a model-free check that the key reached the server.

Because the tokens are fixed, the assertions are deterministic even though the
runs make real (cheap, haiku) LLM calls.

## Provider keys

Put one config per line-based `.txt` file in `test/provider/` (git-ignored):

```
base-url: https://…
api-key:  …
model:    claude-haiku-4-5-20251001
```

Name them `claude.txt` and `codex.txt`. `claude.txt` is an Anthropic-style
endpoint with a claude model (e.g. `claude-haiku-4-5-20251001`); `codex.txt` is an
endpoint serving the OpenAI Responses API with a `gpt-*` model (e.g.
`gpt-5.6-terra`). Codex appends `/responses` to the base-url, so for an
OpenAI-compatible relay it ends in `/v1`; without it Codex only prints
`Reconnecting... 5/5`. Both may point at the same relay. Without those names, the file
whose `base-url` contains `codex` is used for Codex. Keys are mounted read-only at
runtime and are never copied into the image.

## Run locally (Docker)

```bash
make e2e-docker          # build the image + run the full matrix
# or step by step:
make e2e-docker-build
docker run --rm -v "$(pwd)/test/provider:/secrets:ro" agent-store-e2e
```

Exit code is non-zero if any check fails (`claude:skill`, `claude:mcp`,
`codex:skill`, `codex:mcp`, and the `project:*` checks).

## Run in CI (GitHub Actions)

`.github/workflows/e2e.yml` runs the same `verify.ts` directly on the runner (no
Docker — the runner is already isolated). It needs two repo secrets holding the
3-line provider configs:

- `E2E_PROVIDER_CLAUDE` — Anthropic-style endpoint + a claude model
- `E2E_PROVIDER_CODEX` — a Responses API endpoint + a `gpt-*` model

Set them from the files with `gh secret set E2E_PROVIDER_CLAUDE < test/provider/claude.txt`
(and likewise for codex). When a relay key is rotated, update these secrets too:
a stale key shows up as `401` in the failing check's output.

A failing check prints the exit code, whether it timed out, and the end of the
agent's output.
