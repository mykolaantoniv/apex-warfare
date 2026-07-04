import { Scene, Vector3, Color3, ShadowGenerator } from "@babylonjs/core";
import { createController, VehicleController } from "../vehicles/VehicleController";
import { Weapon } from "../vehicles/Weapon";
import { FeelDirector } from "../feel/FeelDirector";
import type { InputState, Target, Team, VehicleConfig } from "../core/types";

/** A fighting unit = vehicle controller + health + weapon. Implements Target (can be hit). */
export class Combatant implements Target {
  readonly controller: VehicleController;
  readonly team: Team;
  readonly name: string;
  readonly radius = 1.3;
  alive = true;
  /** Locked target for auto-aim + homing (player only; enemies leave null). */
  lockTarget: Target | null = null;

  private hp: number;
  private readonly maxHp: number;
  private readonly armor: number;
  private finisher = false;
  private readonly muzzle = new Vector3();
  private readonly recoil = new Vector3();
  private readonly aimDir = new Vector3();

  constructor(
    scene: Scene,
    cfg: VehicleConfig,
    team: Team,
    shadows: ShadowGenerator,
    spawn: Vector3,
    private readonly weapon: Weapon,
    private readonly feel: FeelDirector,
    accent: Color3,
  ) {
    this.team = team;
    this.name = cfg.name;
    this.controller = createController(scene, cfg, shadows, spawn, accent);
    this.maxHp = cfg.stats.maxHealth;
    this.hp = this.maxHp;
    this.armor = cfg.stats.armor;
  }

  get healthPct(): number {
    return Math.max(0, (this.hp / this.maxHp) * 100);
  }
  get maxHealth(): number {
    return this.maxHp;
  }

  /** Restore a fraction of max HP (special/repair ability). */
  heal(fraction: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
  }
  get ammo(): number {
    return this.weapon.ammo;
  }
  get reloading(): boolean {
    return this.weapon.reloading;
  }
  get magFraction(): number {
    return this.weapon.magazineFraction;
  }

  getPosition(): Vector3 {
    return this.controller.position;
  }

  markFinisher(): void {
    this.finisher = true;
  }

  takeDamage(amount: number, hitPos: Vector3, knock: Vector3): void {
    if (!this.alive) return;
    const dealt = amount * (1 - this.armor);
    this.hp -= dealt;
    this.controller.applyImpulse(knock);
    this.feel.hit(hitPos, dealt, false);
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.alive = false;
    const pos = this.controller.position.clone();
    if (this.finisher) this.feel.finisher(pos);
    else this.feel.killImpact(pos); // beefier-than-a-hit kill moment on every death (C3b)
    // Hand the controller off instead of disposing it: it becomes a pooled, charred wreck
    // (collapses/settles under physics, smokes for a while) and is torn down later by the
    // FeelDirector's Wrecks pool once the concurrent-wreck cap is exceeded.
    this.feel.wrecks.spawn(this.controller, pos);
  }

  update(dt: number, input: InputState, fwd: Vector3, right: Vector3): void {
    if (!this.alive) return;

    this.controller.fixedUpdate(dt, input, fwd, right);
    this.controller.frameUpdate(dt);
    this.weapon.update(dt);

    // Turret vehicles (tank) auto-aim at the locked target.
    this.controller.aimAt?.(this.lockTarget && this.lockTarget.alive ? this.lockTarget.getPosition() : null);

    const pct = this.hp / this.maxHp;
    if (pct < 0.66) this.feel.particles.damageSmoke(this.controller.position, pct < 0.33 ? 1 : 0.5);

    if (input.firing) {
      this.muzzle.copyFrom(this.controller.forwardDir).scaleInPlace(1.4).addInPlace(this.controller.position);
      this.muzzle.y += 0.1;

      // Auto-aim at the locked target if there is one, else fire straight ahead.
      let dir = this.controller.forwardDir;
      if (this.lockTarget && this.lockTarget.alive) {
        const tp = this.lockTarget.getPosition();
        this.aimDir.set(tp.x - this.muzzle.x, tp.y - this.muzzle.y, tp.z - this.muzzle.z).normalize();
        dir = this.aimDir;
      }

      if (this.weapon.tryFire(this.muzzle, dir, this.lockTarget)) {
        this.recoil.copyFrom(this.controller.forwardDir).scaleInPlace(-this.weapon.recoil * 3);
        this.controller.applyImpulse(this.recoil);
        if (this.team === "player") this.feel.fireKick();
      }
    }
  }

  dispose(): void {
    this.controller.dispose();
  }
}
