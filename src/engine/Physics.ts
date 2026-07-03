import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin, Scene, Vector3 } from "@babylonjs/core";

export type HavokInstance = Awaited<ReturnType<typeof HavokPhysics>>;

/** Load the Havok WASM once; reuse the instance across mission scenes. */
export async function initHavok(): Promise<HavokInstance> {
  return HavokPhysics();
}

/** Enable physics on a scene using an already-loaded Havok instance. */
export function enablePhysicsOnScene(scene: Scene, havok: HavokInstance): void {
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
}

/** Collision filter groups (reserved for projectile/team filtering refinements). */
export const CollisionGroup = {
  World: 1 << 0,
  Player: 1 << 1,
  Enemy: 1 << 2,
  PlayerShot: 1 << 3,
  EnemyShot: 1 << 4,
} as const;
