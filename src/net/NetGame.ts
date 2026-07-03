import { Engine, Scene, Vector3, Color3, Quaternion, TransformNode } from "@babylonjs/core";
import { Client, type Room } from "colyseus.js";
import { enablePhysicsOnScene, type HavokInstance } from "../engine/Physics";
import { buildLighting } from "../engine/Lighting";
import { buildPostFX } from "../engine/PostFX";
import { CameraRig } from "../engine/CameraRig";
import { buildArena } from "../engine/SceneBuilder";
import { TwinStick } from "../controls/TwinStick";
import { buildShowcaseModel } from "../vehicles/models";
import { Content } from "../data/Content";
import { Audio } from "../feel/Audio";
import { Hud } from "../ui/Hud";
import { QualityGovernor } from "../perf/Quality";
import { clamp } from "../core/math";
import { integrateMove, type MoveState } from "../../shared/sim";
import { profileFor, type MoveProfile } from "../../shared/vehicles";
import { worldFor, type MapWorld } from "../../shared/maps";
import { ARENA_ROOM, type GameMode, type InputMessage } from "../../shared/net";
import type { NetArena, NetPlayer } from "./state";
import type { QualityTier } from "../core/types";

const TEAM_BLUE = new Color3(0.2, 0.6, 1);
const TEAM_RED = new Color3(1, 0.35, 0.28);
const INTERP_DELAY = 100; // ms — render remotes this far in the past to interpolate smoothly
const SNAP_ERROR = 4; // m — beyond this, hard-snap the local prediction to the server

export interface NetConfig {
  serverUrl: string;
  mode: GameMode;
  mapId: string;
  vehicleId: string;
  name: string;
  tier: QualityTier;
  /** When set, join this specific room (from the lobby browser) instead of matchmaking. */
  roomId?: string;
}

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
}

interface View {
  root: TransformNode;
  spinners: TransformNode[];
  restY: number;
}

interface Remote extends View {
  buf: Sample[];
  lastFire: number;
}

/**
 * Networked match runner (server-authoritative). Mirrors MissionRunner's scene setup but the
 * simulation lives on the Colyseus server: we predict the local vehicle with the shared sim
 * and reconcile against server snapshots, and interpolate every other player ~100ms behind.
 */
export class NetGame {
  private scene!: Scene;
  private camera!: CameraRig;
  private input!: TwinStick;
  private client!: Client;
  private room!: Room<NetArena>;
  private governor!: QualityGovernor;
  private world: MapWorld = { half: 90 };
  private myProfile: MoveProfile = profileFor("heli-hornet");

  private me: (View & { pred: MoveState }) | null = null;
  private readonly remotes = new Map<string, Remote>();
  // Scratch vectors reused each frame (no per-frame allocation in the hot loop).
  private readonly headingV = new Vector3();
  private readonly posV = new Vector3();
  private readonly velV = new Vector3();
  private seq = 0;
  private myTeam = 1;
  private wasAlive = true;
  private lastTick = -1;
  private startedAt = 0;
  private stopped = false;
  private ended = false;
  private resultEl: HTMLElement | null = null;
  private waitEl: HTMLElement | null = null;
  private mapName = "";
  private readonly q = new Quaternion();

  constructor(
    private readonly engine: Engine,
    private readonly havok: HavokInstance,
    private readonly audio: Audio,
    private readonly hud: Hud,
    private readonly cfg: NetConfig,
    private readonly onExit: (msg?: string) => void,
  ) {}

  async start(): Promise<void> {
    this.client = new Client(this.cfg.serverUrl);
    const opts = {
      name: this.cfg.name,
      mode: this.cfg.mode,
      mapId: this.cfg.mapId,
      vehicleId: this.cfg.vehicleId,
    };
    try {
      this.room = this.cfg.roomId
        ? await this.client.joinById<NetArena>(this.cfg.roomId, opts)
        : await this.client.joinOrCreate<NetArena>(ARENA_ROOM, opts);
    } catch (err: unknown) {
      this.onExit(`Couldn't reach the server: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (this.stopped) {
      void this.room.leave();
      return;
    }

    // Initial state syncs asynchronously after join — wait for it before reading the map.
    await this.waitForState();
    if (this.stopped) {
      void this.room.leave();
      return;
    }

    const map = Content.map(this.room.state.mapId);
    this.mapName = map.name;

    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    enablePhysicsOnScene(this.scene, this.havok);

    this.camera = new CameraRig(this.scene);
    const lighting = buildLighting(this.scene, this.cfg.tier, map.sunDir);
    buildPostFX(this.scene, this.camera.camera, this.cfg.tier);
    const arena = buildArena(this.scene, lighting.shadows, map);
    this.scene.blockMaterialDirtyMechanism = true;
    this.world = worldFor(this.room.state.mapId);
    this.governor = new QualityGovernor(this.engine, this.cfg.tier);

    this.input = new TwinStick(byId("stickLeft"));
    window.addEventListener("keydown", this.onKey);

    this.audio.unlock();
    this.audio.startEngine(Content.vehicle(this.cfg.vehicleId).movement.model);
    this.hud.reset();
    this.hud.setMission(`${map.name} · ${this.cfg.mode === "coop" ? "CO-OP" : "PVP"}`);
    this.hud.show();
    this.hud.showBanner(this.cfg.mode === "coop" ? "TEAM UP — CLEAR THE ZONE" : "ELIMINATE THE ENEMY TEAM");

    this.waitEl = document.createElement("div");
    this.waitEl.className = "net-wait";
    this.waitEl.textContent = "WAITING FOR OPPONENT…";
    document.body.appendChild(this.waitEl);

    this.room.onLeave(() => {
      if (!this.stopped) this.onExit("Disconnected from the server.");
    });

    this.startedAt = performance.now();
    const startLoop = (): void => {
      if (this.stopped) return;
      this.engine.runRenderLoop(this.frame);
    };
    if (arena.env.isReady()) startLoop();
    else {
      arena.env.onLoadObservable.addOnce(startLoop);
      window.setTimeout(startLoop, 4000);
    }
  }

  /** Resolve once the server's first state patch has populated the room (mapId is set). */
  private async waitForState(): Promise<void> {
    for (let i = 0; i < 150; i++) {
      if (this.room.state && this.room.state.mapId) return;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.dispose(), this.onExit();
  };

  private readonly frame = (): void => {
    if (this.stopped) return;
    const dtMs = this.engine.getDeltaTime();
    const dt = clamp(dtMs / 1000, 0, 0.05);
    const now = performance.now();
    const state = this.room.state;
    const sid = this.room.sessionId;

    this.input.update();
    const s = this.input.state;
    const msg: InputMessage = {
      seq: ++this.seq,
      moveX: s.move.x,
      moveY: s.move.y,
      firing: s.firing,
      switchTarget: s.switchTarget,
      special: s.special,
    };
    this.room.send("input", msg);

    const serverMe = state.players.get(sid);
    if (serverMe) this.myTeam = serverMe.team;

    // Spawn our own view lazily once the server has placed us.
    if (!this.me && serverMe) {
      const v = this.spawnView(serverMe.vehicleId, serverMe.team);
      this.myProfile = profileFor(serverMe.vehicleId);
      this.me = { ...v, pred: { x: serverMe.x, z: serverMe.z, yaw: serverMe.yaw, vx: serverMe.vx, vz: serverMe.vz } };
    }

    // Sample remotes into interpolation buffers once per server tick.
    if (state.tick !== this.lastTick) {
      this.lastTick = state.tick;
      state.players.forEach((p, id) => {
        if (id === sid) return;
        const r = this.ensureRemote(id, p);
        r.buf.push({ t: now, x: p.x, z: p.z, yaw: p.yaw });
        if (r.buf.length > 24) r.buf.shift();
      });
    }
    this.reapRemotes(state);

    // Local prediction + reconciliation.
    if (this.me && serverMe) {
      if (serverMe.alive) {
        integrateMove(this.me.pred, msg.moveX, msg.moveY, dt, this.myProfile, this.world);
        const ex = serverMe.x - this.me.pred.x;
        const ez = serverMe.z - this.me.pred.z;
        if (!this.wasAlive || Math.hypot(ex, ez) > SNAP_ERROR) {
          this.me.pred.x = serverMe.x;
          this.me.pred.z = serverMe.z;
          this.me.pred.yaw = serverMe.yaw;
          this.me.pred.vx = serverMe.vx;
          this.me.pred.vz = serverMe.vz;
        } else {
          const k = 1 - Math.exp(-dt * 10);
          this.me.pred.x += ex * k;
          this.me.pred.z += ez * k;
          this.me.pred.yaw += angleDelta(serverMe.yaw, this.me.pred.yaw) * k;
        }
        this.me.root.setEnabled(true);
        this.place(this.me, this.me.pred.x, this.me.pred.z, this.me.pred.yaw, dt);
      } else {
        this.me.root.setEnabled(false);
      }
      this.wasAlive = serverMe.alive;

      this.headingV.set(Math.sin(this.me.pred.yaw), 0, Math.cos(this.me.pred.yaw));
      this.posV.set(this.me.pred.x, this.me.restY, this.me.pred.z);
      this.velV.set(this.me.pred.vx, 0, this.me.pred.vz);
      this.camera.update(dt, this.posV, this.headingV, this.velV);
      const speed01 = Math.min(1, Math.hypot(this.me.pred.vx, this.me.pred.vz) / this.myProfile.maxSpeed);
      this.audio.setEngine(speed01, serverMe.alive);
      this.audio.setListener(this.camera.camera.position, this.camera.forward);
    }

    // Render remotes at (now - INTERP_DELAY).
    const renderT = now - INTERP_DELAY;
    this.remotes.forEach((r, id) => {
      const p = state.players.get(id);
      if (!p || !p.alive) {
        r.root.setEnabled(false);
        return;
      }
      const smp = sampleAt(r.buf, renderT);
      r.root.setEnabled(true);
      this.place(r, smp.x, smp.z, smp.yaw, dt);
    });

    // HUD.
    if (serverMe) {
      this.hud.setHp((serverMe.hp / Math.max(1, serverMe.maxHp)) * 100);
      this.hud.setLowHp((serverMe.hp / Math.max(1, serverMe.maxHp)) * 100);
    }
    this.hud.setTimer((now - this.startedAt) / 1000);
    this.hud.setEnemies(this.countEnemies(state));
    const mode = state.mode === "coop" ? "CO-OP" : "PVP";
    this.hud.setMission(
      state.mode === "coop"
        ? `${this.mapName} · ${mode}`
        : `${this.mapName} · ${mode} · ${state.scoreA}–${state.scoreB} (to ${state.scoreTarget})`,
    );

    if (this.waitEl) {
      const waiting = state.mode === "pvp" && !state.over && this.countEnemies(state) === 0;
      this.waitEl.classList.toggle("show", waiting);
    }

    this.governor.update(dtMs); // auto-scale quality to hold 60fps
    this.scene.render();

    if (state.over && !this.ended) {
      this.ended = true;
      this.showResult(state.winnerTeam === this.myTeam);
    }
  };

  private showResult(won: boolean): void {
    const st = this.room.state;
    const wrap = document.createElement("div");
    wrap.className = "net-result";
    const title = document.createElement("div");
    title.className = "screen-title " + (won ? "victory" : "defeat");
    title.textContent = won ? "VICTORY" : "DEFEAT";
    const sub = document.createElement("div");
    sub.className = "screen-sub";
    sub.textContent =
      st.mode === "coop"
        ? won
          ? "All hostiles eliminated"
          : "Team wiped out"
        : `Final score  ${st.scoreA} – ${st.scoreB}`;
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "CONTINUE";
    btn.onclick = () => {
      this.dispose();
      this.onExit();
    };
    wrap.append(title, sub, btn);
    document.body.appendChild(wrap);
    this.resultEl = wrap;
  }

  private spawnView(vehicleId: string, team: number): View {
    const cfg = Content.vehicle(vehicleId);
    const m = buildShowcaseModel(this.scene, cfg, team === 2 ? TEAM_RED : TEAM_BLUE);
    const restY = profileFor(vehicleId).cruiseY; // flyers hover high, ground vehicles sit low
    m.root.position.y = restY;
    return { root: m.root, spinners: m.spinners, restY };
  }

  private ensureRemote(id: string, p: NetPlayer): Remote {
    let r = this.remotes.get(id);
    if (!r) {
      const v = this.spawnView(p.vehicleId, p.team);
      r = { ...v, buf: [], lastFire: p.fireEvent };
      this.remotes.set(id, r);
    }
    return r;
  }

  private reapRemotes(state: NetArena): void {
    for (const [id, r] of this.remotes) {
      if (!state.players.get(id)) {
        r.root.dispose(false, true);
        this.remotes.delete(id);
      }
    }
  }

  private place(v: View, x: number, z: number, yaw: number, dt: number): void {
    Quaternion.FromEulerAnglesToRef(0, yaw, 0, this.q);
    v.root.rotationQuaternion = v.root.rotationQuaternion ?? new Quaternion();
    v.root.rotationQuaternion.copyFrom(this.q);
    v.root.position.set(x, v.restY, z);
    for (const sp of v.spinners) sp.rotation.y += 26 * dt;
  }

  private countEnemies(state: NetArena): number {
    let n = 0;
    state.players.forEach((p) => {
      if (p.team !== this.myTeam && p.alive) n++;
    });
    return n;
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener("keydown", this.onKey);
    this.engine.stopRenderLoop(this.frame);
    this.input?.dispose();
    void this.room?.leave();
    this.scene?.dispose();
    this.resultEl?.remove();
    this.resultEl = null;
    this.waitEl?.remove();
    this.waitEl = null;
  }
}

/** Smallest signed angle to rotate `from` onto `to`. */
function angleDelta(to: number, from: number): number {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/** Interpolate the buffer at render time `t`, clamping to the ends. */
function sampleAt(buf: Sample[], t: number): Sample {
  if (buf.length === 0) return { t, x: 0, z: 0, yaw: 0 };
  if (buf.length === 1 || t <= buf[0]!.t) return buf[0]!;
  const last = buf[buf.length - 1]!;
  if (t >= last.t) return last;
  for (let i = 0; i < buf.length - 1; i++) {
    const a = buf[i]!;
    const b = buf[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / Math.max(1e-3, b.t - a.t);
      return { t, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: a.yaw + angleDelta(b.yaw, a.yaw) * f };
    }
  }
  return last;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}
