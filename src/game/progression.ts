import { Content } from "../data/Content";
import type { Save } from "../save/Save";
import type { MissionConfig, UpgradeNode, UpgradeTree } from "../data/types";
import type { VehicleConfig } from "../core/types";

/** Is a mission available to play given current progress? */
export function isMissionUnlocked(save: Save, mission: MissionConfig): boolean {
  switch (mission.unlock.type) {
    case "start":
      return true;
    case "stars":
      return save.totalStars() >= mission.unlock.required;
    case "previous": {
      const order = Content.missionOrder;
      const idx = order.indexOf(mission.id as (typeof order)[number]);
      if (idx <= 0) return true;
      const prev = order[idx - 1]!;
      return save.stars(prev) > 0;
    }
  }
}

/** Vehicle unlock rule satisfied? */
export function isVehicleEligible(save: Save, vehicle: VehicleConfig): boolean {
  switch (vehicle.unlock.type) {
    case "start":
      return true;
    case "stars":
      return save.totalStars() >= vehicle.unlock.required;
    case "previous":
      return true;
  }
}

/** Requirement text for a still-locked vehicle. */
export function vehicleLockLabel(vehicle: VehicleConfig): string {
  return vehicle.unlock.type === "stars" ? `★ ${vehicle.unlock.required} to unlock` : "Locked";
}

/** Unlock any player vehicles whose requirements are now met. */
export function syncVehicleUnlocks(save: Save): void {
  for (const id of Content.playerVehicleOrder) {
    const v = Content.vehicle(id);
    if (!save.isVehicleUnlocked(id) && isVehicleEligible(save, v)) save.unlockVehicle(id);
  }
}

export function isUpgradeBuyable(save: Save, tree: UpgradeTree, node: UpgradeNode): boolean {
  if (save.ownsUpgrade(tree.id, node.id)) return false;
  if (node.requires && !save.ownsUpgrade(tree.id, node.requires)) return false;
  return save.data.scrap >= node.cost;
}
