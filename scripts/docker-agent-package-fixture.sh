#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="agent-store-agent-package-fixture"

if [[ -z "${YLS_ME_API_KEY:-}" ]] && [[ -f "$HOME/.code-switch/codex.json" ]] && command -v jq >/dev/null 2>&1; then
  YLS_ME_API_KEY="$(jq -r '.providers[] | select(.enabled == true and .apiUrl == "https://code.ylsagi.com/codex") | .apiKey' "$HOME/.code-switch/codex.json" | head -n 1)"
fi

if [[ -z "${YLS_ME_BASE_URL:-}" ]] && [[ -f "$HOME/.code-switch/codex.json" ]] && command -v jq >/dev/null 2>&1; then
  YLS_ME_BASE_URL="$(jq -r '.providers[] | select(.enabled == true and .apiUrl == "https://code.ylsagi.com/codex") | .apiUrl' "$HOME/.code-switch/codex.json" | head -n 1)"
fi

bash "$ROOT_DIR/scripts/download-codex-linux.sh"

docker build \
  --pull=false \
  -f "$ROOT_DIR/docker/agent-package-fixture.Dockerfile" \
  -t "$IMAGE_NAME" \
  "$ROOT_DIR"

docker run --rm \
  -e YLS_ME_API_KEY="${YLS_ME_API_KEY:-test-yls-key}" \
  -e YLS_ME_BASE_URL="${YLS_ME_BASE_URL:-https://code.ylsagi.com/codex}" \
  "$IMAGE_NAME"
