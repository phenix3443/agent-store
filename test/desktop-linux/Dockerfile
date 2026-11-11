# Linux build of the desktop client plus a virtual display, to exercise
# agent-store:// install links end to end without touching the host's config.
# Build context is the repo root:
#   docker build -f test/desktop-linux/Dockerfile -t as-desktop-linux .
#   docker run --rm --shm-size 1g -v "$PWD/test/desktop-linux/out:/out" as-desktop-linux
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev \
    build-essential curl file ca-certificates \
    xvfb xdotool imagemagick dbus-x11 xdg-utils desktop-file-utils fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
RUN npm install -g pnpm@11.5.0
ENV CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup PATH=/usr/local/cargo/bin:$PATH
# Same version as apps/cli-gui/src-tauri/rust-toolchain.toml. It must also be the
# default: build-sidecar.sh calls rustc from outside src-tauri.
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.85.0

WORKDIR /work
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm exec turbo build --filter=@as/client-core \
  && pnpm --filter @as/cli-gui build:sidecar \
  && pnpm --filter @as/cli-gui build
RUN cd apps/cli-gui && pnpm exec tauri build --no-bundle

# A disposable home: the client writes skills and MCP config under it.
RUN useradd -m -u 1001 tester && chmod -R a+rX /work
USER tester
ENV HOME=/home/tester
ENTRYPOINT ["bash", "/work/test/desktop-linux/run.sh"]
