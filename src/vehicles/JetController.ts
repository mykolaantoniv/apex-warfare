import {
  Scene,
  Mesh,
  TransformNode,
  MeshBuilder,
  Vector3,
  Quaternion,
  Color3,
  PhysicsAggregate,
  PhysicsShapeType,
  ShadowGenerator,
} from "@babylonjs/core";
import type { InputState, VehicleConfig } from "../core/types";
import { clamp, expDamp } from "../core/math";
import type { VehicleController } from "./VehicleController";
import { attachGlb, buildJetModel, charAllMaterials } from "./models";

const GRAVITY = 9.81;
const DEG2RAD = Math.PI / 180;

/**
 * Jet: forward-biased flyer. Left stick steers heading (x) + throttle (y); it never fully
 * stops (stall floor) and banks hard into turns. Fires along its nose. High speed, low agility.
 */
export class JetController implements VehicleController {
  readonly forwardDir = new Vector3(0, 0, 1);

  private readonly body: Mesh;
  private readonly visual: TransformNode;
  private readonly agg: PhysicsAggregate;
  private readonly mv: VehicleConfig["movement"];
  private readonly maxBank: number;
  private readonly minSpeed: number;
  private readonly turnRate: number;

  private readonly vel = new Vector3();
  private readonly force = new Vector3();
  private readonly zero = new Vector3(0, 0, 0);

  private yaw = 0;
  private speed: number;
  private bank = 0;
  private pitch = 0;
  private steer = 0;

  constructor(scene: Scene, cfg: VehicleConfig, shadows: ShadowGenerator, spawn: Vector3, accent: Color3) {
    this.mv = cfg.movement;
    this.maxBank = cfg.movement.bankAngleMax * DEG2RAD;
    this.minSpeed = cfg.movement.maxSpeed * 0.45;
    this.turnRate = cfg.movement.turnRate * DEG2RAD;
    this.speed = this.minSpeed;

    this.body = MeshBuilder.CreateBox("jetBody", { width: 1.2, height: 0.6, depth: 2.4 }, scene);
    this.body.position.copyFrom(spawn);
    this.body.isVisible = false;
    this.agg = new PhysicsAggregate(this.body, PhysicsShapeType.BOX, { mass: this.mv.mass, restitution: 0.05 }, scene);
    this.agg.body.setLinearDamping(this.mv.linearDamping);
    this.agg.body.setAngularDamping(this.mv.angularDamping);

    const model = buildJetModel(scene, accent, cfg.visual.scale);
    this.visual = model.root;
    for (const m of model.parts) shadows.addShadowCaster(m);
    attachGlb(scene, this.visual, cfg, model.parts, ({ meshes }) => {
      for (const m of meshes) shadows.addShadowCaster(m as Mesh);
    });
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

  /** Destroyed: char in place + a small tumbling impulse; gravity brings the wreck down once
   *  `fixedUpdate` stops being driven (Combatant no longer moves a dead unit). */
  kill(): void {
    charAllMaterials(this.visual);
    const body = this.agg.body;
    const c = this.body.getAbsolutePosition();
    body.applyImpulse(
      new Vector3((Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4),
      new Vector3(c.x + (Math.random() - 0.5) * 1.2, c.y + (Math.random() - 0.5) * 0.3, c.z + (Math.random() - 0.5) * 1.2),
    );
  }

  fixedUpdate(dt: number, input: InputState, _fwd: Vector3, _right: Vector3): void {
    const body = this.agg.body;
    body.getLinearVelocityToRef(this.vel);
    const pos = this.body.position;

    // Steer heading + throttle (heading-relative controls).
    this.steer = input.move.x;
    this.yaw += this.steer * this.turnRate * dt;
    this.speed = clamp(this.speed + input.move.y * this.mv.accelForce * dt, this.minSpeed, this.mv.maxSpeed);

    // Altitude hold.
    const heightErr = this.mv.hoverHeight - pos.y;
    const liftAccel = GRAVITY + clamp(heightErr * 9 - this.vel.y * 4, -14, 16);

    // Track desired velocity along heading.
    const dvx = Math.sin(this.yaw) * this.speed;
    const dvz = Math.cos(this.yaw) * this.speed;
    let ax = (dvx - this.vel.x) * 6;
    let az = (dvz - this.vel.z) * 6;
    const aMag = Math.hypot(ax, az);
    if (aMag > 40) {
      const s = 40 / aMag;
      ax *= s;
      az *= s;
    }

    this.force.set(ax * this.mv.mass, liftAccel * this.mv.mass, az * this.mv.mass);
    body.applyForce(this.force, this.body.getAbsolutePosition());
    body.setAngularVelocity(this.zero);
  }

  frameUpdate(dt: number): void {
    this.visual.position.copyFrom(this.body.position);
    this.forwardDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const bankTarget = clamp(-this.steer, -1, 1) * this.maxBank;
    const pitchTarget = -((this.speed - this.minSpeed) / (this.mv.maxSpeed - this.minSpeed)) * this.maxBank * 0.25;
    this.bank += (bankTarget - this.bank) * expDamp(dt, 6);
    this.pitch += (pitchTarget - this.pitch) * expDamp(dt, 6);

    Quaternion.RotationYawPitchRollToRef(this.yaw, this.pitch, this.bank, this.visual.rotationQuaternion as Quaternion);
  }

  dispose(): void {
    this.agg.dispose();
    this.body.dispose();
    this.visual.dispose();
  }
}
