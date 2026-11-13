#!/usr/bin/env bash
# Builds the Linux AppImage with the aas sidecar byte-identical to the build output.
# Run after `tauri build` (or `tauri build --no-bundle`); extra args go to `tauri bundle`.
#
# Tauri's AppImage bundler runs linuxdeploy, which patchelfs every ELF in usr/bin.
# aas is a bun-compiled binary with its script appended to the ELF; patchelf breaks it
# silently, and linuxdeploy's gtk plugin then fails on it. Tauri has no option to keep
# a file away from linuxdeploy, so linuxdeploy gets a placeholder in place of aas, and
# the AppDir it leaves behind is packed again with the real aas.
set -euo pipefail

GUI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
SIDECAR="$GUI_DIR/src-tauri/binaries/aas-$TRIPLE"
BUNDLE_DIR="$GUI_DIR/src-tauri/target/release/bundle/appimage"
TOOLS_DIR="${APPIMAGE_TOOLS_DIR:-$GUI_DIR/src-tauri/target/appimage-tools}"

case "$TRIPLE" in
  x86_64-unknown-linux-gnu) ARCH=x86_64 ;;
  *) echo "bundle-appimage.sh: no pinned AppImage tools for $TRIPLE" >&2; exit 1 ;;
esac

APPIMAGETOOL_URL=https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage
APPIMAGETOOL_SHA256=ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0
# appimagetool otherwise downloads the runtime from the type2-runtime "continuous" release.
RUNTIME_URL=https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64
RUNTIME_SHA256=2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d

fetch() {
  local url=$1 sha=$2 out=$3
  if [[ -f "$out" ]] && echo "$sha  $out" | sha256sum -c --status -; then return; fi
  curl -fsSL --retry 3 -o "$out.part" "$url"
  echo "$sha  $out.part" | sha256sum -c --quiet -
  chmod +x "$out.part"
  mv "$out.part" "$out"
}

[[ -f "$SIDECAR" ]] || { echo "bundle-appimage.sh: $SIDECAR missing; run build:sidecar first" >&2; exit 1; }

mkdir -p "$TOOLS_DIR"
fetch "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$TOOLS_DIR/appimagetool-$ARCH.AppImage"
fetch "$RUNTIME_URL" "$RUNTIME_SHA256" "$TOOLS_DIR/runtime-$ARCH"

WORK="$(mktemp -d)"
cp -p "$SIDECAR" "$WORK/aas"
restore() { cp -p "$WORK/aas" "$SIDECAR"; rm -rf "$WORK"; }
trap restore EXIT
cp /usr/bin/true "$SIDECAR"
(cd "$GUI_DIR" && pnpm exec tauri bundle --bundles appimage "$@")
cp -p "$WORK/aas" "$SIDECAR"

shopt -s nullglob
appdirs=("$BUNDLE_DIR"/*.AppDir)
images=("$BUNDLE_DIR"/*.AppImage)
[[ ${#appdirs[@]} -eq 1 && ${#images[@]} -eq 1 ]] || { echo "bundle-appimage.sh: expected one AppDir and one AppImage in $BUNDLE_DIR" >&2; exit 1; }
APPDIR=${appdirs[0]}
IMAGE=${images[0]}

install -m 755 "$WORK/aas" "$APPDIR/usr/bin/aas"
rm -f "$IMAGE"
# No FUSE in containers and on some CI runners.
ARCH=$ARCH APPIMAGE_EXTRACT_AND_RUN=1 "$TOOLS_DIR/appimagetool-$ARCH.AppImage" \
  --no-appstream --runtime-file "$TOOLS_DIR/runtime-$ARCH" "$APPDIR" "$IMAGE"
