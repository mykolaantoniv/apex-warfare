import type { VehicleConfig } from "../core/types";
import type { WeaponConfig } from "../vehicles/Weapon";
import { Content } from "../data/Content";

export interface ResolvedVehicle {
  vehicle: VehicleConfig;
  weapon: WeaponConfig;
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function getPath(root: Record<string, unknown>, path: string): number {
  const parts = path.split(".");
  let obj: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]!] as Record<string, unknown>;
  return obj[parts[parts.length - 1]!] as number;
}

function setPath(root: Record<string, unknown>, path: string, value: number): void {
  const parts = path.split(".");
  let obj: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]!] as Record<string, unknown>;
  obj[parts[parts.length - 1]!] = value;
}

/**
 * Resolve a vehicle + its weapon with owned upgrade nodes applied.
 * All additive terms are applied first, then all multiplicative — order-independent.
 */
export function resolveVehicle(vehicleId: string, ownedNodeIds: readonly string[]): ResolvedVehicle {
  const base = Content.vehicle(vehicleId);
  const vehicle = clone(base);
  const weapon = clone(Content.weapon(base.weaponId));

  if (base.upgradeTreeId) {
    const tree = Content.tree(base.upgradeTreeId);
    const owned = new Set(ownedNodeIds);
    const nodes = Object.values(tree.branches)
      .flat()
      .filter((n) => owned.has(n.id));

    const root: Record<string, unknown> = { movement: vehicle.movement, stats: vehicle.stats, weapon };
    for (const n of nodes) if (n.add) setPath(root, n.path, getPath(root, n.path) + n.add);
    for (const n of nodes) if (n.mul && n.mul !== 1) setPath(root, n.path, getPath(root, n.path) * n.mul);
  }

  return { vehicle, weapon };
}
