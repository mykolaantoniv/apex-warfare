# syntax=docker/dockerfile:1
# Apex Warfare — single image: builds the client, then runs the authoritative Colyseus
# server which also serves the built client (same origin → no CORS / no cross-host config).

# ---------- stage 1: build the browser client ----------
FROM node:22-alpine AS client
WORKDIR /src
# Skip Playwright's browser download (devDep, not needed to build); give Vite headroom.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY scripts ./scripts
COPY public ./public
# tsc typecheck is done in CI/locally; the image only needs the Vite bundle.
RUN npx vite build

# ---------- stage 2: server runtime (also serves the client) ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY shared ./shared
COPY --from=client /src/dist ./client
ENV CLIENT_DIR=/app/client
ENV PORT=2567
EXPOSE 2567
WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
