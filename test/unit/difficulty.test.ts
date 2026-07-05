// Dependency-free unit test for the F2 difficulty-curve fix. Uses Node's built-in test runner
// (node:test / node:assert) — no jest/vitest/mocha. See package.json's "test:unit" script and
// tsconfig.test.json for how this gets compiled (CommonJS) and run under plain `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CAMPAIGN_LENGTH, difficultyFor, starsFor } from "../../src/game/difficulty";
import { Content } from "../../src/data/Content";
import type { MissionConfig } from "../../src/data/types";

test("CAMPAIGN_LENGTH is derived from Content.missionOrder, not hardcoded", () => {
  assert.strictEqual(CAMPAIGN_LENGTH, Content.missionOrder.length);
  // Pin the real campaign length: 13 missions (was stale-hardcoded to 9 — see F2 in BACKLOG.md).
  assert.strictEqual(CAMPAIGN_LENGTH, 13);
});

test("difficultyFor(0) matches the documented curve start", () => {
  assert.deepStrictEqual(difficultyFor(0), {
    enemyHealthMul: 1.0,
    enemyDamageMul: 0.55,
    maxConcurrent: 3,
    spawnInterval: 3.6,
  });
});

test("difficultyFor(last index) matches the documented curve end exactly", () => {
  assert.deepStrictEqual(difficultyFor(CAMPAIGN_LENGTH - 1), {
    enemyHealthMul: 2.0,
    enemyDamageMul: 0.9,
    maxConcurrent: 5,
    spawnInterval: 2.5,
  });
});

test("starsFor at the true finale locks the rebalanced (campaign-fraction) par", () => {
  // m-foundry-2: campaign index 12 (last), deathmatch, killTarget 13, finale.
  // par = killTarget*12 + round(32 * fraction) = 13*12 + 32 = 188.
  // 3-star needs timeSec <= par*0.6 = 112.8 AND hpPct >= 70.
  const finale: MissionConfig = Content.mission("m-foundry-2");
  const index = CAMPAIGN_LENGTH - 1;
  assert.strictEqual(finale.killTarget, 13, "fixture drifted — update the par math above");

  assert.strictEqual(starsFor(finale, index, 100, 80), 3, "well inside par, high HP -> 3 stars");
  assert.strictEqual(starsFor(finale, index, 140, 50), 2, "mid par, mid HP -> 2 stars");
  assert.strictEqual(starsFor(finale, index, 300, 10), 1, "over par, low HP -> 1 star");
});

test("starsFor at mission 1 (fraction 0) has no campaign-progress bonus", () => {
  // m-shower-1: campaign index 0, deathmatch, killTarget 6. par = 6*12 + 0 = 72.
  const first: MissionConfig = Content.mission("m-shower-1");
  assert.strictEqual(first.killTarget, 6, "fixture drifted — update the par math above");

  assert.strictEqual(starsFor(first, 0, 40, 75), 3, "well inside par, high HP -> 3 stars");
});
