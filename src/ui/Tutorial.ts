import type { InputState } from "../core/types";

/** Live signals the tutorial reads each frame to decide when a step is satisfied. */
export interface TutorialCtx {
  input: InputState;
  hasLock: boolean;
  hpPct: number;
  dt: number;
}

interface Step {
  text: string;
  /** Control button to pulse (element id), if any. */
  targetId?: string;
  /** Seconds the action must be sustained to complete the step. */
  hold: number;
  /** Is the desired action happening this frame? */
  active: (ctx: TutorialCtx) => boolean;
}

const STEPS: Step[] = [
  {
    text: "Push the LEFT STICK to drive",
    targetId: "stickLeft",
    hold: 0.7,
    active: (c) => Math.hypot(c.input.move.x, c.input.move.y) > 0.3,
  },
  {
    text: "Enemies ahead are AUTO-LOCKED — the red bracket is your aim",
    hold: 3.2,
    active: () => true, // timed info card
  },
  {
    text: "Hold FIRE to hit the locked target",
    targetId: "fireBtn",
    hold: 0.6,
    active: (c) => c.input.firing,
  },
  {
    text: "Tap SWITCH to change target · REPAIR to patch armor",
    targetId: "switchBtn",
    hold: 0.05,
    active: (c) => c.input.switchTarget || c.input.special,
  },
];

const DONE_TEXT = "GOOD HUNTING, COMMANDER";

/**
 * One-time onboarding coach marks for the first mission. A passive top-center card explains
 * one control at a time and pulses the relevant button; each step completes when the player
 * performs the action (or, for info cards, after a short beat). Non-interactive overlay —
 * controls underneath stay fully usable.
 */
export class Tutorial {
  private idx = 0;
  private progress = 0; // seconds the current step's action has been sustained
  private finished = false;
  private doneTimer = 0;

  private readonly root: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly pipEl: HTMLElement;
  private target: HTMLElement | null = null;

  constructor(private readonly onComplete: () => void) {
    this.root = document.createElement("div");
    this.root.className = "coach";
    this.textEl = document.createElement("div");
    this.textEl.className = "coach-text";
    this.pipEl = document.createElement("div");
    this.pipEl.className = "coach-pips";
    this.root.append(this.textEl, this.pipEl);
    document.body.appendChild(this.root);
    this.showStep();
  }

  private showStep(): void {
    const step = STEPS[this.idx];
    if (!step) return;
    this.textEl.textContent = step.text;
    this.pipEl.textContent = `${this.idx + 1} / ${STEPS.length}`;
    this.setTarget(step.targetId ? document.getElementById(step.targetId) : null);
  }

  private setTarget(el: HTMLElement | null): void {
    if (this.target) this.target.classList.remove("coach-target");
    this.target = el;
    if (el) el.classList.add("coach-target");
  }

  update(ctx: TutorialCtx): void {
    if (this.finished) return;

    // Final "good luck" flash, then tear down.
    if (this.idx >= STEPS.length) {
      this.doneTimer -= ctx.dt;
      if (this.doneTimer <= 0) this.complete();
      return;
    }

    const step = STEPS[this.idx]!;
    if (step.active(ctx)) this.progress += ctx.dt;
    if (this.progress >= step.hold) {
      this.idx += 1;
      this.progress = 0;
      if (this.idx >= STEPS.length) {
        this.setTarget(null);
        this.textEl.textContent = DONE_TEXT;
        this.pipEl.textContent = "";
        this.root.classList.add("coach-done");
        this.doneTimer = 2;
      } else {
        this.showStep();
      }
    }
  }

  private complete(): void {
    if (this.finished) return;
    this.finished = true;
    this.onComplete();
    this.dispose();
  }

  dispose(): void {
    this.setTarget(null);
    this.root.remove();
  }
}
