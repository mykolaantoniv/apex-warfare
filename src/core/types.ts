// Shared types for Apex Warfare. Only type-only Babylon imports so any module can use it.
import type { Vector3 } from "@babylonjs/core";

export type QualityTier = "low" | "med" | "high" | "ultra";

export type Team = "player" | "enemy";

/** Anything a projectile can hit and damage. */
export interface Target {
  readonly team: Team;
  readonly radius: number;
  alive: boolean;
  getPosition(): Vector3;
  takeDamage(amount: number, hitPos: Vector3, knock: Vector3): void;
}

/** Normalized twin-stick input. x = strafe (right +), y = forward (+). Magnitude 0..1. */
export interface StickVector {
  x: number;
  y: number;
}

export interface InputState {
  /** Left stick — steer (x) + throttle (y). */
  move: StickVector;
  /** Fire button held. */
  firing: boolean;
  /** Edge: cycle the locked target (true for one frame on press). */
  switchTarget: boolean;
  /** Edge: activate the special/ability (true for one frame on press). */
  special: boolean;
}

/** Subset of the vehicle schema (see game-data-designer skill) used by the controllers. */
export interface VehicleMovement {
  model: "heli" | "jet" | "tank" | "bike" | "boat" | "soldier";
  mass: number;
  maxSpeed: number;
  accelForce: number;
  linearDamping: number;
  angularDamping: number;
  turnRate: number; // deg/s
  hoverLift: boolean;
  hoverHeight: number; // target altitude for helis (m)
  bankAngleMax: number; // deg, cosmetic
}

export interface VehicleStats {
  maxHealth: number;
  armor: number; // 0..1 damage reduction
}

export type UnlockRule =
  | { type: "start" }
  | { type: "previous" }
  | { type: "stars"; required: number };

export interface VehicleConfig {
  id: string;
  name: string;
  class: string;
  movement: VehicleMovement;
  stats: VehicleStats;
  visual: {
    scale: number;
    /** Optional CC0 glTF/GLB in public/models/ (e.g. "models/heli.glb"). Falls back to
     * the built-in primitive mesh if absent or if loading fails. */
    modelUrl?: string;
    /** Uniform scale applied to the loaded GLB (its units differ from our primitives). */
    modelScale?: number;
    /** Yaw correction (deg) so the model's nose points +Z. */
    yawOffset?: number;
    /** Vertical offset (m) so the model rests correctly on the physics proxy. */
    heightOffset?: number;
  };
  weaponId: string;
  upgradeTreeId: string;
  unlock: UnlockRule;
}
