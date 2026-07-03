import { Scene, Engine, Vector3, Matrix, Viewport } from "@babylonjs/core";

export interface PlateInfo {
  pos: Vector3;
  hpPct: number;
  name: string;
  locked: boolean;
}

interface Plate {
  el: HTMLDivElement;
  tag: HTMLDivElement;
  fill: HTMLDivElement;
}

const POOL = 12;

/** Floating enemy name tags + health bars projected above each vehicle; red when locked. */
export class Nameplates {
  private readonly container: HTMLDivElement;
  private readonly pool: Plate[] = [];
  private readonly identity = Matrix.Identity();
  private readonly viewport = new Viewport(0, 0, 1, 1);
  private readonly tmp = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly engine: Engine,
  ) {
    this.container = document.createElement("div");
    this.container.className = "plate-layer";
    document.body.appendChild(this.container);

    for (let i = 0; i < POOL; i++) {
      const el = document.createElement("div");
      el.className = "plate";
      el.style.opacity = "0";
      const tag = document.createElement("div");
      tag.className = "plate-tag";
      const track = document.createElement("div");
      track.className = "plate-bar";
      const fill = document.createElement("div");
      fill.className = "plate-fill";
      track.appendChild(fill);
      el.appendChild(tag);
      el.appendChild(track);
      this.container.appendChild(el);
      this.pool.push({ el, tag, fill });
    }
  }

  dispose(): void {
    this.container.remove();
  }

  update(plates: readonly PlateInfo[]): void {
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    this.viewport.width = w;
    this.viewport.height = h;
    const transform = this.scene.getTransformMatrix();

    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i]!;
      const info = plates[i];
      if (!info) {
        slot.el.style.opacity = "0";
        continue;
      }
      this.tmp.copyFrom(info.pos);
      this.tmp.y += 2.6; // float above the vehicle
      const p = Vector3.Project(this.tmp, this.identity, transform, this.viewport);
      if (p.z < 0 || p.z > 1) {
        slot.el.style.opacity = "0";
        continue;
      }
      slot.el.style.opacity = "1";
      slot.el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
      slot.tag.textContent = info.name.toUpperCase();
      slot.fill.style.width = `${Math.max(0, Math.min(100, info.hpPct))}%`;
      slot.el.classList.toggle("locked", info.locked);
    }
  }
}
