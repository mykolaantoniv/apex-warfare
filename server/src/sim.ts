import type { PlayerState } from "./schema";
import { emptyInput, type InputMessage } from "../../shared/net";
import { integrateMove } from "../../shared/sim";
import { profileFor } from "../../shared/vehicles";
import type { MapWorld } from "../../shared/maps";

/**
 * Authoritative per-player step. Movement itself lives in the shared `integrateMove` (using the
 * vehicle's profile + the map world) so the client predicts it identically; this wrapper adds
 * server-only concerns (fire cooldown, input-seq acknowledgement). Deterministic + Babylon-free.
 */

const FIRE_COOLDOWN = 0.28; // s between shots

export interface PlayerRuntime {
  input: InputMessage;
  fireCooldown: number;
}

export function newRuntime(): PlayerRuntime {
  return { input: emptyInput(), fireCooldown: 0 };
}

/** Advance one player by `dt` seconds under its latest input. Returns true if it fired. */
export function stepPlayer(p: PlayerState, rt: PlayerRuntime, dt: number, world: MapWorld): boolean {
  if (!p.alive) return false;
  const inp = rt.input;

  integrateMove(p, inp.moveX, inp.moveY, dt, profileFor(p.vehicleId), world);
  p.lastInputSeq = inp.seq;

  let fired = false;
  rt.fireCooldown = Math.max(0, rt.fireCooldown - dt);
  if (inp.firing && rt.fireCooldown <= 0) {
    rt.fireCooldown = FIRE_COOLDOWN;
    p.fireEvent++;
    fired = true;
  }
  return fired;
}
