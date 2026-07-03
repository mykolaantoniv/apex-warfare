# Apex Warfare

Premium 3D vehicle-combat game — **Massive Warfare-style**: third-person chase camera,
auto-lock-on shooting, tiny war machines fighting across realistic warzones. Now with
**real-time online multiplayer** (PvP + co-op) on an authoritative server, plus the
single-player campaign. Built to feel and look better than the reference.

### ▶ Play multiplayer (live): **https://apex-warfare.agreeableriver-ee963951.northeurope.azurecontainerapps.io/**

Tap **DEPLOY** → **⚔ MULTIPLAYER** → pick **CO-OP** (vs bots) or **PVP**, then **QUICKPLAY**
(or join an open match from the room browser). Open a second device/tab to play against yourself.

> **Status:** Single-player campaign (4 vehicles, 3 maps, 9 missions + boss finales, garage +
> upgrade trees, IndexedDB save) **and** real-time multiplayer (server-authoritative PvP + co-op,
> lobby/matchmaking, bots) — **complete and deployed to Azure Container Apps.**
> `apex-warfare.pages.dev` is the older single-player-only build on Cloudflare Pages.
> See `GDD.md` for design, `CLAUDE.md` for architecture.

## Stack
**Client:** Babylon.js (WebGL2) · Havok physics (WASM) · Vite + TypeScript (strict) · nipplejs ·
IndexedDB (idb) · vite-plugin-pwa.
**Multiplayer:** Colyseus (authoritative Node/TS server) · client-side prediction + reconciliation +
entity interpolation · shared movement sim (`shared/`).
**Hosting:** Azure Container Apps (one image serves the game server **and** the client).

## Getting started
```bash
npm install
npm run dev            # client → http://localhost:5173

cd server && npm install && npm run dev   # game server → http://localhost:2567
```
Then tap **DEPLOY**. For multiplayer the client connects to `ws://localhost:2567` in dev
(same-origin `wss` in production). Override with `VITE_SERVER_URL` if needed.

**Controls** — single steering stick + buttons (auto-aim at the locked target, no aim stick):
- **Touch:** left stick = steer + throttle; **FIRE** / **SWITCH** target / **SPECIAL** buttons.
- **Keyboard:** `WASD` drive, `Space` fire, `Tab` switch target, `Q` special. `` ` `` = perf overlay.

## Scripts
| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (client) |
| `npm run build` | Type-check (strict) + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate-data` | Validate content JSON against schemas |
| `server/ npm run dev` | Run the authoritative game server (tsx watch) |
| `server/ node smoke.mjs` · `node coop-smoke.mjs` | Netcode integration smoke tests |

## Deploy (Azure)
Single Docker image = client build + game server (serves the client from the same origin).
```bash
# build the image in Azure Container Registry (no local Docker needed)
az acr build -r apexwarfare24621f -t apex-server:v1 -f Dockerfile --no-logs .
# roll it out
az containerapp update -n apex-warfare -g apex-warfare-rg \
  --image apexwarfare24621f.azurecr.io/apex-server:v1
```
Server pinned to a single replica (Colyseus rooms are in-memory). `--min-replicas 0` to
scale-to-zero and stop billing when idle (adds a cold start on first connect).

## Project layout
```
GDD.md  CLAUDE.md  ASSETS.md         # design, architecture, CC0 license log
Dockerfile                          # client build + server runtime (one image)
shared/     net.ts  sim.ts          # protocol + movement sim shared by client & server
server/     src/                    # authoritative Colyseus server (rooms, bots, scoring)
src/
  core/     engine/   vehicles/     # loop/types, Babylon setup, controllers
  net/      ui/  controls/          # netplay + lobby, HUD/menus, input
  perf/     data/                   # tier+governor, content JSON
```

## License
Code: MIT (project owner). Assets: CC0 per `ASSETS.md`.
