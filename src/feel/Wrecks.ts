import { Vector3 } from "@babylonjs/core";
import type { VehicleController } from "../vehicles/VehicleController";
import { Particles } from "./Particles";

const MAX_WRECKS = 6; // soft cap — the normal target concurrent wreck count (C3b AC1)
const HARD_CAP = 9; // absolute perf ceiling even if the oldest hasn't hit MIN_LIFE_S yet
const MIN_LIFE_S = 10; // a wreck must stay on screen at least this long before it can be evicted
const SMOKE_DURATION_S = 9; // rising smoke column keeps feeding for ~9s after death
const SMOKE_RATE = 5; // particles/sec fed into the column per active young wreck

interface WreckEntry {
  readonly controller: VehicleController;
  age: number;
  smokeAccum: number;
  readonly lastPos: Vector3;
}

/**
 * Owns the pooled "death moment" wreck lifecycle. Every kill hands its `VehicleController` here
 * instead of being disposed immediately: the controller becomes a charred, collapsed wreck (see
 * `VehicleController.kill()`) that keeps settling under Havok while this class feeds its rising
 * smoke column. Up to `MAX_WRECKS` stay in the world at once; the oldest is fully torn down
 * (physics + mesh, freed via `controller.dispose()`) with a small dust puff once a new kill would
 * push the pool past its cap. Nothing here allocates meshes/materials/particle systems per kill —
 * a wreck reuses the dying vehicle's own mesh, and the smoke column reuses one pooled
 * `ParticleSystem` (see `Particles.wreckSmoke`).
 */
export class Wrecks {
  private readonly active: WreckEntry[] = [];

  constructor(private readonly particles: Particles) {}

  /** Register a freshly-killed vehicle as a wreck. */
  spawn(controller: VehicleController, pos: Vector3): void {
    controller.kill(); // char in place + a small toppling impulse; no new allocations
    this.active.push({ controller, age: 0, smokeAccum: 0, lastPos: pos.clone() });
    this.evictOverflow();
  }

  /** Called once per frame from `FeelDirector.update` regardless of mission state, so wrecks
   *  keep settling/smoking even after the mission has ended. */
  update(dt: number): void {
    for (const e of this.active) {
      e.age += dt;
      e.controller.frameUpdate(dt); // keep the wreck's visual synced to physics (fall/topple/rest)
      e.lastPos.copyFrom(e.controller.position);
      if (e.age < SMOKE_DURATION_S) {
        e.smokeAccum += dt * SMOKE_RATE;
        if (e.smokeAccum >= 1) {
          const n = Math.floor(e.smokeAccum);
          this.particles.wreckSmoke(e.lastPos, n);
          e.smokeAccum -= n;
        }
      }
    }
    this.evictOverflow();
  }

  private evictOverflow(): void {
    while (this.active.length > MAX_WRECKS) {
      const oldest = this.active[0]!;
      if (oldest.age < MIN_LIFE_S && this.active.length <= HARD_CAP) break;
      this.active.shift();
      this.particles.groundDust(oldest.lastPos, 10); // small settling-dust puff as it's cleared
      oldest.controller.dispose();
    }
  }

  /** Scene teardown: free every remaining wreck's physics/mesh. */
  dispose(): void {
    for (const e of this.active) e.controller.dispose();
    this.active.length = 0;
  }
}
