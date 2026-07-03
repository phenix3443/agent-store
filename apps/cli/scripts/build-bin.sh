#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUTFILE="$ROOT_DIR/bin/aas"

bun build "$ROOT_DIR/apps/cli/src/index.ts" --compile --outfile "$OUTFILE"

if [[ "$(uname)" == "Darwin" ]]; then
  # bun --compile emits a Mach-O with a malformed ad-hoc signature on some
  # bun/macOS combinations, which the kernel refuses to execute (SIGKILL).
  # Re-signing ad-hoc fixes this without requiring a real signing identity.
  codesign --remove-signature "$OUTFILE"
  codesign --force -s - "$OUTFILE"
fi

echo "Built: bin/aas"
