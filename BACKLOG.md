# Apex Warfare — Improvement Plan & Backlog

> Written 2026-07-04, based on the live v6 build (Verdant Valley opening map, military GLB
> vehicles, 3 biomes, SP + Colyseus MP on Azure). Each task has concrete acceptance criteria
> (AC) that are testable via Playwright, the perf HUD (`` ` ``), or plain play.
>
> Priorities: **P0** = biggest player-visible wins / correctness · **P1** = strong value ·
> **P2** = polish / later. Effort: S (<½ day) · M (½–1 day) · L (multi-day).

## The plan in one paragraph

The game boots fast, plays clean, and now looks like a war game — but it *feels* unfinished at
the edges: you can't pause, the HUD doesn't tell you why you died or what to do next, two of the
three reference looks (snow arena, industrial ruins) are still half-done, all five helicopters
share one model, and one 5.5 MB JS chunk drags first load. The plan: (1) close the survival
loop UX (pause / death recap / objective clarity), (2) finish the two remaining reference
biomes, (3) differentiate vehicles visually and mechanically, (4) split the bundle + finish the
KTX2/perf pass so mid-range mobile hits 60 fps honestly, and (5) deepen MP from "works" to
"worth returning to" (names over vehicles, scoreboard, rematch).

---

## A. UI / UX

### A1. Pause menu (P0, S) — *there is currently no pause at all*
In-mission ESC (desktop) / a ⏸ button (mobile) opens an overlay: RESUME · SETTINGS · QUIT TO MENU.
- AC1: ESC or ⏸ freezes the sim (fixed-step accumulator stops; no enemy movement/damage while open).
- AC2: QUIT returns to mission select without a page reload; re-entering a mission works (no leaked
  scene: draw-call count after quit+relaunch equals a fresh launch ±5).
- AC3: SETTINGS inside pause shows the same volume/motion-blur controls as the main menu and
  changes apply live (volume) or next mission (blur), persisted to IndexedDB.

### A2. Death / defeat recap (P0, S)
On player death, show killer name + vehicle, survival time, kills, and damage dealt before the
DEFEAT screen buttons.
- AC1: Recap appears within 1.5 s of death, showing ≥4 stats; RETRY restarts the same mission in
  ≤3 s without returning to menu.
- AC2: Works in MP too (killed-by line over the respawn countdown).

### A3. Objective clarity (P0, S)
Persistent objective line under the timer ("DESTROY 8 ENEMIES — 3 LEFT" / capture % / escort HP)
plus an edge-of-screen arrow to the current objective (enemy cluster, zone, or convoy).
- AC1: Every mission type (deathmatch/capture/extract/escort) shows a live-updating one-line
  objective; text changes within 250 ms of a kill/zone tick.
- AC2: Off-screen objective indicator points correctly (±15°) and hides when the target is on screen.

### A4. Settings expansion (P1, M)
Add: graphics quality (Auto/Low/Med/High/Ultra), invert steering toggle, camera distance slider,
SFX vs music volume split, language stub (EN/UK).
- AC1: Quality picker overrides the auto tier immediately (resolution scale + shadows visibly
  change without reload) and persists.
- AC2: All settings survive reload (IndexedDB) and reset with RESET PROGRESS only when confirmed
  via an "are you sure" dialog (currently reset is one accidental tap).

### A5. Mobile control comfort (P1, M)
Bigger touch targets on phones (<400 px), optional left/right-handed layout flip, haptic pulse on
hit/kill (Vibration API where available).
- AC1: All buttons ≥48 px touch target at 360 px viewport; no overlap with the stick at any
  supported aspect ratio (test 360×640, 412×915, 1024×768).
- AC2: Layout flip setting swaps stick/buttons sides and persists.

### A6. First-run flow (P2, S)
Replace the two coach-mark strings with a 3-step interactive tutorial (drive → lock → fire) that
completes on action, not on timer; skippable.
- AC: A fresh profile completes the tutorial only by performing each action; SKIP visible from
  step 1; never shown again after completion (flag in save).

## B. Gameplay

### B1. Survival mode missions (P1, M) — *schema supports it; zero missions use it*
Waves escalate until death; score = waves cleared. One survival mission per map (5 new JSONs +
wave spawner in Mission).
- AC1: `type:"survival"` spawns waves (N+1 enemies each wave, 5 s intermission banner), HUD shows
  "WAVE k"; mission ends only on player death; stars from wave count (3★ = wave 8+).
- AC2: `npm run validate-data` passes; survival missions appear in mission select with a distinct icon.

### B2. Vehicle differentiation pass (P1, M)
The 5 helis share one GLB + similar handling. Give each class a distinct silhouette (tint +
attachment variations via the rig registry: different weapon pods/nose) and a signature stat
(Wasp = fastest, Brute = tanky-slow, Pest = small hitbox, Mule = repair aura).
- AC1: In the garage, all 5 helis are visually distinguishable at a glance (different accent
  livery + at least one geometric attachment difference).
- AC2: Stat sheet in garage shows per-vehicle deltas; Mule's repair aura heals allies 2 HP/s in a
  6 m radius in co-op (visible ring + tick numbers).

### B3. Special weapons actually special (P1, M)
The SPECIAL bar exists; give each class a real special: heli = rocket volley (8 unguided),
tank = artillery shell (arc + big splash), jet = strafing run, boat = torpedo (water only),
bike = smoke screen (breaks enemy lock).
- AC1: Each class's special has unique projectile visuals + audio and a 12–20 s cooldown shown on
  the SPECIAL bar; usable via Q/button.
- AC2: Torpedo only fires while on water; smoke screen makes bots lose lock for 4 s (verifiable in
  a bot test: bot stops firing while player is smoked).

### B4. Smarter bots (P2, L)
Add cover usage (move to nearest cover prop when HP <40 %), focus-fire callouts, and per-difficulty
aim error so early missions are gentler.
- AC1: A damaged bot demonstrably repositions toward a cover collider within 3 s in ≥70 % of trials
  (scripted test scenario).
- AC2: Mission 1 bots miss ≥40 % of shots; finale bots ≤15 % (config-driven `aimError`).

### B5. Session goals / daily challenge (P2, M)
One rotating daily challenge (e.g. "10 kills with a tank") stored locally; reward = scrap bonus.
- AC: Challenge shown on the menu with progress; completing it grants scrap once per calendar day
  (UTC), persists across reloads.

## C. Visual

### C1. Snow arena walls — reference #2 (P0, M) — *planned, agents were cut by session limit*
Visible low retaining-wall ring (snowy concrete) just inside the bounds on `map-frost`, so it
reads as the walled arena in the reference; new `ArenaWalls.ts`, biome-gated (`walls: true`).
- AC1: On Frostline, the perimeter shows a continuous visible wall (~2.5 m) with ≤4 draw calls
  total; vehicles collide with it exactly at today's bounds (no gameplay change).
- AC2: Other maps are unchanged (no wall).
- AC3: Screenshot comparison vs `Знімок екрана 2026-07-03 234053.png`: walled enclosure, pale
  cracked ground, pines + cabins visible from spawn.

### C2. Industrial structures — reference #3 (P0, M)
Acquire 3–5 big industrial GLBs (crane, silo, warehouse, pipe rack — any license, private game),
add as `industrial` landmarks so The Foundry reads as ruined industry, warm-grey grading.
- AC1: From The Foundry spawn, ≥3 large structures are visible on the skyline; each prop type is
  1 thin-instanced draw call with a collider.
- AC2: Screenshot comparison vs `Знімок екрана 2026-07-03 234127.png`: concrete plaza + rusty
  structures + autumn foliage mood matches.

### C3. Rotor blur + vehicle damage states (P1, M)
Spinning rotors render as a semi-transparent blur disc above ~60 % throttle; vehicles under 50 %
HP emit the existing damage smoke + show scorch decal tint; under 25 % add flame particles.
- AC1: Heli rotor visually transitions blade→disc as it spins up (no popping).
- AC2: Any vehicle at <50 % HP trails smoke that thickens by 25 % HP steps (already partially
  wired via SmokeEmitter — verify + extend to all classes incl. GLB models).

### C4. Water polish (P1, S)
Shoreline foam band + subtle depth tint gradient near edges; boat wake trail (existing spray +
a fading ribbon).
- AC: Standing at the lake edge shows a foam line along 100 % of the shore; a moving boat leaves a
  visible wake ≥8 m long that fades in ~3 s.

### C5. Muzzle flash & tracer upgrade (P2, S)
Bigger 2-frame muzzle flash sprite + point light pulse; tracers get length scaled by velocity.
- AC: Firing in a dark map visibly lights the vehicle nose; tracer read at 60 fps (no gaps) on
  medium tier.

### C6. Skybox variety per biome (P2, S)
Snow = overcast HDRI, industrial = hazy warm HDRI (Poly Haven, any license OK) instead of the one
sunny sky everywhere.
- AC: Each theme loads its own HDRI (fallback to default on 404); loading adds ≤300 ms on a
  mid-tier device (async, world visible meanwhile).

## D. Technical

### D1. Bundle split + lazy Havok (P0, M) — *one 5.5 MB JS chunk today*
Split vendor (Babylon core / loaders / Havok wasm loader / colyseus.js) via Rollup manualChunks;
lazy-import NetGame + Lobby (only when PLAY ONLINE clicked).
- AC1: No single JS chunk >2.5 MB; initial load fetches ≤3 JS files; menu interactive ≥30 % faster
  on a throttled Fast-3G Lighthouse run (record before/after numbers in the PR).
- AC2: PWA still precaches everything; offline boot still works (airplane-mode test).

### D2. KTX2 texture pipeline (P1, M) — *Phase 5 leftover*
Convert ground/grass/concrete/metal JPGs to KTX2/Basis (toktx), register the KTX2 loader, keep JPG
fallback.
- AC1: GPU texture memory for the ground sets drops ≥50 % (perf HUD before/after on the same map).
- AC2: Visual diff acceptable (no visible banding at chase-cam distance); loads on iOS Safari +
  Android Chrome.

### D3. Deploy pipeline: finish GHCR migration (P1, S) — *blocked on one manual click*
User makes ghcr.io package public → repoint Container App → delete ACR (saves ~$5/mo, enables
`git push` = deploy via existing GitHub Action).
- AC1: Container App runs `ghcr.io/mykolaantoniv/apex-warfare:latest`; live URL passes the
  Playwright smoke; `az acr delete` completed.
- AC2: A push to main auto-builds + the update command is documented in README.

### D4. Promote test scripts to npm scripts + CI (P1, M)
The ad-hoc gitignored Playwright scripts (.gsmoke/.deploytest/.shot) become `tests/` +
`npm run test:smoke` / `test:live`; GitHub Action runs typecheck + validate-data + smoke on PR.
- AC1: `npm run test:smoke` boots the dev server itself, runs the mission smoke headless, exits
  non-zero on any console error; runs green in CI on push.
- AC2: `npm run test:live <url>` runs the deploy verification against any URL.

### D5. Error telemetry (P2, S)
window.onerror + unhandledrejection → buffered POST to a `/log` endpoint on the Colyseus server
(ring buffer in memory, `GET /log` to read; no external service).
- AC: Forcing a test error client-side shows up in `GET /log` with UA + game version; opt-out
  respected offline (queue drops silently).

### D6. Save robustness (P2, S)
Save schema version bump path (v1→v2 migration test), plus export/import save as JSON from
settings (user owns their progress).
- AC1: Loading a synthetic v1 save upgrades in place without data loss (unit test).
- AC2: EXPORT downloads a .json; IMPORT restores it (round-trip test equals deep-equal).

## E. Multiplayer

### E1. Nameplates + scoreboard (P1, M)
Show player names over vehicles (exists for SP nameplates — wire to MP), TAB/button scoreboard
(kills/deaths/ping), kill feed top-right.
- AC1: In a 2-client test, each client sees the other's callsign overhead within 1 s of join.
- AC2: Scoreboard lists all players sorted by kills, updates ≤1 s after a kill; kill feed shows
  "A ▸ B" entries that expire after 5 s.

### E2. Rematch + room persistence (P1, S)
After VICTORY/DEFEAT in MP, offer REMATCH (same room resets state) alongside CONTINUE.
- AC: Both clients clicking REMATCH restarts the match in ≤3 s without reconnecting (same roomId);
  scores reset; a client that leaves instead is removed cleanly.

### E3. New-biome MP verification (P1, S) — *shared/maps.ts entries landed; needs live proof*
- AC: Two Playwright clients complete a co-op match on Frostline and on The Foundry over the live
  URL: correct biome renders on both, boats (if any) stay in water, 0 console errors.

### E4. Multi-replica scale-out (P2, L) — *only if players warrant it*
@colyseus/redis-presence + driver, maxReplicas >1.
- AC: Two replicas run simultaneously; room browser lists rooms from both; no split-brain
  quickplay (join hits the same room pool). Cost delta documented first.

---

## Suggested order (2-week slices)

| Slice | Contents |
|-------|----------|
| 1 (now) | A1 pause · A2 death recap · A3 objectives · C1 snow walls · C2 industrial structures · D1 bundle split |
| 2 | B1 survival · B2 vehicle differentiation · C3 rotor/damage states · D4 tests+CI · E1 nameplates/scoreboard |
| 3 | B3 specials · A4/A5 settings+mobile · C4–C6 visual polish · D2 KTX2 · D3 GHCR · E2/E3 |
| 4 | B4 bots · B5 daily · D5/D6 · E4 (if needed) |
