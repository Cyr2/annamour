# syntax=docker/dockerfile:1
# naka-bridge — a headed Chromium (under Xvfb) that calls Naka's API for the Annamour server.
# Build from the repository root: docker build -f apps/naka-bridge/Dockerfile .

# Same version as the `playwright` dependency: the image ships the matching browsers.
FROM mcr.microsoft.com/playwright:v1.65.0-noble
RUN npm install -g pnpm@10.34.9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches patches/
COPY apps/naka-bridge apps/naka-bridge/
RUN pnpm install --prod --frozen-lockfile --filter "@annamour/naka-bridge..."
WORKDIR /app/apps/naka-bridge
USER pwuser
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["xvfb-run", "-a", "node", "--import", "tsx", "src/index.ts"]
