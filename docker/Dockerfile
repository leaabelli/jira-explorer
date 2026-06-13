# Multi-stage build. Node packages run via tsx (no compile step); the web app is built by Vite.
# bookworm-slim (glibc) keeps native better-sqlite3 painless; the native binary is compiled in the
# build stage and carried to the identical runtime base.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# install deps against the workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/app/package.json packages/app/
COPY packages/web/package.json packages/web/
RUN npm ci
# copy sources (node_modules is excluded via .dockerignore) and build the web bundle
COPY . .
RUN npm run build:web

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
# bring the installed deps (incl. the compiled better-sqlite3 + tsx) and built app
COPY --from=build /app /app
RUN mkdir -p /data
EXPOSE 3000
VOLUME ["/data"]
# the server serves the built web app + REST + MCP-over-HTTP on one port
CMD ["npx", "tsx", "packages/app/src/server/index.ts"]
