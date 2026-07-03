import { Scene, Engine, Vector3, Matrix, Viewport } from "@babylonjs/core";

/**
 * On-screen objective indicator. When the target (zone / convoy) is on screen it shows a
 * pulsing beacon over it; when it's off screen it pins an arrow to the screen edge pointing
 * toward it, with the ground distance. Purely a HUD overlay projected from the world point.
 */
export class ObjectiveMarker {
  private readonly el: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly dist: HTMLDivElement;
  private readonly identity = Matrix.Identity();
  private readonly viewport = new Viewport(0, 0, 1, 1);
  private readonly tmp = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly engine: Engine,
  ) {
    this.el = document.createElement("div");
    this.el.className = "obj-ind";
    this.el.style.opacity = "0";
    this.arrow = document.createElement("div");
    this.arrow.className = "obj-arrow";
    this.arrow.textContent = "▲";
    this.dist = document.createElement("div");
    this.dist.className = "obj-dist";
    this.el.append(this.arrow, this.dist);
    document.body.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
  }

  /** Point at `world`; `player` is used for the distance readout. Pass null to hide. */
  update(world: Vector3 | null, player: Vector3, label: string): void {
    if (!world) {
      this.el.style.opacity = "0";
      return;
    }
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    this.viewport.width = w;
    this.viewport.height = h;

    this.tmp.copyFrom(world);
    this.tmp.y += 1.5;
    const p = Vector3.Project(this.tmp, this.identity, this.scene.getTransformMatrix(), this.viewport);

    const behind = p.z < 0 || p.z > 1;
    const margin = 46;
    const onScreen = !behind && p.x >= margin && p.x <= w - margin && p.y >= margin && p.y <= h - margin;

    const groundDist = Math.round(Math.hypot(world.x - player.x, world.z - player.z));
    this.dist.textContent = `${label} ${groundDist}m`;
    this.el.style.opacity = "1";

    if (onScreen) {
      // Beacon straight over the target.
      this.el.classList.add("on-screen");
      this.arrow.style.transform = "rotate(180deg)"; // point down at the target
      this.el.style.left = `${p.x}px`;
      this.el.style.top = `${p.y}px`;
      return;
    }

    // Off screen: clamp to a screen-edge position, arrow points outward toward the target.
    this.el.classList.remove("on-screen");
    let dx = p.x - w / 2;
    let dy = p.y - h / 2;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rx = w / 2 - margin;
    const ry = h / 2 - margin;
    const scale = Math.min(rx / Math.abs(dx || 1e-3), ry / Math.abs(dy || 1e-3));
    const ex = w / 2 + dx * scale;
    const ey = h / 2 + dy * scale;
    this.el.style.left = `${ex}px`;
    this.el.style.top = `${ey}px`;
    // Arrow glyph points up by default; rotate so it aims along (dx,dy).
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    this.arrow.style.transform = `rotate(${angle}deg)`;
  }
}
