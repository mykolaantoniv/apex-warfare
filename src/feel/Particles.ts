import {
  Scene,
  ParticleSystem,
  DynamicTexture,
  Color4,
  Color3,
  Vector3,
  PointLight,
  Mesh,
  MeshBuilder,
  StandardMaterial,
} from "@babylonjs/core";

/** Soft round sprite (radial alpha) generated once — used by sparks, smoke, fireball. */
function softTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("soft", { width: 64, height: 64 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  return tex;
}

interface Anim {
  mesh: Mesh;
  life: number;
  total: number;
  max: number;
}

const FLASH_POOL = 6;
const RING_POOL = 6;
const SCORCH_POOL = 10;
const SCORCH_LIFE_S = 12; // scorch decals linger roughly as long as a wreck (>=10s, C3b AC2)

/**
 * Pooled FX: sparks, billowing smoke, light flashes, plus a fireball core, an expanding
 * shockwave ring, and a lingering ground scorch decal for cinematic explosions.
 */
export class Particles {
  private readonly sparks: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly smokeColumn: ParticleSystem;
  private readonly fireball: ParticleSystem;
  private readonly dust: ParticleSystem;
  private readonly spray: ParticleSystem;
  private readonly debris: ParticleSystem;
  private readonly sparkPos = new Vector3();
  private readonly smokePos = new Vector3();
  private readonly smokeColumnPos = new Vector3();
  private readonly firePos = new Vector3();
  private readonly dustPos = new Vector3();
  private readonly sprayPos = new Vector3();
  private readonly debrisPos = new Vector3();

  private readonly lights: PointLight[] = [];
  private readonly lightLife: number[] = [];
  private readonly lightDur: number[] = [];
  private readonly lightPeak: number[] = [];

  private readonly rings: Anim[] = [];
  private readonly scorches: Anim[] = [];

  constructor(scene: Scene) {
    const soft = softTexture(scene);

    // --- Sparks (additive, fast, short-lived) ---
    this.sparks = new ParticleSystem("sparks", 800, scene);
    this.sparks.particleTexture = soft;
    this.sparks.emitter = this.sparkPos;
    this.sparks.createSphereEmitter(0.3);
    this.sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.sparks.color1 = new Color4(1, 0.75, 0.25, 1);
    this.sparks.color2 = new Color4(1, 0.4, 0.1, 1);
    this.sparks.colorDead = new Color4(0, 0, 0, 0);
    this.sparks.minSize = 0.04;
    this.sparks.maxSize = 0.16;
    this.sparks.minLifeTime = 0.12;
    this.sparks.maxLifeTime = 0.5;
    this.sparks.minEmitPower = 4;
    this.sparks.maxEmitPower = 11;
    this.sparks.gravity = new Vector3(0, -9, 0);
    this.sparks.emitRate = 0;
    this.sparks.start();

    // --- Fireball core (bright, additive, very short, grows fast — readable from distance) ---
    this.fireball = new ParticleSystem("fireball", 400, scene);
    this.fireball.particleTexture = soft;
    this.fireball.emitter = this.firePos;
    this.fireball.createSphereEmitter(0.35);
    this.fireball.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.fireball.color1 = new Color4(1, 0.95, 0.6, 1);
    this.fireball.color2 = new Color4(1, 0.5, 0.15, 1);
    this.fireball.colorDead = new Color4(0.2, 0.05, 0, 0);
    this.fireball.addSizeGradient(0, 0.8);
    this.fireball.addSizeGradient(0.4, 2.6);
    this.fireball.addSizeGradient(1, 3.4);
    this.fireball.minLifeTime = 0.18;
    this.fireball.maxLifeTime = 0.4;
    this.fireball.minEmitPower = 1;
    this.fireball.maxEmitPower = 4;
    this.fireball.emitRate = 0;
    this.fireball.start();

    // --- Smoke (soft, billowing, lit grey, drifts up) ---
    this.smoke = new ParticleSystem("smoke", 600, scene);
    this.smoke.particleTexture = soft;
    this.smoke.emitter = this.smokePos;
    this.smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.smoke.minLifeTime = 1.4;
    this.smoke.maxLifeTime = 3.4;
    this.smoke.minEmitPower = 0.4;
    this.smoke.maxEmitPower = 1.4;
    this.smoke.direction1 = new Vector3(-0.4, 0.7, -0.4);
    this.smoke.direction2 = new Vector3(0.4, 1.2, 0.4);
    this.smoke.gravity = new Vector3(0, 0.6, 0);
    this.smoke.addColorGradient(0, new Color4(0.05, 0.05, 0.06, 0));
    this.smoke.addColorGradient(0.15, new Color4(0.12, 0.12, 0.13, 0.7));
    this.smoke.addColorGradient(0.6, new Color4(0.32, 0.33, 0.35, 0.45));
    this.smoke.addColorGradient(1, new Color4(0.5, 0.51, 0.53, 0));
    this.smoke.addSizeGradient(0, 0.5);
    this.smoke.addSizeGradient(1, 2.8);
    this.smoke.emitRate = 0;
    this.smoke.start();

    // --- Wreck smoke column (sustained, tall, dark — stage-2 of a kill explosion). Fed a few
    // particles per frame per active wreck by `Wrecks.update`; each particle lives long enough
    // and rises fast enough on its own to read as an >=8m column, no per-kill system needed. ---
    this.smokeColumn = new ParticleSystem("smokeColumn", 500, scene);
    this.smokeColumn.particleTexture = soft;
    this.smokeColumn.emitter = this.smokeColumnPos;
    this.smokeColumn.createSphereEmitter(0.5);
    this.smokeColumn.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.smokeColumn.minLifeTime = 3.5;
    this.smokeColumn.maxLifeTime = 6.5;
    this.smokeColumn.minEmitPower = 1.6;
    this.smokeColumn.maxEmitPower = 2.6;
    this.smokeColumn.direction1 = new Vector3(-0.15, 1, -0.15);
    this.smokeColumn.direction2 = new Vector3(0.15, 1, 0.15);
    this.smokeColumn.gravity = new Vector3(0, -0.15, 0); // rises fast then decelerates, like heat
    this.smokeColumn.addColorGradient(0, new Color4(0.03, 0.03, 0.03, 0));
    this.smokeColumn.addColorGradient(0.12, new Color4(0.05, 0.05, 0.05, 0.55));
    this.smokeColumn.addColorGradient(0.55, new Color4(0.2, 0.2, 0.21, 0.4));
    this.smokeColumn.addColorGradient(1, new Color4(0.4, 0.4, 0.42, 0));
    this.smokeColumn.addSizeGradient(0, 0.7);
    this.smokeColumn.addSizeGradient(0.5, 2.6);
    this.smokeColumn.addSizeGradient(1, 4.2);
    this.smokeColumn.emitRate = 0;
    this.smokeColumn.start();

    // --- Ground dust (tan, kicked up by wheels/tracks + heli downwash) ---
    this.dust = new ParticleSystem("dust", 700, scene);
    this.dust.particleTexture = soft;
    this.dust.emitter = this.dustPos;
    this.dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.dust.direction1 = new Vector3(-1, 0.25, -1);
    this.dust.direction2 = new Vector3(1, 0.9, 1);
    this.dust.gravity = new Vector3(0, -1.2, 0);
    this.dust.minLifeTime = 0.5;
    this.dust.maxLifeTime = 1.3;
    this.dust.minEmitPower = 1;
    this.dust.maxEmitPower = 3.5;
    this.dust.addColorGradient(0, new Color4(0.55, 0.47, 0.36, 0));
    this.dust.addColorGradient(0.2, new Color4(0.55, 0.47, 0.36, 0.5));
    this.dust.addColorGradient(1, new Color4(0.5, 0.44, 0.34, 0));
    this.dust.addSizeGradient(0, 0.4);
    this.dust.addSizeGradient(1, 1.9);
    this.dust.emitRate = 0;
    this.dust.start();

    // --- Water spray (white droplets, boat wake + heli-over-water downwash) ---
    this.spray = new ParticleSystem("spray", 500, scene);
    this.spray.particleTexture = soft;
    this.spray.emitter = this.sprayPos;
    this.spray.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.spray.direction1 = new Vector3(-0.7, 1.0, -0.7);
    this.spray.direction2 = new Vector3(0.7, 2.0, 0.7);
    this.spray.gravity = new Vector3(0, -7, 0);
    this.spray.minLifeTime = 0.3;
    this.spray.maxLifeTime = 0.8;
    this.spray.minEmitPower = 2;
    this.spray.maxEmitPower = 5;
    this.spray.color1 = new Color4(0.85, 0.9, 0.96, 0.8);
    this.spray.color2 = new Color4(0.6, 0.72, 0.85, 0.6);
    this.spray.colorDead = new Color4(0.6, 0.72, 0.85, 0);
    this.spray.minSize = 0.08;
    this.spray.maxSize = 0.4;
    this.spray.emitRate = 0;
    this.spray.start();

    // --- Debris (dark chunks flung by explosions, heavy gravity) ---
    this.debris = new ParticleSystem("debris", 300, scene);
    this.debris.particleTexture = soft;
    this.debris.emitter = this.debrisPos;
    this.debris.createSphereEmitter(0.2);
    this.debris.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.debris.gravity = new Vector3(0, -16, 0);
    this.debris.minLifeTime = 0.3;
    this.debris.maxLifeTime = 1.0;
    this.debris.minEmitPower = 6;
    this.debris.maxEmitPower = 17;
    this.debris.color1 = new Color4(0.16, 0.13, 0.1, 1);
    this.debris.color2 = new Color4(0.1, 0.09, 0.08, 1);
    this.debris.colorDead = new Color4(0.1, 0.09, 0.08, 0);
    this.debris.minSize = 0.05;
    this.debris.maxSize = 0.24;
    this.debris.emitRate = 0;
    this.debris.start();

    // --- Flash light pool ---
    for (let i = 0; i < FLASH_POOL; i++) {
      const l = new PointLight(`flash${i}`, new Vector3(0, 0, 0), scene);
      l.intensity = 0;
      l.range = 14;
      l.diffuse = new Color3(1, 0.7, 0.35);
      this.lights.push(l);
      this.lightLife.push(0);
      this.lightDur.push(0);
      this.lightPeak.push(0);
    }

    // --- Shockwave rings ---
    const ringMat = new StandardMaterial("ringMat", scene);
    ringMat.emissiveColor = new Color3(1, 0.6, 0.2);
    ringMat.disableLighting = true;
    ringMat.backFaceCulling = false;
    for (let i = 0; i < RING_POOL; i++) {
      const mesh = MeshBuilder.CreateTorus(`ring${i}`, { diameter: 2, thickness: 0.18, tessellation: 28 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.material = ringMat;
      mesh.isVisible = false;
      mesh.isPickable = false;
      this.rings.push({ mesh, life: 0, total: 0.45, max: 1 });
    }

    // --- Ground scorch decals ---
    const scorchMat = new StandardMaterial("scorchMat", scene);
    scorchMat.diffuseColor = new Color3(0, 0, 0);
    scorchMat.specularColor = new Color3(0, 0, 0);
    for (let i = 0; i < SCORCH_POOL; i++) {
      const mesh = MeshBuilder.CreateDisc(`scorch${i}`, { radius: 1.6, tessellation: 20 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.material = scorchMat;
      mesh.isVisible = false;
      mesh.isPickable = false;
      this.scorches.push({ mesh, life: 0, total: SCORCH_LIFE_S, max: 1 });
    }
  }

  burstSparks(pos: Vector3, count: number): void {
    this.sparkPos.copyFrom(pos);
    this.sparks.manualEmitCount = count;
  }

  burstSmoke(pos: Vector3, count: number): void {
    this.smokePos.copyFrom(pos);
    this.smoke.manualEmitCount = count;
  }

  flash(pos: Vector3, intensity: number, durationMs: number, color?: Color3): void {
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightLife[i]! <= 0) {
        const l = this.lights[i]!;
        l.position.copyFrom(pos);
        if (color) l.diffuse = color;
        l.intensity = intensity;
        this.lightLife[i] = durationMs;
        this.lightDur[i] = durationMs;
        this.lightPeak[i] = intensity;
        return;
      }
    }
  }

  private spawnRing(pos: Vector3, power: number): void {
    for (const r of this.rings) {
      if (r.life <= 0) {
        r.mesh.position.set(pos.x, 0.15, pos.z);
        r.mesh.scaling.setAll(0.2);
        r.mesh.visibility = 1;
        r.mesh.isVisible = true;
        r.life = r.total;
        r.max = 2.5 + power * 4;
        return;
      }
    }
  }

  private spawnScorch(pos: Vector3, power: number): void {
    for (const s of this.scorches) {
      if (s.life <= 0) {
        s.mesh.position.set(pos.x, 0.03, pos.z);
        s.mesh.scaling.setAll(0.5 + power * 0.5);
        s.mesh.visibility = 0.7;
        s.mesh.isVisible = true;
        s.life = s.total;
        return;
      }
    }
  }

  /** Continuous tan ground dust (wheels/tracks/heli downwash). Emit a few per frame. */
  groundDust(pos: Vector3, count: number): void {
    this.dustPos.copyFrom(pos);
    this.dust.manualEmitCount = count;
  }

  /** Continuous white water spray (boat wake / heli-over-water downwash). */
  waterSpray(pos: Vector3, count: number): void {
    this.sprayPos.copyFrom(pos);
    this.spray.manualEmitCount = count;
  }

  /** Cinematic explosion: fireball + sparks + smoke + debris + flash + shockwave + scorch. */
  explosion(pos: Vector3, power: number): void {
    this.burstSparks(pos, Math.round(36 * power));
    this.burstSmoke(pos, Math.round(26 * power));
    this.flash(pos, 90 * power, 150);
    this.firePos.copyFrom(pos);
    this.fireball.manualEmitCount = Math.round(40 * power);
    this.debrisPos.copyFrom(pos);
    this.debris.manualEmitCount = Math.round(18 * power);
    this.spawnRing(pos, power);
    this.spawnScorch(pos, power);
  }

  muzzle(pos: Vector3): void {
    this.burstSparks(pos, 5);
    this.burstSmoke(pos, 1); // wisp of muzzle smoke
    this.flash(pos, 30, 70);
  }

  damageSmoke(pos: Vector3, intensity: number): void {
    if (intensity <= 0) return;
    this.smokePos.copyFrom(pos);
    this.smoke.manualEmitCount = intensity > 0.66 ? 3 : 1;
  }

  /** Sustained rising smoke column fed a few particles/frame from a wreck (stage 2 of a kill
   *  explosion) — reuses the pooled `smokeColumn` system, no per-call allocation. */
  wreckSmoke(pos: Vector3, count: number): void {
    if (count <= 0) return;
    this.smokeColumnPos.copyFrom(pos);
    this.smokeColumn.manualEmitCount = count;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;

    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightLife[i]! > 0) {
        this.lightLife[i]! -= dtMs;
        const t = Math.max(0, this.lightLife[i]! / this.lightDur[i]!);
        this.lights[i]!.intensity = this.lightPeak[i]! * t * t;
      }
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.isVisible = false;
        continue;
      }
      const p = 1 - r.life / r.total; // 0 -> 1
      r.mesh.scaling.setAll(0.2 + p * r.max);
      r.mesh.visibility = 1 - p;
    }

    for (const s of this.scorches) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.isVisible = false;
        continue;
      }
      s.mesh.visibility = 0.7 * (s.life / s.total);
    }
  }
}
