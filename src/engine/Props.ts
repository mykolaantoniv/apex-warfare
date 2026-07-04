import {
  Scene,
  Mesh,
  Matrix,
  Vector3,
  Quaternion,
  SceneLoader,
  ShadowGenerator,
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";

/**
 * CC0 environment prop kit (Poly Pizza / Quaternius, all CC0 1.0 — see ASSETS.md). Each entry
 * maps a prop key to its GLB plus the world tuning to place it: a base scale (its authored units
 * differ from ours) and `floorY` (its lowest vertex in local space, so we can rest its base on the
 * ground). Values come from measuring each GLB's bounding box.
 */
export interface PropDef {
  readonly url: string;
  /** Base uniform scale so the prop reads at a believable real-world size. */
  readonly scale: number;
  /** Local-space min Y (from bbox) — we lift by -floorY*scale so the base sits on the ground. */
  readonly floorY: number;
  /** Physics collider footprint radius (m) at scale 1; 0 = no collider (small debris). */
  readonly colliderR: number;
}

export const PROPS = {
  pineSnow: { url: "models/prop-pine-snow.glb", scale: 1.8, floorY: 0, colliderR: 0.5 },
  tree: { url: "models/prop-tree.glb", scale: 2.2, floorY: -0.04, colliderR: 0.5 },
  treeAutumn: { url: "models/prop-tree-autumn.glb", scale: 1.8, floorY: -0.05, colliderR: 0.5 },
  treeDead: { url: "models/prop-tree-dead.glb", scale: 1.4, floorY: 0, colliderR: 0.4 },
  rock: { url: "models/prop-rock.glb", scale: 1.2, floorY: -0.37, colliderR: 1.6 },
  rockLarge: { url: "models/prop-rock-large.glb", scale: 1.0, floorY: -0.32, colliderR: 3.4 },
  mountain: { url: "models/prop-mountain.glb", scale: 18, floorY: -0.04, colliderR: 0 },
  cabin: { url: "models/prop-cabin.glb", scale: 4.5, floorY: 0, colliderR: 2.4 },
  container: { url: "models/prop-container.glb", scale: 1.2, floorY: 0.04, colliderR: 1.4 },
  barrel: { url: "models/prop-barrel.glb", scale: 1.2, floorY: 0, colliderR: 0.6 },
  pipe: { url: "models/prop-pipe.glb", scale: 1.6, floorY: -0.01, colliderR: 1.5 },
  crate: { url: "models/prop-crate.glb", scale: 0.75, floorY: -1.0, colliderR: 0.8 },
  barrier: { url: "models/prop-barrier.glb", scale: 0.7, floorY: 0, colliderR: 1.4 },
  barrierLow: { url: "models/prop-barrier-traffic.glb", scale: 1.2, floorY: 0, colliderR: 1.0 },
} satisfies Record<string, PropDef>;

export type PropKey = keyof typeof PROPS;

/** One placed instance in the world (ground plane). */
export interface Placement {
  readonly x: number;
  readonly z: number;
  /** Extra per-instance scale multiplier (variety). Default 1. */
  readonly s?: number;
  /** Yaw in radians. */
  readonly yaw?: number;
}

const scratchScale = new Vector3();
const scratchPos = new Vector3();
const scratchQuat = new Quaternion();

/**
 * Render `placements` of one prop as GPU thin instances — a single draw call for the whole set,
 * regardless of count (mobile budget). The GLB loads async (its meshes merged into one), so the
 * visual pops in a frame later; physics colliders (if any) are created synchronously by the
 * caller. Any load failure is swallowed (world still renders without the prop).
 */
export function scatterProp(
  scene: Scene,
  def: PropDef,
  placements: readonly Placement[],
  shadows?: ShadowGenerator,
): void {
  if (placements.length === 0) return;
  const slash = def.url.lastIndexOf("/");
  const dir = def.url.slice(0, slash + 1);
  const file = def.url.slice(slash + 1);
  SceneLoader.ImportMeshAsync("", dir, file, scene)
    .then((res) => {
      const parts = res.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      if (parts.length === 0) return;
      // Merge the GLB's meshes into one multi-material mesh so a single thin-instance buffer
      // paints every submesh per instance. Bakes the props' local transforms into geometry.
      const merged =
        parts.length === 1 ? parts[0]! : Mesh.MergeMeshes(parts, true, true, undefined, false, true);
      if (!merged) return;
      merged.name = `prop_${file}`;
      merged.isPickable = false;
      merged.alwaysSelectAsActiveMesh = true; // one bbox for the whole scattered set
      if (shadows) shadows.addShadowCaster(merged);
      merged.receiveShadows = true;

      const buf = new Float32Array(placements.length * 16);
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i]!;
        const s = def.scale * (p.s ?? 1);
        scratchScale.set(s, s, s);
        Quaternion.FromEulerAnglesToRef(0, p.yaw ?? 0, 0, scratchQuat);
        scratchPos.set(p.x, -def.floorY * s, p.z);
        Matrix.Compose(scratchScale, scratchQuat, scratchPos).copyToArray(buf, i * 16);
      }
      merged.thinInstanceSetBuffer("matrix", buf, 16, true);
      merged.thinInstanceRefreshBoundingInfo();
    })
    .catch((e: unknown) => {
      console.warn(`[apex] prop "${def.url}" failed to load.`, e);
    });
}

/**
 * Create invisible cylinder physics colliders for placed props (synchronous — decoupled from the
 * async visual). Small debris (colliderR 0) is skipped so vehicles brush past it.
 */
export function propColliders(scene: Scene, def: PropDef, placements: readonly Placement[]): void {
  if (def.colliderR <= 0) return;
  for (const p of placements) {
    const s = def.scale * (p.s ?? 1);
    const r = def.colliderR * s;
    const col = Mesh.CreateCylinder("propCol", 6, r * 2, r * 2, 6, 1, scene);
    col.position.set(p.x, 3, p.z);
    col.isVisible = false;
    col.freezeWorldMatrix();
    new PhysicsAggregate(col, PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.1 }, scene);
  }
}
