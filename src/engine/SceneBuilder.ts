import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  Color3,
  PBRMaterial,
  Texture,
  RawTexture,
  HDRCubeTexture,
  ShadowGenerator,
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core";
import type { MapConfig, RGB } from "../data/types";
import { PROPS, PropKey, Placement, scatterProp, propColliders } from "./Props";

/** A weighted prop choice for seeded scatter. */
interface WeightedProp {
  readonly key: PropKey;
  readonly weight: number;
}

/**
 * A biome = the art direction for a map `theme`: which CC0 trees line the field, which props
 * clutter it, the cover piece, and how the ground/mountains/foliage are tinted. New biome = new
 * entry here + a map JSON with that `theme` (data-driven, per CLAUDE.md).
 */
interface Biome {
  readonly trees: readonly WeightedProp[];
  readonly treeLine: number;
  readonly treeInside: number;
  readonly scatter: readonly WeightedProp[];
  readonly scatterCount: number;
  /** Landmark props sprinkled a few times (cabins, big boulders). */
  readonly landmarks: readonly WeightedProp[];
  readonly landmarkCount: number;
  readonly cover: PropKey;
  /** Ground look. `texture` uses the sandy PBR set tinted by `groundTint`; `flat` is a plain
   * bright material with only the normal map (for snow). */
  readonly ground: "texture" | "flat";
  readonly groundTint: Color3;
  readonly mountainTint: Color3;
}

const BIOMES: Record<string, Biome> = {
  warzone: {
    trees: [{ key: "tree", weight: 1 }],
    treeLine: 56,
    treeInside: 22,
    scatter: [
      { key: "rock", weight: 3 },
      { key: "container", weight: 2 },
      { key: "barrel", weight: 1 },
    ],
    scatterCount: 20,
    landmarks: [{ key: "rockLarge", weight: 1 }],
    landmarkCount: 4,
    cover: "barrierLow",
    ground: "texture",
    groundTint: new Color3(1, 1, 1),
    mountainTint: new Color3(0.32, 0.29, 0.26),
  },
  snow: {
    trees: [{ key: "pineSnow", weight: 1 }],
    treeLine: 62,
    treeInside: 26,
    scatter: [
      { key: "rock", weight: 2 },
      { key: "barrel", weight: 1 },
      { key: "container", weight: 1 },
    ],
    scatterCount: 16,
    landmarks: [
      { key: "cabin", weight: 2 },
      { key: "rockLarge", weight: 1 },
    ],
    landmarkCount: 6,
    cover: "barrierLow",
    ground: "flat",
    groundTint: new Color3(0.92, 0.95, 1.0),
    mountainTint: new Color3(0.8, 0.83, 0.9),
  },
  industrial: {
    trees: [
      { key: "treeDead", weight: 2 },
      { key: "treeAutumn", weight: 1 },
    ],
    treeLine: 40,
    treeInside: 12,
    scatter: [
      { key: "container", weight: 3 },
      { key: "pipe", weight: 2 },
      { key: "crate", weight: 2 },
      { key: "barrel", weight: 2 },
    ],
    scatterCount: 26,
    landmarks: [{ key: "container", weight: 1 }],
    landmarkCount: 4,
    cover: "barrierLow",
    ground: "texture",
    groundTint: new Color3(0.62, 0.62, 0.64),
    mountainTint: new Color3(0.34, 0.31, 0.29),
  },
};

const biomeFor = (theme: string): Biome => BIOMES[theme] ?? BIOMES.warzone!;

/** Weighted pick from a seeded RNG. */
function pickWeighted(items: readonly WeightedProp[], r: number): PropKey {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let t = r * total;
  for (const it of items) {
    t -= it.weight;
    if (t <= 0) return it.key;
  }
  return items[items.length - 1]!.key;
}

/** Built arena: physics-backed geometry + gameplay bounds and spawn points. */
export interface Arena {
  bounds: { min: Vector3; max: Vector3 };
  playerSpawn: Vector3;
  enemySpawns: Vector3[];
  /** Sky/IBL HDRI — the render loop should wait for this so the world isn't black on entry. */
  env: HDRCubeTexture;
}

const col = (rgb: RGB): Color3 => new Color3(rgb[0], rgb[1], rgb[2]);

interface PBROpts {
  dir: string;
  base: string;
  metallic: number;
  roughness: number;
  uScale: number;
  tint: Color3;
}

/** CC0 PBR material (ambientCG): albedo + OpenGL normal + roughness, tinted per map. */
function pbr(scene: Scene, name: string, o: PBROpts): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  const albedo = new Texture(`textures/${o.dir}/${o.base}_Color.jpg`, scene);
  const normal = new Texture(`textures/${o.dir}/${o.base}_NormalGL.jpg`, scene);
  const rough = new Texture(`textures/${o.dir}/${o.base}_Roughness.jpg`, scene);
  for (const t of [albedo, normal, rough]) {
    t.uScale = o.uScale;
    t.vScale = o.uScale;
  }
  mat.albedoTexture = albedo;
  mat.albedoColor = o.tint;
  mat.bumpTexture = normal;
  mat.metallicTexture = rough;
  mat.useRoughnessFromMetallicTextureGreen = true;
  mat.useMetallnessFromMetallicTextureBlue = false;
  mat.metallic = o.metallic;
  mat.roughness = o.roughness;
  return mat;
}

/**
 * Mid-field clutter: real CC0 GLB props (rocks / containers / pipes / barrels / crates + biome
 * landmarks like cabins) scattered by a seeded RNG so the layout is deterministic per map but
 * varies between maps. Each prop type renders as ONE thin-instanced draw call; invisible physics
 * colliders are added synchronously so vehicles collide immediately. Replaces the old procedural
 * box buildings/containers.
 */
function dressProps(scene: Scene, map: MapConfig, shadows: ShadowGenerator, biome: Biome): void {
  const H = map.half;
  const rand = seededRng(1337 + Math.round(H));
  const [px, pz] = map.spawns.player;
  const clear = (x: number, z: number): boolean => Math.hypot(x - px, z - pz) > 20;

  // Bucket placements per prop key so each becomes a single thin-instanced mesh.
  const buckets = new Map<PropKey, Placement[]>();
  const add = (key: PropKey, p: Placement): void => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(p);
  };

  for (let i = 0; i < biome.scatterCount; i++) {
    const x = (rand() * 2 - 1) * (H - 12);
    const z = (rand() * 2 - 1) * (H - 12);
    if (!clear(x, z)) continue;
    add(pickWeighted(biome.scatter, rand()), { x, z, s: 0.8 + rand() * 0.6, yaw: rand() * Math.PI * 2 });
  }
  for (let i = 0; i < biome.landmarkCount; i++) {
    const x = (rand() * 2 - 1) * (H - 18);
    const z = (rand() * 2 - 1) * (H - 18);
    if (!clear(x, z)) continue;
    add(pickWeighted(biome.landmarks, rand()), { x, z, s: 0.9 + rand() * 0.4, yaw: rand() * Math.PI * 2 });
  }

  for (const [key, places] of buckets) {
    scatterProp(scene, PROPS[key], places, shadows);
    propColliders(scene, PROPS[key], places);
  }
}

/** Small seeded RNG (mulberry32) so scatter is deterministic per map. */
function seededRng(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Merge same-material meshes into one static, frozen, non-pickable draw call. */
function mergeStatic(name: string, meshes: Mesh[], mat: PBRMaterial): Mesh | null {
  if (meshes.length === 0) return null;
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  if (!merged) return null;
  merged.name = name;
  merged.material = mat;
  merged.isPickable = false;
  merged.freezeWorldMatrix();
  merged.doNotSyncBoundingInfo = true;
  return merged;
}

/**
 * Open-battlefield dressing: a distant ground skirt, a ring of low-poly mountains on the
 * horizon (so the edge reads as terrain, not a wall), and scattered trees — a dense tree line
 * just past the play bounds plus sparse trees inside for cover/depth. All the mountains and
 * trees are MERGED per-material into a few static meshes so the whole horizon is only a
 * handful of draw calls; in-play trees get their own slim invisible colliders.
 */
function buildOpenTerrain(scene: Scene, map: MapConfig, shadows: ShadowGenerator, biome: Biome): void {
  const H = map.half;
  const rng = seededRng(90210 + H);

  // Distant ground skirt — big flat plane reaching to the mountains (visual only).
  const skirt = MeshBuilder.CreateGround("skirt", { width: H * 8, height: H * 8, subdivisions: 1 }, scene);
  skirt.position.y = -0.55;
  const skirtMat = new PBRMaterial("skirtMat", scene);
  skirtMat.albedoColor = new Color3(0.42, 0.39, 0.31);
  skirtMat.roughness = 1;
  skirtMat.metallic = 0;
  skirt.material = skirtMat;
  skirt.freezeWorldMatrix();

  const rockMat = new PBRMaterial("mtnRock", scene);
  rockMat.albedoColor = biome.mountainTint.clone();
  rockMat.roughness = 1;
  rockMat.metallic = 0;
  const rockDark = new PBRMaterial("mtnRockD", scene);
  rockDark.albedoColor = biome.mountainTint.scale(0.72);
  rockDark.roughness = 1;

  // Mountain ring — low-poly cones at ~1.5×half, varied so the horizon feels natural.
  const rocks: Mesh[] = [];
  const rocksDark: Mesh[] = [];
  const ring = H * 1.55;
  const count = 26;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const r = ring * (0.9 + rng() * 0.35);
    const height = H * (0.35 + rng() * 0.5);
    const base = height * (0.9 + rng() * 0.5);
    const mtn = MeshBuilder.CreateCylinder(
      "mtn",
      { height, diameterTop: 0, diameterBottom: base, tessellation: 6 + Math.floor(rng() * 3) },
      scene,
    );
    mtn.position.set(Math.cos(a) * r, height / 2 - 2, Math.sin(a) * r);
    mtn.rotation.y = rng() * Math.PI;
    mtn.scaling.x = 0.8 + rng() * 0.6;
    (rng() < 0.5 ? rocks : rocksDark).push(mtn);
  }
  mergeStatic("mountains", rocks, rockMat);
  mergeStatic("mountainsDark", rocksDark, rockDark);

  // Trees — real CC0 GLB species per biome, each thin-instanced into a single draw call.
  const [px, pz] = map.spawns.player;
  const clearOfSpawn = (x: number, z: number): boolean => Math.hypot(x - px, z - pz) > 16;
  const treeBuckets = new Map<PropKey, Placement[]>();
  const addTree = (x: number, z: number, s: number): void => {
    const key = pickWeighted(biome.trees, rng());
    let b = treeBuckets.get(key);
    if (!b) treeBuckets.set(key, (b = []));
    b.push({ x, z, s, yaw: rng() * Math.PI * 2 });
  };

  // Dense tree line hugging the border (just inside the invisible walls), for a forest horizon.
  for (let i = 0; i < biome.treeLine; i++) {
    const a = (i / biome.treeLine) * Math.PI * 2;
    const r = H * (0.9 + rng() * 0.13);
    addTree(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rng() * 0.6);
  }

  // Sparse trees inside the play area for cover + depth, each with a slim invisible collider.
  const treeColliderPlaces: Placement[] = [];
  for (let i = 0; i < biome.treeInside; i++) {
    const x = (rng() * 2 - 1) * (H - 14);
    const z = (rng() * 2 - 1) * (H - 14);
    if (!clearOfSpawn(x, z)) continue;
    const s = 0.85 + rng() * 0.6;
    addTree(x, z, s);
    treeColliderPlaces.push({ x, z, s });
  }

  for (const [key, places] of treeBuckets) scatterProp(scene, PROPS[key], places, shadows);
  // One collider def represents any trunk (thin) — reuse the tree radius.
  propColliders(scene, { url: "", scale: 1, floorY: 0, colliderR: 0.4 }, treeColliderPlaces);
}

/**
 * Procedural tiling wave normal map (RawTexture) so realistic water needs no binary asset.
 * Value-noise height field → finite-difference normals, packed RGBA, seamless (grid wraps).
 */
function makeWaterNormal(scene: Scene, size = 256): RawTexture {
  const G = 8;
  const rnd = seededRng(24680);
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x: number, y: number): number => grid[(((y % G) + G) % G) * G + (((x % G) + G) % G)]!;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const height = (u: number, v: number): number => {
    const gx = u * G;
    const gy = v * G;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  const data = new Uint8Array(size * size * 4);
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const nx = height((u - e + 1) % 1, v) - height((u + e) % 1, v);
      const ny = height(u, (v - e + 1) % 1) - height(u, (v + e) % 1);
      const nz = 0.5; // controls bump strength
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.name = "waterNormalProc";
  return tex;
}

/** Build a map from its config: IBL env, floor, walls, cover, drains, fog, spawns. */
export function buildArena(scene: Scene, shadows: ShadowGenerator, map: MapConfig): Arena {
  const HALF = map.half;
  const biome = biomeFor(map.theme);
  scene.clearColor.set(map.palette.clear[0], map.palette.clear[1], map.palette.clear[2], 1);

  // Outdoor sky HDRI → skybox + IBL (realistic daylight + reflections).
  const env = new HDRCubeTexture("env/sky.hdr", scene, 256);
  scene.environmentTexture = env;
  scene.environmentIntensity = 1.0;
  scene.createDefaultSkybox(env, true, 1200, 0.12);

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = map.fogDensity * 0.6;
  scene.fogColor = col(map.palette.fog);

  // Floor — realistic sandy-gravel ground.
  const floor = MeshBuilder.CreateBox("floor", { width: HALF * 2, height: 1, depth: HALF * 2 }, scene);
  floor.position.y = -0.5;
  if (biome.ground === "flat") {
    // Snow: bright near-white material, only the sandy normal for micro relief (no albedo texture).
    const snow = new PBRMaterial("floorMat", scene);
    const nrm = new Texture("textures/ground/ground_NormalGL.jpg", scene);
    nrm.uScale = nrm.vScale = HALF / 4;
    snow.bumpTexture = nrm;
    snow.bumpTexture.level = 0.35;
    snow.albedoColor = biome.groundTint;
    snow.metallic = 0;
    snow.roughness = 0.72;
    floor.material = snow;
  } else {
    floor.material = pbr(scene, "floorMat", {
      dir: "ground",
      base: "ground",
      metallic: 0.0,
      roughness: 0.92,
      uScale: HALF / 4,
      tint: biome.groundTint,
    });
  }
  floor.receiveShadows = true;
  floor.freezeWorldMatrix();
  new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 0.9 }, scene);

  // Perimeter — INVISIBLE physics bounds (keeps vehicles in play) so the edge reads as open
  // terrain + a mountain ring instead of a concrete cage.
  const wallH = 12;
  const makeWall = (w: number, d: number, x: number, z: number): void => {
    const wall = MeshBuilder.CreateBox("wall", { width: w, height: wallH, depth: d }, scene);
    wall.position.set(x, wallH / 2, z);
    wall.isVisible = false;
    wall.freezeWorldMatrix();
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0, restitution: 0.2 }, scene);
  };
  makeWall(HALF * 2, 1, 0, HALF);
  makeWall(HALF * 2, 1, 0, -HALF);
  makeWall(1, HALF * 2, HALF, 0);
  makeWall(1, HALF * 2, -HALF, 0);

  buildOpenTerrain(scene, map, shadows, biome);

  // Cover — real CC0 GLB barriers at the map's authored cover points (thin-instanced).
  const coverDef = PROPS[biome.cover];
  const coverPlaces: Placement[] = map.cover.map(([x, z, yaw]) => ({ x, z, yaw: yaw * (Math.PI / 180) }));
  scatterProp(scene, coverDef, coverPlaces, shadows);
  propColliders(scene, coverDef, coverPlaces);

  // Drains.
  const drainMat = new PBRMaterial("drainMat", scene);
  drainMat.albedoColor = new Color3(0.05, 0.06, 0.07);
  drainMat.metallic = 0.3;
  drainMat.roughness = 0.5;
  for (const [x, z] of map.drains) {
    const drain = MeshBuilder.CreateDisc("drain", { radius: 1.4, tessellation: 24 }, scene);
    drain.rotation.x = Math.PI / 2;
    drain.position.set(x, 0.02, z);
    drain.material = drainMat;
    drain.freezeWorldMatrix();
  }

  // Optional lake/river — realistic water via low-roughness PBR (IBL sky reflection + fresnel)
  // with an ANIMATED procedural wave-normal for moving ripples. Robust: no extra render passes,
  // composes with the SSAO/HDR pipeline (unlike WaterMaterial's planar RTT reflections).
  if (map.water) {
    const w = map.water;
    const water = MeshBuilder.CreateGround("water", { width: w.w, height: w.d, subdivisions: 1 }, scene);
    water.position.set(w.x, w.level, w.z);
    const waterMat = new PBRMaterial("waterMat", scene);
    const normal = makeWaterNormal(scene);
    normal.uScale = Math.max(4, Math.round(w.w / 8));
    normal.vScale = Math.max(4, Math.round(w.d / 8));
    normal.level = 0.6; // ripple strength
    waterMat.bumpTexture = normal;
    waterMat.albedoColor = new Color3(0.02, 0.08, 0.12);
    waterMat.metallic = 0.55;
    waterMat.roughness = 0.12; // glossy → grazing fresnel reflects the sky HDRI
    waterMat.alpha = 0.9;
    waterMat.environmentIntensity = 1.6;
    water.material = waterMat;
    // Scroll the wave normals over time for live ripples (two layers, opposing drift).
    scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() * 0.001;
      normal.uOffset = t * 0.03;
      normal.vOffset = t * 0.017;
    });

    // Sandy shore lip so the lake reads as carved into the ground, not painted on.
    const shore = MeshBuilder.CreateGround("shore", { width: w.w + 6, height: w.d + 6, subdivisions: 1 }, scene);
    shore.position.set(w.x, w.level - 0.1, w.z);
    const shoreMat = new PBRMaterial("shoreMat", scene);
    shoreMat.albedoColor = new Color3(0.4, 0.35, 0.26);
    shoreMat.roughness = 1;
    shore.material = shoreMat;
    shore.freezeWorldMatrix();
    scene.metadata = { ...(scene.metadata as object | null), water: w };
  }

  dressProps(scene, map, shadows, biome);

  return {
    bounds: {
      min: new Vector3(-HALF + 1, -2, -HALF + 1),
      max: new Vector3(HALF - 1, 14, HALF - 1),
    },
    playerSpawn: new Vector3(map.spawns.player[0], 3, map.spawns.player[1]),
    enemySpawns: map.spawns.enemy.map((s) => new Vector3(s[0], 3, s[1])),
    env,
  };
}
