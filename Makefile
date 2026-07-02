# Makefile — Local development workflow for ai-agent-store
# Requires: supabase CLI, Docker, pnpm, Bun

.PHONY: setup seed dev dev-gui build-cli e2e stop status

## One-time setup: install CLI, init, start Supabase, seed data, create .env.local
setup:
	brew install supabase/tap/supabase
	supabase init
	supabase start
	$(MAKE) seed
	@echo ""
	@echo "Next: create apps/store/.env.local with credentials from 'make status'"
	@echo "Then: make dev"

## Re-apply migrations + seed (resets all local data)
seed:
	supabase db reset

## Start web store test environment: Supabase (if not running) + store on :3000.
## The store UI reads mock data (lib/mock/*), not live Supabase queries, so this
## is already isolated from any real backend beyond the local Docker Supabase.
dev:
	supabase start
	pnpm --filter=@aas/store dev

## Start GUI client test environment in isolated /tmp dirs — never touches your
## real ~/.claude, ~/.codex, or ~/.agents. Builds the sidecar, then launches
## the Tauri dev window against throwaway config directories.
dev-gui:
	@mkdir -p /tmp/aas-gui-dev /tmp/claude-gui-dev /tmp/codex-gui-dev
	AAS_HOME=/tmp/aas-gui-dev \
	CLAUDE_CONFIG_DIR=/tmp/claude-gui-dev \
	CODEX_CONFIG_DIR=/tmp/codex-gui-dev \
	pnpm --filter=@aas/cli-gui tauri:dev

## Compile CLI binary to bin/aas
build-cli:
	pnpm --filter=@aas/cli build:bin

## Run full E2E test in isolated /tmp dirs (builds CLI first)
e2e: build-cli
	@./scripts/local-e2e.sh

## Stop Supabase local stack
stop:
	supabase stop

## Print local Supabase credentials (URL, anon key, service_role key)
status:
	supabase status
