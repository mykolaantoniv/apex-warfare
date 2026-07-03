# Vehicle models (CC0 .glb / .gltf)

Drop CC0 GLB files here and the game loads them automatically — no code changes. If a file
is missing or fails to load, the built-in primitive mesh is used instead (graceful fallback),
so the game always renders.

## How to enable a model for a vehicle

Add a `modelUrl` (and optional tuning fields) to the vehicle's `visual` block in
`src/data/content/vehicles/<id>.json`:

```json
"visual": {
  "scale": 1.0,
  "modelUrl": "models/attack-heli.glb",
  "modelScale": 1.4,
  "yawOffset": 180,
  "heightOffset": -0.3
}
```

- **modelUrl** — path under `public/` (so `public/models/attack-heli.glb` → `"models/attack-heli.glb"`).
- **modelScale** — uniform scale for the GLB (its units usually differ from our primitives). Tune until it matches the others.
- **yawOffset** — degrees, so the model's nose points forward (+Z). Try `180` if it faces backwards.
- **heightOffset** — metres, so it rests on the ground/waterline instead of floating or sinking.

## Where to get CC0 models

- **Quaternius** — https://quaternius.com (military/vehicle packs, CC0)
- **Kenney** — https://kenney.nl (vehicle kits, CC0)
- **Poly Pizza** — https://poly.pizza (filter to CC0)

Export/convert to `.glb` (binary glTF) for a single self-contained file. Keep them low-poly
(≤ a few thousand triangles) and ORM/KTX2-friendly to hold the mobile perf budget.

## Log every file you add

Add a row to the **3D Models** table in `/ASSETS.md` with the source URL, author, and license.
Only CC0 ships.
