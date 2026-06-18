# Makefile — Local development workflow for ai-agent-store
# Requires: supabase CLI, Docker, pnpm, Bun

.PHONY: setup seed dev build-cli e2e stop status

## One-time setup: install CLI, init, start Supabase, seed data, create .env.local
setup:
	brew install supabase/tap/supabase
	supabase init
	supabase start
	$(MAKE) seed
	@echo ""
	@echo "Next: create apps/market/.env.local with credentials from 'make status'"
	@echo "Then: make dev"

## Re-apply migrations + seed (resets all local data)
seed:
	supabase db reset

## Start local dev: Supabase (if not running) + market on :3000
dev:
	supabase start
	pnpm --filter=@aas/market dev

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
