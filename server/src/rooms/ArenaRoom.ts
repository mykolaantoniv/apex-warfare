import { Room, type Client } from "colyseus";
import { ArenaState, PlayerState } from "../schema";
import { newRuntime, stepPlayer, type PlayerRuntime } from "../sim";
import { TICK_MS, type InputMessage, type JoinOptions } from "../../../shared/net";
import { worldFor, type MapWorld } from "../../../shared/maps";

const FIRE_RANGE = 58; // m
const FIRE_DAMAGE = 12;
const RESPAWN_DELAY = 3; // s
const SPAWN_RADIUS = 70;
const AIM_HALF_ANGLE = 0.28; // rad (~16°) — auto-lock only hits enemies near the reticle
const AIM_COS = Math.cos(AIM_HALF_ANGLE);
const PVP_SCORE_TARGET = 15;
const COOP_BOTS = 5;
const BOT_VEHICLES = ["tank-raider", "heli-pest", "bike-scout", "heli-brute", "tank-boulder"];
const BOT_NAMES = ["Havoc", "Razor", "Viper", "Brute", "Ghost", "Talon", "Reaper", "Onyx"];

/** Authoritative room for both PvP (2 human teams) and co-op (humans on team 1 vs team-2 bots). */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 8;
  private readonly runtimes = new Map<string, PlayerRuntime>();
  private readonly respawn = new Map<string, number>();
  private botSeq = 0;
  private world!: MapWorld;

  override onCreate(options: JoinOptions): void {
    const state = new ArenaState();
    state.mode = options.mode === "coop" ? "coop" : "pvp";
    state.mapId = options.mapId ?? "map-locker";
    this.state = state;
    this.world = worldFor(state.mapId);

    if (state.mode === "coop") {
      for (let i = 0; i < COOP_BOTS; i++) this.spawnBot();
      state.scoreTarget = COOP_BOTS; // humans win by eliminating every bot
    } else {
      state.scoreTarget = PVP_SCORE_TARGET;
    }

    // Surfaced in the lobby's room browser (client.getAvailableRooms).
    void this.setMetadata({ mode: state.mode, mapId: state.mapId });

    this.onMessage<InputMessage>("input", (client, msg) => {
      const rt = this.runtimes.get(client.sessionId);
      if (rt) rt.input = sanitize(msg);
    });

    this.setSimulationInterval((dtMs) => this.update(dtMs / 1000), TICK_MS);
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = (options.name ?? "Recruit").slice(0, 16) || "Recruit";
    p.vehicleId = (options.vehicleId ?? "heli-hornet").slice(0, 32) || "heli-hornet";
    p.team = this.state.mode === "coop" ? 1 : this.nextTeam();
    this.placeAtSpawn(p);
    this.state.players.set(client.sessionId, p);
    this.runtimes.set(client.sessionId, newRuntime());
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.runtimes.delete(client.sessionId);
    this.respawn.delete(client.sessionId);
  }

  private spawnBot(): void {
    const id = `bot-${this.botSeq}`;
    const p = new PlayerState();
    p.id = id;
    p.bot = true;
    p.team = 2;
    p.name = BOT_NAMES[this.botSeq % BOT_NAMES.length]!;
    p.vehicleId = BOT_VEHICLES[this.botSeq % BOT_VEHICLES.length]!;
    p.maxHp = 60; // weaker than a human (100) so co-op is winnable while outnumbered
    this.placeAtSpawn(p);
    this.state.players.set(id, p);
    this.runtimes.set(id, newRuntime());
    this.botSeq++;
  }

  private update(dt: number): void {
    this.state.tick++;
    if (this.state.over) return;

    // Respawns.
    for (const [id, at] of this.respawn) {
      if (this.state.tick >= at) {
        const p = this.state.players.get(id);
        if (p) {
          p.hp = p.maxHp;
          p.alive = true;
          this.placeAtSpawn(p);
        }
        this.respawn.delete(id);
      }
    }

    // Movement + firing (bots get AI-authored input first).
    this.state.players.forEach((p) => {
      const rt = this.runtimes.get(p.id);
      if (!rt) return;
      if (p.bot) this.driveBot(p, rt);
      const fired = stepPlayer(p, rt, dt, this.world);
      if (fired) this.resolveShot(p);
    });
  }

  /** Simple bot brain: hunt the nearest enemy, drive at it, fire when roughly on target. */
  private driveBot(bot: PlayerState, rt: PlayerRuntime): void {
    if (!bot.alive) {
      rt.input = { seq: 0, moveX: 0, moveY: 0, firing: false, switchTarget: false, special: false };
      return;
    }
    let tx = 0;
    let tz = 0;
    let best = Infinity;
    let found = false;
    this.state.players.forEach((t) => {
      if (!t.alive || t.team === bot.team) return;
      const d = (t.x - bot.x) ** 2 + (t.z - bot.z) ** 2;
      if (d < best) {
        best = d;
        tx = t.x;
        tz = t.z;
        found = true;
      }
    });
    if (!found) {
      rt.input = { seq: 0, moveX: 0, moveY: 0.2, firing: false, switchTarget: false, special: false };
      return;
    }
    const want = Math.atan2(tx - bot.x, tz - bot.z);
    const d = ((want - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const dist = Math.sqrt(best);
    const aligned = Math.abs(d) < AIM_HALF_ANGLE; // only shoot when actually on target (matches the cone)
    rt.input = {
      seq: 0,
      moveX: Math.max(-1, Math.min(1, d * 2)),
      moveY: dist > 22 ? 1 : 0.15, // close in, then hold at a firing standoff
      firing: aligned && dist < FIRE_RANGE,
      switchTarget: false,
      special: false,
    };
  }

  /** Auto-lock hitscan at the nearest living enemy within range AND inside the aim cone. */
  private resolveShot(shooter: PlayerState): void {
    let best: PlayerState | null = null;
    let bestD = FIRE_RANGE * FIRE_RANGE;
    const fx = Math.sin(shooter.yaw);
    const fz = Math.cos(shooter.yaw);
    this.state.players.forEach((t) => {
      if (t === shooter || !t.alive || t.team === shooter.team) return;
      const dx = t.x - shooter.x;
      const dz = t.z - shooter.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD) return;
      const dist = Math.sqrt(d2);
      if (dist < 1e-3) return;
      // Only hit if the target is near the reticle, not anywhere in the forward arc.
      if ((dx * fx + dz * fz) / dist < AIM_COS) return;
      bestD = d2;
      best = t;
    });
    if (!best) return;
    const victim: PlayerState = best;
    victim.hp -= shooter.bot ? FIRE_DAMAGE * 0.5 : FIRE_DAMAGE; // bots hit softer (forgiving co-op)
    if (victim.hp > 0) return;

    victim.hp = 0;
    victim.alive = false;
    victim.deaths++;
    shooter.kills++;
    if (shooter.team === 1) this.state.scoreA++;
    else this.state.scoreB++;

    // Co-op bots stay down (so the match can be won); everyone else respawns.
    const permaDead = this.state.mode === "coop" && victim.bot;
    if (!permaDead) {
      this.respawn.set(victim.id, this.state.tick + Math.round(RESPAWN_DELAY * (1000 / TICK_MS)));
    }
    this.checkWin();
  }

  private checkWin(): void {
    if (this.state.over) return;
    if (this.state.mode === "coop") {
      let botsAlive = 0;
      this.state.players.forEach((p) => {
        if (p.bot && p.alive) botsAlive++;
      });
      if (botsAlive === 0) this.endMatch(1);
    } else {
      if (this.state.scoreA >= this.state.scoreTarget) this.endMatch(1);
      else if (this.state.scoreB >= this.state.scoreTarget) this.endMatch(2);
    }
  }

  private endMatch(winnerTeam: number): void {
    this.state.over = true;
    this.state.winnerTeam = winnerTeam;
  }

  private nextTeam(): number {
    let a = 0;
    let b = 0;
    this.state.players.forEach((p) => (p.team === 1 ? a++ : b++));
    return a <= b ? 1 : 2;
  }

  private placeAtSpawn(p: PlayerState): void {
    const ang = Math.random() * Math.PI * 2;
    const side = p.team === 2 ? 1 : -1; // teams start on opposite sides
    p.x = side * SPAWN_RADIUS * 0.6 + Math.cos(ang) * 8;
    p.z = Math.sin(ang) * SPAWN_RADIUS * 0.6;
    p.yaw = side < 0 ? 0 : Math.PI;
    p.vx = 0;
    p.vz = 0;
    p.hp = p.maxHp;
    p.alive = true;
  }
}

function sanitize(m: InputMessage): InputMessage {
  const c = (n: number): number => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
  return {
    seq: Number.isFinite(m.seq) ? m.seq >>> 0 : 0,
    moveX: c(m.moveX),
    moveY: c(m.moveY),
    firing: !!m.firing,
    switchTarget: !!m.switchTarget,
    special: !!m.special,
  };
}
