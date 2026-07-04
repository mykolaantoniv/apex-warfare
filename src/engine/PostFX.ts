import {
  Scene,
  Camera,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
  ImageProcessingConfiguration,
  MotionBlurPostProcess,
} from "@babylonjs/core";
import type { QualityTier } from "../core/types";

/**
 * Realistic post stack. Screen-space ambient occlusion (SSAO2) grounds everything in contact
 * shade, then a DefaultRenderingPipeline does ACES tonemapping + bloom + AA + a filmic finish
 * (sharpen, subtle grain + chromatic aberration on the top tiers) + camera motion blur. Heavier
 * effects are gated by tier, but per the realism overhaul the default tier is `ultra`.
 */
export function buildPostFX(
  scene: Scene,
  camera: Camera,
  tier: QualityTier,
  motionBlur = false,
): DefaultRenderingPipeline {
  const heavy = tier === "high" || tier === "ultra";
  const ultra = tier === "ultra";

  // SSAO2 first so the color pipeline tonemaps/blooms the already-occluded scene (WebGL2 only).
  if (heavy) {
    const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: ultra ? 0.75 : 0.5, blurRatio: 1 }, [camera]);
    ssao.radius = 2.4;
    ssao.totalStrength = 1.15;
    ssao.base = 0.12;
    ssao.samples = ultra ? 32 : 16;
    ssao.maxZ = 260;
    ssao.minZAspect = 0.2;
    ssao.expensiveBlur = ultra;
  }

  const pipeline = new DefaultRenderingPipeline("apex", true, scene, [camera]);

  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.contrast = 1.15;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 1.8;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.85;
  pipeline.bloomWeight = tier === "low" ? 0.35 : 0.5;
  pipeline.bloomKernel = heavy ? 64 : 32;
  pipeline.bloomScale = 0.5;

  // Anti-aliasing: FXAA everywhere + MSAA on the top tiers.
  pipeline.fxaaEnabled = true;
  pipeline.samples = ultra ? 8 : tier === "high" ? 4 : 1;

  // Filmic finish: crisp detail + a whisper of grain/chromatic aberration on the top tiers.
  if (heavy) {
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.28;
    pipeline.sharpen.colorAmount = 1.0;
  }
  if (ultra) {
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 6;
    pipeline.grain.animated = true;
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = 2.2;
  }

  // Camera motion blur — OFF by default (Settings toggle). It is camera-velocity based (no
  // geometry prepass), and the fast third-person chase cam repositions so much per frame that
  // high strength smears the whole scene into a haze; kept subtle + opt-in for players who want
  // the sense-of-speed look.
  if (motionBlur && tier !== "low") {
    const mb = new MotionBlurPostProcess("motionBlur", scene, 1.0, camera);
    mb.motionStrength = 0.2;
    mb.isObjectBased = false;
  }

  return pipeline;
}
