import { Scene, Engine, Vector3 } from "@babylonjs/core";
import { CameraRig } from "../engine/CameraRig";
import { Particles } from "./Particles";
import { Audio, WeaponSfx } from "./Audio";
import { DamageNumbers } from "./DamageNumbers";
import type { Hud } from "../ui/Hud";

/**
 * Central "juice" hub. Callers fire one method and get the whole stack —
 * particles + flash + screenshake + zoom-punch + hitstop + audio + damage numbers.
 */
export class FeelDirector {
  readonly particles: Particles;
  readonly numbers: DamageNumbers;

  private hud: Hud | null = null;
  private stopMs = 0;

  constructor(
    scene: Scene,
    engine: Engine,
    private readonly camera: CameraRig,
    readonly audio: Audio,
  ) {
    this.particles = new Particles(scene);
    this.numbers = new DamageNumbers(scene, engine);
  }

  bindHud(hud: Hud): void {
    this.hud = hud;
  }

  dispose(): void {
    this.audio.stopEngine();
    this.numbers.dispose();
  }

  /** 1 = normal, 0.05 = frozen during hitstop. Game multiplies gameplay dt by this. */
  get timeScale(): number {
    return this.stopMs > 0 ? 0.05 : 1;
  }

  muzzle(pos: Vector3, kind: WeaponSfx = "cannon"): void {
    this.particles.muzzle(pos);
    this.audio.fire(kind, pos);
  }

  /**
   * Per-frame movement FX for the player: heli rotor downwash, wheel/track dust, or boat wake.
   * `groundPos` is the ground/waterline contact point behind the vehicle.
   */
  vehicleTrail(groundPos: Vector3, speed01: number, model: string, overWater: boolean): void {
    if (overWater) {
      if (model === "boat" || model === "heli" || speed01 > 0.05) {
        this.particles.waterSpray(groundPos, model === "boat" ? 3 : 2);
      }
    } else if (model === "heli") {
      this.particles.groundDust(groundPos, 2); // constant downwash
    } else if (speed01 > 0.12) {
      this.particles.groundDust(groundPos, 2); // wheels/tracks kick dust when moving
    }
  }

  /** Tiny screen kick when the player pulls the trigger. */
  fireKick(): void {
    this.camera.addTrauma(0.035);
  }

  hit(pos: Vector3, damage: number, crit = false): void {
    this.particles.burstSparks(pos, crit ? 14 : 8);
    this.particles.flash(pos, 20, 60);
    this.numbers.spawn(pos, damage, crit);
    this.camera.addTrauma(crit ? 0.22 : 0.14);
    this.stopMs = Math.max(this.stopMs, crit ? 70 : 45);
    this.audio.hit(pos);
  }

  explode(pos: Vector3, power: number): void {
    this.particles.explosion(pos, power);
    this.camera.addTrauma(Math.min(0.8, 0.35 * power));
    this.camera.zoomPunch(Math.min(0.18, 0.1 * power));
    this.stopMs = Math.max(this.stopMs, 60 * power);
    this.audio.explosion(power, pos);
  }

  /** Mission-final kill: heavier slow-mo + zoom for the money shot. */
  finisher(pos: Vector3): void {
    this.explode(pos, 1.6);
    this.camera.zoomPunch(0.28);
    this.stopMs = Math.max(this.stopMs, 340);
  }

  /** Player round connected — drive HUD hit marker / kill feed. */
  playerLandedHit(killed: boolean): void {
    this.hud?.flashHitMarker(killed);
    if (killed) this.hud?.killFeed();
  }

  update(dtRealMs: number): void {
    if (this.stopMs > 0) this.stopMs -= dtRealMs;
    this.particles.update(dtRealMs);
    this.numbers.update(dtRealMs / 1000);
  }
}
