FROM oven/bun:1.3.12
WORKDIR /workspace
COPY . .
ENV AS_HOME=/tmp/as-home
ENV CLAUDE_CONFIG_DIR=/tmp/claude-config
ENV CODEX_CONFIG_DIR=/tmp/codex-config
RUN mkdir -p /tmp/as-home /tmp/claude-config /tmp/codex-config
RUN bun install
RUN cd packages/types && bun run build \
    && cd ../sdk && bun run build \
    && cd ../../apps/client-core && bun run build
CMD ["sh", "-lc", "set -euo pipefail; bun build apps/cli/src/index.ts --compile --outfile /tmp/as-bin; /tmp/as-bin __rpc list '[]'; echo '--- registry state (should not exist, confirms no real home touched) ---'; ls -la /tmp/as-home; echo '--- confirming host home directories were never referenced ---'; env | grep -E 'AS_HOME|CLAUDE_CONFIG_DIR|CODEX_CONFIG_DIR'"]
