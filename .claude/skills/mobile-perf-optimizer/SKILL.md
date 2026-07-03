---
name: mobile-perf-optimizer
description: Mobile performance for Apex Warfare — LOD, KTX2/Basis texture compression, draw-call batching, instancing, frustum culling, device-tier detection, and the runtime FPS governor / quality auto-scaling. Read this for any profiling, budgeting, or quality-scaling work.
---

# Mobile Perf Optimizer

Target: **stable 60fps on mid-range phones** while looking realistic. Perf is a feature;
the FPS governor protects it automatically.

## 0. Budget (per frame, mid-range target)
| Metric | Budget |
|--------|--------|
| Frame time | ≤ 16.6ms (hard), governor reacts at >18ms sustained |
| Draw calls | ≤ ~150 |
| Triangles | ≤ ~250k on screen |
| Active dynamic lights | 1 sun + ≤ 4 pooled point (high), ≤ 2 (low) |
| Shadow casters | vehicles + key props only |
| Particle live count | tier-capped (Low ~1.5k / Med ~4k / High ~10k) |
| Texture memory | aggressive KTX2; ≤ 2k hero, ≤ 1k props, atlas small stuff |

## 1. Device-tier detection (at boot)
Heuristics → tier `Low | Med | High`:
- `navigator.hardwareConcurrency` (cores), `navigator.deviceMemory` (GB) if present.
- GPU string via `WEBGL_debug_renderer_info` (UNMASKED_RENDERER) — flag known low-end.
- `window.devicePixelRatio` and screen resolution (4k phone at native = expensive).
- Quick **boot benchmark:** render N frames, measure avg; downshift if slow.
- Persist chosen tier (IndexedDB) but always let the runtime governor override down.

Tier presets control: hardware scaling (resolution), shadow map size, post-FX
(FXAA vs SMAA, SSAO on/off, DOF off), particle caps, LOD bias, max dynamic lights,
draw distance/fog, anisotropy.

## 2. Runtime FPS governor (auto quality-scaling)
Keep a rolling avg frame time (EMA over ~30 frames). State machine:
- If avg > 18ms for >0.5s → **step down** one quality notch (in order):
  1. raise `engine.setHardwareScalingLevel` (e.g. 1.0→1.25→1.5),
  2. lower shadow quality/size,
  3. reduce particle caps,
  4. disable optional post-FX (SSAO, DOF, chromatic),
  5. drop bloom quality / draw distance.
- If avg < 14ms for >3s AND not at max → **step up** one notch (hysteresis prevents
  oscillation). Never step up during heavy combat (check active particle/enemy count).
- Master dial = `setHardwareScalingLevel`; it's the cheapest big win on mobile.
- Expose current tier/scale in a debug overlay (toggle).

## 3. Geometry & draw calls
- **Instancing:** `thinInstances` for tiles/bolts/repeated props (one draw call for thousands).
  `InstancedMesh` for a handful of variants. Bots of same vehicle = instances where possible.
- **Merge** static environment per material (`Mesh.MergeMeshes(meshes, true, true)`); freeze.
- **LOD:** `mesh.addLODLevel(distance, lowMesh)` and `addLODLevel(far, null)` to cull.
  Author 2–3 LODs per vehicle/prop (or auto-decimate offline). Bias distances by tier.
- Backface cull on; double-sided only where needed.
- `scene.freezeActiveMeshes()` once dynamic set is stable; `mesh.freezeWorldMatrix()` on statics.

## 4. Textures
- **KTX2 + Basis Universal** (transcodes to device-native: ASTC/ETC2/BCn). Pipeline:
  author/source PNG → `toktx`/`basisu` → `.ktx2`. Babylon loads via KTX2 decoder (ensure
  the transcoder `.wasm`/`.js` is bundled + SW-precached for offline).
- Pack **ORM** (occlusion/roughness/metallic) into one RGB texture.
- Mipmaps on; anisotropy 4 (med/high) / 1 (low). Cap max size per tier.
- Atlas UI + small props. Reuse materials; `material.freeze()`.

## 5. Culling & scene hygiene
- Frustum culling is automatic; set correct bounding info on merged meshes.
- `scene.skipPointerMovePicking = true`; disable unused subsystems (probes, collisions
  engine if using Havok only, lens flares, etc.).
- `scene.blockMaterialDirtyMechanism = true` after setup.
- Avoid per-frame allocations (reuse `Vector3`/`Quaternion` scratch objects; no closures
  in the hot loop). GC pauses = frame hitches on mobile.
- Pool EVERYTHING runtime-spawned (projectiles, particles, numbers, enemies).

## 6. Physics perf
- Use raycast ballistics for bullets (no body per bullet). Limit simultaneous dynamic
  bodies. Sleep idle bodies. Tier-scale physics substeps (high 2, low 1).
- Simple convex/box collision shapes, never render-mesh colliders for dynamics.

## 7. PWA / load perf
- Code-split; lazy-load maps/vehicles JSON + meshes per mission.
- Precache core + first map in the service worker; stream the rest.
- Compress glTF with Draco/meshopt; bundle decoders + ensure offline precache.
- Show a real loading screen with progress; warm pools during it.

## 8. Profiling workflow
- Babylon Inspector (`scene.debugLayer`) — dev only, tree-shaken from prod.
- `engine.getFps()`, `SceneInstrumentation` (draw calls, active meshes), `EngineInstrumentation`
  (GPU frame time where available).
- Chrome remote-debug real Android device; Safari Web Inspector for iOS. Test on a
  REAL mid-range phone, not just desktop throttling.
- Add an in-game debug HUD: fps, frame ms, draw calls, tris, particle count, tier.

## Checklist (definition of done for perf tasks)
- [ ] Device tier detected at boot + persisted; governor can override down
- [ ] Runtime FPS governor with hysteresis, master = hardwareScalingLevel
- [ ] Statics merged + frozen; repeats instanced; LODs authored
- [ ] KTX2/Basis textures, ORM-packed, mipmapped, tier-capped sizes; decoder precached
- [ ] No per-frame allocations in hot loop; everything pooled
- [ ] Raycast bullets; dynamic body count + substeps tier-scaled
- [ ] Verified 60fps on a real mid-range device
