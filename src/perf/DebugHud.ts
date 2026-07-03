import { Engine, Scene } from "@babylonjs/core";
import type { QualityTier } from "../core/types";

/** Toggle (backtick `) developer overlay: fps, frame ms, active meshes, tier, scale. */
export class DebugHud {
  private visible = false;

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === "`" || e.key === "~") this.toggle();
  };

  constructor(
    private readonly el: HTMLElement,
    private readonly engine: Engine,
    private readonly scene: Scene,
  ) {
    window.addEventListener("keydown", this.onKey);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.el.classList.add("hidden");
  }

  private toggle(): void {
    this.visible = !this.visible;
    this.el.classList.toggle("hidden", !this.visible);
  }

  update(tier: QualityTier, scale: number, frameMs: number): void {
    if (!this.visible) return;
    const fps = this.engine.getFps().toFixed(0);
    const meshes = this.scene.getActiveMeshes().length;
    this.el.textContent =
      `FPS    ${fps}\n` +
      `frame  ${frameMs.toFixed(1)} ms\n` +
      `meshes ${meshes}\n` +
      `tier   ${tier}\n` +
      `scale  ${scale.toFixed(2)}`;
  }
}
