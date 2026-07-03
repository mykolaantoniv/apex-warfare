# Apex Warfare — Project Context (CLAUDE.md)

Premium single-player 3D vehicle-combat game. **Massive Warfare-style: 3rd-person chase
camera, auto-lock-on shooting, realistic warzone maps** (Dust Basin, Riverside, Highland
Pass). One steering stick + FIRE/SWITCH/SPECIAL buttons — no aim stick. Installable offline
PWA, zero hosting cost, 60fps on mid-range mobile. **Goal: feel + look better than
_Massive Warfare_, with super-realistic physics, smoke, shooting, and controls.**

> Design source of truth: **`GDD.md`** (approved). This file is the engineering contract.

## Tech stack (decided — do not re-litigate)
- **Engine:** Babylon.js (WebGL2) + **Havok** physics (WASM)
- **Build:** Vite + TypeScript (**strict, no `any`**)
- **Controls:** nipplejs (single steering stick) + FIRE/SWITCH/SPECIAL buttons; firing
  auto-aims at the locked target (no aim stick). Desktop: WASD + Space/Tab/Q.
- **Persistence:** IndexedDB via `idb`
- **PWA:** vite-plugin-pwa (offline service worker, installable)
- **Hosting:** Cloudflare Pages (static)
- **Assets:** CC0 only (Kenney.nl, Quaternius, Poly Pizza) — logged in `ASSETS.md`

## Architecture overview
- **One Engine, one gameplay Scene.** Menus = DOM/CSS overlays.
- **Fixed-timestep** sim (physics + gameplay) with accumulator; variable-timestep render.
- **ECS-lite:** entities are id + a bag of components (`Transform`, `Health`, `Weapon`,
  `VehicleController`, `AIController`, `Renderable`, `SmokeEmitter`...). Systems iterate
  components each fixed step. No deep inheritance; composition over hierarchy.
- **Data-driven:** vehicles/weapons/maps/missions/upgrades = JSON validated against schemas.
  New content = new JSON, not new code. (See `game-data-designer` skill.)
- **Pools for everything** spawned in combat (projectiles, particles, damage numbers, bots).
- **FeelDirector** centralizes juice: one `impact(power,pos,kind)` fires hitstop + shake +
  knockback + particles + flash + audio + damage number, tier-scaled.
- **Quality governor** auto-scales (resolution, shadows, post-FX, particles) to hold 60fps.

## Folder structure
```
/
├─ GDD.md                  # design doc (approved)
├─ CLAUDE.md               # this file
├─ ASSETS.md               # CC0 asset license log
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ public/
│  ├─ models/  textures/  audio/  env/      # CC0 assets
│  └─ pwa icons, manifest bits
└─ src/
   ├─ main.ts              # bootstrap
   ├─ core/                # Engine, Scene, fixed loop, time, RNG, events, pools
   │  ├─ Game.ts  Loop.ts  Pool.ts  Events.ts  Rng.ts  ServiceLocator.ts
   ├─ engine/              # Babylon setup: scene, lighting, camera, physics, post
   │  ├─ SceneBuilder.ts  Physics.ts  CameraRig.ts  PostFX.ts  Lighting.ts
   ├─ ecs/                 # component types + systems
   │  ├─ components/  systems/  World.ts
   ├─ vehicles/            # controllers (heli/jet/tank), weapons, ballistics
   ├─ ai/                  # FSM bot behaviors
   ├─ feel/                # FeelDirector, ScreenShake, Hitstop, Particles, Smoke, Audio
   ├─ ui/                  # menus, mission select, garage, HUD (DOM/CSS)
   ├─ controls/            # nipplejs twin-stick input
   ├─ data/
   │  ├─ schemas/          # JSON schemas / zod
   │  └─ content/          # vehicles/ weapons/ maps/ missions/ trees/
   ├─ save/                # IndexedDB (idb) save/load + migration
   ├─ perf/                # tier detection + FPS governor + debug HUD
   └─ assets/              # asset manifest + loaders (glTF, KTX2)
```

## Perf budget (mid-range mobile, 60fps)
| Metric | Limit |
|--------|-------|
| Frame time | ≤ 16.6ms (governor reacts >18ms sustained) |
| Draw calls | ≤ ~150 |
| Triangles on screen | ≤ ~250k |
| Dynamic lights | 1 sun + ≤4 pooled point (high) |
| Particles live | Low ~1.5k / Med ~4k / High ~10k |
| Textures | KTX2/Basis, ORM-packed, ≤2k hero / ≤1k props |
See `mobile-perf-optimizer` skill for the governor + tier presets.

## Coding conventions
- **TypeScript strict; `any` is banned** (use `unknown` + narrowing, generics, or a real type).
- ESLint + Prettier; no unused exports. Prefer `readonly`, `const`, discriminated unions.
- **No per-frame allocations in hot loops** — reuse scratch `Vector3`/`Quaternion`; pool objects.
- Pure functions where possible; side effects isolated to systems.
- Components are plain data; logic lives in systems. Controllers read data-driven configs.
- Dispose discipline: anything created at runtime has an explicit owner that disposes it.
- Units: meters, seconds, m/s, degrees — documented in schemas.
- Commit at each milestone (M1..M6) with clear messages.

## Realism requirements (user priority)
- **Physics:** Havok rigid bodies with real mass, linear/angular damping (air drag),
  applied thrust/lift; explosions impart radial impulses; off-center hits impart spin.
- **Shooting:** ballistic projectiles with travel time + tracers (hitscan only for MG),
  recoil impulses, muzzle flash + light, splash damage with falloff.
- **Smoke:** lit GPU particle smoke — muzzle puffs, expanding explosion plumes, and
  **damage-state engine exhaust smoke** that thickens as vehicle HP drops.
- **Controls:** instant input (no lag); weight comes from physics inertia + banking, not
  from input smoothing.

## Skills (read before working a domain)
- `babylon-game-architect` — scene/physics/PBR/post/perf foundations (engine work)
- `game-feel-engineer` — juice, FX, smoke, audio, input feel (feel work)
- `mobile-perf-optimizer` — LOD, KTX2, instancing, governor (perf work)
- `game-data-designer` — JSON schemas, content authoring (content work)

## Subagents (domains — see `.claude/agents/`)
engine-agent · vehicle-agent · feel-agent · ui-agent · content-agent · perf-agent.
Orchestration: engine → vehicle → vertical slice (1 map + 1 vehicle + 1 mission) → scale.

## Milestones
M1 GDD approved ✅ · M2 engine boots + controllable Hornet · M3 vertical slice (must feel
great) · M4 full content + garage/save · M5 PWA + perf pass · M6 Cloudflare deploy + README.

## Commands (once scaffolded)
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview prod build
- `npm run validate-data` — validate content JSON against schemas
- `npm run typecheck` — tsc --noEmit (strict)
