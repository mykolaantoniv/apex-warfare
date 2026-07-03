# Apex Warfare — Game Design Document (GDD)

> **Status:** DRAFT for approval (Milestone **M1**).
> **One-liner:** A premium, single-player 3D twin-stick vehicle-combat game where
> miniature war machines battle across oversized real-world bathrooms — installable
> as an offline PWA, free to host, 60fps on mid-range phones, and built to *feel*
> better than *Massive Warfare*.

---

## 1. Vision & Pillars

**Fantasy:** You command a fleet of tiny, beautifully-rendered war vehicles fighting
miniature battles in a giant human world. Soap bars are cover. Drains are death pits.
Puddles reflect your rocket trails.

**Three pillars (in priority order):**
1. **Feel beats the original.** Twin-stick controls that are instant and weighty;
   hitstop, screenshake, knockback, particle bursts, damage numbers, layered audio.
   If it doesn't feel better than the reference at M3, we don't move on.
2. **Diorama beauty.** PBR materials, dynamic shadows, bloom, post-processing. The
   "tiny vehicles in a giant real room" aesthetic is the visual hook.
3. **Frictionless premium delivery.** Installable PWA, fully offline, zero hosting
   cost, auto quality-scaling so it runs everywhere.

**Non-goals (locked):** No multiplayer, no netcode, no accounts, no microtransactions,
no server. 100% single-player vs AI.

---

## 2. Locked Design Decisions (from discovery)

| Area | Decision |
|------|----------|
| **Setting** | Bathroom / locker-room diorama, 3 map variants |
| **Vehicle progression** | Start with attack heli; unlock the rest by completing missions |
| **Mission core** | Deathmatch, plus survival/score-attack variants on the same combat core |
| **Difficulty** | Smooth ramp; 1–3 star rating per mission (time + health remaining) |
| **Economy** | Single currency **"Scrap"**; each vehicle has its own upgrade tree |
| **UI direction** | Sleek military HUD: dark glassmorphism, neon-cyan accents, angled panels, monospace stats |

---

## 3. Maps (3)

All share one cohesive bathroom/locker art kit for maximum reuse and perf safety.

| # | Name | Setting & layout | Hazards / cover | Vibe |
|---|------|------------------|-----------------|------|
| 1 | **Shower Arena** | Tiled wet-room floor, open center, low glass-block walls | Open drains (fall = damage), puddles (reflective), soap bars (cover) | Hero map. Wet-tile PBR + bloom showcase |
| 2 | **Sink Counter** | Long countertop, mirror backdrop, multi-tier (sink basin lower) | Faucet drip zone, toothbrush ramps, cup/bottle cover | Verticality + mirror reflections |
| 3 | **Locker Bay** | Bench rows between lockers, grated metal floor | Tight corridors, locker-door cover, vent grates | Close-quarters, ambush-friendly |

Each map ships with **2–3 missions** (see §6).

---

## 4. Vehicles (4) — proposed stats for your approval

Stats are **0–10 relative** tuning values, not raw numbers; the data layer stores real
numbers derived from these. Unlock order = campaign progression.

| Vehicle | Role | Move | Speed | Armor | DPS | Special | Unlock |
|---------|------|------|-------|-------|-----|---------|--------|
| **Hornet** (attack heli) | All-rounder DPS | Hover/strafe (omnidirectional) | 6 | 4 | 7 | Rocket barrage (8) | Starter |
| **Mule** (transport heli) | Tanky bruiser | Hover, slower | 4 | 8 | 5 | Deployable turret / repair drone | Clear map 1 |
| **Talon** (jet) | Glass-cannon striker | Forward-biased, fast, must keep speed | 9 | 3 | 8 | Strafing afterburner dash | Clear map 2 |
| **Boulder** (tank) | Siege | Ground, treads, turret rotates independently | 3 | 10 | 9 | Charged mortar shell (arcing) | Clear map 3 |

**Flight/drive models:**
- **Helis:** omnidirectional twin-stick — left stick = move (relative to camera), right
  stick = aim/fire. Slight inertia + banking tilt for weight.
- **Jet:** left stick steers + throttle, can't fully stop (stall floor speed); right
  stick aims a forward-cone weapon. Higher skill, higher reward.
- **Tank:** left stick = tracked movement, right stick = independent turret aim/fire.

> **Weapons** are data-driven (projectile speed, damage, cooldown, spread, falloff).
> Primary = auto-fire on right-stick aim; Special = cooldown-gated, button on HUD.

---

## 5. Combat Feel Targets (the bar for M3)

These are the acceptance criteria for "feels better than the original":

- **Input latency:** < 1 frame perceived; controls poll every frame, no smoothing lag.
- **Hitstop:** 40–90ms freeze on impactful hits (scaled by damage).
- **Screenshake:** trauma-based (additive, decays); capped so it never nauseates.
- **Knockback:** impulse on hit, both to target and slight recoil to shooter.
- **Damage numbers:** pop, rise, fade; crits bigger + colored.
- **Particles:** muzzle flash, impact spark/debris, explosions with smoke + light flash.
- **Audio layering:** engine loop (pitch by speed) + fire + impact + explosion + UI;
  ducking so explosions punch through.
- **Camera:** smooth follow with look-ahead toward aim/movement; subtle zoom-punch on
  big explosions.
- **Death/kill juice:** slow-mo pop on final kill of a mission, debris, light flash.

---

## 6. Missions & Progression

**Mission types (all reuse one combat core):**
- **Deathmatch:** destroy N enemy bots before the timer or to a score cap.
- **Score Attack:** timed; maximize score (kills, multi-kills, no-damage streaks).
- **Survival:** endless escalating waves; score = waves survived + kills.

**Per map:** 2–3 missions, escalating difficulty. ~7 missions total across the campaign
for M4 (e.g., 3 / 2 / 2), expandable via JSON only.

**Stars (1–3):** awarded per mission on `(completion) + (time/par) + (health remaining)`.
Stars are the replay hook and a soft gate (e.g., need X total stars to unlock map 3).

**Difficulty ramp levers (data-driven):** enemy count, enemy vehicle tier, aggro range,
fire rate, HP multiplier, reinforcement waves.

**AI bot behavior** — finite state machine: `Patrol → Engage → Evade → Retreat → Regroup`,
with per-archetype params (aggressive rusher, cautious sniper, support).

---

## 7. Economy & Upgrades

- **Currency:** **Scrap**, earned from mission completion + star bonuses + kills.
- **Per-vehicle upgrade tree**, four branches each:
  `Armor` (HP), `Damage` (DPS), `Mobility` (speed/handling), `Special` (cooldown/power).
- Each branch = a few tiered nodes with rising Scrap cost. Upgrades are permanent,
  saved to IndexedDB.
- **Garage screen:** select vehicle, view/spend on tree, see stat bars update live.
- No soft-locks: Scrap from replaying earlier missions always lets you progress.

---

## 8. UI / UX (Sleek Military HUD)

**Design language:** dark translucent glass panels, neon-cyan (#27e3ff-ish) accents,
angled/clipped corners, monospace numerics, subtle scanline/glow. High contrast for
outdoor phone readability.

**Screens ("tabs"):**
1. **Main Menu** — title, Play, Garage, Settings, Install-app prompt.
2. **Mission Select** — map carousel → mission list with star ratings + best times.
3. **Garage** — vehicle picker + upgrade tree + live stat bars + Scrap balance.
4. **HUD (in-mission)** — see mockup below: health bar, timer, enemies-left, Scrap,
   ammo/reload, special-cooldown meter, twin virtual joysticks (nipplejs), fire button.
5. **Results** — stars earned, Scrap gained, retry / next / garage.
6. **Pause / Settings** — quality tier, audio, controls, restart, quit.

**Approved HUD reference (M2/M3 target):**
```
MISSION 02 · SHOWER ARENA        ⭐⭐☆
╔═════════╗                  ┌───────┐
║ HP ████░░ ║                  │ 0:42  │
╚═════════╝                  └───────┘
 SCRAP 1,240            ENEMIES ▲5

   ╭───╮                      ╭───╮
  │  ◉  │ move           fire │  ◉  │
   ╰───╯                      ╰───╯
[ROCKETS x8]  [████░ special]
```

**Mobile-first:** responsive layout, safe-area insets (notches), touch targets ≥ 44px,
joystick zones anchored to thumbs, landscape primary (portrait optional later).

---

## 9. Performance Budget (mid-range mobile, 60fps)

| Metric | Budget |
|--------|--------|
| Frame time | ≤ 16.6ms (60fps); auto-scale before dropping below |
| Draw calls | ≤ ~150/frame (instancing + merged statics) |
| Triangles on screen | ≤ ~250k |
| Textures | KTX2/Basis compressed; ≤ 2k for hero, atlas the rest |
| Shadows | 1 dynamic shadow caster (sun), low/med tier; cascaded only on high |
| Lights | 1 main directional + baked/ambient; few dynamic point lights, pooled |
| Particles | GPU particles, pooled, capped per emitter |

**Quality auto-scaling tiers (Low / Med / High):** device-tier detection at boot +
runtime FPS governor that steps resolution scale, shadow quality, post-FX, particle
caps, and LOD bias up/down to hold 60fps.

---

## 10. Architecture (summary — full detail in CLAUDE.md at Step 2)

- **Engine:** Babylon.js (WebGL2), **Havok** physics (WASM), PBR, default rendering
  pipeline (bloom, tonemap, FXAA/SMAA, vignette).
- **Build:** Vite + TypeScript (strict, no `any`).
- **Controls:** nipplejs twin sticks.
- **Persistence:** IndexedDB via `idb` (save: unlocks, Scrap, upgrades, stars, settings).
- **PWA:** vite-plugin-pwa, offline service worker, installable, asset precache.
- **Hosting:** Cloudflare Pages (static).
- **Pattern:** ECS-lite — entities composed of components (Transform, Health, Weapon,
  AIController, VehicleController, Renderable...), systems iterate components.
- **Data-driven:** vehicles, weapons, maps, missions, upgrades = JSON validated against
  schemas. New content = new JSON, not new code.
- **Assets:** CC0 only (Kenney, Quaternius, Poly Pizza); every asset logged in ASSETS.md.

---

## 11. Milestones

| # | Deliverable | Gate |
|---|-------------|------|
| **M1** | This GDD approved | ← you are here |
| **M2** | Engine boots: controllable Hornet in Shower Arena, twin-stick, physics, camera | Review |
| **M3** | **Vertical slice:** Hornet + AI enemy + 1 deathmatch + win/lose + HUD + juice. Must already *feel* great — we iterate here. | Review (the big one) |
| **M4** | Full content: 3 maps, 4 vehicles, mission menu, garage + IndexedDB save | Review |
| **M5** | PWA + perf pass: installable, offline, 60fps mid-range, auto quality scaling | Review |
| **M6** | Cloudflare Pages deploy + README | Done |

---

## 12. Open questions / proposed defaults (tell me to change any)

1. **Vehicle names** (Hornet/Mule/Talon/Boulder) — placeholder; happy to rename.
2. **Stat values in §4** — first-pass balance; will be tuned during M3/M4.
3. **Orientation** — defaulting to **landscape-primary**. OK?
4. **Star gate** — soft-gating map 3 behind total stars. Want gates, or fully open?
5. **Survival** — including it as a variant from M4; OK to defer to post-M4 if scope tight?

---

### Approval

If this looks right, say **"approved"** (or note changes) and I'll proceed to **Step 1**
(create the four `.claude/skills/`), then **Step 2** (`CLAUDE.md`), then **M2** (engine
boots with a controllable Hornet).
