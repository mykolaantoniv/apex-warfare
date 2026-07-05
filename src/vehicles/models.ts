import {
  Scene,
  TransformNode,
  AbstractMesh,
  Mesh,
  MeshBuilder,
  Color3,
  PBRMaterial,
  StandardMaterial,
  Quaternion,
  SceneLoader,
} from "@babylonjs/core";
// Register the .glb/.gltf loader (side-effect imports). We pull in the file loader + the 2.0
// parser directly rather than the barrel, which drags in the KHR_interactivity extension whose
// FlowGraph deps don't resolve under this core version.
import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import type { VehicleConfig } from "../core/types";

/**
 * Per-file rigging hints for CC0 GLBs. Real downloaded models carry quirks the primitive
 * fallbacks don't (a rigged soldier holding *every* weapon at once, wheel sub-nodes we want to
 * spin), so we describe those here — keyed by the GLB filename — instead of bloating every
 * vehicle JSON. Unknown files just render whole.
 */
interface GlbRig {
  /** Whitelist of GLB mesh names to keep; every other loaded mesh is hidden. */
  readonly keepMeshes?: readonly string[];
  /** GLB transform-node names to hand back so the controller can spin them (wheels). */
  readonly spinNodes?: readonly string[];
}
const GLB_RIGS: Record<string, GlbRig> = {
  // Quaternius soldier ships holding 15 weapons simultaneously — keep body + a single rifle.
  "soldier.glb": { keepMeshes: ["Body", "Head", "ShoulderPad.L", "ShoulderPad.R", "AK"] },
  // Sports car exposes its wheels as separate nodes — spin them as the buggy rolls.
  "buggy.glb": {
    spinNodes: [
      "SportsCar2_BackWheels_Cylinder.002",
      "SportsCar2_FrontLeftWheel_Cylinder.017",
      "SportsCar2_FrontRightWheel_Cylinder.018",
    ],
  },
};

/** Nodes/meshes the loaded GLB hands back to its controller once it finishes importing. */
export interface GlbHandback {
  /** All GLB render meshes (so the caller can register shadow casters). */
  readonly meshes: readonly AbstractMesh[];
  /** Rig spin nodes (wheels) the caller should rotate each frame, if any. */
  readonly spinners: readonly TransformNode[];
}

/**
 * If the vehicle config points at a CC0 GLB, load it asynchronously and parent it under the
 * controller's visual root, then hide the built-in primitive meshes. Any failure (missing
 * file, decode error) is swallowed so the primitive model stays as a graceful fallback —
 * i.e. the game always renders something, and drops in real art the moment a file exists.
 *
 * `onReady` fires (only on success) with the loaded meshes + any rig spin nodes so the caller
 * can add shadow casters and swap its procedural spinners for the real ones.
 */
export function attachGlb(
  scene: Scene,
  root: TransformNode,
  cfg: VehicleConfig,
  hideOnLoad: readonly Mesh[],
  onReady?: (handback: GlbHandback) => void,
  attachTo?: TransformNode,
): void {
  const url = cfg.visual.modelUrl;
  if (!url) return;
  const slash = url.lastIndexOf("/");
  const dir = url.slice(0, slash + 1);
  const file = url.slice(slash + 1);
  const rig = GLB_RIGS[file] ?? {};
  SceneLoader.ImportMeshAsync("", dir, file, scene)
    .then((res) => {
      // The vehicle may have died (Wrecks pool disposed it) or been torn down while the GLB was
      // still in flight — don't reparent freshly loaded meshes under a disposed node.
      if (root.isDisposed()) {
        for (const m of res.meshes) m.dispose();
        return;
      }
      const holder = new TransformNode("glb", scene);
      // Most controllers rotate `root` itself each frame, so the GLB parents there by default.
      // The tank is the one exception: heading (yaw) is applied to a `hull` child node (kept
      // separate from `root` so the turret can rotate independently for auto-aim) — callers that
      // need the GLB to follow a specific yaw-bearing node pass it via `attachTo`.
      holder.parent = attachTo ?? root;
      holder.scaling.setAll(cfg.visual.modelScale ?? 1);
      holder.rotation.y = ((cfg.visual.yawOffset ?? 0) * Math.PI) / 180;
      holder.position.y = cfg.visual.heightOffset ?? 0;
      const keep = rig.keepMeshes ? new Set(rig.keepMeshes) : undefined;
      for (const m of res.meshes) {
        if (!m.parent) m.parent = holder;
        m.isPickable = false;
        // Rigged kits (soldier) load extra meshes we don't want (spare weapons) — hide any
        // mesh not on the keep-list.
        if (keep && m.name !== "__root__" && m.getTotalVertices() > 0 && !keep.has(m.name)) {
          m.setEnabled(false);
        }
      }
      const spinners: TransformNode[] = [];
      for (const name of rig.spinNodes ?? []) {
        const node =
          res.transformNodes.find((t) => t.name === name) ?? res.meshes.find((m) => m.name === name);
        if (node) spinners.push(node);
      }
      for (const m of hideOnLoad) m.setEnabled(false); // swap primitives out for the real art
      // If the vehicle was already killed (wreck) before this GLB finished loading, char the
      // freshly attached meshes too — otherwise a shiny un-charred model would pop in over a
      // wreck mid-collapse.
      if ((root.metadata as { charred?: boolean } | null)?.charred) charAllMaterials(root);
      onReady?.({ meshes: res.meshes, spinners });
    })
    .catch((e: unknown) => {
      console.warn(`[apex] GLB "${url}" failed to load; keeping primitive model.`, e);
    });
}

/**
 * Darken every mesh under `root` IN PLACE (mutates existing material properties — no new
 * materials/meshes allocated) so a destroyed vehicle instantly reads as a charred wreck.
 * Handles both the procedural PBR parts built below and whatever material a loaded GLB
 * brought with it. Idempotent; call once per death.
 */
export function charAllMaterials(root: TransformNode): void {
  const meta = (root.metadata as { charred?: boolean } | null) ?? {};
  meta.charred = true;
  root.metadata = meta;
  for (const m of root.getChildMeshes(false)) {
    const mat = m.material;
    if (mat instanceof PBRMaterial) {
      mat.albedoColor.scaleInPlace(0.1);
      mat.emissiveColor.set(0, 0, 0);
      mat.metallic = 0.05;
      mat.roughness = 0.95;
      if (mat.clearCoat.isEnabled) mat.clearCoat.intensity = 0;
    } else if (mat instanceof StandardMaterial) {
      mat.diffuseColor.scaleInPlace(0.1);
      mat.emissiveColor.set(0, 0, 0);
      mat.specularColor.set(0, 0, 0);
    }
  }
}

// Shared vehicle geometry — used by the controllers (with physics) AND the garage showcase
// (visual only). Builders return the root plus the nodes the caller needs to animate.

export interface HeliModel {
  root: TransformNode;
  parts: Mesh[];
  mainRotor: TransformNode;
  tailRotor: TransformNode;
}
export interface JetModel {
  root: TransformNode;
  parts: Mesh[];
}
export interface TankModel {
  root: TransformNode;
  parts: Mesh[];
  hull: TransformNode;
  turret: TransformNode;
}

export function buildHeliModel(scene: Scene, accent: Color3, scale: number): HeliModel {
  const root = new TransformNode("heliModel", scene);
  root.rotationQuaternion = Quaternion.Identity();
  root.scaling.setAll(scale);

  const hullMat = new PBRMaterial("heliHull", scene);
  hullMat.albedoColor = new Color3(0.34, 0.37, 0.42);
  hullMat.metallic = 0.55;
  hullMat.roughness = 0.42;
  hullMat.clearCoat.isEnabled = true;
  hullMat.clearCoat.intensity = 0.5;

  const accentMat = new PBRMaterial("heliAccent", scene);
  accentMat.albedoColor = accent;
  accentMat.emissiveColor = accent.scale(0.55);
  accentMat.metallic = 0.2;
  accentMat.roughness = 0.4;

  const glassMat = new PBRMaterial("heliGlass", scene);
  glassMat.albedoColor = new Color3(0.02, 0.05, 0.07);
  glassMat.emissiveColor = accent.scale(0.35);
  glassMat.metallic = 0.1;
  glassMat.roughness = 0.05;

  const gunMat = new PBRMaterial("heliGun", scene);
  gunMat.albedoColor = new Color3(0.05, 0.055, 0.06);
  gunMat.metallic = 0.9;
  gunMat.roughness = 0.45;

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial): Mesh => {
    m.material = mat;
    m.parent = root;
    parts.push(m);
    return m;
  };

  add(MeshBuilder.CreateBox("fus", { width: 0.9, height: 0.55, depth: 2.0 }, scene), hullMat);
  const nose = add(
    MeshBuilder.CreateCylinder("nose", { height: 0.9, diameterTop: 0.12, diameterBottom: 0.62, tessellation: 10 }, scene),
    hullMat,
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.04, 1.25);

  const cp1 = add(MeshBuilder.CreateSphere("cp1", { diameter: 0.62, segments: 10 }, scene), glassMat);
  cp1.scaling.set(1, 0.8, 1.15);
  cp1.position.set(0, 0.26, 0.55);
  const cp2 = add(MeshBuilder.CreateSphere("cp2", { diameter: 0.66, segments: 10 }, scene), glassMat);
  cp2.scaling.set(1, 0.85, 1.1);
  cp2.position.set(0, 0.42, 0.0);

  for (const side of [-1, 1] as const) {
    const wing = add(MeshBuilder.CreateBox("wing", { width: 0.7, height: 0.1, depth: 0.6 }, scene), hullMat);
    wing.position.set(side * 0.75, 0.02, 0.05);
    const pod = add(MeshBuilder.CreateCylinder("pod", { height: 0.7, diameter: 0.34, tessellation: 12 }, scene), gunMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.95, -0.18, 0.1);
    const missile = add(MeshBuilder.CreateCylinder("msl", { height: 0.6, diameter: 0.1, tessellation: 8 }, scene), accentMat);
    missile.rotation.x = Math.PI / 2;
    missile.position.set(side * 1.15, 0.02, 0.15);
  }

  const boom = add(MeshBuilder.CreateBox("boom", { width: 0.2, height: 0.22, depth: 1.5 }, scene), hullMat);
  boom.position.set(0, 0.12, -1.5);
  const fin = add(MeshBuilder.CreateBox("fin", { width: 0.08, height: 0.6, depth: 0.4 }, scene), accentMat);
  fin.position.set(0, 0.4, -2.15);
  for (const side of [-1, 1] as const) {
    const skid = add(MeshBuilder.CreateBox("skid", { width: 0.06, height: 0.06, depth: 1.5 }, scene), gunMat);
    skid.position.set(side * 0.5, -0.5, 0.1);
    const strut = add(MeshBuilder.CreateBox("strut", { width: 0.05, height: 0.35, depth: 0.05 }, scene), gunMat);
    strut.position.set(side * 0.45, -0.32, 0.1);
  }

  const hub = add(MeshBuilder.CreateCylinder("hub", { height: 0.2, diameter: 0.22, tessellation: 8 }, scene), gunMat);
  hub.position.set(0, 0.62, 0);
  const mainRotor = new TransformNode("rotor", scene);
  mainRotor.parent = root;
  mainRotor.position.set(0, 0.7, 0);
  for (const a of [0, Math.PI / 2] as const) {
    const blade = MeshBuilder.CreateBox("blade", { width: 4.4, height: 0.03, depth: 0.16 }, scene);
    blade.rotation.y = a;
    blade.material = gunMat;
    blade.parent = mainRotor;
    parts.push(blade);
  }

  const tailRotor = new TransformNode("tailRotor", scene);
  tailRotor.parent = root;
  tailRotor.position.set(0.16, 0.2, -2.05);
  for (const a of [0, Math.PI / 2] as const) {
    const tb = MeshBuilder.CreateBox("tblade", { width: 0.04, height: 0.7, depth: 0.08 }, scene);
    tb.rotation.z = a;
    tb.material = gunMat;
    tb.parent = tailRotor;
    parts.push(tb);
  }

  return { root, parts, mainRotor, tailRotor };
}

export function buildJetModel(scene: Scene, accent: Color3, scale: number): JetModel {
  const root = new TransformNode("jetModel", scene);
  root.rotationQuaternion = Quaternion.Identity();
  root.scaling.setAll(scale);

  const hull = new PBRMaterial("jetHull", scene);
  hull.albedoColor = new Color3(0.3, 0.33, 0.38);
  hull.metallic = 0.6;
  hull.roughness = 0.35;
  hull.clearCoat.isEnabled = true;

  const acc = new PBRMaterial("jetAcc", scene);
  acc.albedoColor = accent;
  acc.emissiveColor = accent.scale(0.5);
  acc.metallic = 0.2;
  acc.roughness = 0.4;

  const glass = new PBRMaterial("jetGlass", scene);
  glass.albedoColor = new Color3(0.02, 0.05, 0.07);
  glass.emissiveColor = accent.scale(0.35);
  glass.roughness = 0.05;

  const burn = new PBRMaterial("jetBurn", scene);
  burn.emissiveColor = new Color3(1, 0.55, 0.2);
  burn.albedoColor = new Color3(0.1, 0.05, 0.02);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial): Mesh => {
    m.material = mat;
    m.parent = root;
    parts.push(m);
    return m;
  };

  const fus = add(
    MeshBuilder.CreateCylinder("fuse", { height: 2.8, diameterTop: 0.12, diameterBottom: 0.62, tessellation: 12 }, scene),
    hull,
  );
  fus.rotation.x = Math.PI / 2;
  const canopy = add(MeshBuilder.CreateSphere("canopy", { diameter: 0.5, segments: 10 }, scene), glass);
  canopy.scaling.set(1, 0.7, 1.6);
  canopy.position.set(0, 0.22, 0.35);

  for (const side of [-1, 1] as const) {
    const wing = add(MeshBuilder.CreateBox("wing", { width: 1.5, height: 0.07, depth: 1.2 }, scene), hull);
    wing.position.set(side * 0.9, -0.02, -0.35);
    wing.rotation.y = side * -0.5;
    const stripe = add(MeshBuilder.CreateBox("stripe", { width: 1.4, height: 0.08, depth: 0.12 }, scene), acc);
    stripe.position.set(side * 0.9, 0.0, 0.05);
    stripe.rotation.y = side * -0.5;
    const fin = add(MeshBuilder.CreateBox("fin", { width: 0.06, height: 0.55, depth: 0.5 }, scene), hull);
    fin.position.set(side * 0.28, 0.28, -1.15);
    fin.rotation.z = side * 0.2;
    const msl = add(MeshBuilder.CreateCylinder("msl", { height: 0.7, diameter: 0.1, tessellation: 8 }, scene), acc);
    msl.rotation.x = Math.PI / 2;
    msl.position.set(side * 1.35, -0.12, -0.3);
  }

  const nozzle = add(MeshBuilder.CreateCylinder("nozzle", { height: 0.35, diameter: 0.5, tessellation: 12 }, scene), burn);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -1.45;

  return { root, parts };
}

export function buildTankModel(scene: Scene, accent: Color3, scale: number): TankModel {
  const root = new TransformNode("tankModel", scene);
  root.scaling.setAll(scale);
  const hull = new TransformNode("hull", scene);
  hull.parent = root;
  const turret = new TransformNode("turret", scene);
  turret.parent = root;
  turret.position.y = 0.55;

  const hullMat = new PBRMaterial("tankHull", scene);
  hullMat.albedoColor = new Color3(0.16, 0.17, 0.15);
  hullMat.metallic = 0.6;
  hullMat.roughness = 0.5;

  const treadMat = new PBRMaterial("tankTread", scene);
  treadMat.albedoColor = new Color3(0.05, 0.05, 0.06);
  treadMat.metallic = 0.2;
  treadMat.roughness = 0.8;

  const acc = new PBRMaterial("tankAcc", scene);
  acc.albedoColor = accent;
  acc.emissiveColor = accent.scale(0.4);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode): Mesh => {
    m.material = mat;
    m.parent = parent;
    parts.push(m);
    return m;
  };

  add(MeshBuilder.CreateBox("chassis", { width: 1.8, height: 0.6, depth: 2.4 }, scene), hullMat, hull);
  const glacis = add(MeshBuilder.CreateBox("glacis", { width: 1.8, height: 0.6, depth: 0.7 }, scene), hullMat, hull);
  glacis.position.set(0, 0.02, 1.35);
  glacis.rotation.x = -0.5;
  for (const side of [-1, 1] as const) {
    const tread = add(MeshBuilder.CreateBox("tread", { width: 0.5, height: 0.55, depth: 2.7 }, scene), treadMat, hull);
    tread.position.set(side * 1.05, -0.22, 0);
    const fender = add(MeshBuilder.CreateBox("fender", { width: 0.6, height: 0.08, depth: 2.7 }, scene), hullMat, hull);
    fender.position.set(side * 1.05, 0.1, 0);
    for (let i = -1; i <= 1; i++) {
      const wheel = add(MeshBuilder.CreateCylinder("wheel", { height: 0.5, diameter: 0.5, tessellation: 10 }, scene), treadMat, hull);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.05, -0.28, i * 0.85);
    }
  }

  add(MeshBuilder.CreateBox("turretBox", { width: 1.3, height: 0.55, depth: 1.4 }, scene), hullMat, turret);
  const stripe = add(MeshBuilder.CreateBox("tstripe", { width: 1.32, height: 0.12, depth: 0.5 }, scene), acc, turret);
  stripe.position.set(0, 0.22, -0.2);
  const mantlet = add(MeshBuilder.CreateBox("mantlet", { width: 0.7, height: 0.5, depth: 0.4 }, scene), hullMat, turret);
  mantlet.position.set(0, -0.02, 0.7);
  const barrel = add(MeshBuilder.CreateCylinder("barrel", { height: 1.8, diameter: 0.2, tessellation: 10 }, scene), hullMat, turret);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.02, 1.5);
  const brake = add(MeshBuilder.CreateCylinder("brake", { height: 0.35, diameter: 0.32, tessellation: 10 }, scene), treadMat, turret);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, -0.02, 2.3);

  return { root, parts, hull, turret };
}

export interface GroundModel {
  root: TransformNode;
  parts: Mesh[];
  /** Nodes to spin each frame (wheels), if any. */
  spinners: TransformNode[];
}

/** Fast attack buggy/bike: low chassis, roll cage, 4 chunky wheels, forward gun. */
export function buildBikeModel(scene: Scene, accent: Color3, scale: number): GroundModel {
  const root = new TransformNode("bikeModel", scene);
  root.scaling.setAll(scale);

  const body = new PBRMaterial("bikeBody", scene);
  body.albedoColor = new Color3(0.2, 0.21, 0.19);
  body.metallic = 0.5;
  body.roughness = 0.5;
  const acc = new PBRMaterial("bikeAcc", scene);
  acc.albedoColor = accent;
  acc.emissiveColor = accent.scale(0.4);
  const rubber = new PBRMaterial("bikeTire", scene);
  rubber.albedoColor = new Color3(0.04, 0.04, 0.05);
  rubber.roughness = 0.85;

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial, parent: TransformNode = root): Mesh => {
    m.material = mat;
    m.parent = parent;
    parts.push(m);
    return m;
  };

  add(MeshBuilder.CreateBox("chassis", { width: 1.1, height: 0.35, depth: 2.0 }, scene), body).position.y = 0.35;
  const nose = add(MeshBuilder.CreateBox("bnose", { width: 0.9, height: 0.3, depth: 0.7 }, scene), acc);
  nose.position.set(0, 0.35, 1.1);
  const seat = add(MeshBuilder.CreateBox("seat", { width: 0.7, height: 0.3, depth: 0.7 }, scene), body);
  seat.position.set(0, 0.6, -0.2);
  // roll cage
  for (const zz of [-0.4, 0.4] as const) {
    const bar = add(MeshBuilder.CreateTorus("cage", { diameter: 1.0, thickness: 0.08, tessellation: 10 }, scene), body);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, 0.75, zz);
  }
  const gun = add(MeshBuilder.CreateCylinder("bgun", { height: 1.1, diameter: 0.12, tessellation: 8 }, scene), body);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, 0.7, 1.0);

  const spinners: TransformNode[] = [];
  for (const sx of [-1, 1] as const) {
    for (const zz of [-0.7, 0.7] as const) {
      const wheel = MeshBuilder.CreateCylinder("bwheel", { height: 0.28, diameter: 0.7, tessellation: 12 }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.62, 0.2, zz);
      wheel.material = rubber;
      wheel.parent = root;
      parts.push(wheel);
      spinners.push(wheel);
    }
  }
  return { root, parts, spinners };
}

/** Infantry soldier: torso + head + helmet + rifle. Small (human-scale). */
export function buildSoldierModel(scene: Scene, accent: Color3, scale: number): GroundModel {
  const root = new TransformNode("soldierModel", scene);
  root.scaling.setAll(scale);

  const cloth = new PBRMaterial("sCloth", scene);
  cloth.albedoColor = new Color3(0.22, 0.25, 0.16);
  cloth.roughness = 0.9;
  const skin = new PBRMaterial("sSkin", scene);
  skin.albedoColor = new Color3(0.6, 0.45, 0.36);
  skin.roughness = 0.7;
  const gear = new PBRMaterial("sGear", scene);
  gear.albedoColor = new Color3(0.08, 0.08, 0.09);
  gear.roughness = 0.6;
  const acc = new PBRMaterial("sAcc", scene);
  acc.albedoColor = accent;
  acc.emissiveColor = accent.scale(0.4);

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial): Mesh => {
    m.material = mat;
    m.parent = root;
    parts.push(m);
    return m;
  };

  const torso = add(MeshBuilder.CreateCapsule("torso", { height: 1.1, radius: 0.28 }, scene), cloth);
  torso.position.y = 1.05;
  const band = add(MeshBuilder.CreateBox("band", { width: 0.58, height: 0.16, depth: 0.42 }, scene), acc);
  band.position.y = 1.35;
  const head = add(MeshBuilder.CreateSphere("head", { diameter: 0.32, segments: 8 }, scene), skin);
  head.position.y = 1.75;
  const helmet = add(MeshBuilder.CreateSphere("helmet", { diameter: 0.38, segments: 8 }, scene), gear);
  helmet.scaling.y = 0.7;
  helmet.position.y = 1.82;
  for (const sx of [-1, 1] as const) {
    const leg = add(MeshBuilder.CreateCapsule("leg", { height: 0.9, radius: 0.13 }, scene), gear);
    leg.position.set(sx * 0.14, 0.45, 0);
  }
  // Rifle held forward.
  const rifle = add(MeshBuilder.CreateBox("rifle", { width: 0.08, height: 0.1, depth: 0.9 }, scene), gear);
  rifle.position.set(0.24, 1.15, 0.45);
  return { root, parts, spinners: [] };
}

/** Patrol boat: pointed hull, cabin, mounted gun, accent waterline. */
export function buildBoatModel(scene: Scene, accent: Color3, scale: number): GroundModel {
  const root = new TransformNode("boatModel", scene);
  root.scaling.setAll(scale);

  const hullMat = new PBRMaterial("boatHull", scene);
  hullMat.albedoColor = new Color3(0.18, 0.2, 0.22);
  hullMat.metallic = 0.5;
  hullMat.roughness = 0.5;
  const deckMat = new PBRMaterial("boatDeck", scene);
  deckMat.albedoColor = new Color3(0.3, 0.28, 0.24);
  deckMat.roughness = 0.8;
  const acc = new PBRMaterial("boatAcc", scene);
  acc.albedoColor = accent;
  acc.emissiveColor = accent.scale(0.4);
  const glass = new PBRMaterial("boatGlass", scene);
  glass.albedoColor = new Color3(0.02, 0.05, 0.07);
  glass.roughness = 0.05;
  glass.metallic = 0.1;

  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: PBRMaterial): Mesh => {
    m.material = mat;
    m.parent = root;
    parts.push(m);
    return m;
  };

  const hull = add(MeshBuilder.CreateBox("hull", { width: 1.7, height: 0.7, depth: 4.6 }, scene), hullMat);
  hull.position.y = 0.1;
  // Pointed bow.
  const bow = add(MeshBuilder.CreateCylinder("bow", { height: 1.7, diameterTop: 0, diameterBottom: 0.9, tessellation: 4 }, scene), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scaling.set(1.9, 1, 0.8);
  bow.position.set(0, 0.1, 2.9);
  const deck = add(MeshBuilder.CreateBox("deck", { width: 1.5, height: 0.12, depth: 4.2 }, scene), deckMat);
  deck.position.y = 0.46;
  const stripe = add(MeshBuilder.CreateBox("wline", { width: 1.74, height: 0.16, depth: 4.0 }, scene), acc);
  stripe.position.y = 0.2;
  const cabin = add(MeshBuilder.CreateBox("cabin", { width: 1.1, height: 0.8, depth: 1.4 }, scene), deckMat);
  cabin.position.set(0, 0.9, -0.6);
  const windshield = add(MeshBuilder.CreateBox("wshield", { width: 1.0, height: 0.5, depth: 0.12 }, scene), glass);
  windshield.position.set(0, 0.95, 0.1);
  const mast = add(MeshBuilder.CreateCylinder("mast", { height: 1.0, diameter: 0.08, tessellation: 6 }, scene), hullMat);
  mast.position.set(0, 1.6, -0.6);
  // Bow gun.
  const gunbase = add(MeshBuilder.CreateCylinder("gbase", { height: 0.3, diameter: 0.4, tessellation: 10 }, scene), hullMat);
  gunbase.position.set(0, 0.6, 1.6);
  const gun = add(MeshBuilder.CreateCylinder("bgun", { height: 1.2, diameter: 0.14, tessellation: 8 }, scene), hullMat);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, 0.75, 2.1);
  return { root, parts, spinners: [] };
}

export interface ShowcaseModel {
  root: TransformNode;
  spinners: TransformNode[];
  parts: Mesh[];
}

/** Visual-only model for the garage showcase (spinners = rotors to turn). */
export function buildShowcaseModel(scene: Scene, cfg: VehicleConfig, accent: Color3): ShowcaseModel {
  const scale = cfg.visual.scale;
  // `keepVisible` meshes stay shown when a GLB swaps in (heli keeps its proc rotor, which the
  // CC0 GLB lacks). If the GLB exposes its own spin nodes (wheels) we swap the showcase spinners.
  const show = (
    m: { root: TransformNode; parts: Mesh[] },
    spinners: TransformNode[],
    keepVisible?: ReadonlySet<Mesh>,
  ): ShowcaseModel => {
    const hide = keepVisible ? m.parts.filter((p) => !keepVisible.has(p)) : m.parts;
    const out: ShowcaseModel = { root: m.root, spinners, parts: m.parts };
    attachGlb(scene, m.root, cfg, hide, ({ spinners: rigSpin }) => {
      if (rigSpin.length > 0) {
        out.spinners.length = 0;
        out.spinners.push(...rigSpin);
      }
    });
    return out;
  };
  switch (cfg.movement.model) {
    case "heli": {
      const m = buildHeliModel(scene, accent, scale);
      const blades = new Set<Mesh>([
        ...m.mainRotor.getChildMeshes(false),
        ...m.tailRotor.getChildMeshes(false),
      ] as Mesh[]);
      return show(m, [m.mainRotor, m.tailRotor], blades);
    }
    case "jet":
      return show(buildJetModel(scene, accent, scale), []);
    case "tank":
      return show(buildTankModel(scene, accent, scale), []);
    case "bike": {
      const m = buildBikeModel(scene, accent, scale);
      return show(m, m.spinners);
    }
    case "boat":
      return show(buildBoatModel(scene, accent, scale), []);
    case "soldier":
      return show(buildSoldierModel(scene, accent, scale), []);
    default:
      throw new Error(`Unknown model: ${String(cfg.movement.model)}`);
  }
}
