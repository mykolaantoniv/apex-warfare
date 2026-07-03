---
name: babylon-game-architect
description: Best practices for Babylon.js scene graph, asset pipeline, Havok physics, PBR materials, post-processing, and mobile perf budgeting for Apex Warfare. Read this when working on engine core, scene setup, physics, rendering, or materials.
---

# Babylon.js Game Architect

Authoritative engineering reference for the **engine** domain of Apex Warfare.
Goal: a realistic-looking, 60fps-on-mobile diorama combat game.

## 0. Golden rules
- **One `Engine`, one `Scene`** for gameplay. Menus are DOM/CSS overlays, not extra scenes.
- **WebGL2** required; detect and warn on fallback. Prefer `Engine` with
  `{ antialias: false, powerPreference: "high-performance", stencil: true }` and do AA
  via the post pipeline (FXAA/SMAA) so it's tier-scalable.
- **Fixed-timestep simulation** (physics + gameplay), variable-timestep render. Never
  put gameplay logic in a raw `render` callback without an accumulator.
- **Everything pooled.** Projectiles, particles, damage numbers, enemies — never
  `new Mesh` mid-combat. Allocate in pools at map load.
- **Dispose discipline.** Every `Mesh`/`Material`/`Texture`/`ParticleSystem` created at
  runtime has an owner that disposes it. Leaks = mobile crashes.

## 1. Boot sequence (engine-agent owns)
```
1. Create canvas, Engine (WebGL2, high-performance).
2. await HavokPhysics() WASM, enable scene.enablePhysics(gravity, new HavokPlugin()).
3. Build Scene: clearColor, ambient, fog (subtle, sells diorama scale).
4. Lighting: 1 DirectionalLight "sun" (shadow caster) + 1 HemisphericLight (ambient fill).
5. Camera: ArcRotate or custom follow rig (see §5).
6. DefaultRenderingPipeline (bloom, tonemap=ACES, image processing, FXAA).
7. ShadowGenerator on sun (tier-scaled size: 512/1024/2048).
8. Load map glTF + collision meshes; freeze static world matrices.
9. Register physics bodies. Start fixed-step loop.
10. engine.runRenderLoop -> step(accumulator) + scene.render().
```

## 2. Scene graph layout
```
Scene
├─ __environment__ (TransformNode, static)   // map geometry, frozen
├─ __vehicles__    (TransformNode)            // player + bots
├─ __projectiles__ (TransformNode, pooled)
├─ __fx__          (TransformNode, pooled)    // particles, decals
├─ __sun__ DirectionalLight (+ ShadowGenerator)
└─ __ambient__ HemisphericLight
```
- Call `mesh.freezeWorldMatrix()` on static environment meshes.
- `scene.freezeActiveMeshes()` only AFTER all dynamic meshes are registered; unfreeze if
  the active set changes (rare). Safer: `mesh.alwaysSelectAsActiveMesh = false` and rely
  on frustum culling.
- Use `scene.skipPointerMovePicking = true`, `scene.autoClear` true for main, and disable
  unused features (`scene.probesEnabled=false`, etc.) you don't use.

## 3. Physics (Havok) — realistic but tuned
- Plugin: `HavokPlugin` via `@babylonjs/havok` (WASM). `await HavokPhysics()` then
  `new HavokPlugin(true, havokInstance)`; `scene.enablePhysics(new Vector3(0,-9.81,0), plugin)`.
- **Bodies:**
  - Environment: `PhysicsBody` with `PhysicsMotionType.STATIC`, mesh/convex shapes.
  - Vehicles: `DYNAMIC` body with realistic **mass** (heli ~1.5–3 "units", tank ~10),
    `setLinearDamping`/`setAngularDamping` for air drag, and applied forces (see vehicle skill).
  - Projectiles: prefer **kinematic raycast** ballistics (cheaper, no tunneling) OR small
    dynamic bodies for grenades/mortars that need arcs + bounce.
- **Lift/thrust model (helis):** apply continuous upward force ≈ mass*gravity ± control,
  plus directional thrust from stick. Add `angularDamping` so it doesn't spin forever.
  Banking = cosmetic tilt toward velocity (lerp the visual mesh, not the body) for weight.
- **Continuous collision:** enable CCD on fast projectiles to avoid tunneling, or use
  raycast-per-step. Mortar/grenade = dynamic + restitution for bounce.
- **Layers/filtering:** use collision filter groups (player, enemy, projectile-player,
  projectile-enemy, world) so player rockets don't hit the player, etc.
- **Determinism:** fixed substep (e.g. 1/120s, 2 substeps per 1/60 frame) for stable feel.

## 4. Materials / PBR (sells realism)
- Use `PBRMaterial` (metallic/roughness). Source CC0 PBR textures (albedo, normal,
  ORM-packed metallic/rough/AO) — KTX2/Basis compressed.
- **Wet tile look (Shower Arena):** high `metallic` in puddle decals, low roughness,
  enable a reflection probe OR screen-space-ish fake via environment texture (HDR .env).
- Provide an **IBL environment** (`scene.environmentTexture` = compressed .env) for
  realistic reflections/ambient — cheap and huge visual win.
- Clearcoat on vehicle paint (`clearCoat.isEnabled`) for a premium glossy finish.
- Atlas/share materials; `material.freeze()` once params are set.

## 5. Camera (follow rig)
- Custom follow: a `TransformNode` target that **lerps** toward the player position with
  **look-ahead** (offset toward velocity + aim direction). Camera = ArcRotate locked to
  this target, or a `UniversalCamera` parented to a spring arm.
- Spring damping (critically-damped lerp) so it's smooth but not floaty.
- **Zoom-punch** on big explosions (feel-agent hooks this). Clamp pitch/zoom for mobile.
- Subtle FOV widen with player speed for a sense of velocity.

## 6. Post-processing (`DefaultRenderingPipeline`)
- Tonemapping: **ACES**. `imageProcessing.toneMappingEnabled = true`.
- **Bloom:** threshold ~0.8, weight tier-scaled. Drives the neon-HUD + explosion pop.
- **FXAA** (low/med) → **SMAA** (high). MSAA only on high-tier desktop-class.
- Optional, high-tier only: SSAO2 (expensive), depth-of-field on results screen only.
- Vignette subtle; chromatic aberration tiny on hit (feel-agent pulses it).
- **Never** enable DOF/SSAO on low tier — perf killer.

## 7. Shadows
- One `CascadedShadowGenerator` (high) or `ShadowGenerator` (low/med) on the sun only.
- Tier map size: Low 512 / Med 1024 / High 2048. `usePercentageCloserFiltering` med+.
- Only vehicles + key props cast; ground only receives. Freeze shadow casters list when
  the scene is static.

## 8. Mobile perf hooks (see mobile-perf-optimizer skill for the governor)
- `engine.setHardwareScalingLevel()` is the master resolution dial the FPS governor turns.
- Use **thin instances** / `InstancedMesh` for repeated props (tiles, bolts, lockers).
- Merge static environment meshes per-material (`Mesh.MergeMeshes`).
- `scene.blockMaterialDirtyMechanism = true` after setup.
- Cap `scene.particlesEnabled` particle counts per tier.

## 9. Gotchas
- Havok WASM must be fetched/instantiated before `enablePhysics`; serve the `.wasm` from
  the bundle (Vite asset) and ensure the SW precaches it for offline PWA.
- Don't parent physics-bodied meshes to moving nodes — physics fights the parent transform.
  Keep dynamic bodies at scene root; drive child visuals separately.
- `freezeActiveMeshes` + spawning new meshes = invisible objects. Unfreeze around spawns
  or pre-spawn pools before freezing.
- iOS Safari: WebGL2 ok but watch memory (texture budget); aggressively compress.
- Audio needs a user-gesture unlock (first tap) — wire into the main-menu Play button.

## Checklist (definition of done for engine tasks)
- [ ] Fixed-timestep loop with accumulator
- [ ] Havok enabled, gravity correct, bodies filtered by collision group
- [ ] Sun + ambient + IBL env set; ACES + bloom pipeline on
- [ ] Shadow generator tier-scaled
- [ ] Pools allocated at load; nothing `new`'d in combat
- [ ] Static world frozen & merged; draw calls within budget (see perf skill)
- [ ] Everything runtime-created has a disposer
