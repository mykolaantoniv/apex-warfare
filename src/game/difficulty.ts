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
// grew to 13, which pushed late-mission difficulty + star pars off the intended curve). Exported
// (read-only) so tests can pin it against Content.missionOrder.length without duplicating the
// derivation.
export const CAMPAIGN_LENGTH = Content.missionOrder.length;
const TOTAL = CAMPAIGN_LENGTH;

/** Position of a mission in the canonical campaign order (0..TOTAL-1). */
export function campaignIndexOf(missionId: string): number {
  const order = Content.missionOrder;
  const i = order.indexOf(missionId as (typeof order)[number]);
  return i < 0 ? 0 : i;
}

/**
 * Normalized campaign progress: 0 at mission 1, 1 at the true final mission. Both the difficulty
 * ramp and the star-par bonuses below are expressed as a function of this fraction rather than
 * the raw mission index, so the curve's *shape* (and its endpoints) stay fixed however many
 * missions the campaign ends up with — adding/removing missions redistributes the ramp instead
 * of silently extending or truncating it past its intended range (the bug this file used to have
 * when TOTAL was hardcoded to 9 while the campaign grew to 13).
 */
function campaignFraction(index: number): number {
  return TOTAL > 1 ? index / (TOTAL - 1) : 0;
}

/** Smooth ramp across the campaign. Tune the whole game from here. */
export function difficultyFor(index: number): MissionDifficulty {
  const d = campaignFraction(index); // 0..1
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

/**
 * Star rating (1..3), mission-type aware.
 *
 * Par times/thresholds get a campaign-progress "bonus" that makes 3-starring later missions
 * stricter. F2 rebalance: that bonus used to be `index * 4` (or `* 5` for survival), written
 * when the campaign had 9 missions and topped out at index 8 (bonus 32 / 40). As content grew to
 * 13 missions the same formula quietly extended to index 12 (bonus 48 / 60) — on top of the
 * TOTAL bug also over-escalating raw difficulty for those same tail missions, stacking two
 * problems on missions 10-13. Fix: size the bonus off `campaignFraction` (caps at 1.0 for the
 * true final mission) so it tops out at the *original* intended max (32 / 40) no matter how many
 * missions the campaign has — mission-select order, chapter grouping, etc. can grow independently.
 *
 * Before -> after at the real endpoints (13 missions):
 *   - mission 1  (index 0,  d=0): bonus 0 either way — unchanged.
 *   - old finale (index 8,  d=0.667): bonus was 32 (deathmatch/capture) / 40 (survival);
 *     now ~21 / ~27 — this mission is no longer the finale, so a smaller bonus is correct.
 *   - true finale (index 12, d=1): bonus was 48 / 60 (drifted past the intended cap);
 *     now capped at 32 / 40, matching the original design intent exactly.
 */
export function starsFor(cfg: MissionConfig, index: number, timeSec: number, hpPct: number): number {
  const d = campaignFraction(index);
  if (cfg.type === "survival") {
    const bonus = Math.round(40 * d); // was index * 5 (max 40 at the intended finale)
    const t1 = 60 + bonus;
    const t2 = 100 + bonus;
    return timeSec >= t2 ? 3 : timeSec >= t1 ? 2 : 1;
  }
  if (cfg.type === "capture" || cfg.type === "extract" || cfg.type === "escort") {
    // Faster objective + more HP left = more stars.
    const bonus = Math.round(32 * d); // was index * 4 (max 32 at the intended finale)
    const par = (cfg.zone?.hold ?? 20) * 3 + bonus;
    const timeStars = timeSec <= par * 0.8 ? 3 : timeSec <= par * 1.2 ? 2 : 1;
    const hpStars = hpPct >= 60 ? 3 : hpPct >= 30 ? 2 : 1;
    return Math.max(1, Math.min(timeStars, hpStars));
  }
  const bonus = Math.round(32 * d); // was index * 4 (max 32 at the intended finale)
  const par = cfg.killTarget * 12 + bonus;
  const timeStars = timeSec <= par * 0.6 ? 3 : timeSec <= par * 0.85 ? 2 : 1;
  const hpStars = hpPct >= 70 ? 3 : hpPct >= 40 ? 2 : 1;
  return Math.max(1, Math.min(timeStars, hpStars));
}
