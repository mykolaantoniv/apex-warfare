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

/** Procedural warzone structures — buildings, containers, watchtowers, rocks — that fill
 * the map and block line of sight (CC0-by-construction). */
function buildWarzone(scene: Scene, map: MapConfig, shadows: ShadowGenerator): void {
  const H = map.half;
  const f = H / 90; // scale placements with map size

  const concrete = new PBRMaterial("wzConcrete", scene);
  concrete.albedoColor = new Color3(0.52, 0.5, 0.46);
  concrete.roughness = 0.9;
  const concreteDark = new PBRMaterial("wzConcreteD", scene);
  concreteDark.albedoColor = new Color3(0.34, 0.33, 0.3);
  concreteDark.roughness = 0.92;
  const rockMat = new PBRMaterial("wzRock", scene);
  rockMat.albedoColor = new Color3(0.3, 0.27, 0.24);
  rockMat.roughness = 0.95;
  const mkContainer = (name: string, tint: Color3): PBRMaterial =>
    pbr(scene, name, { dir: "metal", base: "Metal032_1K-JPG", metallic: 0.5, roughness: 0.62, uScale: 2, tint });
  const containerMats = [
    mkContainer("wzC1", new Color3(0.7, 0.18, 0.12)),
    mkContainer("wzC2", new Color3(0.16, 0.34, 0.55)),
    mkContainer("wzC3", new Color3(0.3, 0.42, 0.2)),
  ];

  const solid = (m: Mesh, mat: PBRMaterial): void => {
    m.material = mat;
    m.receiveShadows = true;
    shadows.addShadowCaster(m);
    m.freezeWorldMatrix();
    new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass: 0, restitution: 0.1 }, scene);
  };
  const building = (x: number, z: number, w: number, h: number, d: number, rot: number, mat: PBRMaterial): void => {
    const b = MeshBuilder.CreateBox("wzBuilding", { width: w, height: h, depth: d }, scene);
    b.position.set(x, h / 2, z);
    b.rotation.y = rot;
    solid(b, mat);
  };
  const container = (x: number, y: number, z: number, rot: number, mat: PBRMaterial): void => {
    const c = MeshBuilder.CreateBox("wzContainer", { width: 6, height: 2.6, depth: 2.5 }, scene);
    c.position.set(x, y, z);
    c.rotation.y = rot;
    solid(c, mat);
  };

  // Buildings + watchtowers.
  building(-35 * f, 6 * f, 16, 13, 20, 0.15, concrete);
  building(-52 * f, -8 * f, 12, 8, 14, -0.25, concreteDark);
  building(-40 * f, 24 * f, 10, 7, 12, 0.4, concrete);
  building(55 * f, 46 * f, 16, 11, 14, 0.5, concrete);
  building(-58 * f, 50 * f, 14, 9, 18, -0.4, concreteDark);
  building(36 * f, 62 * f, 18, 15, 12, 0, concrete);
  building(20 * f, 20 * f, 9, 6, 9, 0.6, concreteDark);
  building(48 * f, 2 * f, 5, 22, 5, 0, concrete);
  building(-14 * f, 72 * f, 4, 18, 4, 0, concreteDark);

  // Container stacks.
  container(-22 * f, 1.3, 4 * f, 0.4, containerMats[0]!);
  container(-22 * f, 3.9, 4 * f, 0.4, containerMats[1]!);
  container(-16 * f, 1.3, 0, 0.1, containerMats[2]!);
  container(50 * f, 1.3, 40 * f, 1.2, containerMats[1]!);
  container(50 * f, 3.9, 40 * f, 1.2, containerMats[0]!);

  // Seeded scatter of rocks + lone containers (seed per map so layouts differ).
  const rand = seededRng(1337 + Math.round(H));
  const [px, pz] = map.spawns.player;
  for (let i = 0; i < 16; i++) {
    const x = (rand() * 2 - 1) * (H - 12);
    const z = (rand() * 2 - 1) * (H - 12);
    if (Math.hypot(x - px, z - pz) < 20) continue; // keep the player spawn clear
    if (rand() < 0.55) {
      const s = 2 + rand() * 4;
      const rock = MeshBuilder.CreateBox("wzRock", { width: s, height: s * 0.8, depth: s * 1.1 }, scene);
      rock.position.set(x, s * 0.4, z);
      rock.rotation.set(rand() * 0.3, rand() * Math.PI, rand() * 0.3);
      solid(rock, rockMat);
    } else {
      container(x, 1.3, z, rand() * Math.PI, containerMats[Math.floor(rand() * 3)]!);
    }
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

/**
 * One low-poly tree = trunk + 2–3 stacked foliage cones. The meshes are pushed into
 * per-material buckets (bark / leaf) so the whole forest can be merged into a couple of
 * static meshes afterwards — keeping draw calls low on mobile.
 */
function makeTree(
  scene: Scene,
  x: number,
  z: number,
  s: number,
  rot: number,
  barkBucket: Mesh[],
  leafBucket: Mesh[],
): void {
  const trunk = MeshBuilder.CreateCylinder("tree", { height: 2.4 * s, diameterTop: 0.35 * s, diameterBottom: 0.55 * s, tessellation: 6 }, scene);
  trunk.position.set(x, 1.2 * s, z);
  barkBucket.push(trunk);
  const tiers = 2 + (Math.floor(rot) % 2);
  for (let i = 0; i < tiers; i++) {
    const cone = MeshBuilder.CreateCylinder(
      "leaf",
      { height: 2.6 * s, diameterTop: 0, diameterBottom: (3.4 - i * 0.7) * s, tessellation: 7 },
      scene,
    );
    cone.position.set(x, (2.6 + i * 1.5) * s, z);
    cone.rotation.y = rot;
    leafBucket.push(cone);
  }
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
function buildOpenTerrain(scene: Scene, map: MapConfig, _shadows: ShadowGenerator): void {
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
  rockMat.albedoColor = new Color3(0.32, 0.29, 0.26);
  rockMat.roughness = 1;
  rockMat.metallic = 0;
  const rockDark = new PBRMaterial("mtnRockD", scene);
  rockDark.albedoColor = new Color3(0.24, 0.22, 0.2);
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

  // Trees (materials shared across the whole forest so we can merge by bucket).
  const bark = new PBRMaterial("bark", scene);
  bark.albedoColor = new Color3(0.28, 0.2, 0.13);
  bark.roughness = 0.95;
  const leaf = new PBRMaterial("leaf", scene);
  leaf.albedoColor = new Color3(0.16, 0.32, 0.14);
  leaf.roughness = 0.85;
  const leafDry = new PBRMaterial("leafDry", scene);
  leafDry.albedoColor = new Color3(0.3, 0.34, 0.16);
  leafDry.roughness = 0.85;

  const barkBucket: Mesh[] = [];
  const leafBucket: Mesh[] = [];
  const leafDryBucket: Mesh[] = [];

  const [px, pz] = map.spawns.player;
  const clearOfSpawn = (x: number, z: number): boolean => Math.hypot(x - px, z - pz) > 16;

  // Tree line hugging the border (just inside the invisible walls).
  const lineCount = 64;
  for (let i = 0; i < lineCount; i++) {
    const a = (i / lineCount) * Math.PI * 2;
    const r = H * (0.9 + rng() * 0.12);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    makeTree(scene, x, z, 1.1 + rng() * 0.9, rng() * Math.PI * 2, barkBucket, rng() < 0.5 ? leafBucket : leafDryBucket);
  }

  // Sparse trees inside the play area for cover + depth, each with a slim invisible collider.
  const colliderMat = new PBRMaterial("treeCol", scene);
  for (let i = 0; i < 30; i++) {
    const x = (rng() * 2 - 1) * (H - 14);
    const z = (rng() * 2 - 1) * (H - 14);
    if (!clearOfSpawn(x, z)) continue;
    const s = 0.85 + rng() * 0.7;
    makeTree(scene, x, z, s, rng() * Math.PI * 2, barkBucket, rng() < 0.6 ? leafBucket : leafDryBucket);
    // Physics-only collider (not rendered) so vehicles hit the trunk.
    const col = MeshBuilder.CreateCylinder("treeCol", { height: 2.4 * s, diameter: 0.7 * s, tessellation: 6 }, scene);
    col.position.set(x, 1.2 * s, z);
    col.isVisible = false;
    col.material = colliderMat;
    new PhysicsAggregate(col, PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.15 }, scene);
  }

  // Collapse the whole forest into 3 static draw calls.
  mergeStatic("treeBark", barkBucket, bark);
  mergeStatic("treeLeaf", leafBucket, leaf);
  mergeStatic("treeLeafDry", leafDryBucket, leafDry);
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
  floor.material = pbr(scene, "floorMat", {
    dir: "ground",
    base: "ground",
    metallic: 0.0,
    roughness: 0.92,
    uScale: HALF / 4,
    tint: new Color3(1, 1, 1),
  });
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

  buildOpenTerrain(scene, map, shadows);

  // Cover — painted metal blocks (accent tint).
  const coverMat = pbr(scene, "coverMat", {
    dir: "metal",
    base: "Metal032_1K-JPG",
    metallic: 0.85,
    roughness: 0.4,
    uScale: 1,
    tint: col(map.palette.accent),
  });
  for (const [x, z, yaw] of map.cover) {
    const box = MeshBuilder.CreateBox("cover", { width: 2.4, height: 1.1, depth: 1.3 }, scene);
    box.position.set(x, 0.55, z);
    box.rotation.y = yaw * (Math.PI / 180);
    box.material = coverMat;
    box.receiveShadows = true;
    shadows.addShadowCaster(box);
    box.freezeWorldMatrix();
    new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, restitution: 0.25 }, scene);
  }

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

  buildWarzone(scene, map, shadows);

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
