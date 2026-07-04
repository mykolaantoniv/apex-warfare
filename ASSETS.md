# ASSETS — License Log

> **2026-07-04 — asset policy changed:** this is now a **private, non-commercial personal game**,
> so the CC0-only rule is lifted — any-licensed models may be used (see CLAUDE.md). Military
> vehicle models below are **CC-BY 3.0** (Poly Pizza), chosen for a proper war-machine look.

**Legacy policy (superseded): CC0 assets ONLY.** Every asset used in Apex Warfare must be listed here with its
source URL and license. CC0 (public domain) sources: [Kenney.nl](https://kenney.nl),
[Quaternius](https://quaternius.com), [Poly Pizza](https://poly.pizza) (filter to CC0),
[ambientCG](https://ambientcg.com) (CC0 PBR textures), [Poly Haven](https://polyhaven.com)
(CC0 HDRIs/textures), [freesound.org](https://freesound.org) (filter CC0).

> Rule: if it's not CC0 and not logged here, it does not ship. When `content-agent` or
> anyone adds an asset, append a row in the relevant table in the same change.

## 3D Models
Drop CC0 `.glb` files in `public/models/` and set `visual.modelUrl` on the vehicle JSON — the
loader (`attachGlb` in `src/vehicles/models.ts`) swaps them in, falling back to the built-in
primitive mesh if absent. See `public/models/README.md`. Log every file added below.

All models are **CC0 1.0** from [Poly Pizza](https://poly.pizza) (author links are the model pages).

**Vehicles** (wired via `visual.modelUrl`):

| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| Helicopter | public/models/attack-heli.glb | https://poly.pizza/m/EQJ2MECUbx | kazuma | CC0 1.0 | All attack/transport helis (hornet, brute, mule, pest, wasp) |
| Tank | public/models/tank.glb | https://poly.pizza/m/cW3zvvkMOM | Quaternius | CC0 1.0 | Heavy tank (tank-boulder) |
| Tank | public/models/tank2.glb | https://poly.pizza/m/Dc4k4CooN3 | Quaternius | CC0 1.0 | Light tank (tank-raider) |
| Low poly Fighter | public/models/mil-jet.glb | https://poly.pizza/m/1fi8ZIDdFCP | Stephen Graybill | CC-BY 3.0 | Fighter jet (jet-talon) — replaced the civilian "Swordfish" |
| Military Motorbike | public/models/mil-bike.glb | https://poly.pizza/m/9SwnIlPjNv | Zsky | CC-BY 3.0 | Scout bike (bike-scout) — replaced the civilian sports car |
| Military Boat | public/models/mil-boat.glb | https://poly.pizza/m/wouBxOe3CD | Zsky | CC-BY 3.0 | Patrol gunboat (boat-gunner) — replaced the civilian dinghy |

**Environment props** (thin-instanced by `SceneBuilder`, per-biome):

| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| Pine Tree with Snow | public/models/prop-pine-snow.glb | https://poly.pizza/m/17vQv2X5rh | Quaternius | CC0 1.0 | Snow biome pines |
| Tree | public/models/prop-tree.glb | https://poly.pizza/m/2paAm1ja4w | Quaternius | CC0 1.0 | Forest trees |
| Autumn Tree | public/models/prop-tree-autumn.glb | https://poly.pizza/m/2lRubrT6Na | Quaternius | CC0 1.0 | Industrial/autumn foliage |
| Dead Tree | public/models/prop-tree-dead.glb | https://poly.pizza/m/16MPvqwlmE | Quaternius | CC0 1.0 | Industrial/dead foliage |
| Rock | public/models/prop-rock.glb | https://poly.pizza/m/34W5ymEePk | Quaternius | CC0 1.0 | Scatter rocks |
| Rock Large | public/models/prop-rock-large.glb | https://poly.pizza/m/54jZKTAt5p | Quaternius | CC0 1.0 | Large boulders |
| Mountain | public/models/prop-mountain.glb | https://poly.pizza/m/7HYR2s9JVi | Quaternius | CC0 1.0 | Border-terrain relief |
| Hut | public/models/prop-cabin.glb | https://poly.pizza/m/4MJWbyd6vw | Quaternius | CC0 1.0 | Snow-biome cabins |
| Container Small | public/models/prop-container.glb | https://poly.pizza/m/B79i6fHgVU | Quaternius | CC0 1.0 | Industrial containers |
| Exploding Barrel | public/models/prop-barrel.glb | https://poly.pizza/m/1orHe0kCc1 | Quaternius | CC0 1.0 | Barrels |
| Pipe | public/models/prop-pipe.glb | https://poly.pizza/m/CpCnSuo786 | Quaternius | CC0 1.0 | Industrial pipes |
| Crate | public/models/prop-crate.glb | https://poly.pizza/m/CnMGEDwg8s | Quaternius | CC0 1.0 | Crates |
| Barrier Large | public/models/prop-barrier.glb | https://poly.pizza/m/gLbBiYwt7l | Quaternius | CC0 1.0 | Concrete cover barriers |
| Traffic Barrier | public/models/prop-barrier-traffic.glb | https://poly.pizza/m/cM3aJPU9NS | Quaternius | CC0 1.0 | Low cover barriers |

## Textures / Materials (PBR)
| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| sandy_gravel_02 | public/textures/ground/ground_* | https://polyhaven.com/a/sandy_gravel_02 | Poly Haven | CC0 | Arena ground (all maps) |
| Metal032 | public/textures/metal/Metal032_1K-JPG_* | https://ambientcg.com/view?id=Metal032 | ambientCG | CC0 | Cover blocks / props |

## Environment / HDRI (.env, IBL)
| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| studio_small_08 (2K) | public/env/ibl.hdr | https://polyhaven.com/a/studio_small_08 | Poly Haven | CC0 | Garage showcase IBL |
| kloofendal_48d_partly_cloudy_puresky (2K) | public/env/sky.hdr | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Poly Haven | CC0 | Gameplay skybox + IBL |

## Audio (SFX / music)
| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| Helicopter Ambience | public/audio/heli.mp3 | https://pixabay.com/sound-effects/helicopter-ambience-353004/ | Pixabay | Pixabay Content License (free, no attribution required — NOT strictly CC0) | Heli engine loop (user-requested) |

> Note: one-shot SFX (fire/hit/explosion) are procedurally synthesized (no asset). The heli
> engine loop uses the Pixabay file above if present, else falls back to synth.

## Fonts
| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| _(none yet)_ | | | | OFL/CC0 | HUD monospace |

## Notes
- Prefer CC0 to avoid attribution obligations, but we still credit authors here as courtesy.
- Convert textures to KTX2/Basis and HDRIs to `.env` in the asset pipeline (keep sources too).
- Placeholder primitives (boxes/capsules) generated in-code need no entry; replace before M4.
