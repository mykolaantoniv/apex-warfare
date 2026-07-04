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

### B4. AI overhaul (P1, L) ⬆ *promoted — current AI is 96 lines, 2 archetypes, no variety*
Today: approach/back-off/strafe + fire-when-facing; every fight feels identical. Build a real
archetype roster on the same InputState interface: **rusher** (rams at <10 m, burst-fires),
**sniper** (fires 2 aimed shots then repositions 15 m), **flanker** (approaches at ±90° off the
player's facing), **support** (stays behind others, pops smoke/heals — co-op flavor), plus shared
behaviors: use cover when HP <40 %, burst-fire rhythm with 1.5 s vulnerability windows, brief
panic-evade when hit 3× in 2 s, and per-difficulty `aimError`.
- AC1: 4 archetypes visibly behave differently in a 60 s observation test (scripted scenario logs
  distinct movement signatures: ram-contact, reposition count, approach bearing).
- AC2: A damaged bot repositions toward a cover collider within 3 s in ≥70 % of trials.
- AC3: Mission 1 bots miss ≥40 % of shots; finale bots ≤15 % (config-driven `aimError`).
- AC4: Bots fire in bursts (no continuous beam-hold); between bursts they are hittable-punishable.

### B5. Session goals / daily challenge (P2, M)
One rotating daily challenge (e.g. "10 kills with a tank") stored locally; reward = scrap bonus.
- AC: Challenge shown on the menu with progress; completing it grants scrap once per calendar day
  (UTC), persists across reloads.

## C. Visual

### C0. Map design pass — composed layouts, not RNG scatter (P0, L) ⭐ *biggest quality lever*
Today props are seeded-random scatter on a flat plane; real maps are *designed*. Give each map a
hand-authored layout: a central POI (bridge / village / depot / rail yard), 2–3 roads or tracks
crossing the field (flat decal strips — playfield stays planar for MP), prop clusters forming
chokepoints and bases at spawns, and clear sightline lanes. Author placements in the map JSON
(new optional `props: [{key,x,z,yaw,s}]` array that overrides/augments biome scatter).
- AC1: Each of the 5 maps has ≥1 recognizable central POI and ≥2 road strips; standing at any
  spawn, a player can name where they are ("the bridge", "the depot") — verified by screenshot
  review against a layout sketch per map.
- AC2: Authored props come from map JSON (schema-validated), render via the existing
  thin-instance path, and keep total draw calls ≤150 on the perf HUD.
- AC3: RNG scatter still fills the gaps but density drops near authored clusters (no overlap
  clipping: no authored prop intersects another > 20 % bbox).

### C0b. Border terrain relief — kill the cone mountains (P0, M)
Replace the 6-sided-cone "mountains" with layered relief: a sculpted ridged heightmap ring (or the
mountain GLB thin-instanced at varied scales/rotations) + a second, farther, fog-faded ridge line
for depth. Playfield stays planar.
- AC1: No visible geometric cones anywhere on the horizon; ridge silhouette is irregular (screenshot
  vs current build shows clearly organic profile).
- AC2: Horizon costs ≤6 draw calls and ≤40 k tris total; fog fades the far ridge per biome palette.

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

### C3b. Death moments — wrecks, big explosions, scorch (P0, M) ⭐ *kills are the reward loop*
Destroyed vehicles must not blink out: swap to a blackened wreck (same mesh, charred material,
collapsed on ground), spawn a 2-stage explosion (flash+fireball → rising smoke column for 8–10 s),
leave a scorch decal, and give the killing blow a beefier FeelDirector impact (bigger shake +
slow-mo already exists via finisher — use a lighter version for every kill).
- AC1: Every vehicle kill leaves a visible wreck for ≥10 s (pooled, max 6 concurrent, oldest
  despawns with a small dust puff) + a ground scorch decal.
- AC2: Explosion is readable from 60 m in bright daylight (fireball ≥3 m, smoke column ≥8 m tall).
- AC3: No frame-time regression >1 ms on medium tier with 3 simultaneous wrecks (perf HUD).

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

## F. Game loop & retention (investigation, 2026-07-04)

**Why players won't come back today (found in the data, not vibes):**
1. **Nothing to earn** — 9 of 11 vehicles are `unlock:"start"`; only Mule (5★) and Brute (13★)
   are gated. The garage is a menu, not a goal.
2. **Upgrades are shallow** — only 4 of 11 vehicles have trees, each branch just 2 nodes
   (~8 purchases ≈ 30 min of scrap income and you're "done").
3. **Sessions have no shape** — after a mission you're dumped back to the list; no "next up",
   no streak, no reason for *one more*.
4. **Maps are small & samey** — half = 85–95 m (≈180 m squares); with heli speed ~15 m/s you
   cross the world in ~12 s. Fights all happen in the same undifferentiated middle.
5. **BUG: stale difficulty curve** — `difficulty.ts` has `TOTAL = 9` hardcoded but the campaign
   now has 13 missions, so late-mission difficulty/star pars extrapolate past the intended curve.

**Target loop shape:**
- **Core loop (30 s):** spot → lock → burst-fire dance (B4's vulnerability windows make this a
  rhythm, not a hold) → kill **moment** (C3b wreck + explosion) → loot ping (scrap flies to HUD).
- **Session loop (5–15 min):** mission → results (stars + scrap + "contract progress 2/3") →
  **NEXT MISSION card** one tap away → after 2–3 missions a contract completes → spend scrap in
  garage → *"new node unlocked"* pulls you into one more run.
- **Meta loop (days):** vehicle ladder (earn, don't start with, the roster) → chapter bosses →
  daily contracts reset → career stats climb → MP rank ticks up.

### F1. Bigger, structured maps (P0, L)
Grow maps to half = 140–160 (≈3× area) and split each into 3 named ZONES (e.g. Verdant Valley:
Riverside → Village → Ridge Depot) with the C0 POIs; missions reference a zone for spawns so
fights move around the map across the campaign. Radar + objective arrow (A3) keep wayfinding easy.
- AC1: ≥2 maps at half ≥140 with 3 named zones each (zone name flashes on entry, à la MW).
- AC2: Enemy spawns per mission are zone-scoped (JSON `zone` field), verified: mission 1 fights in
  zone A, mission 2 in zone B on the same map.
- AC3: 60 fps holds on medium tier at the new size (thin instances + existing governor; perf HUD
  before/after recorded). MP: `shared/maps.ts` halves updated in the same PR (sim + client agree).

### F2. Campaign restructure + difficulty fix (P0, S)
Chapters = maps (5 chapters × 2–3 missions + 1 boss finale each). Fix `TOTAL = 9` → derive from
`Content.missionOrder.length`. Rebalance star pars for the new curve.
- AC1: `difficultyFor` uses the real campaign length (unit test: last mission's multipliers equal
  the documented curve endpoints exactly).
- AC2: Mission select groups missions under chapter headers with a per-chapter star meter.

### F3. Vehicle unlock ladder (P0, S) — *make the garage a goal*
Re-gate the roster: start with Hornet + Boulder only; everything else earned — stars (campaign),
scrap purchase (2 mid vehicles), chapter-boss kills (Brute = beat chapter 3 boss), one MP-only
unlock (win 5 online matches → Raider).
- AC1: Fresh save starts with exactly 2 vehicles; every other vehicle shows its unlock condition
  on its locked garage card.
- AC2: Unlock moments are celebrated (full-screen "UNLOCKED" flash + the vehicle spins in).
- AC3: Existing saves keep anything already unlocked (migration keeps `unlockedVehicles`).

### F4. Deep upgrade trees + visible upgrades (P1, M)
Trees for all 11 vehicles, 4–5 nodes per branch (~20 nodes/vehicle); tier-3 purchases change the
model visually via the GLB rig registry (extra armor plates / bigger pods / antenna).
- AC1: Every vehicle has a full tree (`validate-data` enforces ≥4 nodes/branch); total scrap to
  max one vehicle ≈ 2–3 h of play (economy sheet committed alongside).
- AC2: At least one visual attachment appears on the vehicle when a tier-3 node is bought (garage
  + in-mission).

### F5. Contracts + session flow (P0, M) — *the comeback mechanic*
Three rotating contracts (daily, seeded by date, no server needed): e.g. "Destroy 12 vehicles",
"Win a mission in a tank", "3★ any snow mission" → scrap + a streak counter (day 2: ×1.25,
day 3+: ×1.5). Post-mission results screen gains a NEXT MISSION card (next campaign mission or
closest incomplete contract) — one tap to keep playing.
- AC1: 3 contracts shown on the menu with live progress; complete → claim animation → scrap;
  reset at UTC midnight (date-seeded RNG, deterministic in tests).
- AC2: Streak survives reload; missing a day resets it (unit-test the date math).
- AC3: Results screen's NEXT button starts the suggested mission in ≤3 s; ≥1 contract's progress
  is visible on the results screen itself.

### F6. Chapter bosses (P1, M)
One boss per chapter using the existing `finale` flag: an oversized elite (3× HP, custom tint +
scale, named healthbar at top) with one learnable mechanic each (e.g. snow boss: artillery barrage
with telegraphed target circles; foundry boss: spawns 2 adds at 50 %).
- AC1: 5 boss missions exist; each boss has a top-screen named HP bar and ≥1 telegraphed attack
  (visible warning ≥1 s before damage).
- AC2: Boss kill = guaranteed unlock/reward (ties into F3) + finisher slow-mo.

### F7. Elite enemies + replay mutators (P2, M)
5 % of spawns are elites (tinted, 2× HP, drop 3× scrap, small nameplate). Completed missions can
re-run with mutators ("iron vehicles: no repair", "double speed") for bonus scrap.
- AC1: Elites visibly distinct (outline/tint + name) and drop-boost verified.
- AC2: ≥3 mutators selectable on completed missions; rewards multiply and stars unaffected.

### F8. Career + MP rank (P2, M)
Local career screen (kills, accuracy, favorite vehicle, playtime, per-map stars) + MP rank from
match XP (name shows rank chevrons in lobby/scoreboard).
- AC1: Career screen shows ≥8 lifetime stats, updates after every mission, survives reload.
- AC2: MP rank persists (localStorage), displayed next to callsign for all clients in a room.

---

## Suggested order (2-week slices, updated)

| Slice | Contents |
|-------|----------|
| 1 (now) | **C0 map design** · **C0b relief** · **C3b death moments** · A1 pause · A2 recap · A3 objectives · **F2 difficulty fix** |
| 2 | **F1 bigger maps** · **F3 unlock ladder** · **F5 contracts** · B4 AI overhaul · D1 bundle split · C1 snow walls · C2 industrial structures |
| 3 | B1 survival · B2 vehicle differentiation · F4 deep trees · F6 bosses · C3 rotor/damage · E1 nameplates/scoreboard · D4 tests+CI |
| 4 | B3 specials · A4/A5 settings+mobile · C4–C6 polish · D2 KTX2 · D3 GHCR · E2/E3 · F7/F8 · B5/D5/D6 · E4 (if needed) |
