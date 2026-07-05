import { Engine, Color3 } from "@babylonjs/core";
import { initHavok, HavokInstance } from "../engine/Physics";
import { Audio } from "../feel/Audio";
import { Hud } from "../ui/Hud";
import { Screens } from "../ui/Screens";
import type { ShellTab } from "../ui/Screens";
import { GaragePreview } from "../ui/GaragePreview";
import { Save } from "../save/Save";
import { Content } from "../data/Content";
import { MissionRunner } from "./MissionRunner";
import { NetGame } from "../net/NetGame";
import { Lobby, type LobbyChoice } from "../ui/Lobby";
import { detectTier } from "../perf/Quality";
import { syncVehicleUnlocks } from "../game/progression";
import type { MissionResult } from "../game/Mission";
import type { QualityTier } from "./types";

type StatusFn = (s: string) => void;

const PLAYER_ACCENT = new Color3(0.2, 0.6, 1); // MW-style ally blue for the showcase

/** Top-level app: owns the engine + save + screens; launches missions and persists progress. */
export class App {
  private engine!: Engine;
  private havok!: HavokInstance;
  private readonly audio = new Audio();
  private save!: Save;
  private hud!: Hud;
  private screens!: Screens;
  private tier: QualityTier = "med";
  private runner: MissionRunner | null = null;
  private netGame: NetGame | null = null;
  private lobby: Lobby | null = null;
  private preview: GaragePreview | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async boot(status: StatusFn): Promise<void> {
    this.tier = detectTier();
    status("starting engine…");
    this.engine = new Engine(
      this.canvas,
      false,
      { powerPreference: "high-performance", stencil: true, preserveDrawingBuffer: false },
      true,
    );
    window.addEventListener("resize", () => this.engine.resize());

    status("loading physics…");
    this.havok = await initHavok();

    status("loading save…");
    Content.verify();
    this.save = new Save();
    await this.save.load();
    syncVehicleUnlocks(this.save);
    await this.save.persist();

    // Warm the browser cache for the big sky HDRI while the player is in the menus, so the
    // first mission's IBL is ready instantly instead of showing a black world on entry.
    void fetch("env/sky.hdr").catch(() => undefined);

    this.hud = new Hud();
    this.screens = new Screens();
    status("ready");
  }

  /** Entry point after boot (called from main.ts on DEPLOY). */
  mainMenu(): void {
    this.showTab("missions");
  }

  private showTab(tab: ShellTab): void {
    this.hud.hide();
    if (tab === "garage") {
      if (!this.preview) this.preview = new GaragePreview(this.engine);
      this.preview.setVehicle(Content.vehicle(this.save.data.selectedVehicle), PLAYER_ACCENT);
      this.preview.start();
    } else {
      this.preview?.stop();
    }
    this.screens.showShell(tab, this.save, () => void this.save.persist(), {
      onTab: (t) => this.showTab(t),
      play: (id) => this.launch(id),
      openOnline: () => this.openOnline(),
      onVehicle: (id) => this.preview?.setVehicle(Content.vehicle(id), PLAYER_ACCENT),
      onVolume: (v) => this.audio.setVolume(v),
      reset: () => void this.save.reset().then(() => this.showTab("missions")),
    });
  }

  private launch(missionId: string): void {
    this.preview?.stop();
    this.screens.hideAll();
    const vehicleId = this.save.data.selectedVehicle;
    const treeId = Content.vehicle(vehicleId).upgradeTreeId;
    this.audio.unlock();
    this.runner = new MissionRunner(
      this.engine,
      this.havok,
      this.audio,
      this.hud,
      {
        missionId,
        vehicleId,
        ownedUpgrades: treeId ? this.save.ownedUpgrades(treeId) : [],
        tier: this.tier,
        tutorial: !this.save.data.tutorialDone,
        motionBlur: this.save.data.settings.motionBlur,
      },
      {
        save: this.save,
        persist: () => void this.save.persist(),
        onVolume: (v) => this.audio.setVolume(v),
      },
      (r) => void this.finish(missionId, r),
      () => this.quitMission(),
    );
    this.runner.start();
  }

  /** A1 QUIT TO MENU: tear the mission scene down cleanly and return to mission select — no
   * reload, no leaked scene (the next launch() creates a fresh one). */
  private quitMission(): void {
    this.runner?.dispose();
    this.runner = null;
    this.hud.hide();
    this.showTab("missions");
  }

  private serverUrl(): string {
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    if (env.VITE_SERVER_URL) return env.VITE_SERVER_URL;
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    // Local dev: separate Vite (5173) + server (2567). Prod: server serves the client, so
    // the socket is same-origin (wss on 443) — use location.host, no explicit port.
    return local
      ? `ws://${location.hostname}:2567`
      : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  }

  /** Open the multiplayer lobby (name + mode/map pick, quickplay, room browser). */
  private openOnline(): void {
    this.lobby = new Lobby(
      this.serverUrl(),
      (choice) => {
        this.lobby = null;
        this.launchNet(choice);
      },
      () => {
        this.lobby = null;
      },
    );
    this.lobby.show();
  }

  /** Launch a real-time online match (PvP or co-op) on the authoritative server. */
  private launchNet(choice: LobbyChoice): void {
    this.preview?.stop();
    this.screens.hideAll();
    this.audio.unlock();
    this.netGame = new NetGame(
      this.engine,
      this.havok,
      this.audio,
      this.hud,
      {
        serverUrl: this.serverUrl(),
        mode: choice.mode,
        mapId: choice.mapId,
        vehicleId: this.save.data.selectedVehicle,
        name: choice.name,
        tier: this.tier,
        motionBlur: this.save.data.settings.motionBlur,
        ...(choice.roomId ? { roomId: choice.roomId } : {}),
      },
      (msg) => {
        this.netGame?.dispose();
        this.netGame = null;
        this.hud.hide();
        if (msg) toast(msg);
        this.showTab("missions");
      },
    );
    void this.netGame.start();
  }

  private async finish(missionId: string, r: MissionResult): Promise<void> {
    this.runner?.dispose();
    this.runner = null;

    const mission = Content.mission(missionId);
    this.save.recordResult(missionId, r.stars, r.timeSec, mission.type !== "survival");
    this.save.addScrap(r.scrap);
    this.save.data.tutorialDone = true; // coach marks shown on the first completed mission
    syncVehicleUnlocks(this.save);
    await this.save.persist();

    this.hud.hide();
    // A2: RETRY relaunches the same mission immediately — same path as PLAY, no menu hop.
    this.screens.showResults(r, mission, { cont: () => this.showTab("missions"), retry: () => this.launch(missionId) });
  }
}

/** Lightweight transient toast (connection errors, disconnects). */
function toast(msg: string): void {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  window.setTimeout(() => t.remove(), 3200);
}
