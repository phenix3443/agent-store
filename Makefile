# Makefile — Local development workflow for agent-store
# Requires: pnpm, Bun, Node 22
#
# The API and the store share one SQLite file, app.db. `make db` creates it and
# applies the migrations; `make db-reset` deletes it.

.PHONY: setup db db-reset dev-env dev-api dev-store dev-client build-cli e2e-docker-build e2e-docker status

# Absolute, because the API and the store each run from their own directory.
DEV_APP_DB_PATH ?= $(CURDIR)/.dev/app.db

# Dev-server ports. `make dev-env` picks the first free ports at/above these
# (see scripts/dev-ports.sh) and passes them to the sub-targets, so a stale
# previous run doesn't cause EADDRINUSE. Standalone sub-targets use these defaults.
API_PORT ?= 3001
STORE_PORT ?= 3000

## One-time setup: create apps/store/.env.local and the database
setup: db
	@test -f apps/store/.env.local || cp apps/store/.env.local.example apps/store/.env.local
	@echo ""
	@echo "Next: fill apps/store/.env.local (Better Auth secret, GitHub OAuth app), then: make dev-env"

## Create app.db if needed and apply migrations
db:
	cd apps/api && APP_DB_PATH="$(DEV_APP_DB_PATH)" bun src/migrate.ts

## Delete the local database (everything, including sign-ins) and recreate it
db-reset:
	rm -f "$(DEV_APP_DB_PATH)" "$(DEV_APP_DB_PATH)-wal" "$(DEV_APP_DB_PATH)-shm"
	$(MAKE) --no-print-directory db

## Start ALL THREE components locally for full integration testing — catalog
## API, web store, and the Tauri desktop client — run in parallel as the three
## sub-targets below. Ports are chosen dynamically (first free at/above 3001 for
## the API, 3000 for the store) and passed to all three so a stale previous run
## doesn't collide. Ctrl-C tears all three down.
dev-env: db
	@ports=$$(scripts/dev-ports.sh); echo "▸ dev-env $$ports"; \
	$(MAKE) --no-print-directory -j3 dev-api dev-store dev-client $$ports

## Catalog API server (apps/api). Verifies sign-in tokens against the local
## store's Better Auth JWKS. Both the web store and the CLI consume this API.
dev-api:
	APP_DB_PATH="$(DEV_APP_DB_PATH)" \
	AUTH_JWKS_URL=http://localhost:$(STORE_PORT)/api/auth/jwks \
	AUTH_ISSUER=http://localhost:$(STORE_PORT) \
	PORT=$(API_PORT) pnpm --filter=@as/api start

## Web store (apps/store), which also hosts Better Auth. Reads the catalog from
## the local API via API_URL; Better Auth uses the same app.db.
dev-store:
	set -a; . apps/store/.env.local; set +a; \
	APP_DB_PATH="$(DEV_APP_DB_PATH)" BETTER_AUTH_URL=http://localhost:$(STORE_PORT) \
	PORT=$(STORE_PORT) API_URL=http://127.0.0.1:$(API_PORT) NEXT_PUBLIC_API_URL=http://127.0.0.1:$(API_PORT) \
	pnpm --filter=@as/store dev

## Desktop client for local dev, in isolated /tmp dirs — never touches your real
## ~/.claude, ~/.codex, or ~/.agents. Built and run as a packaged debug .app with a
## dev-only identity (com.aas.cli-gui.dev + agent-store-dev://) so macOS routes
## agent-store-dev:// links to the running window — `tauri dev`'s unbundled binary does
## not receive them. Reads the catalog from the local API (AS_STORE_URL) and signs in
## against the LOCAL store's /api/auth/* (AS_AUTH_URL), so sign-in stays local.
## Trade-off: no frontend hot-reload — re-run `make dev-env` to pick up UI changes.
## Building block of `make dev-env`. (See apps/cli-gui/scripts/dev-app.sh.)
dev-client:
	@mkdir -p /tmp/as-gui-dev /tmp/claude-gui-dev /tmp/codex-gui-dev
	AS_HOME=/tmp/as-gui-dev \
	AS_STORE_URL=http://127.0.0.1:$(API_PORT) \
	AS_AUTH_URL=http://localhost:$(STORE_PORT) \
	VITE_STORE_URL=http://localhost:$(STORE_PORT) \
	CLAUDE_CONFIG_DIR=/tmp/claude-gui-dev \
	CODEX_CONFIG_DIR=/tmp/codex-gui-dev \
	bash apps/cli-gui/scripts/dev-app.sh

## Compile CLI binary to bin/as
build-cli:
	pnpm --filter=@as/cli build:bin

## Build the real-agent e2e image (claude + codex CLIs, the `as` CLI, fixtures).
## Builds the @as/* libs on the host first — their dist/ is copied into the image.
e2e-docker-build:
	pnpm --filter='@as/client-core...' run build
	docker build -f test/e2e/Dockerfile -t agent-store-e2e .

## Run the real-agent e2e: installs packages, then drives claude & codex against them.
## Needs provider keys in test/provider/*.txt (mounted read-only, never baked into the image).
e2e-docker: e2e-docker-build
	docker run --rm -v "$(PWD)/test/provider:/secrets:ro" agent-store-e2e

## Show where the local app.db is
status:
	@echo "$(DEV_APP_DB_PATH)"
