/**
 * Minimal per-map world data the shared sim needs: arena half-extent (for bounds) and the
 * water region (rectangle on the XZ plane) that ground vehicles can't cross. Mirrors the
 * relevant fields of the map content JSON. Engine-free so the server can use it too.
 */

export interface WaterRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface MapWorld {
  /** Half the arena size; vehicles are clamped to ±(half-2). */
  half: number;
  water?: WaterRect;
}

export const MAP_WORLDS: Record<string, MapWorld> = {
  "map-locker": { half: 95, water: { x: 48, z: 0, w: 34, d: 190 } }, // Highland Pass
  "map-shower": { half: 90, water: { x: 40, z: -30, w: 50, d: 44 } }, // Dust Basin
  "map-sink": { half: 85, water: { x: 0, z: 12, w: 170, d: 22 } }, // Riverside
  "map-frost": { half: 90, water: { x: 46, z: 0, w: 30, d: 150 } }, // Frostline
  "map-foundry": { half: 88 }, // The Foundry (no water)
};

export function worldFor(mapId: string): MapWorld {
  return MAP_WORLDS[mapId] ?? { half: 90 };
}

/** True if (x,z) is inside the water rectangle. */
export function inWater(x: number, z: number, w: WaterRect): boolean {
  return Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2;
}
