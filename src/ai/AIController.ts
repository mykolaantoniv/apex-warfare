import { Vector3 } from "@babylonjs/core";
import type { InputState } from "../core/types";
import { clamp } from "../core/math";

export type Archetype = "rusher" | "sniper";

interface Profile {
  desiredRange: number;
  fireRange: number;
  lead: number;
}

const PROFILES: Record<Archetype, Profile> = {
  rusher: { desiredRange: 14, fireRange: 40, lead: 0.15 },
  sniper: { desiredRange: 26, fireRange: 55, lead: 0.3 },
};

const TWO_PI = Math.PI * 2;

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= TWO_PI;
  while (x < -Math.PI) x += TWO_PI;
  return x;
}

/**
 * Enemy AI for the drive-forward flight model: steer the heading toward a desired travel
 * direction (approach / back off / circle-strafe) and throttle forward; fire when facing
 * the target and in range. Emits a synthetic InputState the shared controller consumes.
 */
export class AIController {
  private readonly input: InputState = {
    move: { x: 0, y: 0 },
    firing: false,
    switchTarget: false,
    special: false,
  };
  private readonly profile: Profile;
  private readonly predicted = new Vector3();

  private strafeSign: number = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;

  constructor(archetype: Archetype) {
    this.profile = PROFILES[archetype];
  }

  update(
    dt: number,
    selfPos: Vector3,
    selfForward: Vector3,
    targetPos: Vector3,
    targetVel: Vector3,
    selfHpPct: number,
  ): InputState {
    this.predicted.copyFrom(targetVel).scaleInPlace(this.profile.lead).addInPlace(targetPos);
    const dx = this.predicted.x - selfPos.x;
    const dz = this.predicted.z - selfPos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    const range = selfHpPct < 30 ? this.profile.desiredRange + 8 : this.profile.desiredRange;

    // Desired travel direction (world).
    let desX: number;
    let desZ: number;
    if (dist > range + 4) {
      desX = nx;
      desZ = nz; // close in
    } else if (dist < range - 4) {
      desX = -nx;
      desZ = -nz; // back off
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeSign *= -1;
        this.strafeTimer = 2 + Math.random() * 2;
      }
      desX = -nz * this.strafeSign;
      desZ = nx * this.strafeSign;
    }

    // Steer heading toward desired direction.
    const headingAngle = Math.atan2(selfForward.x, selfForward.z);
    const steerDiff = wrapAngle(Math.atan2(desX, desZ) - headingAngle);
    this.input.move.x = clamp(steerDiff / 0.8, -1, 1);
    this.input.move.y = 0.7; // throttle forward

    // Fire when roughly facing the actual target and in range.
    const faceDiff = Math.abs(wrapAngle(Math.atan2(nx, nz) - headingAngle));
    this.input.firing = dist < this.profile.fireRange && faceDiff < 0.5;
    return this.input;
  }
}
