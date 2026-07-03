# ASSETS — License Log

**Policy: CC0 assets ONLY.** Every asset used in Apex Warfare must be listed here with its
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

| Asset | File | Source (URL) | Author | License | Used for |
|-------|------|--------------|--------|---------|----------|
| _(none yet — pipeline ready, awaiting CC0 GLBs)_ | | | | CC0 | |

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
