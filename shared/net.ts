/**
 * Shared network protocol between the Apex Warfare client and the authoritative
 * Colyseus server. Plain types + constants only (no engine/Babylon imports) so both
 * sides can consume it. The Schema state classes live server-side (server/src/schema).
 */

export const ARENA_ROOM = "arena";

/** Authoritative simulation rate. Client renders interpolated between snapshots. */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

export type GameMode = "pvp" | "coop";

/** Client → server, sent every client frame (or on change). `seq` drives reconciliation. */
export interface InputMessage {
  /** Monotonic client input sequence number; server echoes the last one it applied. */
  seq: number;
  /** Steering, [-1, 1]. Positive = turn right. */
  moveX: number;
  /** Throttle, [-1, 1]. Positive = forward. */
  moveY: number;
  firing: boolean;
  switchTarget: boolean;
  special: boolean;
}

/** Options passed on room join / matchmaking. */
export interface JoinOptions {
  name?: string;
  mode?: GameMode;
  mapId?: string;
  vehicleId?: string;
}

export function emptyInput(): InputMessage {
  return { seq: 0, moveX: 0, moveY: 0, firing: false, switchTarget: false, special: false };
}
