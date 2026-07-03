import {
  Scene,
  Vector3,
  Color3,
  ShadowGenerator,
  Mesh,
  MeshBuilder,
  StandardMaterial,
} from "@babylonjs/core";
import { Combatant } from "./Combatant";
import { AIController } from "../ai/AIController";
import { ProjectileSystem, Weapon, WeaponConfig } from "../vehicles/Weapon";
import { FeelDirector } from "../feel/FeelDirector";
import { MissionDifficulty, rewardsFor, starsFor } from "./difficulty";
import type { InputState, VehicleConfig } from "../core/types";
import type { CaptureZone, MissionConfig } from "../data/types";

const WORLD_FWD = new Vector3(0, 0, 1);
const WORLD_RIGHT = new Vector3(1, 0, 0);
const BOSS_HEALTH_MUL = 1.4;
const SPECIAL_CD = 12; // repair cooldown (s)
const SPECIAL_HEAL = 0.35; // fraction of max HP restored
const FRONT_ARC_DOT = 0.3; // only lock enemies within ~72° of the nose (dot of unit dirs)
const CAPTURE_CONTEST_MUL = 0.6; // meter drain rate while an enemy holds the zone
const CAPTURE_DECAY_MUL = 0.25; // meter drain rate while nobody holds it

export type MissionState = "playing" | "won" | "lost";

export interface MissionResult {
  outcome: "won" | "lost";
  stars: number;
  timeSec: number;
  scrap: number;
}

export interface RosterEntry {
  vehicle: VehicleConfig;
  weapon: WeaponConfig;
}

export interface MissionParams {
  mission: MissionConfig;
  index: number;
  difficulty: MissionDifficulty;
  playerVehicle: VehicleConfig;
  playerWeapon: WeaponConfig;
  enemyRoster: RosterEntry[];
  playerSpawn: Vector3;
  enemySpawns: Vector3[];
  /** Escort missions: the convoy to protect + where it starts. */
  ally?: { vehicle: VehicleConfig; weapon: WeaponConfig; spawn: Vector3 };
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function enemyAccent(id: string): Color3 {
  if (id === "heli-brute") return new Color3(1, 0.18, 0.14);
  if (id === "heli-wasp") return new Color3(1, 0.85, 0.2);
  return new Color3(1, 0.45, 0.15);
}

/** Runs one mission (deathmatch or survival) and reports a scored result. */
export class Mission {
  readonly player: Combatant;
  state: MissionState = "playing";
  elapsed = 0;

  private readonly cfg: MissionConfig;
  private readonly index: number;
  private readonly difficulty: MissionDifficulty;
  private readonly finale: boolean;
  private readonly enemySpawns: Vector3[];
  private readonly roster: Array<{ vehicle: VehicleConfig; weapon: WeaponConfig; boss: boolean }>;
  private readonly enemies: Array<{ c: Combatant; ai: AIController }> = [];
  private readonly targets: Combatant[] = [];
  private spawned = 0;
  private spawnTimer = 0;
  private specialCd = 0;

  // Zone objectives (capture / extract hold; escort destination).
  private readonly zone: CaptureZone | null;
  private readonly captureMode: boolean; // player holds the zone to fill a meter
  private readonly escortMode: boolean; // protect a convoy to the destination zone
  private readonly ally: Combatant | null = null;
  private captureProgress = 0; // 0..1
  private zoneRing: Mesh | null = null;
  private zoneMat: StandardMaterial | null = null;
  private zonePulse = 0;
  private readonly zonePoint = new Vector3();
  private readonly allyInput: InputState = { move: { x: 0, y: 0 }, firing: false, switchTarget: false, special: false };

  constructor(
    private readonly scene: Scene,
    private readonly shadows: ShadowGenerator,
    private readonly feel: FeelDirector,
    private readonly projectiles: ProjectileSystem,
    params: MissionParams,
  ) {
    this.cfg = params.mission;
    this.index = params.index;
    this.difficulty = params.difficulty;
    this.finale = params.mission.finale;
    this.enemySpawns = params.enemySpawns;

    // Pre-scale each roster entry by the campaign difficulty; the finale's boss (slot 0)
    // gets an extra health multiplier so it reads as a proper boss.
    this.roster = params.enemyRoster.map((e, i) => {
      const vehicle = clone(e.vehicle);
      vehicle.stats.maxHealth *= this.difficulty.enemyHealthMul;
      const boss = this.finale && i === 0;
      if (boss) vehicle.stats.maxHealth *= BOSS_HEALTH_MUL;
      const weapon = clone(e.weapon);
      weapon.damage *= this.difficulty.enemyDamageMul;
      return { vehicle, weapon, boss };
    });

    this.player = new Combatant(
      this.scene,
      params.playerVehicle,
      "player",
      this.shadows,
      params.playerSpawn,
      new Weapon(params.playerWeapon, "player", this.projectiles),
      this.feel,
      new Color3(0.15, 0.85, 1),
    );
    this.targets.push(this.player);

    const t = this.cfg.type;
    this.captureMode = (t === "capture" || t === "extract") && !!this.cfg.zone;
    this.escortMode = t === "escort" && !!this.cfg.zone && !!params.ally;
    this.zone = (this.captureMode || this.escortMode) && this.cfg.zone ? this.cfg.zone : null;

    if (params.ally && this.escortMode) {
      this.ally = new Combatant(
        this.scene,
        params.ally.vehicle,
        "player", // friendly — enemy fire hits it, player fire passes through
        this.shadows,
        params.ally.spawn,
        new Weapon(params.ally.weapon, "player", this.projectiles),
        this.feel,
        new Color3(0.2, 0.55, 1),
      );
      this.targets.push(this.ally);
    }

    // Escort destination is green; capture/extract zones are cyan.
    if (this.zone) this.buildZoneMarker(this.zone, this.escortMode ? new Color3(0.3, 1, 0.4) : new Color3(0.15, 0.85, 1));
  }

  /** Translucent objective-zone marker: a flat disc + a bright rim ring on the ground. */
  private buildZoneMarker(zone: CaptureZone, color: Color3): void {
    const mat = new StandardMaterial("zoneMat", this.scene);
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.alpha = 0.16;
    const disc = MeshBuilder.CreateDisc("zoneDisc", { radius: zone.radius, tessellation: 40 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(zone.x, 0.06, zone.z);
    disc.material = mat;
    disc.isPickable = false;

    const ringMat = new StandardMaterial("zoneRingMat", this.scene);
    ringMat.emissiveColor = color.clone();
    ringMat.disableLighting = true;
    const ring = MeshBuilder.CreateTorus(
      "zoneRing",
      { diameter: zone.radius * 2, thickness: 0.5, tessellation: 48 },
      this.scene,
    );
    ring.position.set(zone.x, 0.3, zone.z);
    ring.material = ringMat;
    ring.isPickable = false;
    this.zoneRing = ring;
    this.zoneMat = ringMat;
  }

  private get deadCount(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.c.alive) n++;
    return n;
  }
  private get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.c.alive) n++;
    return n;
  }

  get hudCounter(): number {
    // Deathmatch counts down remaining kills; survival/capture show live threats.
    return this.cfg.type === "deathmatch" ? this.cfg.killTarget - this.deadCount : this.aliveCount;
  }

  /** HUD objective bar (label + 0..1) for zone missions, else null. */
  get objectiveHud(): { label: string; frac: number } | null {
    if (this.escortMode && this.ally) return { label: "CONVOY", frac: this.ally.healthPct / 100 };
    if (this.captureMode) return { label: this.cfg.type === "extract" ? "EXTRACT" : "CAPTURE", frac: this.captureProgress };
    return null;
  }
  get hasObjective(): boolean {
    return this.zone !== null;
  }

  /** World point + label the objective indicator should aim at (convoy for escort, else zone). */
  objectiveTarget(): { pos: Vector3; label: string } | null {
    if (this.escortMode && this.ally?.alive) return { pos: this.ally.getPosition(), label: "CONVOY" };
    if (this.zone) {
      this.zonePoint.set(this.zone.x, 1, this.zone.z);
      return { pos: this.zonePoint, label: this.cfg.type === "extract" ? "EXTRACT" : "ZONE" };
    }
    return null;
  }

  private inZone(pos: Vector3): boolean {
    const z = this.zone;
    if (!z) return false;
    return Math.hypot(pos.x - z.x, pos.z - z.z) <= z.radius;
  }
  private enemyInZone(): boolean {
    for (const e of this.enemies) if (e.c.alive && this.inZone(e.c.getPosition())) return true;
    return false;
  }

  /** Alive enemies within the forward firing arc, nearest first. */
  private enemiesInFront(): Combatant[] {
    const fwd = this.player.controller.forwardDir;
    const pp = this.player.getPosition();
    const list: Array<{ c: Combatant; d: number }> = [];
    for (const e of this.enemies) {
      if (!e.c.alive) continue;
      const p = e.c.getPosition();
      const dx = p.x - pp.x;
      const dz = p.z - pp.z;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx / d) * fwd.x + (dz / d) * fwd.z; // cos(angle from nose to enemy)
      if (dot > FRONT_ARC_DOT) list.push({ c: e.c, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.map((x) => x.c);
  }

  /** Enemy nameplate data (position, health, name, lock state) for the HUD overlay. */
  enemyPlates(): Array<{ pos: Vector3; hpPct: number; name: string; locked: boolean }> {
    const locked = this.player.lockTarget;
    const out: Array<{ pos: Vector3; hpPct: number; name: string; locked: boolean }> = [];
    for (const e of this.enemies) {
      if (!e.c.alive) continue;
      out.push({ pos: e.c.getPosition(), hpPct: e.c.healthPct, name: e.c.name, locked: e.c === locked });
    }
    return out;
  }

  /** 0..1 readiness of the special/repair ability (drives the HUD SPECIAL bar). */
  get specialReady01(): number {
    return this.specialCd <= 0 ? 1 : 1 - this.specialCd / SPECIAL_CD;
  }

  /**
   * Sticky lock, but only on enemies inside the forward firing arc: keep the current target
   * until it dies OR leaves the arc, then fall back to the nearest one in front. The switch
   * button cycles through the in-front enemies. This is why the red brackets — not a fixed
   * center dot — are the true aim: you can only hit what's ahead of the nose.
   */
  private updateLock(cycle: boolean): void {
    const front = this.enemiesInFront();
    if (front.length === 0) {
      this.player.lockTarget = null;
      return;
    }
    let cur = this.player.lockTarget as Combatant | null;
    if (cur && (!cur.alive || !front.includes(cur))) cur = null;
    if (cycle) {
      cur = cur ? front[(front.indexOf(cur) + 1) % front.length]! : front[0]!;
    } else if (!cur) {
      cur = front[0]!;
    }
    this.player.lockTarget = cur;
  }

  private updateSpecial(dt: number, activate: boolean): void {
    if (this.specialCd > 0) this.specialCd -= dt;
    if (activate && this.specialCd <= 0 && this.player.alive) {
      this.player.heal(SPECIAL_HEAL);
      this.specialCd = SPECIAL_CD;
      this.feel.particles.burstSparks(this.player.getPosition(), 24);
      this.feel.particles.flash(this.player.getPosition(), 40, 200);
    }
  }

  private pickEntry(): { vehicle: VehicleConfig; weapon: WeaponConfig; boss: boolean } {
    if (this.finale && this.spawned === 0) return this.roster[0]!;
    if (this.finale && this.roster.length > 1) {
      return this.roster[1 + Math.floor(Math.random() * (this.roster.length - 1))]!;
    }
    return this.roster[Math.floor(Math.random() * this.roster.length)]!;
  }

  private spawnOne(): void {
    const i = this.spawned;
    const spot = this.enemySpawns[i % this.enemySpawns.length]!;
    const pos = spot.clone();
    const pick = this.pickEntry();

    const archetype = i % 2 === 0 ? "rusher" : "sniper";
    const enemy = new Combatant(
      this.scene,
      pick.vehicle,
      "enemy",
      this.shadows,
      pos,
      new Weapon(pick.weapon, "enemy", this.projectiles),
      this.feel,
      enemyAccent(pick.vehicle.id),
    );
    this.enemies.push({ c: enemy, ai: new AIController(archetype) });
    this.targets.push(enemy);
    this.feel.particles.flash(pos, pick.boss ? 90 : 50, 240);
    this.feel.particles.burstSparks(pos, pick.boss ? 40 : 18);
    this.spawned++;
  }

  update(dt: number, playerInput: InputState, camFwd: Vector3, camRight: Vector3): void {
    if (this.state !== "playing") return;
    this.elapsed += dt;

    const deathmatch = this.cfg.type === "deathmatch";
    // Deathmatch spawns a fixed pool; survival + capture spawn continuously.
    const canSpawnMore = !deathmatch || this.spawned < this.cfg.killTarget;
    this.spawnTimer -= dt;
    if (canSpawnMore && this.spawnTimer <= 0 && this.aliveCount < this.difficulty.maxConcurrent) {
      this.spawnOne();
      this.spawnTimer = this.spawned < 2 ? 0.6 : this.difficulty.spawnInterval;
    }

    // Finisher slow-mo for the last kill of a deathmatch (incl. the boss).
    if (deathmatch && this.cfg.killTarget - this.deadCount === 1 && this.aliveCount === 1) {
      for (const e of this.enemies) if (e.c.alive) e.c.markFinisher();
    }

    this.updateLock(playerInput.switchTarget);
    this.updateSpecial(dt, playerInput.special);
    this.player.update(dt, playerInput, camFwd, camRight);

    // Escort: drive the convoy toward the destination; enemies hunt IT, not the player.
    if (this.escortMode && this.ally?.alive) this.updateEscort(dt);
    const focus = this.escortMode && this.ally?.alive ? this.ally : this.player;
    const fv = focus.controller.velocity;
    for (const e of this.enemies) {
      if (!e.c.alive) continue;
      const input = e.ai.update(
        dt,
        e.c.getPosition(),
        e.c.controller.forwardDir,
        focus.getPosition(),
        fv,
        focus.healthPct,
      );
      e.c.update(dt, input, WORLD_FWD, WORLD_RIGHT);
    }

    this.projectiles.update(dt, this.targets);

    if (this.captureMode) this.updateCapture(dt);
    else if (this.zone) this.spinZoneRing(dt);

    if (!this.player.alive) this.state = "lost";
    else if (this.escortMode) {
      if (!this.ally || !this.ally.alive) this.state = "lost";
      else if (this.inZone(this.ally.getPosition())) this.state = "won";
    } else if (deathmatch && this.spawned >= this.cfg.killTarget && this.aliveCount === 0) this.state = "won";
    else if (this.captureMode && this.captureProgress >= 1) this.state = "won";
  }

  /** Steer the escorted convoy toward the destination zone; halt once it arrives. */
  private updateEscort(dt: number): void {
    const ally = this.ally!;
    const zone = this.zone!;
    const pos = ally.getPosition();
    const fwd = ally.controller.forwardDir;
    const dx = zone.x - pos.x;
    const dz = zone.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const heading = Math.atan2(fwd.x, fwd.z);
    let steer = Math.atan2(dx, dz) - heading;
    while (steer > Math.PI) steer -= Math.PI * 2;
    while (steer < -Math.PI) steer += Math.PI * 2;
    this.allyInput.move.x = Math.max(-1, Math.min(1, steer / 0.7));
    this.allyInput.move.y = dist > zone.radius * 0.7 ? 0.85 : 0; // ease off near the goal
    ally.update(dt, this.allyInput, WORLD_FWD, WORLD_RIGHT);
    this.spinZoneRing(dt);
  }

  private spinZoneRing(dt: number): void {
    if (this.zoneRing) this.zoneRing.rotation.y += dt * 0.6;
  }

  /** Fill the capture meter while the player holds the zone; drain when contested/empty. */
  private updateCapture(dt: number): void {
    const zone = this.zone!;
    const rate = 1 / zone.hold;
    const playerIn = this.player.alive && this.inZone(this.player.getPosition());
    const enemyIn = zone.contested && this.enemyInZone();

    if (playerIn) {
      // Enemies contesting the zone SLOW the capture but never reverse it while you hold.
      const factor = enemyIn ? CAPTURE_CONTEST_MUL : 1;
      this.captureProgress = Math.min(1, this.captureProgress + rate * factor * dt);
    } else {
      // Leave the zone and it bleeds back down.
      this.captureProgress = Math.max(0, this.captureProgress - rate * CAPTURE_DECAY_MUL * dt);
    }

    // Recolour the marker: cyan → gold as it fills; flash red when contested. Spin the ring.
    if (this.zoneMat) {
      this.zonePulse += dt * 6;
      const pulse = 0.7 + 0.3 * Math.sin(this.zonePulse);
      if (enemyIn) this.zoneMat.emissiveColor.set(1, 0.25, 0.15);
      else this.zoneMat.emissiveColor.set(0.15 + this.captureProgress * 0.85, 0.85, 1 - this.captureProgress * 0.55);
      this.zoneMat.emissiveColor.scaleInPlace(pulse);
    }
    this.spinZoneRing(dt);
  }

  /** Result once finished, else null. Stars + rewards come from the difficulty curve. */
  result(): MissionResult | null {
    if (this.state === "playing") return null;
    const time = this.elapsed;
    const kills = this.deadCount;
    const rew = rewardsFor(this.index, this.finale);

    if (this.cfg.type === "survival") {
      const stars = starsFor(this.cfg, this.index, time, 0);
      return { outcome: "won", stars, timeSec: time, scrap: rew.scrapBase + kills * rew.scrapPerKill };
    }
    if (this.state === "lost") {
      return { outcome: "lost", stars: 0, timeSec: time, scrap: kills * rew.scrapPerKill };
    }
    const stars = starsFor(this.cfg, this.index, time, this.player.healthPct);
    return { outcome: "won", stars, timeSec: time, scrap: rew.scrapBase + kills * rew.scrapPerKill };
  }
}
