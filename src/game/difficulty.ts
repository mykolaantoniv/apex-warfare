import { Content } from "../data/Content";
import type { MissionConfig } from "../data/types";

/** Effective per-mission difficulty, derived from campaign index (single global curve). */
export interface MissionDifficulty {
  enemyHealthMul: number;
  enemyDamageMul: number;
  maxConcurrent: number;
  spawnInterval: number;
}

// Campaign length is derived from the actual mission order (was hardcoded to 9 while the campaign
// grew to 13, which pushed late-mission difficulty + star pars off the intended curve).
const TOTAL = Content.missionOrder.length;

/** Position of a mission in the canonical campaign order (0..TOTAL-1). */
export function campaignIndexOf(missionId: string): number {
  const order = Content.missionOrder;
  const i = order.indexOf(missionId as (typeof order)[number]);
  return i < 0 ? 0 : i;
}

/** Smooth ramp across the campaign. Tune the whole game from here. */
export function difficultyFor(index: number): MissionDifficulty {
  const d = TOTAL > 1 ? index / (TOTAL - 1) : 0; // 0..1
  return {
    enemyHealthMul: 1 + 1.0 * d, // 1.0 -> 2.0
    enemyDamageMul: 0.55 + 0.35 * d, // 0.55 -> 0.9 (forgiving; lock-on will help you)
    maxConcurrent: 3 + Math.round(2 * d), // 3 -> 5
    spawnInterval: 3.6 - 1.1 * d, // 3.6s -> 2.5s
  };
}

export function rewardsFor(index: number, finale: boolean): { scrapBase: number; scrapPerKill: number } {
  return {
    scrapBase: Math.round((90 + 18 * index) * (finale ? 1.5 : 1)),
    scrapPerKill: 7 + index,
  };
}

/** Star rating (1..3), mission-type aware. */
export function starsFor(cfg: MissionConfig, index: number, timeSec: number, hpPct: number): number {
  if (cfg.type === "survival") {
    const t1 = 60 + index * 5;
    const t2 = 100 + index * 5;
    return timeSec >= t2 ? 3 : timeSec >= t1 ? 2 : 1;
  }
  if (cfg.type === "capture" || cfg.type === "extract" || cfg.type === "escort") {
    // Faster objective + more HP left = more stars.
    const par = (cfg.zone?.hold ?? 20) * 3 + index * 4;
    const timeStars = timeSec <= par * 0.8 ? 3 : timeSec <= par * 1.2 ? 2 : 1;
    const hpStars = hpPct >= 60 ? 3 : hpPct >= 30 ? 2 : 1;
    return Math.max(1, Math.min(timeStars, hpStars));
  }
  const par = cfg.killTarget * 12 + index * 4;
  const timeStars = timeSec <= par * 0.6 ? 3 : timeSec <= par * 0.85 ? 2 : 1;
  const hpStars = hpPct >= 70 ? 3 : hpPct >= 40 ? 2 : 1;
  return Math.max(1, Math.min(timeStars, hpStars));
}
