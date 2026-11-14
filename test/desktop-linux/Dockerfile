# Linux .deb, .rpm and AppImage of the desktop client plus a virtual display, to exercise
# agent-store:// install links end to end without touching the host's config.
# Build context is the repo root:
#   docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
#   docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
# Same base as the release job (ubuntu-22.04), so the bundles tested here are the ones shipped.
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev \
    build-essential curl file ca-certificates \
    xvfb xdotool imagemagick dbus-x11 xdg-utils desktop-file-utils libglib2.0-bin fonts-noto-cjk sudo unzip rpm2cpio cpio rpm git \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
RUN npm install -g pnpm@11.5.0
ENV CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup PATH=/usr/local/cargo/bin:$PATH
# Same version as apps/cli-gui/src-tauri/rust-toolchain.toml. It must also be the
# default: build-sidecar.sh calls rustc from outside src-tauri.
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.85.0
# shots.sh: a stand-in file manager on D-Bus for 在文件管理器中显示, and the Claude Code CLI that
# `enable --replace` needs to try the restore first. Kept off PATH; one step points AS_CLAUDE_BIN at it.
RUN apt-get update && apt-get install -y --no-install-recommends python3-dbus python3-gi \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g --prefix /opt/claude-cli @anthropic-ai/claude-code@2.1.311 \
  && chmod -R a+rX /opt/claude-cli

WORKDIR /work
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm exec turbo build --filter=@as/client-core \
  && pnpm --filter @as/cli-gui build:sidecar \
  && pnpm --filter @as/cli-gui build
RUN cd apps/cli-gui && pnpm exec tauri build --no-bundle
RUN cd apps/cli-gui && pnpm exec tauri bundle --bundles deb,rpm \
  && mkdir /bundles && cp src-tauri/target/release/bundle/deb/*.deb src-tauri/target/release/bundle/rpm/*.rpm /bundles/ \
  && chmod a+rx /bundles/*
RUN cd apps/cli-gui && pnpm bundle:appimage \
  && cp src-tauri/target/release/bundle/appimage/*.AppImage /bundles/ \
  && chmod a+rx /bundles/*

# A disposable home: the client writes skills and MCP config under it.
# The deb is installed at run time by run.sh; appimage.sh runs the AppImage.
RUN useradd -m -u 1001 tester && chmod -R a+rX /work \
  && echo 'tester ALL=(root) NOPASSWD: /usr/bin/dpkg, /work/test/desktop-linux/wrap-sidecar.sh' > /etc/sudoers.d/tester
USER tester
ENV HOME=/home/tester
ENTRYPOINT ["bash", "/work/test/desktop-linux/run.sh"]
