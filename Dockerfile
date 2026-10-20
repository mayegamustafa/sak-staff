# ─────────────────────────────────────────────────────────────────────────────
# SAK Staff Profiling System – production image
#
# Builds the API server together with the React frontend it serves, so the whole
# system is one container that needs nothing but a Postgres URL and a writable
# directory for uploads. That is what makes it portable: the same image runs on
# Railway, a VPS, or the school's own server with no code changes.
#
#   docker build -t sak-staff .
#   docker run -p 4000:4000 \
#     -e DATABASE_URL=postgres://... \
#     -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
#     -v sak_uploads:/data/uploads -e UPLOAD_DIR=/data/uploads \
#     sak-staff
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Copy manifests first so dependency installs cache independently of source edits.
COPY package.json package-lock.json ./
COPY packages/shared/package.json   packages/shared/
COPY packages/backend/package.json  packages/backend/
COPY packages/desktop/package.json  packages/desktop/
COPY packages/mobile/package.json   packages/mobile/

# --ignore-scripts skips the desktop package's electron-rebuild postinstall,
# which needs Electron and is irrelevant to a server build.
RUN npm ci --ignore-scripts

COPY . .

# Shared types first (backend and frontend both compile against its dist output),
# then the API, then the web frontend. build:renderer is vite only – it
# deliberately skips electron-builder, which would try to produce installers.
RUN npm run build --workspace=packages/shared \
 && npm run build --workspace=packages/backend \
 && npm run build:renderer --workspace=packages/desktop

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/data/uploads

# postgresql-client provides pg_dump/psql for backups and for moving this
# deployment to another host later. tini reaps zombies and forwards signals so
# the server's graceful shutdown actually runs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client tini \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json   packages/shared/
COPY packages/backend/package.json  packages/backend/
COPY packages/desktop/package.json  packages/desktop/
COPY packages/mobile/package.json   packages/mobile/

# Only the backend workspace and the repo root – no Electron, no React Native.
RUN npm ci --ignore-scripts --omit=dev \
      --workspace=packages/backend --include-workspace-root \
 && npm cache clean --force

# Compiled server + the TypeScript sources its migrations still run from.
COPY --from=builder /app/packages/shared/dist   packages/shared/dist
COPY --from=builder /app/packages/backend/dist  packages/backend/dist
COPY --from=builder /app/packages/backend/src   packages/backend/src
COPY --from=builder /app/packages/backend/tsconfig.json packages/backend/

# The frontend, served by the API at / (see packages/backend/src/app.ts).
COPY --from=builder /app/packages/desktop/dist  packages/desktop/dist

# Uploaded staff documents live here. Mount a volume at this path in production –
# without one, every national ID and contract is lost on the next deploy.
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/packages/backend
ENTRYPOINT ["/usr/bin/tini", "--"]

# Applies any pending migrations, then starts the server.
CMD ["npm", "run", "start:migrate"]
