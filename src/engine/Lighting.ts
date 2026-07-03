import {
  Scene,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  CascadedShadowGenerator,
  Vector3,
  Color3,
} from "@babylonjs/core";
import type { QualityTier } from "../core/types";

export interface LightingRig {
  sun: DirectionalLight;
  ambient: HemisphericLight;
  shadows: ShadowGenerator; // a CascadedShadowGenerator on med+, plain on low
}

const SHADOW_SIZE: Record<QualityTier, number> = { low: 1024, med: 2048, high: 2048, ultra: 4096 };
const CASCADES: Record<QualityTier, number> = { low: 2, med: 3, high: 4, ultra: 4 };

/**
 * Realistic outdoor lighting: a warm directional sun casting CASCADED shadows (crisp up close,
 * stable into the distance across the whole open map), a sky/ground hemispheric fill, and the
 * scene's HDRI doing the ambient/IBL. Low tier falls back to a single plain shadow map.
 */
export function buildLighting(
  scene: Scene,
  tier: QualityTier,
  sunDir: readonly [number, number, number] = [-0.45, -1, -0.35],
): LightingRig {
  const sun = new DirectionalLight("sun", new Vector3(sunDir[0], sunDir[1], sunDir[2]).normalize(), scene);
  sun.position = new Vector3(40, 80, 40);
  sun.intensity = 2.4;
  sun.diffuse = new Color3(1.0, 0.95, 0.86); // warm daylight
  sun.specular = new Color3(1.0, 0.97, 0.9);

  // Sky/ground bounce so shadows read as occlusion, not black holes.
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.5;
  ambient.diffuse = new Color3(0.82, 0.87, 0.98);
  ambient.groundColor = new Color3(0.3, 0.28, 0.24);
  ambient.specular = new Color3(0, 0, 0);

  const size = SHADOW_SIZE[tier];
  let shadows: ShadowGenerator;
  if (tier === "low") {
    const sg = new ShadowGenerator(size, sun);
    sg.useExponentialShadowMap = true;
    sg.bias = 0.0015;
    sg.normalBias = 0.02;
    sg.setDarkness(0.4);
    shadows = sg;
  } else {
    const csm = new CascadedShadowGenerator(size, sun);
    csm.numCascades = CASCADES[tier];
    csm.lambda = 0.7; // split blend: crisp near cascades, roomy far one
    csm.stabilizeCascades = true; // kill edge shimmer as the camera moves
    csm.shadowMaxZ = 220; // cover the open battlefield out to the treeline
    csm.autoCalcDepthBounds = true; // tighten cascades to what the camera sees
    csm.depthClamp = true;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    csm.bias = 0.002;
    csm.normalBias = 0.03;
    csm.setDarkness(0.32);
    shadows = csm;
  }

  return { sun, ambient, shadows };
}
