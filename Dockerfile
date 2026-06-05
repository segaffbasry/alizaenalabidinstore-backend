# syntax=docker/dockerfile:1
# Production image for Medusa v2 (server + worker share this image).
# Multi-stage: builds the server AND the admin (Vite) inside Docker.
# This is safe now — the Oracle A1 box has 24GB RAM, unlike Railway's
# free-tier build budget that OOM'd on `medusa build`.
# Multi-arch: node:22-slim has official linux/arm64 images.

########## Stage 1: build ##########
FROM node:22-slim AS builder

# Native-module toolchain (some transitive deps compile on arm64)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps (devDeps needed for `medusa build` / Vite admin build)
COPY package.json package-lock.json ./
RUN npm ci

# The admin SPA bakes the backend URL in at BUILD time (medusa-config admin.backendUrl).
# Coolify must pass this as a build variable. Default keeps local builds working.
ARG MEDUSA_BACKEND_URL=http://localhost:9000
ENV MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL}

COPY . .
RUN npm run build

# Install runtime-only deps for the built server output
WORKDIR /app/.medusa/server
RUN npm ci --omit=dev && npm cache clean --force

########## Stage 2: runtime ##########
FROM node:22-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# Only the built server (compiled config + src, admin in public/admin, prod node_modules)
COPY --from=builder --chown=node:node /app/.medusa/server ./

# Writable dir for the file-local provider (mounted as a volume in compose)
RUN mkdir -p /app/static && chown node:node /app/static

USER node
EXPOSE 9000

# Default = server entrypoint: migrate then start.
# The worker service overrides this with `npx medusa start` (no migrations)
# so server and worker never race migrations.
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
