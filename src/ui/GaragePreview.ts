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
  TransformNode,
} from "@babylonjs/core";
import { buildShowcaseModel } from "../vehicles/models";
import type { VehicleConfig } from "../core/types";

/**
 * Rotating 3D vehicle showcase for the garage (MW-style hangar). Renders to the shared
 * #renderCanvas with IBL reflections; the DOM garage overlays around a transparent center.
 * Visual only — no physics.
 */
export class GaragePreview {
  private scene: Scene | null = null;
  private turntable: TransformNode | null = null;
  private currentRoot: TransformNode | null = null;
  private spinners: TransformNode[] = [];
  private running = false;

  constructor(private readonly engine: Engine) {}

  private ensureScene(): Scene {
    if (this.scene) return this.scene;
    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.03, 0.05, 0.08, 1);
    scene.environmentTexture = new HDRCubeTexture("env/ibl.hdr", scene, 128);
    scene.environmentIntensity = 1.0;

    const cam = new ArcRotateCamera("gcam", -1.0, 1.18, 8.5, new Vector3(0, 1.2, 0), scene);
    cam.minZ = 0.1;
    cam.fov = 0.7;

    const key = new DirectionalLight("gkey", new Vector3(-0.5, -1, -0.35), scene);
    key.intensity = 3.0;
    key.diffuse = new Color3(1, 0.97, 0.92);
    const rim = new DirectionalLight("grim", new Vector3(0.6, -0.2, 0.7), scene);
    rim.intensity = 1.4;
    rim.diffuse = new Color3(0.4, 0.6, 1);
    const amb = new HemisphericLight("gamb", new Vector3(0, 1, 0), scene);
    amb.intensity = 0.45;

    // Reflective pedestal.
    const ped = MeshBuilder.CreateCylinder("ped", { height: 0.4, diameter: 6.5, tessellation: 56 }, scene);
    ped.position.y = -0.2;
    const pmat = new PBRMaterial("pedmat", scene);
    pmat.albedoColor = new Color3(0.04, 0.05, 0.07);
    pmat.metallic = 0.85;
    pmat.roughness = 0.22;
    ped.material = pmat;

    this.turntable = new TransformNode("turntable", scene);
    this.turntable.position.y = 1.2;

    this.scene = scene;
    return scene;
  }

  setVehicle(cfg: VehicleConfig, accent: Color3): void {
    const scene = this.ensureScene();
    if (this.currentRoot) {
      this.currentRoot.dispose();
      this.currentRoot = null;
    }
    const model = buildShowcaseModel(scene, cfg, accent);
    model.root.parent = this.turntable;
    model.root.position.setAll(0);
    this.currentRoot = model.root;
    this.spinners = model.spinners;
  }

  private readonly frame = (): void => {
    if (!this.scene) return;
    const dt = this.engine.getDeltaTime() / 1000;
    if (this.turntable) this.turntable.rotation.y += dt * 0.5;
    for (let i = 0; i < this.spinners.length; i++) {
      const s = this.spinners[i]!;
      if (i === 0) s.rotation.y += dt * 40;
      else s.rotation.x += dt * 50;
    }
    this.scene.render();
  };

  start(): void {
    if (this.running || !this.scene) return;
    this.running = true;
    this.engine.runRenderLoop(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.engine.stopRenderLoop(this.frame);
  }

  dispose(): void {
    this.stop();
    this.scene?.dispose();
    this.scene = null;
    this.turntable = null;
    this.currentRoot = null;
    this.spinners = [];
  }
}
