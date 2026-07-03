import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "apex-warfare";
const STORE = "save";
const KEY = "player";
const VERSION = 1;

export interface SaveData {
  version: number;
  scrap: number;
  unlockedVehicles: string[];
  selectedVehicle: string;
  missionStars: Record<string, number>; // best stars (0..3) per mission
  missionBestTime: Record<string, number>; // best time (s) per mission
  purchasedUpgrades: Record<string, string[]>; // node ids per tree
  settings: { volume: number };
  tutorialDone: boolean; // first-mission coach marks already shown
}

function defaults(): SaveData {
  return {
    version: VERSION,
    scrap: 0,
    unlockedVehicles: ["heli-hornet"],
    selectedVehicle: "heli-hornet",
    missionStars: {},
    missionBestTime: {},
    purchasedUpgrades: {},
    settings: { volume: 0.5 },
    tutorialDone: false,
  };
}

/** Persistent progression via IndexedDB. Validates shape on load; falls back to defaults. */
export class Save {
  data: SaveData = defaults();
  private db: IDBPDatabase | null = null;

  async load(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        },
      });
      const stored = (await this.db.get(STORE, KEY)) as Partial<SaveData> | undefined;
      if (stored && stored.version === VERSION) {
        this.data = { ...defaults(), ...stored, settings: { ...defaults().settings, ...stored.settings } };
      }
    } catch (err) {
      console.warn("[apex] save load failed; using defaults", err);
    }
  }

  async persist(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.put(STORE, this.data, KEY);
    } catch (err) {
      console.warn("[apex] save persist failed", err);
    }
  }

  /** Wipe all progression back to a fresh start. */
  async reset(): Promise<void> {
    this.data = defaults();
    await this.persist();
  }

  totalStars(): number {
    let n = 0;
    for (const v of Object.values(this.data.missionStars)) n += v;
    return n;
  }

  stars(missionId: string): number {
    return this.data.missionStars[missionId] ?? 0;
  }

  bestTime(missionId: string): number {
    return this.data.missionBestTime[missionId] ?? 0;
  }

  /** Record a completed mission; keeps best stars and best time (by direction). */
  recordResult(missionId: string, stars: number, timeSec: number, lowerTimeIsBetter: boolean): void {
    const prevStars = this.data.missionStars[missionId] ?? 0;
    if (stars > prevStars) this.data.missionStars[missionId] = stars;

    const prev = this.data.missionBestTime[missionId];
    if (prev === undefined) this.data.missionBestTime[missionId] = timeSec;
    else if (lowerTimeIsBetter ? timeSec < prev : timeSec > prev) {
      this.data.missionBestTime[missionId] = timeSec;
    }
  }

  addScrap(n: number): void {
    this.data.scrap += n;
  }

  spendScrap(n: number): boolean {
    if (this.data.scrap < n) return false;
    this.data.scrap -= n;
    return true;
  }

  isVehicleUnlocked(id: string): boolean {
    return this.data.unlockedVehicles.includes(id);
  }

  unlockVehicle(id: string): void {
    if (!this.data.unlockedVehicles.includes(id)) this.data.unlockedVehicles.push(id);
  }

  ownedUpgrades(treeId: string): string[] {
    return this.data.purchasedUpgrades[treeId] ?? [];
  }

  ownsUpgrade(treeId: string, nodeId: string): boolean {
    return this.ownedUpgrades(treeId).includes(nodeId);
  }

  addUpgrade(treeId: string, nodeId: string): void {
    const list = this.data.purchasedUpgrades[treeId] ?? [];
    if (!list.includes(nodeId)) list.push(nodeId);
    this.data.purchasedUpgrades[treeId] = list;
  }
}
