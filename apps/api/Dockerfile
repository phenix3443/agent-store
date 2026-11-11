# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @as/api...
RUN pnpm --filter @as/types run build
# A self-contained copy of the API with production deps and the built workspace
# packages it imports (@as/types).
RUN pnpm --filter @as/api deploy --legacy --prod /out

FROM oven/bun:1.3.14-alpine
WORKDIR /app
COPY --from=build --chown=bun /out ./
COPY --from=build --chown=bun /repo/db/seed.sql ./seed.sql
ENV HOST=:: PORT=3001 SEED_FILE=/app/seed.sql
USER bun
EXPOSE 3001
CMD ["bun", "src/index.ts"]
