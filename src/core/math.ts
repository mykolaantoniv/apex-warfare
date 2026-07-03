import { Vector3 } from "@babylonjs/core";

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-path angular lerp (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}

/**
 * Framerate-independent exponential damping factor.
 * `lerp(a, b, expDamp(dt, rate))` converges to b at a rate independent of dt.
 */
export const expDamp = (dt: number, rate: number): number => 1 - Math.exp(-rate * dt);

export const easeOutQuad = (t: number): number => t * (2 - t);

/** Reusable scratch vectors — avoid per-frame allocations in hot loops. */
export const scratch = {
  a: new Vector3(),
  b: new Vector3(),
  c: new Vector3(),
  d: new Vector3(),
};
