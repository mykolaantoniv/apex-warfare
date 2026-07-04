import type { VehicleConfig } from "../core/types";
import type { WeaponConfig } from "../vehicles/Weapon";
import type { MapConfig, MissionConfig, UpgradeTree } from "./types";

import hornet from "./content/vehicles/heli-hornet.json";
import mule from "./content/vehicles/heli-mule.json";
import talon from "./content/vehicles/jet-talon.json";
import boulder from "./content/vehicles/tank-boulder.json";
import pest from "./content/vehicles/heli-pest.json";
import wasp from "./content/vehicles/heli-wasp.json";
import brute from "./content/vehicles/heli-brute.json";
import bikeScout from "./content/vehicles/bike-scout.json";
import soldierGrunt from "./content/vehicles/soldier-grunt.json";
import boatGunner from "./content/vehicles/boat-gunner.json";
import tankRaider from "./content/vehicles/tank-raider.json";

import wVulcan from "./content/weapons/weapon-vulcan.json";
import wMule from "./content/weapons/weapon-mule-cannon.json";
import wTalon from "./content/weapons/weapon-talon-cannon.json";
import wBoulder from "./content/weapons/weapon-boulder-cannon.json";
import wPest from "./content/weapons/weapon-pest-cannon.json";
import wWasp from "./content/weapons/weapon-wasp-mg.json";
import wBrute from "./content/weapons/weapon-brute-cannon.json";
import wScout from "./content/weapons/weapon-scout-mg.json";
import wRifle from "./content/weapons/weapon-rifle.json";
import wGunboat from "./content/weapons/weapon-gunboat.json";
import wRaider from "./content/weapons/weapon-raider-cannon.json";

import mapShower from "./content/maps/map-shower.json";
import mapSink from "./content/maps/map-sink.json";
import mapLocker from "./content/maps/map-locker.json";
import mapFrost from "./content/maps/map-frost.json";
import mapFoundry from "./content/maps/map-foundry.json";

import mShower1 from "./content/missions/m-shower-1.json";
import mShower2 from "./content/missions/m-shower-2.json";
import mShower3 from "./content/missions/m-shower-3.json";
import mSink1 from "./content/missions/m-sink-1.json";
import mSink2 from "./content/missions/m-sink-2.json";
import mSink3 from "./content/missions/m-sink-3.json";
import mLocker1 from "./content/missions/m-locker-1.json";
import mLocker2 from "./content/missions/m-locker-2.json";
import mLocker3 from "./content/missions/m-locker-3.json";
import mFrost1 from "./content/missions/m-frost-1.json";
import mFrost2 from "./content/missions/m-frost-2.json";
import mFoundry1 from "./content/missions/m-foundry-1.json";
import mFoundry2 from "./content/missions/m-foundry-2.json";

import tHornet from "./content/trees/tree-hornet.json";
import tMule from "./content/trees/tree-mule.json";
import tTalon from "./content/trees/tree-talon.json";
import tBoulder from "./content/trees/tree-boulder.json";

function index<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const it of items) map[it.id] = it;
  return map;
}

const vehicles = [
  hornet,
  mule,
  talon,
  boulder,
  pest,
  wasp,
  brute,
  bikeScout,
  soldierGrunt,
  boatGunner,
  tankRaider,
] as unknown as VehicleConfig[];
const weapons = [
  wVulcan,
  wMule,
  wTalon,
  wBoulder,
  wPest,
  wWasp,
  wBrute,
  wScout,
  wRifle,
  wGunboat,
  wRaider,
] as unknown as WeaponConfig[];
const maps = [mapShower, mapSink, mapLocker, mapFrost, mapFoundry] as unknown as MapConfig[];
const missions = [
  mShower1,
  mShower2,
  mShower3,
  mSink1,
  mSink2,
  mSink3,
  mLocker1,
  mLocker2,
  mLocker3,
  mFrost1,
  mFrost2,
  mFoundry1,
  mFoundry2,
] as unknown as MissionConfig[];
const trees = [tHornet, tMule, tTalon, tBoulder] as unknown as UpgradeTree[];

const vehicleMap = index(vehicles);
const weaponMap = index(weapons);
const mapMap = index(maps);
const missionMap = index(missions);
const treeMap = index(trees);

function need<T>(map: Record<string, T>, id: string, kind: string): T {
  const v = map[id];
  if (!v) throw new Error(`Content: missing ${kind} "${id}"`);
  return v;
}

export const Content = {
  /** Player-selectable roster, in unlock order. */
  playerVehicleOrder: ["heli-hornet", "heli-mule", "jet-talon", "tank-boulder"] as const,
  mapOrder: ["map-shower", "map-sink", "map-locker", "map-frost", "map-foundry"] as const,
  /** Canonical campaign order (drives campaign index + "previous"-type unlocks). */
  missionOrder: [
    "m-shower-1",
    "m-shower-2",
    "m-shower-3",
    "m-sink-1",
    "m-sink-2",
    "m-sink-3",
    "m-locker-1",
    "m-locker-2",
    "m-locker-3",
    "m-frost-1",
    "m-frost-2",
    "m-foundry-1",
    "m-foundry-2",
  ] as const,

  vehicle: (id: string): VehicleConfig => need(vehicleMap, id, "vehicle"),
  weapon: (id: string): WeaponConfig => need(weaponMap, id, "weapon"),
  map: (id: string): MapConfig => need(mapMap, id, "map"),
  mission: (id: string): MissionConfig => need(missionMap, id, "mission"),
  tree: (id: string): UpgradeTree => need(treeMap, id, "tree"),

  missionsForMap(mapId: string): MissionConfig[] {
    return this.missionOrder.map((id) => need(missionMap, id, "mission")).filter((m) => m.mapId === mapId);
  },

  /** Validate all cross-references at boot — fail loud on broken content. */
  verify(): void {
    for (const v of vehicles) {
      this.weapon(v.weaponId);
      if (v.upgradeTreeId) this.tree(v.upgradeTreeId);
    }
    for (const m of missions) {
      this.map(m.mapId);
      for (const id of m.enemyRoster) this.weapon(this.vehicle(id).weaponId);
    }
    for (const t of trees) this.vehicle(t.vehicleId);
  },
};
