import nipplejs from "nipplejs";
import type { JoystickManager, JoystickOutputData, EventData } from "nipplejs";
import type { InputState, StickVector } from "../core/types";

const DEADZONE = 0.12;

/**
 * Controls: left joystick = steer + throttle; right side = FIRE button (hold),
 * TARGET-SWITCH button (tap), and SPECIAL button (tap). Firing auto-aims at the lock,
 * so no aim stick. Desktop fallback: WASD move, Space fire, Tab switch, Q special.
 */
export class TwinStick {
  readonly state: InputState = { move: { x: 0, y: 0 }, firing: false, switchTarget: false, special: false };

  private readonly stickMove: StickVector = { x: 0, y: 0 };
  private readonly keys = new Set<string>();
  private readonly left: JoystickManager;
  private fireHeld = false;
  private pendingSwitch = false;
  private pendingSpecial = false;

  private readonly fireBtn: HTMLElement;
  private readonly switchBtn: HTMLElement;
  private readonly specialBtn: HTMLElement;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.keys.add(key);
    if (key === "tab") {
      e.preventDefault();
      this.pendingSwitch = true;
    }
    if (key === "q") this.pendingSpecial = true;
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
  private readonly onFireDown = (e: Event): void => {
    e.preventDefault();
    this.fireHeld = true;
  };
  private readonly onFireUp = (): void => {
    this.fireHeld = false;
  };
  private readonly onSwitch = (e: Event): void => {
    e.preventDefault();
    this.pendingSwitch = true;
  };
  private readonly onSpecial = (e: Event): void => {
    e.preventDefault();
    this.pendingSpecial = true;
  };

  constructor(leftZone: HTMLElement) {
    this.left = nipplejs.create({
      zone: leftZone,
      mode: "dynamic", // spawns where the thumb lands → center = touch point (no static-offset bug)
      color: "#27e3ff",
      size: 120,
      fadeTime: 80,
      restOpacity: 0.5,
    });
    this.left.on("move", (_e: EventData, d: JoystickOutputData) => {
      this.stickMove.x = d.vector.x;
      this.stickMove.y = d.vector.y;
    });
    this.left.on("end", () => {
      this.stickMove.x = 0;
      this.stickMove.y = 0;
    });

    this.fireBtn = must("fireBtn");
    this.switchBtn = must("switchBtn");
    this.specialBtn = must("specialBtn");

    this.fireBtn.addEventListener("pointerdown", this.onFireDown);
    this.fireBtn.addEventListener("pointerup", this.onFireUp);
    this.fireBtn.addEventListener("pointerleave", this.onFireUp);
    this.fireBtn.addEventListener("pointercancel", this.onFireUp);
    this.switchBtn.addEventListener("pointerdown", this.onSwitch);
    this.specialBtn.addEventListener("pointerdown", this.onSpecial);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  dispose(): void {
    this.left.destroy();
    this.fireBtn.removeEventListener("pointerdown", this.onFireDown);
    this.fireBtn.removeEventListener("pointerup", this.onFireUp);
    this.fireBtn.removeEventListener("pointerleave", this.onFireUp);
    this.fireBtn.removeEventListener("pointercancel", this.onFireUp);
    this.switchBtn.removeEventListener("pointerdown", this.onSwitch);
    this.specialBtn.removeEventListener("pointerdown", this.onSpecial);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  /** Merge stick + keyboard and resolve edge intents. Call once per frame. */
  update(): void {
    let mx = this.stickMove.x;
    let my = this.stickMove.y;
    const k = this.keys;
    let kmx = 0;
    let kmy = 0;
    if (k.has("a") || k.has("arrowleft")) kmx -= 1;
    if (k.has("d") || k.has("arrowright")) kmx += 1;
    if (k.has("w") || k.has("arrowup")) kmy += 1;
    if (k.has("s") || k.has("arrowdown")) kmy -= 1;
    if (kmx !== 0 || kmy !== 0) {
      const m = Math.hypot(kmx, kmy) || 1;
      mx = kmx / m;
      my = kmy / m;
    }
    applyDeadzone(this.state.move, mx, my);

    this.state.firing = this.fireHeld || k.has(" ");
    this.state.switchTarget = this.pendingSwitch;
    this.state.special = this.pendingSpecial;
    this.pendingSwitch = false;
    this.pendingSpecial = false;
  }
}

function applyDeadzone(out: StickVector, x: number, y: number): void {
  const mag = Math.hypot(x, y);
  if (mag < DEADZONE) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scaled = (mag - DEADZONE) / (1 - DEADZONE);
  const norm = Math.min(scaled, 1) / mag;
  out.x = x * norm;
  out.y = y * norm;
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`control #${id} missing`);
  return el;
}
