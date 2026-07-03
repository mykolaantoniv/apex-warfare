import type { UnlockRule } from "../core/types";

export type RGB = [number, number, number];

export interface MapPalette {
  floor: RGB;
  grout: RGB;
  wall: RGB;
  accent: RGB;
  fog: RGB;
  clear: RGB;
}

/** Rectangular water body (lake/river). Boats float at `level` and stay inside it. */
export interface WaterRegion {
  x: number;
  z: number;
  w: number;
  d: number;
  level: number;
}

export interface MapConfig {
  id: string;
  name: string;
  theme: string;
  half: number; // arena half-extent (m)
  fogDensity: number;
  sunDir: RGB;
  palette: MapPalette;
  /** Cover boxes: [x, z, yawDeg]. */
  cover: Array<[number, number, number]>;
  /** Decorative floor drains: [x, z]. */
  drains: Array<[number, number]>;
  /** Optional lake/river. Boats spawn + patrol here; visual water plane at `level`. */
  water?: WaterRegion;
  spawns: {
    player: [number, number];
    enemy: Array<[number, number]>;
  };
}

export type MissionType = "deathmatch" | "survival" | "capture" | "extract" | "escort";

/** Objective zone: capture/extract = hold it; escort = the convoy's destination. */
export interface CaptureZone {
  x: number;
  z: number;
  radius: number;
  hold: number; // seconds of clean holding to reach 100% (capture/extract)
  contested: boolean; // enemies inside the zone slow the meter
}

/** Escort ally (a friendly convoy the player must protect to the destination zone). */
export interface EscortAlly {
  vehicleId: string;
  spawn: [number, number];
}

export interface MissionConfig {
  id: string;
  mapId: string;
  name: string;
  type: MissionType;
  /** Deathmatch: total enemies to destroy. Survival/Capture: enemies keep spawning. */
  killTarget: number;
  /** Enemy VEHICLE ids to draw from (weapon comes from each vehicle's weaponId). */
  enemyRoster: string[];
  /** Boss finale: guarantees roster[0] (the boss) spawns first + framing. */
  finale: boolean;
  /** Capture/extract: zone to hold. Escort: the convoy's destination. */
  zone?: CaptureZone;
  /** Escort missions: the friendly convoy to protect. */
  ally?: EscortAlly;
  unlock: UnlockRule;
}
// Difficulty, star thresholds, and rewards are derived from the campaign index —
// see src/game/difficulty.ts (single global curve).

export interface UpgradeNode {
  id: string;
  label: string;
  /** Dot-path into the resolved vehicle (e.g. "stats.maxHealth", "weapon.damage"). */
  path: string;
  add: number; // additive term (0 = none)
  mul: number; // multiplicative factor (1 = none)
  cost: number; // Scrap
  requires: string; // node id that must be owned first ("" = none)
}

export type UpgradeBranch = "armor" | "damage" | "mobility" | "special";

export interface UpgradeTree {
  id: string;
  vehicleId: string;
  branches: Record<UpgradeBranch, UpgradeNode[]>;
}
