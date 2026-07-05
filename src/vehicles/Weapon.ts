import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
} from "@babylonjs/core";
import type { AttackerTag, Target, Team } from "../core/types";
import type { WaterRegion } from "../data/types";
import { FeelDirector } from "../feel/FeelDirector";
import type { WeaponSfx } from "../feel/Audio";

/** Pick a muzzle-report voice from weapon stats: splash = cannon, fast = MG, else rifle. */
function weaponSfx(cfg: WeaponConfig): WeaponSfx {
  if (cfg.splashRadius > 0) return "cannon";
  return cfg.fireRate >= 4 ? "mg" : "rifle";
}

export interface WeaponConfig {
  id: string;
  name: string;
  damage: number;
  fireRate: number; // shots/sec
  magazine: number;
  reloadTime: number; // sec
  speed: number; // m/s
  lifetime: number; // sec
  splashRadius: number; // 0 = no splash
  spread: number; // deg cone
  recoil: number; // impulse magnitude
}

interface Projectile {
  mesh: Mesh;
  vel: Vector3;
  team: Team;
  dmg: number;
  splash: number;
  life: number;
  active: boolean;
  homing: Target | null;
  owner: AttackerTag;
}

const POOL = 96;
const DEG2RAD = Math.PI / 180;
const HOMING_TURN = 3.5; // how hard guided shots curve toward the locked target
const NO_OWNER: AttackerTag = { name: "", vehicle: "" };

/** Pooled ballistic projectiles with stretched tracers. No physics body per round. */
export class ProjectileSystem {
  private readonly pool: Projectile[] = [];
  private readonly scratchDir = new Vector3();
  private readonly look = new Vector3();
  private readonly knock = new Vector3();
  private readonly water: WaterRegion | null;
  /** Running total of post-armor damage the player's team has landed on enemies this mission
   * (drives the defeat/victory recap's "DAMAGE DEALT" stat, A2). */
  totalPlayerDamageDealt = 0;

  constructor(
    scene: Scene,
    private readonly feel: FeelDirector,
    private readonly bounds: { min: Vector3; max: Vector3 },
  ) {
    this.water = (scene.metadata as { water?: WaterRegion } | null)?.water ?? null;
    const playerMat = new StandardMaterial("tracerP", scene);
    playerMat.emissiveColor = new Color3(0.3, 0.95, 1);
    playerMat.disableLighting = true;
    const enemyMat = new StandardMaterial("tracerE", scene);
    enemyMat.emissiveColor = new Color3(1, 0.55, 0.15);
    enemyMat.disableLighting = true;

    for (let i = 0; i < POOL; i++) {
      const mesh = MeshBuilder.CreateBox(`shot${i}`, { width: 0.09, height: 0.09, depth: 0.7 }, scene);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.material = i % 2 === 0 ? playerMat : enemyMat; // reassigned on spawn
      mesh.metadata = { playerMat, enemyMat };
      this.pool.push({
        mesh,
        vel: new Vector3(),
        team: "player",
        dmg: 0,
        splash: 0,
        life: 0,
        active: false,
        homing: null,
        owner: NO_OWNER,
      });
    }
  }

  spawn(pos: Vector3, dir: Vector3, cfg: WeaponConfig, team: Team, homing: Target | null = null, owner: AttackerTag = NO_OWNER): void {
    const p = this.pool.find((x) => !x.active);
    if (!p) return;

    // Apply spread.
    this.scratchDir.copyFrom(dir).normalize();
    if (cfg.spread > 0) {
      const a = (Math.random() * 2 - 1) * cfg.spread * DEG2RAD;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const x = this.scratchDir.x * cos - this.scratchDir.z * sin;
      const z = this.scratchDir.x * sin + this.scratchDir.z * cos;
      this.scratchDir.x = x;
      this.scratchDir.z = z;
    }

    p.active = true;
    p.team = team;
    p.dmg = cfg.damage;
    p.splash = cfg.splashRadius;
    p.life = cfg.lifetime;
    p.homing = homing && homing.alive ? homing : null;
    p.owner = owner;
    p.vel.copyFrom(this.scratchDir).scaleInPlace(cfg.speed);
    p.mesh.position.copyFrom(pos);
    p.mesh.isVisible = true;
    const meta = p.mesh.metadata as { playerMat: StandardMaterial; enemyMat: StandardMaterial };
    p.mesh.material = team === "player" ? meta.playerMat : meta.enemyMat;

    this.feel.muzzle(pos, weaponSfx(cfg));
  }

  update(dt: number, targets: readonly Target[]): void {
    for (const p of this.pool) {
      if (!p.active) continue;

      // Guided: curve velocity toward the locked target, keeping speed.
      if (p.homing && p.homing.alive) {
        const tp = p.homing.getPosition();
        const pp = p.mesh.position;
        const tx = tp.x - pp.x;
        const ty = tp.y - pp.y;
        const tz = tp.z - pp.z;
        const td = Math.hypot(tx, ty, tz) || 1;
        const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
        const k = Math.min(1, dt * HOMING_TURN);
        p.vel.x += ((tx / td) * speed - p.vel.x) * k;
        p.vel.y += ((ty / td) * speed - p.vel.y) * k;
        p.vel.z += ((tz / td) * speed - p.vel.z) * k;
        const ns = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
        p.vel.scaleInPlace(speed / ns);
      }

      p.mesh.position.addInPlace(this.scratchDir.copyFrom(p.vel).scaleInPlace(dt));
      this.look.copyFrom(p.mesh.position).addInPlace(p.vel);
      p.mesh.lookAt(this.look);

      p.life -= dt;
      const pos = p.mesh.position;

      // Ground / bounds.
      if (pos.y <= 0.06) {
        this.impact(p, false);
        continue;
      }
      if (
        p.life <= 0 ||
        pos.x < this.bounds.min.x ||
        pos.x > this.bounds.max.x ||
        pos.z < this.bounds.min.z ||
        pos.z > this.bounds.max.z
      ) {
        this.deactivate(p);
        continue;
      }

      // Target hits (opposing team only).
      for (const t of targets) {
        if (!t.alive || t.team === p.team) continue;
        const tp = t.getPosition();
        const dx = tp.x - pos.x;
        const dy = tp.y - pos.y;
        const dz = tp.z - pos.z;
        const r = t.radius + 0.25;
        if (dx * dx + dy * dy + dz * dz <= r * r) {
          this.knock.copyFrom(p.vel).normalize().scaleInPlace(p.dmg * 0.35);
          const wasAlive = t.alive;
          const dealt = t.takeDamage(p.dmg, pos, this.knock, p.owner);
          if (p.team === "player" && t.team === "enemy") {
            this.totalPlayerDamageDealt += dealt;
            this.feel.playerLandedHit(wasAlive && !t.alive);
          }
          this.impact(p, true);
          break;
        }
      }
    }
  }

  private impact(p: Projectile, onTarget: boolean): void {
    const pos = p.mesh.position;
    const w = this.water;
    // Only world hits (not vehicle hits) care about the surface underneath.
    const overWater =
      !onTarget && w !== null && Math.abs(pos.x - w.x) < w.w / 2 && Math.abs(pos.z - w.z) < w.d / 2 && pos.y <= w.level + 0.4;
    if (p.splash > 0) {
      // Shell splash on water reads as a plume, not a fireball.
      if (overWater) {
        this.feel.particles.waterSpray(pos, 14);
        this.feel.explode(pos, 0.35);
      } else {
        this.feel.explode(pos, 0.8);
      }
    } else if (!onTarget) {
      // Bullet hits the ground/water: dirt puff or white splash.
      if (overWater) this.feel.particles.waterSpray(pos, 8);
      else this.feel.particles.groundDust(pos, 6);
    }
    this.deactivate(p);
  }

  private deactivate(p: Projectile): void {
    p.active = false;
    p.mesh.isVisible = false;
  }
}

/** Per-combatant weapon: cooldown, magazine, reload. */
export class Weapon {
  private cooldown = 0;
  private reloadTimer = 0;
  private mag: number;

  constructor(
    private readonly cfg: WeaponConfig,
    private readonly team: Team,
    private readonly projectiles: ProjectileSystem,
    private readonly owner: AttackerTag = NO_OWNER,
  ) {
    this.mag = cfg.magazine;
  }

  get ammo(): number {
    return this.mag;
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** 0..1 fraction of the magazine remaining (drives the fire-pad ring). */
  get magazineFraction(): number {
    if (this.reloadTimer > 0) return 1 - this.reloadTimer / this.cfg.reloadTime;
    return this.cfg.magazine > 0 ? this.mag / this.cfg.magazine : 1;
  }

  get recoil(): number {
    return this.cfg.recoil;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.mag = this.cfg.magazine;
    }
  }

  /** Fire if ready. Returns true if a round left the barrel. */
  tryFire(pos: Vector3, dir: Vector3, homing: Target | null = null): boolean {
    if (this.cooldown > 0 || this.reloadTimer > 0) return false;
    if (this.mag <= 0) {
      this.reloadTimer = this.cfg.reloadTime;
      return false;
    }
    this.projectiles.spawn(pos, dir, this.cfg, this.team, homing, this.owner);
    this.mag -= 1;
    this.cooldown = 1 / this.cfg.fireRate;
    if (this.mag <= 0) this.reloadTimer = this.cfg.reloadTime;
    return true;
  }
}
