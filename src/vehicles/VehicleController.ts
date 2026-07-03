import { Scene, Color3, ShadowGenerator, Vector3 } from "@babylonjs/core";
import type { InputState, VehicleConfig } from "../core/types";
import { HeliController } from "./HeliController";
import { JetController } from "./JetController";
import { TankController } from "./TankController";
import { GroundController } from "./GroundController";

/** Common interface every vehicle controller (heli/jet/tank) implements. */
export interface VehicleController {
  readonly position: Vector3;
  readonly velocity: Vector3;
  /** Unit forward (where the nose/turret points) — bullets fire along this. */
  readonly forwardDir: Vector3;
  fixedUpdate(dt: number, input: InputState, fwd: Vector3, right: Vector3): void;
  frameUpdate(dt: number): void;
  applyImpulse(impulse: Vector3): void;
  /** Point a turret (tank) at a world position; no-op for vehicles without a turret. */
  aimAt?(target: Vector3 | null): void;
  kill(): void;
  dispose(): void;
}

export function createController(
  scene: Scene,
  cfg: VehicleConfig,
  shadows: ShadowGenerator,
  spawn: Vector3,
  accent: Color3,
): VehicleController {
  switch (cfg.movement.model) {
    case "heli":
      return new HeliController(scene, cfg, shadows, spawn, accent);
    case "jet":
      return new JetController(scene, cfg, shadows, spawn, accent);
    case "tank":
      return new TankController(scene, cfg, shadows, spawn, accent);
    case "bike":
    case "boat":
    case "soldier":
      return new GroundController(scene, cfg, shadows, spawn, accent);
    default:
      throw new Error(`Unknown movement model: ${String(cfg.movement.model)}`);
  }
}
