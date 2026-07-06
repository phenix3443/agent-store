FROM oven/bun:1.3.12

WORKDIR /workspace

COPY . .
COPY docker/assets/codex-linux-musl.tar.gz /tmp/codex.tgz

RUN set -eux; \
  mkdir -p /tmp/codex-dist; \
  tar -xzf /tmp/codex.tgz -C /tmp/codex-dist; \
  install "$(find /tmp/codex-dist -maxdepth 1 -type f -name 'codex-*-unknown-linux-musl' | head -n 1)" /usr/local/bin/codex; \
  codex --version

ENV AS_HOME=/root/.aas
ENV CLAUDE_CONFIG_DIR=/root/.claude
ENV CODEX_CONFIG_DIR=/root/.codex
ENV CODEX_HOME=/root/.codex
ENV CODEX_RELAY_BASE_URL=http://127.0.0.1:18100
ENV AGENT_PACKAGE_CODEX_RELAY_PORT=18100
ENV AGENT_PACKAGE_FIXTURE_ALLOW_HOME_DIRS=1

CMD ["sh", "-lc", "set -euo pipefail; bun scripts/run-agent-package-fixture.ts examples/packages/provider-yls-me examples/packages/skill-frontend-design; bun scripts/agent-package-codex-relay.ts >/tmp/agent-package-relay.log 2>&1 & relay_pid=$!; trap 'kill $relay_pid' EXIT; for i in 1 2 3 4 5; do if bun -e 'const r = await fetch(\"http://127.0.0.1:18100/health\"); process.exit(r.ok ? 0 : 1)' >/dev/null 2>&1; then break; fi; sleep 1; done; echo '--- CODEX VERSION ---'; codex --version; echo '--- CODEX PROMPT INPUT ---'; codex debug prompt-input 'Use frontend-design skill to critique this landing page.' > /tmp/prompt-input.json; grep -n 'frontend-design' /tmp/prompt-input.json; echo '--- CODEX EXEC ---'; codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --color never -C /workspace 'Reply with exactly OK.'; echo '--- CODEX DOCTOR ---'; codex doctor --summary --ascii || true; echo '--- CODEX CONFIG ---'; cat /root/.codex/config.toml; echo '--- CODEX AUTH ---'; cat /root/.codex/auth.json; echo '--- CLAUDE SETTINGS ---'; cat /root/.claude/settings.json; echo '--- RELAY LOG ---'; sed -n '1,80p' /tmp/agent-package-relay.log; echo '--- CODEX SKILL ---'; sed -n '1,20p' /root/.codex/skills/local.frontend-design-skill#frontend-design.md; echo '--- CLAUDE SKILL ---'; sed -n '1,20p' /root/.claude/skills/local.frontend-design-skill#frontend-design.md"]
