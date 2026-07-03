import { Schema, MapSchema, type } from "@colyseus/schema";

/** One connected combatant (human or server-run bot). Synced to all clients. */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "Recruit";
  @type("string") vehicleId = "heli-hornet";
  @type("uint8") team = 0;
  @type("boolean") bot = false;

  @type("float32") x = 0;
  @type("float32") z = 0;
  /** Heading yaw in radians (0 = +Z). */
  @type("float32") yaw = 0;
  @type("float32") vx = 0;
  @type("float32") vz = 0;

  @type("float32") hp = 100;
  @type("float32") maxHp = 100;
  @type("uint16") kills = 0;
  @type("uint16") deaths = 0;
  @type("boolean") alive = true;

  /** Last input seq the server applied for this player — client reconciles against it. */
  @type("uint32") lastInputSeq = 0;
  /** Bumped on each shot fired so clients can spawn a tracer/muzzle FX. */
  @type("uint32") fireEvent = 0;
}

/** Whole-match authoritative state. */
export class ArenaState extends Schema {
  @type("string") mode = "pvp";
  @type("string") mapId = "map-locker";
  @type("uint32") tick = 0;
  @type("boolean") over = false;
  @type("uint8") winnerTeam = 0;
  @type("uint16") scoreA = 0; // team 1 (humans in co-op) kills
  @type("uint16") scoreB = 0; // team 2 (bots in co-op) kills
  @type("uint16") scoreTarget = 15;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
