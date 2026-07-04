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
import { expDamp, lerpAngle } from "../core/math";
import type { VehicleController } from "./VehicleController";
import { attachGlb, buildTankModel } from "./models";

const DEG2RAD = Math.PI / 180;

/**
 * Tank: ground vehicle. Left stick steers the hull + throttles forward/back (chase-cam
 * style); the turret auto-aims at the locked target. Heavy, high armor, no flight.
 */
export class TankController implements VehicleController {
  readonly forwardDir = new Vector3(0, 0, 1);

  private readonly body: Mesh;
  private readonly visual: TransformNode;
  private readonly hull: TransformNode;
  private readonly turret: TransformNode;
  private readonly agg: PhysicsAggregate;
  private readonly mv: VehicleConfig["movement"];
  private readonly turnRate: number; // rad/s

  private readonly vel = new Vector3();
  private readonly force = new Vector3();
  private readonly zero = new Vector3(0, 0, 0);

  private hullYaw = 0;
  private turretYaw = 0;
  private turretYawTarget = 0;
  private aimTarget: Vector3 | null = null;

  constructor(scene: Scene, cfg: VehicleConfig, shadows: ShadowGenerator, spawn: Vector3, accent: Color3) {
    this.mv = cfg.movement;
    this.turnRate = cfg.movement.turnRate * DEG2RAD;

    this.body = MeshBuilder.CreateBox("tankBody", { width: 2, height: 1, depth: 2.6 }, scene);
    this.body.position.set(spawn.x, 0.8, spawn.z); // rest on ground
    this.body.isVisible = false;
    this.agg = new PhysicsAggregate(
      this.body,
      PhysicsShapeType.BOX,
      { mass: this.mv.mass, restitution: 0.02, friction: 0.9 },
      scene,
    );
    this.agg.body.setLinearDamping(this.mv.linearDamping);
    this.agg.body.setAngularDamping(this.mv.angularDamping);

    const model = buildTankModel(scene, accent, cfg.visual.scale);
    this.visual = model.root;
    this.hull = model.hull;
    this.turret = model.turret;
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

  kill(): void {
    this.visual.setEnabled(false);
  }

  /** Point the turret at a world position (from the locked target); null = face forward. */
  aimAt(target: Vector3 | null): void {
    if (target) {
      if (!this.aimTarget) this.aimTarget = new Vector3();
      this.aimTarget.copyFrom(target);
    } else {
      this.aimTarget = null;
    }
  }

  fixedUpdate(dt: number, input: InputState, _fwd: Vector3, _right: Vector3): void {
    const body = this.agg.body;
    body.getLinearVelocityToRef(this.vel);

    // Steer hull (X) + throttle forward/back along hull heading (Y).
    this.hullYaw += input.move.x * this.turnRate * dt;
    const fx = Math.sin(this.hullYaw);
    const fz = Math.cos(this.hullYaw);
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
    this.force.set(ax * this.mv.mass, 0, az * this.mv.mass); // gravity keeps it grounded
    body.applyForce(this.force, this.body.getAbsolutePosition());
    body.setAngularVelocity(this.zero);

    this.forwardDir.set(fx, 0, fz); // chase cam follows the hull heading

    // Turret auto-aims at the locked target, else faces forward.
    if (this.aimTarget) {
      const tx = this.aimTarget.x - this.body.position.x;
      const tz = this.aimTarget.z - this.body.position.z;
      if (Math.hypot(tx, tz) > 0.5) this.turretYawTarget = Math.atan2(tx, tz);
    } else {
      this.turretYawTarget = this.hullYaw;
    }
  }

  frameUpdate(dt: number): void {
    this.visual.position.copyFrom(this.body.position);
    this.visual.position.y -= 0.3; // sit visual near the tracks
    this.turretYaw = lerpAngle(this.turretYaw, this.turretYawTarget, expDamp(dt, 10));
    this.hull.rotation.y = this.hullYaw;
    this.turret.rotation.y = this.turretYaw;
  }

  dispose(): void {
    this.agg.dispose();
    this.body.dispose();
    this.visual.dispose();
  }
}
