import { Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { clamp, expDamp, lerp } from "../core/math";

const BASE_FOV = 0.9;
const CHASE_DIST = 13; // how far behind the vehicle
const CHASE_HEIGHT = 6; // how high above
const LOOK_AHEAD = 11; // look point ahead of the vehicle
const LOOK_HEIGHT = 2;

/**
 * Third-person CHASE camera (Massive Warfare style): sits behind the vehicle's heading,
 * low and looking forward; swings around to stay behind as the vehicle turns.
 * Slower position follow than look = a smooth trailing arc through turns.
 */
export class CameraRig {
  readonly camera: UniversalCamera;

  private trauma = 0;
  private readonly look = new Vector3();
  private readonly shake = new Vector3();
  private readonly desired = new Vector3();
  private readonly lookTarget = new Vector3();

  /** XZ basis from the camera's actual facing (legacy camera-relative controllers). */
  readonly forward = new Vector3(0, 0, 1);
  readonly right = new Vector3(1, 0, 0);

  private punch = 0;

  constructor(scene: Scene) {
    this.camera = new UniversalCamera("cam", new Vector3(0, CHASE_HEIGHT, -CHASE_DIST), scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 600;
    this.camera.fov = BASE_FOV;
    this.camera.setTarget(Vector3.Zero());
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  zoomPunch(amount: number): void {
    this.punch = Math.min(0.3, this.punch + amount);
  }

  /** @param heading unit XZ direction the vehicle is facing. */
  update(dt: number, targetPos: Vector3, heading: Vector3, targetVel: Vector3): void {
    // Chase position: behind the heading, raised up.
    this.desired.copyFrom(heading).scaleInPlace(-CHASE_DIST).addInPlace(targetPos);
    this.desired.y = targetPos.y + CHASE_HEIGHT;
    Vector3.LerpToRef(this.camera.position, this.desired, expDamp(dt, 3.5), this.camera.position);

    // Look point ahead of the vehicle (into the screen).
    this.lookTarget.copyFrom(heading).scaleInPlace(LOOK_AHEAD).addInPlace(targetPos);
    this.lookTarget.y = targetPos.y + LOOK_HEIGHT;
    Vector3.LerpToRef(this.look, this.lookTarget, expDamp(dt, 6), this.look);

    // Trauma shake.
    const s = this.trauma * this.trauma;
    if (s > 0.0001) {
      const mag = 0.55 * s;
      this.shake.set(
        (Math.random() * 2 - 1) * mag,
        (Math.random() * 2 - 1) * mag,
        (Math.random() * 2 - 1) * mag,
      );
      this.camera.position.addInPlace(this.shake);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    this.camera.setTarget(this.look);

    // Speed-FOV + decaying zoom-punch.
    const speed01 = clamp(Math.hypot(targetVel.x, targetVel.z) / 14, 0, 1);
    const fovTarget = BASE_FOV + speed01 * 0.08 + this.punch;
    this.camera.fov = lerp(this.camera.fov, fovTarget, expDamp(dt, 8));
    this.punch = Math.max(0, this.punch - dt * 1.2);

    // XZ basis from the camera's actual facing.
    this.forward.copyFrom(this.look).subtractInPlace(this.camera.position);
    this.forward.y = 0;
    if (this.forward.lengthSquared() > 1e-6) this.forward.normalize();
    this.right.set(this.forward.z, 0, -this.forward.x);
  }
}
