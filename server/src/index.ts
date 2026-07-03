import { createServer } from "http";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { ArenaRoom } from "./rooms/ArenaRoom";
import { ARENA_ROOM } from "../../shared/net";

const port = Number(process.env.PORT ?? 2567);

const app = express();

// CORS for the custom HTTP routes below (the client is served from a different origin).
// Colyseus adds CORS to its own matchmaking routes, but not to these.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "apex-warfare-server" });
});

// Room browser for the lobby: list joinable arena rooms + their metadata.
app.get("/rooms", (_req, res) => {
  matchMaker
    .query({ name: ARENA_ROOM })
    .then((rooms) => {
      res.json(
        rooms
          .filter((r) => !r.locked && !r.private)
          .map((r) => ({ roomId: r.roomId, clients: r.clients, maxClients: r.maxClients, metadata: r.metadata })),
      );
    })
    .catch(() => res.json([]));
});
// In production the image bundles the built client and serves it from this same origin
// (so the browser's wss:// + /rooms are same-origin — no CORS, no cross-host config).
const clientDir = process.env.CLIENT_DIR;
if (clientDir) app.use(express.static(clientDir));

app.use("/monitor", monitor());

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
// Pool matchmaking by mode + map so Quickplay only groups compatible rooms.
gameServer.define(ARENA_ROOM, ArenaRoom).filterBy(["mode", "mapId"]);

gameServer
  .listen(port)
  .then(() => {
    console.log(`[apex-server] listening on :${port}`);
  })
  .catch((err: unknown) => {
    console.error("[apex-server] failed to start", err);
    process.exit(1);
  });
