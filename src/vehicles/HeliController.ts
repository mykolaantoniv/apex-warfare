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
import { clamp, expDamp, scratch } from "../core/math";
import { attachGlb, buildHeliModel } from "./models";

const GRAVITY = 9.81;
const DEG2RAD = Math.PI / 180;

/**
 * Realistic-but-responsive attack-heli controller.
 * - Physics proxy (invisible box, Havok dynamic body) provides weight & collisions.
 * - Hover = PD altitude hold cancelling gravity; left stick = camera-relative thrust.
 * - Input is INSTANT; weight comes from mass/damping. Banking/pitch are cosmetic.
 */
export class HeliController {
  readonly body: Mesh;
  readonly visual: TransformNode;
  /** Unit forward (where the nose points) — bullets fire along this. */
  readonly forwardDir = new Vector3(0, 0, 1);

  private readonly agg: PhysicsAggregate;
  private readonly rotor: TransformNode;
  private readonly tailRotor: TransformNode;
  private readonly mv: VehicleConfig["movement"];
  private readonly maxBank: number;

  private readonly vel = new Vector3();
  private readonly force = new Vector3();
  private readonly zero = new Vector3(0, 0, 0);

  private yaw = 0;
  private steer = 0;
  private bank = 0;
  private pitch = 0;
  private readonly turnRate: number; // rad/s

  constructor(
    scene: Scene,
    cfg: VehicleConfig,
    shadows: ShadowGenerator,
    spawn: Vector3,
    accent: Color3 = new Color3(0.15, 0.85, 1.0),
  ) {
    this.mv = cfg.movement;
    this.maxBank = cfg.movement.bankAngleMax * DEG2RAD;
    this.turnRate = cfg.movement.turnRate * DEG2RAD;

    // Invisible physics proxy.
    this.body = MeshBuilder.CreateBox("heliBody", { width: 1.6, height: 0.7, depth: 1.9 }, scene);
    this.body.position.copyFrom(spawn);
    this.body.isVisible = false;
    this.agg = new PhysicsAggregate(
      this.body,
      PhysicsShapeType.BOX,
      { mass: this.mv.mass, restitution: 0.08, friction: 0.3 },
      scene,
    );
    this.agg.body.setLinearDamping(this.mv.linearDamping);
    this.agg.body.setAngularDamping(this.mv.angularDamping);

    // Rendered heli (shared geometry from models.ts; physics stays here).
    const model = buildHeliModel(scene, accent, cfg.visual.scale);
    this.visual = model.root;
    this.rotor = model.mainRotor;
    this.tailRotor = model.tailRotor;
    for (const m of model.parts) shadows.addShadowCaster(m);
    // The CC0 heli GLB has no separate rotor node, so keep the procedural rotor blades
    // (children of the rotor hubs) visible + spinning over the real hull — hide everything else.
    const rotorBlades = new Set<Mesh>([
      ...model.mainRotor.getChildMeshes(false),
      ...model.tailRotor.getChildMeshes(false),
    ] as Mesh[]);
    const hide = model.parts.filter((m) => !rotorBlades.has(m));
    attachGlb(scene, this.visual, cfg, hide, ({ meshes }) => {
      for (const m of meshes) shadows.addShadowCaster(m as Mesh);
    });
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get velocity(): Vector3 {
    return this.vel;
  }

  /** Knockback / explosion impulse (world space). */
  applyImpulse(impulse: Vector3): void {
    this.agg.body.applyImpulse(impulse, this.body.getAbsolutePosition());
  }

  /** Destroyed: hide the wreck (physics body left to settle; disposed with the scene). */
  kill(): void {
    this.visual.setEnabled(false);
    this.rotor.rotation.y = 0;
  }

  /** Physics step — steer + throttle forward flight (chase-cam style). */
  fixedUpdate(dt: number, input: InputState, _camForward: Vector3, _camRight: Vector3): void {
    const body = this.agg.body;
    body.getLinearVelocityToRef(this.vel);
    const pos = this.body.position;

    // Left stick X = steer heading; Y = throttle (forward/back along heading).
    this.steer = input.move.x;
    this.yaw += this.steer * this.turnRate * dt;
    this.forwardDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const targetSpeed = input.move.y * this.mv.maxSpeed;
    const dvx = this.forwardDir.x * targetSpeed;
    const dvz = this.forwardDir.z * targetSpeed;
    let ax = (dvx - this.vel.x) * this.mv.accelForce;
    let az = (dvz - this.vel.z) * this.mv.accelForce;
    const aMag = Math.hypot(ax, az);
    const maxA = 32;
    if (aMag > maxA) {
      const s = maxA / aMag;
      ax *= s;
      az *= s;
    }

    // Hover altitude hold.
    const heightErr = this.mv.hoverHeight - pos.y;
    const liftAccel = GRAVITY + clamp(heightErr * 10 - this.vel.y * 4.5, -14, 16);

    this.force.set(ax * this.mv.mass, liftAccel * this.mv.mass, az * this.mv.mass);
    body.applyForce(this.force, this.body.getAbsolutePosition());
    body.setAngularVelocity(this.zero);
  }

  /** Render step — sync visual, bank into turns, spin rotors. */
  frameUpdate(dt: number): void {
    this.visual.position.copyFrom(this.body.position);

    const fwdSpeed = (this.vel.x * this.forwardDir.x + this.vel.z * this.forwardDir.z) / this.mv.maxSpeed;
    const bankTarget = clamp(-this.steer, -1, 1) * this.maxBank;
    const pitchTarget = clamp(fwdSpeed, -1, 1) * this.maxBank * 0.4;
    this.bank += (bankTarget - this.bank) * expDamp(dt, 6);
    this.pitch += (pitchTarget - this.pitch) * expDamp(dt, 6);

    Quaternion.RotationYawPitchRollToRef(this.yaw, this.pitch, this.bank, this.visual.rotationQuaternion as Quaternion);

    this.rotor.rotation.y += dt * 40;
    this.tailRotor.rotation.x += dt * 55;
  }

  dispose(): void {
    this.agg.dispose();
    this.body.dispose();
    this.visual.dispose();
    // scratch is shared/global; nothing else to free here.
    void scratch;
  }
}
