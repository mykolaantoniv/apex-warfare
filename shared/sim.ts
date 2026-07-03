import type { MoveProfile } from "./vehicles";
import { inWater, type MapWorld } from "./maps";

/**
 * The single authoritative movement integration, shared verbatim by the server (authority)
 * and the client (prediction). Per-vehicle feel comes from the MoveProfile; the MapWorld adds
 * arena bounds and water blocking for ground vehicles. Pure + engine-free so prediction and
 * authority stay identical (tiny reconciliation).
 */

export interface MoveState {
  x: number;
  z: number;
  /** Heading yaw in radians (0 = +Z). */
  yaw: number;
  vx: number;
  vz: number;
}

/** Advance a movement state by `dt` seconds under steering `moveX` and throttle `moveY`. */
export function integrateMove(
  s: MoveState,
  moveX: number,
  moveY: number,
  dt: number,
  p: MoveProfile,
  world: MapWorld,
): void {
  s.yaw += moveX * p.turnRate * dt;
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);

  // Velocity chases heading * throttle * maxSpeed — accelerates to top speed and coasts to
  // rest on release; lagging behind heading gives natural drift/inertia through turns.
  const targetVx = fx * moveY * p.maxSpeed;
  const targetVz = fz * moveY * p.maxSpeed;
  const k = Math.min(1, (p.accel / p.maxSpeed) * dt);
  s.vx += (targetVx - s.vx) * k;
  s.vz += (targetVz - s.vz) * k;

  let nx = s.x + s.vx * dt;
  let nz = s.z + s.vz * dt;

  // Ground vehicles can't drive onto water. Check axes independently so they slide along the
  // shoreline instead of sticking; only block *entering* water (a unit spawned in it can leave).
  if (!p.water && world.water) {
    const wasIn = inWater(s.x, s.z, world.water);
    if (!wasIn) {
      if (inWater(nx, s.z, world.water)) {
        nx = s.x;
        s.vx = 0;
      }
      if (inWater(s.x, nz, world.water)) {
        nz = s.z;
        s.vz = 0;
      }
    }
  }

  // Keep inside the arena.
  const h = world.half - 2;
  if (nx < -h) {
    nx = -h;
    s.vx = 0;
  } else if (nx > h) {
    nx = h;
    s.vx = 0;
  }
  if (nz < -h) {
    nz = -h;
    s.vz = 0;
  } else if (nz > h) {
    nz = h;
    s.vz = 0;
  }

  s.x = nx;
  s.z = nz;
}
