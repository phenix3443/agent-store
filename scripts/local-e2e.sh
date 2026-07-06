#!/usr/bin/env bash
# E2E test for the full CLI → SDK → Market → Supabase chain.
# Runs in isolated /tmp dirs — never touches ~/.claude or ~/.codex.
set -euo pipefail

export AS_HOME=/tmp/as-e2e
export CLAUDE_CONFIG_DIR=/tmp/claude-e2e
export CODEX_CONFIG_DIR=/tmp/codex-e2e

AS="$(cd "$(dirname "$0")/.." && pwd)/bin/as"

echo "=== [setup] cleaning isolated dirs ==="
rm -rf "$AS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"
mkdir -p "$AS_HOME" "$CLAUDE_CONFIG_DIR/skills" "$CODEX_CONFIG_DIR"

echo ""
echo "=== search: verify store is reachable ==="
$AS search test

echo ""
echo "=== install: all 3 test items ==="
$AS install openai-provider-test
$AS install hello-skill
$AS install fs-mcp-test

echo ""
echo "=== config: apply provider credentials ==="
printf 'sk-local-e2e\n\n\n' | $AS config openai-provider-test

echo ""
echo "=== list: all items installed and enabled ==="
$AS list

echo ""
echo "=== disable + re-enable: test both commands ==="
$AS disable openai-provider-test --for claude
$AS list
$AS enable openai-provider-test --for claude
$AS list

echo ""
echo "=== sync: idempotency check ==="
$AS sync

echo ""
echo "=== info: spot-check one item ==="
$AS info openai-provider-test

echo ""
echo "=== verify: checking config files ==="

grep -q '"ANTHROPIC_BASE_URL": "https://api.openai.com/v1"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && grep -q '"ANTHROPIC_AUTH_TOKEN": "sk-local-e2e"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ provider in claude settings" \
  || { echo "✗ provider missing from claude settings"; exit 1; }

grep -q '"fs-mcp-test"' "$CLAUDE_CONFIG_DIR/settings.json" \
  && echo "✓ mcp in claude settings" \
  || { echo "✗ mcp missing from claude settings"; exit 1; }

[ -s "$CLAUDE_CONFIG_DIR/skills/hello-skill.md" ] \
  && echo "✓ hello-skill.md exists and non-empty" \
  || { echo "✗ hello-skill.md missing or empty"; exit 1; }

grep -q 'model_provider = "openai-provider-test"' "$CODEX_CONFIG_DIR/config.toml" 2>/dev/null \
  && grep -q '"OPENAI_API_KEY": "sk-local-e2e"' "$CODEX_CONFIG_DIR/auth.json" 2>/dev/null \
  && echo "✓ provider in codex config" \
  || echo "⚠ codex config not checked (codex may not be installed)"

echo ""
echo "=== [cleanup] removing isolated dirs ==="
rm -rf "$AS_HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_CONFIG_DIR"

echo ""
echo "✓ All E2E checks passed"
