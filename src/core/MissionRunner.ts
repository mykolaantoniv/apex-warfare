import { Engine, Scene, Vector3 } from "@babylonjs/core";
import { enablePhysicsOnScene, HavokInstance } from "../engine/Physics";
import { buildLighting } from "../engine/Lighting";
import { buildPostFX } from "../engine/PostFX";
import { CameraRig } from "../engine/CameraRig";
import { buildArena } from "../engine/SceneBuilder";
import { TwinStick } from "../controls/TwinStick";
import { ProjectileSystem } from "../vehicles/Weapon";
import { FeelDirector } from "../feel/FeelDirector";
import { Nameplates } from "../feel/Nameplates";
import { Audio } from "../feel/Audio";
import { Mission, MissionResult } from "../game/Mission";
import { resolveVehicle } from "../game/resolveVehicle";
import { campaignIndexOf, difficultyFor } from "../game/difficulty";
import { QualityGovernor } from "../perf/Quality";
import { DebugHud } from "../perf/DebugHud";
import { Hud } from "../ui/Hud";
import { Radar } from "../ui/Radar";
import { Tutorial } from "../ui/Tutorial";
import { ObjectiveMarker } from "../ui/ObjectiveMarker";
import { Content } from "../data/Content";
import { clamp } from "./math";
import type { QualityTier } from "../core/types";
import type { WaterRegion } from "../data/types";

export interface LaunchConfig {
  missionId: string;
  vehicleId: string;
  ownedUpgrades: string[];
  tier: QualityTier;
  tutorial: boolean;
}

/** Builds and runs a single mission scene; reports its result and tears itself down. */
export class MissionRunner {
  private scene!: Scene;
  private camera!: CameraRig;
  private input!: TwinStick;
  private feel!: FeelDirector;
  private mission!: Mission;
  private governor!: QualityGovernor;
  private debug!: DebugHud;
  private nameplates!: Nameplates;
  private radar!: Radar;
  private tutorial: Tutorial | null = null;
  private objMarker: ObjectiveMarker | null = null;
  private playerModel = "heli";
  private water: WaterRegion | null = null;
  private readonly trailPos = new Vector3();
  private maxSpeed = 9;
  private stopped = false;
  private resultSent = false;

  constructor(
    private readonly engine: Engine,
    private readonly havok: HavokInstance,
    private readonly audio: Audio,
    private readonly hud: Hud,
    private readonly cfg: LaunchConfig,
    private readonly onFinish: (r: MissionResult) => void,
  ) {}

  start(): void {
    const missionCfg = Content.mission(this.cfg.missionId);
    const map = Content.map(missionCfg.mapId);

    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    enablePhysicsOnScene(this.scene, this.havok);

    // Camera first: the cascaded shadow generator + SSAO both read the active camera.
    this.camera = new CameraRig(this.scene);
    const lighting = buildLighting(this.scene, this.cfg.tier, map.sunDir);
    buildPostFX(this.scene, this.camera.camera, this.cfg.tier);
    const arena = buildArena(this.scene, lighting.shadows, map);
    this.water = (this.scene.metadata as { water?: WaterRegion } | null)?.water ?? null;

    this.feel = new FeelDirector(this.scene, this.engine, this.camera, this.audio);
    this.feel.bindHud(this.hud);
    const projectiles = new ProjectileSystem(this.scene, this.feel, arena.bounds);

    const player = resolveVehicle(this.cfg.vehicleId, this.cfg.ownedUpgrades);
    this.maxSpeed = player.vehicle.movement.maxSpeed;
    this.playerModel = player.vehicle.movement.model;

    const index = campaignIndexOf(this.cfg.missionId);
    const enemyRoster = missionCfg.enemyRoster.map((id) => {
      const vehicle = Content.vehicle(id);
      return { vehicle, weapon: Content.weapon(vehicle.weaponId) };
    });

    // Escort convoy (if any): resolve its vehicle + weapon and place it at its spawn.
    let ally: { vehicle: ReturnType<typeof Content.vehicle>; weapon: ReturnType<typeof Content.weapon>; spawn: Vector3 } | undefined;
    if (missionCfg.ally) {
      const av = Content.vehicle(missionCfg.ally.vehicleId);
      ally = { vehicle: av, weapon: Content.weapon(av.weaponId), spawn: new Vector3(missionCfg.ally.spawn[0], 3, missionCfg.ally.spawn[1]) };
    }

    this.mission = new Mission(this.scene, lighting.shadows, this.feel, projectiles, {
      mission: missionCfg,
      index,
      difficulty: difficultyFor(index),
      playerVehicle: player.vehicle,
      playerWeapon: player.weapon,
      enemyRoster,
      playerSpawn: arena.playerSpawn,
      enemySpawns: arena.enemySpawns,
      ...(ally ? { ally } : {}),
    });

    this.input = new TwinStick(byId("stickLeft"));
    this.governor = new QualityGovernor(this.engine, this.cfg.tier);
    this.debug = new DebugHud(byId("debugHud"), this.engine, this.scene);
    this.nameplates = new Nameplates(this.scene, this.engine);
    this.radar = new Radar(byId("radar") as HTMLCanvasElement);
    this.scene.blockMaterialDirtyMechanism = true;

    this.audio.unlock();
    this.audio.startEngine(player.vehicle.movement.model);
    this.hud.reset();
    this.hud.setMission(`${map.name} · ${missionCfg.name}`);
    this.hud.show();
    this.hud.showBanner(bannerFor(missionCfg));
    const obj = this.mission.objectiveHud;
    if (obj) this.hud.setObjective(obj.frac, obj.label);
    if (this.mission.hasObjective) this.objMarker = new ObjectiveMarker(this.scene, this.engine);
    if (this.cfg.tutorial) this.tutorial = new Tutorial(() => undefined);

    // Wait for the sky/IBL HDRI before running the loop so the world never appears black on
    // entry (the skybox + every PBR surface depend on it). Safety timeout so a stalled/failed
    // HDR can't hang the mission.
    let started = false;
    const startLoop = (): void => {
      if (started || this.stopped) return;
      started = true;
      this.engine.runRenderLoop(this.frame);
    };
    if (arena.env.isReady()) startLoop();
    else {
      arena.env.onLoadObservable.addOnce(startLoop);
      window.setTimeout(startLoop, 4000);
    }
  }

  private readonly frame = (): void => {
    if (this.stopped) return;
    const dtMs = this.engine.getDeltaTime();
    const dtReal = clamp(dtMs / 1000, 0, 0.05);

    this.input.update();
    this.feel.update(dtMs);
    const dt = dtReal * this.feel.timeScale;

    this.mission.update(dt, this.input.state, this.camera.forward, this.camera.right);

    const player = this.mission.player;
    const vel = player.controller.velocity;
    this.camera.update(dtReal, player.getPosition(), player.controller.forwardDir, vel);

    const speed01 = Math.min(1, Math.hypot(vel.x, vel.z) / this.maxSpeed);
    this.audio.setEngine(speed01, player.alive);
    this.audio.setListener(this.camera.camera.position, this.camera.forward);

    // Movement FX: dust/downwash/wake at the ground/waterline contact point behind the vehicle.
    if (player.alive) {
      const pos = player.getPosition();
      const fwd = player.controller.forwardDir;
      const w = this.water;
      const overWater = w !== null && Math.abs(pos.x - w.x) < w.w / 2 && Math.abs(pos.z - w.z) < w.d / 2;
      const groundY = overWater && w ? w.level + 0.05 : 0.05;
      this.trailPos.set(pos.x - fwd.x * 1.2, groundY, pos.z - fwd.z * 1.2);
      this.feel.vehicleTrail(this.trailPos, speed01, this.playerModel, overWater);
    }

    this.hud.setTimer(this.mission.elapsed);
    this.hud.setHp(player.healthPct);
    this.hud.setLowHp(player.healthPct);
    this.hud.setEnemies(this.mission.hudCounter);
    this.hud.setAmmo(player.ammo, player.reloading);
    this.hud.setFireRing(player.magFraction);
    this.hud.setSpecial(this.mission.specialReady01);
    const obj = this.mission.objectiveHud;
    if (obj) this.hud.setObjective(obj.frac, obj.label);
    if (this.objMarker) {
      const t = this.mission.objectiveTarget();
      this.objMarker.update(t?.pos ?? null, player.getPosition(), t?.label ?? "");
    }
    this.tutorial?.update({
      input: this.input.state,
      hasLock: player.lockTarget !== null,
      hpPct: player.healthPct,
      dt: dtReal,
    });
    this.radar.update(player.getPosition(), player.controller.forwardDir, this.mission.enemyPlates());

    this.governor.update(dtMs);
    this.debug.update(this.cfg.tier, this.governor.scale, this.governor.frameMs);

    this.scene.render();
    this.nameplates.update(this.mission.enemyPlates());

    if (!this.resultSent) {
      const r = this.mission.result();
      if (r) {
        this.resultSent = true;
        this.onFinish(r);
      }
    }
  };

  dispose(): void {
    this.stopped = true;
    this.engine.stopRenderLoop(this.frame);
    this.input.dispose();
    this.tutorial?.dispose();
    this.objMarker?.dispose();
    this.debug.dispose();
    this.nameplates.dispose();
    this.feel.dispose();
    this.scene.dispose();
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function bannerFor(m: { finale: boolean; type: string }): string {
  if (m.finale) return "DESTROY THE BRUTE";
  switch (m.type) {
    case "capture":
      return "HOLD THE ZONE";
    case "extract":
      return "REACH EXTRACTION";
    case "escort":
      return "PROTECT THE CONVOY";
    case "survival":
      return "SURVIVE";
    default:
      return "ELIMINATE ALL HOSTILES";
  }
}
