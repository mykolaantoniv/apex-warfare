import {
  Scene,
  Mesh,
  TransformNode,
  MeshBuilder,
  Vector3,
  Color3,
  PhysicsAggregate,
  PhysicsShapeType,
  ShadowGenerator,
} from "@babylonjs/core";
import type { InputState, VehicleConfig } from "../core/types";
import type { WaterRegion } from "../data/types";
import { clamp } from "../core/math";
import type { VehicleController } from "./VehicleController";
import { attachGlb, buildBikeModel, buildBoatModel, buildSoldierModel, charAllMaterials, GroundModel } from "./models";

const GRAVITY = 9.81;
const DEG2RAD = Math.PI / 180;

/**
 * Generic ground/water mover for turret-less vehicles (bike / soldier / boat). Steers the
 * hull heading + throttles forward/back like the tank, but has no turret — it fires along
 * `forwardDir`. Boats float at the map's water level and are kept inside the lake.
 */
export class GroundController implements VehicleController {
  readonly forwardDir = new Vector3(0, 0, 1);

  private readonly body: Mesh;
  private readonly visual: TransformNode;
  private readonly spinners: TransformNode[];
  private readonly agg: PhysicsAggregate;
  private readonly mv: VehicleConfig["movement"];
  private readonly turnRate: number;
  private readonly visualDrop: number;
  private readonly water: WaterRegion | null; // boats: buoyancy + confined INSIDE the lake
  private readonly avoidWater: WaterRegion | null; // ground units: blocked FROM the lake

  private readonly vel = new Vector3();
  private readonly force = new Vector3();
  private readonly zero = new Vector3(0, 0, 0);

  private hullYaw = 0;
  private bob = 0;

  constructor(scene: Scene, cfg: VehicleConfig, shadows: ShadowGenerator, spawn: Vector3, accent: Color3) {
    this.mv = cfg.movement;
    this.turnRate = cfg.movement.turnRate * DEG2RAD;
    const model = cfg.movement.model;

    // Boats float; read the lake region stashed on the scene by the arena builder.
    const meta = scene.metadata as { water?: WaterRegion } | null;
    this.water = model === "boat" ? (meta?.water ?? null) : null;
    // War-game rule: boats live on water, everything else is barred from it (no cars on the lake).
    this.avoidWater = model !== "boat" ? (meta?.water ?? null) : null;

    // Physics proxy sized per class.
    const dims =
      model === "boat"
        ? { width: 1.8, height: 0.9, depth: 4.4 }
        : model === "soldier"
          ? { width: 0.7, height: 1.7, depth: 0.7 }
          : { width: 1.3, height: 0.7, depth: 2.0 }; // bike
    this.body = MeshBuilder.CreateBox("groundBody", dims, scene);
    // Boats always start inside the lake (spawns are assigned by index, not vehicle type).
    let sx = spawn.x;
    let sz = spawn.z;
    let sy = spawn.y;
    if (model === "boat" && this.water) {
      const w = this.water;
      sx = clamp(spawn.x, w.x - w.w / 2 + 4, w.x + w.w / 2 - 4);
      sz = clamp(spawn.z, w.z - w.d / 2 + 4, w.z + w.d / 2 - 4);
      sy = w.level + 0.5;
    }
    this.body.position.set(sx, sy, sz);
    this.body.isVisible = false;
    this.agg = new PhysicsAggregate(
      this.body,
      PhysicsShapeType.BOX,
      { mass: this.mv.mass, restitution: 0.02, friction: 0.85 },
      scene,
    );
    this.agg.body.setLinearDamping(this.mv.linearDamping);
    this.agg.body.setAngularDamping(this.mv.angularDamping);

    const built: GroundModel =
      model === "boat"
        ? buildBoatModel(scene, accent, cfg.visual.scale)
        : model === "soldier"
          ? buildSoldierModel(scene, accent, cfg.visual.scale)
          : buildBikeModel(scene, accent, cfg.visual.scale);
    this.visual = built.root;
    this.spinners = built.spinners;
    for (const m of built.parts) shadows.addShadowCaster(m);
    attachGlb(scene, this.visual, cfg, built.parts, ({ meshes, spinners }) => {
      for (const m of meshes) shadows.addShadowCaster(m as Mesh);
      // Real GLB exposes its own wheels — spin those instead of the now-hidden proc wheels.
      if (spinners.length > 0) {
        this.spinners.length = 0;
        this.spinners.push(...spinners);
      }
    });

    // Visual origin offset so the model sits on the ground / waterline.
    this.visualDrop = model === "boat" ? 0.5 : model === "soldier" ? 0.85 : 0.35;
  }

  get position(): Vector3 {
    return this.body.position;
  }
  get velocity(): Vector3 {
    return this.vel;
  }

  applyImpulse(impulse: Vector3): void {
    this.agg.body.applyImpulse(impulse, this.body.getAbsolutePosition());
  }

  /** Destroyed: char in place + a small off-center impulse (topples/shudders). Boats stop
   *  taking on gravity so a sunk hull rests visibly at the waterline instead of sinking through
   *  the (non-solid) water plane and disappearing below the terrain collider. */
  kill(): void {
    charAllMaterials(this.visual);
    const body = this.agg.body;
    if (this.water) body.setGravityFactor(0);
    const c = this.body.getAbsolutePosition();
    body.applyImpulse(
      new Vector3((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3),
      new Vector3(c.x + (Math.random() - 0.5) * 1.0, c.y + (Math.random() - 0.5) * 0.2, c.z + (Math.random() - 0.5) * 1.0),
    );
  }

  fixedUpdate(dt: number, input: InputState, _fwd: Vector3, _right: Vector3): void {
    const body = this.agg.body;
    body.getLinearVelocityToRef(this.vel);
    const pos = this.body.position;

    this.hullYaw += input.move.x * this.turnRate * dt;
    const fx = Math.sin(this.hullYaw);
    const fz = Math.cos(this.hullYaw);
    this.forwardDir.set(fx, 0, fz);

    const targetSpeed = input.move.y * this.mv.maxSpeed;
    let ax = (fx * targetSpeed - this.vel.x) * this.mv.accelForce;
    let az = (fz * targetSpeed - this.vel.z) * this.mv.accelForce;
    const aMag = Math.hypot(ax, az);
    const maxA = 60;
    if (aMag > maxA) {
      const s = maxA / aMag;
      ax *= s;
      az *= s;
    }

    // Vertical: boats hold the waterline (buoyancy PD + gravity cancel); others ride gravity.
    let fy = 0;
    if (this.water) {
      const heightErr = this.water.level + 0.5 - pos.y;
      fy = GRAVITY + clamp(heightErr * 12 - this.vel.y * 5, -14, 16);
    }
    this.force.set(ax * this.mv.mass, fy * this.mv.mass, az * this.mv.mass);
    body.applyForce(this.force, this.body.getAbsolutePosition());
    body.setAngularVelocity(this.zero);

    // Keep boats inside the lake; keep everything else OUT of it.
    if (this.water) this.confineToWater(body, pos);
    else if (this.avoidWater) this.blockFromWater(body, pos);
  }

  /** Ground units: hard-stop at the shoreline so cars/tanks/troops never drive onto the lake. */
  private blockFromWater(body: PhysicsAggregate["body"], pos: Vector3): void {
    const w = this.avoidWater;
    if (!w) return;
    const margin = 2.5; // keep the hull clear of the waterline
    const hx = w.w / 2 + margin;
    const hz = w.d / 2 + margin;
    const dx = pos.x - w.x;
    const dz = pos.z - w.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) return; // already clear of the lake
    // Inside the shore band: push out along the shallowest axis and kill inward velocity.
    const outX = hx - Math.abs(dx);
    const outZ = hz - Math.abs(dz);
    if (outX < outZ) {
      const dir = dx >= 0 ? 1 : -1;
      body.applyForce(this.force.set(dir * 120 * this.mv.mass, 0, 0), this.body.getAbsolutePosition());
      if (this.vel.x * dir < 0) body.setLinearVelocity(this.vel.set(0, this.vel.y, this.vel.z));
    } else {
      const dir = dz >= 0 ? 1 : -1;
      body.applyForce(this.force.set(0, 0, dir * 120 * this.mv.mass), this.body.getAbsolutePosition());
      if (this.vel.z * dir < 0) body.setLinearVelocity(this.vel.set(this.vel.x, this.vel.y, 0));
    }
  }

  private confineToWater(body: PhysicsAggregate["body"], pos: Vector3): void {
    const w = this.water;
    if (!w) return;
    const hx = w.w / 2 - 3;
    const hz = w.d / 2 - 3;
    let nudgeX = 0;
    let nudgeZ = 0;
    if (pos.x > w.x + hx) nudgeX = -1;
    else if (pos.x < w.x - hx) nudgeX = 1;
    if (pos.z > w.z + hz) nudgeZ = -1;
    else if (pos.z < w.z - hz) nudgeZ = 1;
    if (nudgeX !== 0 || nudgeZ !== 0) {
      this.force.set(nudgeX * 40 * this.mv.mass, 0, nudgeZ * 40 * this.mv.mass);
      body.applyForce(this.force, this.body.getAbsolutePosition());
    }
  }

  frameUpdate(dt: number): void {
    this.visual.position.copyFrom(this.body.position);
    this.visual.position.y -= this.visualDrop;
    // Gentle bob for boats.
    if (this.water) {
      this.bob += dt * 2.2;
      this.visual.position.y += Math.sin(this.bob) * 0.06;
      this.visual.rotation.z = Math.sin(this.bob * 0.8) * 0.04;
    }
    this.visual.rotation.y = this.hullYaw;
    // Spin wheels proportional to speed (bikes).
    if (this.spinners.length > 0) {
      const spd = Math.hypot(this.vel.x, this.vel.z);
      for (const s of this.spinners) s.rotation.x += spd * dt * 1.6;
    }
  }

  dispose(): void {
    this.agg.dispose();
    this.body.dispose();
    this.visual.dispose();
  }
}
