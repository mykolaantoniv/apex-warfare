---
name: game-data-designer
description: JSON schemas and data-driven content design for Apex Warfare — vehicles, weapons, maps, missions, upgrades. New content = new JSON, not new code. Read this for any content authoring, schema, balance-data, or save-format work.
---

# Game Data Designer

**Core philosophy:** all content is data. Adding a vehicle, weapon, map, mission, or
upgrade tree means writing validated JSON — never editing engine code. Schemas live in
`src/data/schemas/`, content in `src/data/content/`, validated at build + load.

## 0. Rules
- TypeScript `interface` per type mirrors a JSON Schema; validate with a runtime validator
  (e.g. `ajv` or zod) at load — fail loud with the offending file + field.
- IDs are stable kebab-case strings (`heli-hornet`, `weapon-rocket-pod`). Cross-references
  use IDs (mission → vehicleId, map → missionIds). Validate referential integrity at boot.
- Units are explicit and documented (meters, seconds, m/s, degrees). No magic numbers.
- Balance values live in data, not code, so the perf/feel of tuning is fast iteration.

## 1. Vehicle schema
```jsonc
{
  "id": "heli-hornet",
  "name": "Hornet",
  "class": "attack-heli",            // attack-heli|transport-heli|jet|tank
  "movement": {
    "model": "heli",                 // heli|jet|tank — selects controller
    "mass": 2.0,                     // physics mass
    "maxSpeed": 9.0,                 // m/s
    "accelForce": 28.0,              // N applied from stick
    "linearDamping": 1.6,            // air drag
    "angularDamping": 6.0,
    "turnRate": 220,                 // deg/s yaw toward aim/move
    "hoverLift": true,               // helis counter gravity
    "bankAngleMax": 22               // deg cosmetic tilt
  },
  "stats": {
    "maxHealth": 100,
    "armor": 0.15                    // damage reduction 0..1
  },
  "weapons": { "primary": "weapon-vulcan", "special": "weapon-rocket-pod" },
  "upgradeTreeId": "tree-hornet",
  "visual": { "model": "hornet.glb", "scale": 1.0, "smokeAnchor": "exhaust" },
  "audio": { "engineLoop": "heli_loop", "enginePitchRange": [0.8, 1.6] },
  "unlock": { "type": "mission", "missionId": "m1-3" }   // or "type":"starter"
}
```

## 2. Weapon schema
```jsonc
{
  "id": "weapon-rocket-pod",
  "name": "Rocket Pod",
  "kind": "projectile",              // hitscan|projectile|mortar
  "damage": 34,
  "fireRate": 2.5,                   // shots/sec (or volley cadence)
  "magazine": 8,                     // -1 = infinite
  "reloadTime": 2.0,                 // sec
  "projectile": {
    "speed": 40, "gravity": 0, "lifetime": 2.5, "radius": 0.06,
    "splashRadius": 1.2, "splashFalloff": "linear", "tracer": true
  },
  "spread": 1.5,                     // deg cone
  "recoil": 0.4,                     // feel impulse
  "fx": { "muzzle": "fx-muzzle-big", "impact": "fx-explosion-small", "tracer": "fx-tracer-rocket" },
  "audio": { "fire": "rocket_fire", "impact": "explosion_small" }
}
```
- `hitscan` = instant raycast (vulcan/MG); `projectile` = ballistic with travel;
  `mortar` = arcing dynamic body with `gravity` + bounce.

## 3. Map schema
```jsonc
{
  "id": "map-shower",
  "name": "Shower Arena",
  "theme": "bathroom",
  "scene": { "model": "shower_arena.glb", "envTexture": "bathroom.env",
             "sunDir": [-0.4,-1,-0.3], "fog": { "density": 0.015, "color": [0.7,0.75,0.8] } },
  "bounds": { "min": [-20,-2,-20], "max": [20,10,20] },
  "spawns": { "player": [[0,1,8]], "enemy": [[10,1,-10],[ -10,1,-10],[0,1,-14]] },
  "hazards": [ { "type": "drain", "pos": [0,-0.5,0], "radius": 1.5, "damage": 999 } ],
  "cover": [ { "model": "soap.glb", "pos": [4,0,2], "rot": 30 } ],
  "missionIds": ["m-shower-1","m-shower-2","m-shower-3"],
  "perf": { "maxEnemiesOnScreen": 8 }
}
```

## 4. Mission schema
```jsonc
{
  "id": "m-shower-1",
  "mapId": "map-shower",
  "name": "Wet Work",
  "type": "deathmatch",              // deathmatch|score-attack|survival
  "objective": { "killTarget": 8, "timeLimitSec": 0 },     // type-specific
  "waves": [                          // survival/escalation; deathmatch can use 1 wave
    { "enemies": [ { "vehicleId": "heli-hornet", "ai": "ai-rusher", "count": 3 } ],
      "spawnDelaySec": 0 }
  ],
  "difficulty": { "enemyHealthMul": 1.0, "enemyDamageMul": 1.0, "aggroRange": 14 },
  "rewards": { "scrapBase": 120, "scrapPerKill": 8 },
  "stars": {                          // thresholds for 1..3 stars
    "time": [120, 80, 50],            // sec (<= earns that star count tier)
    "healthRemaining": [0, 40, 75]    // % HP at end
  },
  "unlock": { "type": "previous" }    // or {"type":"stars","required":6}
}
```

## 5. Upgrade tree schema
```jsonc
{
  "id": "tree-hornet",
  "vehicleId": "heli-hornet",
  "branches": {
    "armor":   [ { "id":"a1","stat":"maxHealth","add":20,"cost":80 },
                 { "id":"a2","stat":"armor","add":0.05,"cost":160,"requires":"a1" } ],
    "damage":  [ { "id":"d1","stat":"weapon.primary.damage","mul":1.15,"cost":100 } ],
    "mobility":[ { "id":"m1","stat":"movement.maxSpeed","add":1.5,"cost":90 } ],
    "special": [ { "id":"s1","stat":"weapon.special.reloadTime","mul":0.85,"cost":140 } ]
  }
}
```
- `stat` is a dot-path applied to a resolved vehicle instance. `add` and `mul` compose
  deterministically (apply all `add` then all `mul`, or define order in the resolver).
- `requires` enforces tree order. Costs rise per tier.

## 6. Save schema (IndexedDB via idb)
```jsonc
{
  "version": 1,
  "scrap": 0,
  "unlockedVehicles": ["heli-hornet"],
  "missionStars": { "m-shower-1": 2 },     // best stars per mission
  "missionBestTime": { "m-shower-1": 71.4 },
  "purchasedUpgrades": { "tree-hornet": ["a1","d1"] },
  "settings": { "qualityTier": "auto", "masterVolume": 0.8, "haptics": true }
}
```
- Migrate on `version` bump. Never trust shape — validate on load, fall back to defaults.

## 7. Authoring workflow (content-agent)
1. Write JSON in `src/data/content/<type>/<id>.json`.
2. Run schema validation (`npm run validate-data`) — fix until clean.
3. Check referential integrity (all referenced IDs exist).
4. Balance pass against the curve (see GDD §4/§6); record rationale in a comment.
5. Asset referenced? Add it to `ASSETS.md` with CC0 source + license.

## Checklist (definition of done for content tasks)
- [ ] Valid against schema; IDs kebab-case & unique
- [ ] All cross-references resolve (vehicle/weapon/map/mission/tree)
- [ ] Units explicit; balance fits the difficulty curve
- [ ] Stars thresholds set; rewards within economy budget
- [ ] Any new asset logged in ASSETS.md (CC0)
- [ ] `npm run validate-data` passes in CI
