# syntax=docker/dockerfile:1
# Annamour — one container: the sync server also serves the built PWA.

FROM node:26-alpine AS base
RUN npm install -g pnpm@10.34.9
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/protocol/package.json packages/protocol/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @annamour/web build
# Keep only what the server needs at runtime.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --prod --frozen-lockfile --filter "@annamour/server..."

FROM node:26-alpine AS run
ENV NODE_ENV=production \
    PORT=8787 \
    WEB_DIST=/app/apps/web/dist \
    DATA_DIR=/app/data
WORKDIR /app
# Sessions and accounts live in SQLite on this volume (mount it in Coolify).
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/server
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
