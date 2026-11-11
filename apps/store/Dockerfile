# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/store/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @as/store...
RUN pnpm --filter @as/types run build && pnpm --filter @as/sdk run build
# NEXT_PUBLIC_* are inlined into the browser bundle at build time, so each
# environment needs its own image.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @as/store run build

FROM node:22-alpine
WORKDIR /app
# `::` accepts IPv4 and IPv6; the k3s cluster is IPv6-only.
ENV NODE_ENV=production HOSTNAME=:: PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node /repo/apps/store/.next/standalone ./
COPY --from=build --chown=node /repo/apps/store/.next/static ./apps/store/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/store/server.js"]
