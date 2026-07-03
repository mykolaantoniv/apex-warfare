/** In-mission HUD (sleek-military): health, timer, threat count, ammo, and juice cues. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly mission: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly hitMarker: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly killfeed: HTMLElement;
  private readonly lowHp: HTMLElement;
  private readonly fireRing: HTMLElement;
  private readonly special: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveFill: HTMLElement;
  private readonly objectivePct: HTMLElement;
  private readonly objectiveLabel: HTMLElement;

  private lastKill = 0;
  private combo = 0;

  constructor() {
    this.root = must("hud");
    this.mission = must("hudMission");
    this.timer = must("hudTimer");
    this.hp = must("hudHp");
    this.enemies = must("hudEnemies");
    this.ammo = must("hudAmmo");
    this.hitMarker = must("hitMarker");
    this.banner = must("banner");
    this.killfeed = must("killfeed");
    this.lowHp = must("lowHp");
    this.fireRing = must("fireRing");
    this.special = must("hudSpecial");
    this.objective = must("hudObjective");
    this.objectiveFill = must("hudObjectiveFill");
    this.objectivePct = must("hudObjectivePct");
    this.objectiveLabel = must("hudObjectiveLabel");
  }

  /** Show + drive the capture-objective bar (0..1). Call hideObjective() for non-capture. */
  setObjective(frac: number, label = "CAPTURE"): void {
    const p = Math.max(0, Math.min(1, frac));
    this.objective.classList.remove("hidden");
    this.objectiveLabel.textContent = label;
    this.objectiveFill.style.width = `${p * 100}%`;
    this.objectivePct.textContent = `${Math.round(p * 100)}%`;
  }

  hideObjective(): void {
    this.objective.classList.add("hidden");
  }

  /** 0..1 readiness of the special ability. */
  setSpecial(frac: number): void {
    this.special.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  /** 0..1 — orange progress on the fire pad (ammo remaining / reload progress). */
  setFireRing(frac: number): void {
    this.fireRing.style.setProperty("--p", String(Math.max(0, Math.min(1, frac))));
  }

  show(): void {
    this.root.classList.remove("hidden");
    document.body.classList.add("in-mission"); // reveals the twin-stick pads
    for (const id of ["hitMarker", "lowHp"]) toggle(id, false);
  }

  hide(): void {
    this.root.classList.add("hidden");
    document.body.classList.remove("in-mission");
    toggle("lowHp", true);
    this.hideObjective();
  }

  reset(): void {
    this.combo = 0;
    this.lastKill = 0;
    this.killfeed.replaceChildren();
    this.lowHp.classList.remove("active");
    this.lowHp.style.opacity = "0";
    this.setHp(100);
  }

  setMission(text: string): void {
    this.mission.textContent = text;
  }

  setTimer(seconds: number): void {
    this.timer.textContent = fmtTime(seconds);
  }

  setHp(pct: number): void {
    this.hp.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  setEnemies(n: number): void {
    this.enemies.textContent = `▲${n}`;
  }

  setAmmo(ammo: number, reloading: boolean): void {
    this.ammo.textContent = reloading ? "RELOADING…" : `AMMO x${ammo}`;
  }

  setLowHp(pct: number): void {
    if (pct < 30) {
      this.lowHp.classList.add("active");
      this.lowHp.style.opacity = String(Math.min(0.9, (30 - pct) / 30 + 0.2));
    } else {
      this.lowHp.classList.remove("active");
      this.lowHp.style.opacity = "0";
    }
  }

  flashHitMarker(killed: boolean): void {
    this.hitMarker.classList.toggle("kill", killed);
    this.hitMarker.classList.remove("show");
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add("show");
  }

  killFeed(): void {
    const now = performance.now();
    this.combo = now - this.lastKill < 1600 ? this.combo + 1 : 1;
    this.lastKill = now;
    const text = this.combo >= 2 ? `${this.combo}× MULTIKILL` : "HOSTILE DOWN";
    const line = document.createElement("div");
    line.className = this.combo >= 2 ? "kf-line combo" : "kf-line";
    line.textContent = text;
    this.killfeed.appendChild(line);
    window.setTimeout(() => line.remove(), 2400);
  }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
    window.setTimeout(() => this.banner.classList.remove("show"), 2400);
  }
}

function fmtTime(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function toggle(id: string, hidden: boolean): void {
  document.getElementById(id)?.classList.toggle("hidden", hidden);
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`HUD element #${id} missing`);
  return el;
}
