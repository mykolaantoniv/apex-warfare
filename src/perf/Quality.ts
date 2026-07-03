import { Engine } from "@babylonjs/core";
import type { QualityTier } from "../core/types";

/**
 * Boot-time device tier guess. Per the realism overhaul we "go heavy everywhere": default to
 * `ultra` and only drop to a lighter tier on clearly weak hardware. The governor can still nudge
 * resolution down as a safety net, but never disables realism features.
 */
export function detectTier(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;

  // Only obviously weak devices fall back; everything else gets the full realistic pipeline.
  if (cores <= 2 || mem <= 2) return "low";
  if (cores <= 4 || mem <= 4) return "med";
  return "ultra";
}

const START_SCALE: Record<QualityTier, number> = { low: 1.5, med: 1.15, high: 1.0, ultra: 1.0 };

/**
 * Runtime FPS safety net. Per the realism overhaul ("go heavy everywhere") this only nudges the
 * hardware scaling level — it never disables realism features — and only reacts to a SEVERE,
 * sustained slowdown (below ~30fps for over a second), recovering slowly back toward native.
 */
export class QualityGovernor {
  scale: number;
  private readonly baseScale: number;
  private ema = 16.6;
  private slowTimer = 0;
  private fastTimer = 0;

  constructor(
    private readonly engine: Engine,
    tier: QualityTier,
  ) {
    this.baseScale = START_SCALE[tier];
    this.scale = this.baseScale;
    engine.setHardwareScalingLevel(this.scale);
  }

  get frameMs(): number {
    return this.ema;
  }

  update(dtMs: number): void {
    this.ema = this.ema * 0.92 + dtMs * 0.08;

    // Severe slowdown (< ~30fps) sustained → drop resolution a notch (safety only).
    if (this.ema > 33) {
      this.fastTimer = 0;
      this.slowTimer += dtMs;
      if (this.slowTimer > 1500 && this.scale < 2.0) {
        this.scale = Math.min(2.0, this.scale + 0.2);
        this.engine.setHardwareScalingLevel(this.scale);
        this.slowTimer = 0;
      }
    } else if (this.ema < 20 && this.scale > this.baseScale) {
      // Comfortably fast (> 50fps) for a while → climb back toward native resolution.
      this.slowTimer = 0;
      this.fastTimer += dtMs;
      if (this.fastTimer > 5000) {
        this.scale = Math.max(this.baseScale, this.scale - 0.1);
        this.engine.setHardwareScalingLevel(this.scale);
        this.fastTimer = 0;
      }
    } else {
      this.slowTimer = 0;
      this.fastTimer = 0;
    }
  }
}
