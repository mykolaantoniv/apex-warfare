import { Scene, Engine, Vector3, Matrix, Viewport } from "@babylonjs/core";

interface FloatingNumber {
  el: HTMLSpanElement;
  world: Vector3;
  life: number;
  total: number;
  active: boolean;
}

const POOL = 32;

/** Pooled DOM damage numbers projected from 3D to screen — pop, rise, fade. */
export class DamageNumbers {
  private readonly container: HTMLDivElement;
  private readonly pool: FloatingNumber[] = [];
  private readonly identity = Matrix.Identity();
  private readonly viewport = new Viewport(0, 0, 1, 1);

  constructor(
    private readonly scene: Scene,
    private readonly engine: Engine,
  ) {
    this.container = document.createElement("div");
    this.container.className = "dmg-layer";
    document.body.appendChild(this.container);

    for (let i = 0; i < POOL; i++) {
      const el = document.createElement("span");
      el.className = "dmg-num";
      el.style.opacity = "0";
      this.container.appendChild(el);
      this.pool.push({ el, world: new Vector3(), life: 0, total: 1, active: false });
    }
  }

  dispose(): void {
    this.container.remove();
  }

  spawn(worldPos: Vector3, amount: number, crit = false): void {
    const n = this.pool.find((p) => !p.active);
    if (!n) return;
    n.active = true;
    n.world.copyFrom(worldPos);
    n.world.y += 0.6;
    n.life = 0.7;
    n.total = 0.7;
    n.el.textContent = String(Math.round(amount));
    n.el.classList.toggle("crit", crit);
  }

  update(dt: number): void {
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    this.viewport.width = w;
    this.viewport.height = h;
    const transform = this.scene.getTransformMatrix();

    for (const n of this.pool) {
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.active = false;
        n.el.style.opacity = "0";
        continue;
      }
      n.world.y += dt * 1.6; // rise
      const p = Vector3.Project(n.world, this.identity, transform, this.viewport);
      if (p.z < 0 || p.z > 1) {
        n.el.style.opacity = "0";
        continue;
      }
      const t = n.life / n.total; // 1 -> 0
      const pop = 1 + (1 - t) * 0.3;
      n.el.style.transform = `translate(-50%,-50%) translate(${p.x}px, ${p.y}px) scale(${pop})`;
      n.el.style.opacity = String(Math.min(1, t * 1.6));
    }
  }
}
