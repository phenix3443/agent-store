#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GUI_DIR="$ROOT_DIR/apps/cli-gui"
HOST_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"

if [[ -z "$HOST_TRIPLE" ]]; then
  echo "Could not determine host target triple from rustc -vV" >&2
  exit 1
fi

# Build the sidecar for each Rust target triple in SIDECAR_TARGETS (space-separated).
# Defaults to the host triple only — set it to build a macOS universal binary in CI,
# e.g. SIDECAR_TARGETS="aarch64-apple-darwin x86_64-apple-darwin".
TARGETS="${SIDECAR_TARGETS:-$HOST_TRIPLE}"
# `aas --version` reports the version of the app it ships in.
APP_VERSION="$(cd "$GUI_DIR" && bun -e "console.log(require('./src-tauri/tauri.conf.json').version)")"

# Map a Rust target triple to bun's --compile --target value for cross-compilation.
bun_target_for() {
  case "$1" in
    aarch64-apple-darwin) echo "bun-darwin-arm64" ;;
    x86_64-apple-darwin) echo "bun-darwin-x64" ;;
    x86_64-pc-windows-msvc) echo "bun-windows-x64" ;;
    aarch64-unknown-linux-gnu) echo "bun-linux-arm64" ;;
    x86_64-unknown-linux-gnu) echo "bun-linux-x64" ;;
    *) echo "" ;;
  esac
}

mkdir -p "$GUI_DIR/src-tauri/binaries"

for TRIPLE in $TARGETS; do
  # Not "as": Linux packages install sidecars to /usr/bin, where binutils already owns as.
  OUT="$GUI_DIR/src-tauri/binaries/aas-$TRIPLE"

  if [[ "$TRIPLE" == "$HOST_TRIPLE" ]]; then
    # Native compile for the host (unchanged behavior for local dev and same-arch CI).
    bun build "$ROOT_DIR/apps/cli/src/index.ts" --compile --define "AS_VERSION=\"$APP_VERSION\"" --outfile "$OUT"
  else
    BUN_TARGET="$(bun_target_for "$TRIPLE")"
    if [[ -z "$BUN_TARGET" ]]; then
      echo "No bun --compile target mapping for $TRIPLE" >&2
      exit 1
    fi
    bun build "$ROOT_DIR/apps/cli/src/index.ts" --compile --target="$BUN_TARGET" --define "AS_VERSION=\"$APP_VERSION\"" --outfile "$OUT"
  fi

  if [[ "$(uname)" == "Darwin" ]]; then
    # bun --compile emits a Mach-O with a malformed ad-hoc signature on some
    # bun/macOS combinations, which the kernel refuses to execute (SIGKILL).
    # Re-signing ad-hoc fixes this without requiring a real signing identity.
    codesign --remove-signature "$OUT" 2>/dev/null || true
    codesign --force -s - "$OUT"
  fi

  echo "Built sidecar: src-tauri/binaries/aas-$TRIPLE"
done

# For a macOS universal bundle, Tauri expects a single fat sidecar named
# as-universal-apple-darwin. Combine the two arch slices with lipo when present.
ARM_SLICE="$GUI_DIR/src-tauri/binaries/aas-aarch64-apple-darwin"
X64_SLICE="$GUI_DIR/src-tauri/binaries/aas-x86_64-apple-darwin"
UNIVERSAL="$GUI_DIR/src-tauri/binaries/aas-universal-apple-darwin"
if [[ -f "$ARM_SLICE" && -f "$X64_SLICE" ]]; then
  lipo -create -output "$UNIVERSAL" "$ARM_SLICE" "$X64_SLICE"
  codesign --remove-signature "$UNIVERSAL" 2>/dev/null || true
  codesign --force -s - "$UNIVERSAL"
  echo "Built sidecar: src-tauri/binaries/aas-universal-apple-darwin (lipo)"
fi
