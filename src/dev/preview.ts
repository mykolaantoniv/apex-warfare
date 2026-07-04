// Dev-only harness: lay every vehicle GLB on a grid with a +Z "front" marker so a single
// screenshot reveals scale + facing for all of them. Not shipped (root preview.html is dev-only).
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  HDRCubeTexture,
  MeshBuilder,
  PBRMaterial,
} from "@babylonjs/core";
import { Content } from "../data/Content";
import { buildShowcaseModel } from "../vehicles/models";

const ALL = [
  "heli-hornet",
  "jet-talon",
  "tank-boulder",
  "tank-raider",
  "bike-scout",
  "boat-gunner",
  "soldier-grunt",
];
const only = new URLSearchParams(location.search).get("only");
const ids = only ? [only] : ALL;

const canvas = document.getElementById("c") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.13, 0.15, 0.18, 1);
scene.environmentTexture = new HDRCubeTexture("env/ibl.hdr", scene, 128);
scene.environmentIntensity = 1.0;

const key = new DirectionalLight("k", new Vector3(-0.4, -1, -0.3), scene);
key.intensity = 3;
new HemisphericLight("a", new Vector3(0, 1, 0), scene).intensity = 0.5;

// Ground.
const ground = MeshBuilder.CreateGround("g", { width: 60, height: 30 }, scene);
const gm = new PBRMaterial("gm", scene);
gm.albedoColor = new Color3(0.22, 0.25, 0.29);
gm.metallic = 0.1;
gm.roughness = 0.85;
ground.material = gm;

const accents = [
  new Color3(0.9, 0.4, 0.2),
  new Color3(0.2, 0.6, 0.95),
  new Color3(0.3, 0.85, 0.4),
  new Color3(0.85, 0.75, 0.2),
  new Color3(0.8, 0.3, 0.7),
  new Color3(0.2, 0.85, 0.8),
  new Color3(0.9, 0.5, 0.5),
];

const spinnersAll: { rot: (dt: number) => void }[] = [];
const spacing = 7;
const startX = -((ids.length - 1) * spacing) / 2;
ids.forEach((id, i) => {
  const cfg = Content.vehicle(id);
  const model = buildShowcaseModel(scene, cfg, accents[i % accents.length]!);
  const x = startX + i * spacing;
  model.root.position.set(x, 0, 0);
  // Green marker 2m toward +Z (our "forward"): the nose should point at it.
  const front = MeshBuilder.CreateSphere("front" + i, { diameter: 0.6 }, scene);
  const fm = new PBRMaterial("fm" + i, scene);
  fm.emissiveColor = new Color3(0.1, 1, 0.2);
  fm.albedoColor = new Color3(0.1, 1, 0.2);
  front.material = fm;
  front.position.set(x, 0.3, 3.2);
  spinnersAll.push({
    rot: (dt) => {
      model.spinners.forEach((s, k) => {
        if (k === 0) s.rotation.y += dt * 40;
        else s.rotation.x += dt * 50;
      });
    },
  });
});

// Single-vehicle mode: close 3/4 view. Grid mode: far top-down.
const cam = only
  ? new ArcRotateCamera("cam", -Math.PI / 2 + 0.5, 1.0, 9, new Vector3(0, 0.8, 0.5), scene)
  : new ArcRotateCamera("cam", -Math.PI / 2, 0.18, 40, new Vector3(0, 0, 0.5), scene);
cam.attachControl(canvas, true);
cam.wheelPrecision = 20;

document.getElementById("legend")!.textContent =
  "L→R: " + ids.join("  |  ") + "\ngreen ball = +Z FRONT (nose should point at it)";

engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000;
  for (const s of spinnersAll) s.rot(dt);
  scene.render();
});
addEventListener("resize", () => engine.resize());
// Signal readiness for screenshot tooling once GLBs have had time to load.
setTimeout(() => ((window as unknown as { __ready: boolean }).__ready = true), 2500);
