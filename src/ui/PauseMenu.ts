import type { Save } from "../save/Save";

export interface PauseCb {
  resume: () => void;
  quit: () => void;
  onVolume: (v: number) => void;
  persist: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * In-mission pause overlay (A1): RESUME / SETTINGS / QUIT. The caller is responsible for
 * actually freezing the sim (MissionRunner); this class only owns the DOM/CSS overlay.
 */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private mode: "menu" | "settings" = "menu";

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "pause-overlay hidden";
    document.body.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  show(save: Save, cb: PauseCb): void {
    this.mode = "menu";
    this.render(save, cb);
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  dispose(): void {
    this.root.remove();
  }

  private render(save: Save, cb: PauseCb): void {
    this.root.replaceChildren();
    const card = el("div", "pause-card");
    card.appendChild(el("div", "pause-title", "PAUSED"));

    if (this.mode === "menu") {
      const resume = el("button", "btn primary pause-btn-lg", "RESUME");
      resume.onclick = cb.resume;
      const settings = el("button", "btn pause-btn-lg", "SETTINGS");
      settings.onclick = () => {
        this.mode = "settings";
        this.render(save, cb);
      };
      const quit = el("button", "btn ghost pause-btn-lg", "QUIT TO MENU");
      quit.onclick = cb.quit;
      card.append(resume, settings, quit);
    } else {
      card.appendChild(this.volumeRow(save, cb));
      card.appendChild(this.motionBlurRow(save, cb));
      const back = el("button", "btn ghost pause-btn-lg", "BACK");
      back.onclick = () => {
        this.mode = "menu";
        this.render(save, cb);
      };
      card.appendChild(back);
    }

    this.root.appendChild(card);
  }

  private volumeRow(save: Save, cb: PauseCb): HTMLElement {
    const row = el("div", "set-row");
    row.appendChild(el("span", "set-label", "VOLUME"));
    const slider = el("input", "slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(save.data.settings.volume * 100));
    slider.oninput = () => {
      const v = Number(slider.value) / 100;
      save.data.settings.volume = v;
      cb.onVolume(v); // applies live (AC3)
    };
    slider.onchange = () => cb.persist();
    row.appendChild(slider);
    return row;
  }

  private motionBlurRow(save: Save, cb: PauseCb): HTMLElement {
    const row = el("div", "set-row");
    row.appendChild(el("span", "set-label", "MOTION BLUR"));
    const btn = el("button", "btn toggle");
    const sync = (): void => {
      const on = save.data.settings.motionBlur;
      btn.textContent = on ? "ON" : "OFF";
      btn.classList.toggle("on", on);
    };
    sync();
    btn.onclick = () => {
      save.data.settings.motionBlur = !save.data.settings.motionBlur; // applies next mission (AC3)
      sync();
      cb.persist();
    };
    row.appendChild(btn);
    return row;
  }
}
