import { Vector3 } from "@babylonjs/core";

export interface Blip {
  pos: Vector3;
  locked: boolean;
}

const RANGE = 140; // world metres mapped to the radar edge

/** Top-left minimap: player at centre facing up; enemy blips rotated into player space. */
export class Radar {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("radar: no 2d context");
    this.ctx = ctx;
  }

  update(playerPos: Vector3, forward: Vector3, blips: readonly Blip[]): void {
    const s = this.canvas.width;
    const r = s / 2;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, s, s);

    // Dish.
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,14,20,0.6)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(39,227,255,0.45)";
    ctx.stroke();

    // Player local frame: forward = up.
    const h = Math.atan2(forward.x, forward.z);
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const scale = (r - 7) / RANGE;
    const maxR = r - 7;

    for (const b of blips) {
      const dx = b.pos.x - playerPos.x;
      const dz = b.pos.z - playerPos.z;
      const localForward = dx * sin + dz * cos;
      const localRight = dx * cos - dz * sin;
      let px = localRight * scale;
      let py = -localForward * scale;
      const d = Math.hypot(px, py);
      if (d > maxR) {
        px = (px / d) * maxR;
        py = (py / d) * maxR;
      }
      ctx.beginPath();
      ctx.arc(r + px, r + py, b.locked ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = b.locked ? "#ff3b30" : "#ff8a3d";
      ctx.fill();
    }

    // Player marker (triangle pointing up).
    ctx.fillStyle = "#27e3ff";
    ctx.beginPath();
    ctx.moveTo(r, r - 7);
    ctx.lineTo(r - 5, r + 6);
    ctx.lineTo(r + 5, r + 6);
    ctx.closePath();
    ctx.fill();
  }
}
