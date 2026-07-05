import { Content } from "../data/Content";
import type { Save } from "../save/Save";
import type { MissionResult } from "../game/Mission";
import type { MissionConfig, UpgradeBranch } from "../data/types";
import { resolveVehicle } from "../game/resolveVehicle";
import { isMissionUnlocked, isUpgradeBuyable, vehicleLockLabel } from "../game/progression";
import { campaignIndexOf, rewardsFor } from "../game/difficulty";

export type ShellTab = "missions" | "garage" | "settings";

export interface ShellCb {
  onTab: (tab: ShellTab) => void;
  play: (missionId: string) => void;
  openOnline: () => void;
  onVehicle: (id: string) => void;
  onVolume: (v: number) => void;
  reset: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function stars(n: number): string {
  const c = Math.max(0, Math.min(3, n));
  return "★★★☆☆☆".slice(3 - c, 6 - c);
}

function fmtTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function bar(label: string, value01: number, text: string): HTMLElement {
  const row = el("div", "stat-row");
  row.appendChild(el("span", "stat-label", label));
  const track = el("div", "stat-track");
  const fill = el("div", "stat-fill");
  fill.style.width = `${Math.max(0, Math.min(1, value01)) * 100}%`;
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el("span", "stat-val", text));
  return row;
}

const ROMAN = ["I", "II", "III"];
const tierOf = (index: number): number => (index < 3 ? 0 : index < 6 ? 1 : 2);
const classLabel = (c: string): string =>
  c === "jet" ? "JET" : c === "tank" ? "TANK" : c === "transport-heli" ? "TRANSPORT" : "ATTACK HELI";

function missionTypeBadge(m: MissionConfig): { label: string; cls: string } {
  if (m.finale) return { label: "BOSS", cls: "boss" };
  if (m.type === "survival") return { label: "SURVIVAL", cls: "surv" };
  if (m.type === "capture") return { label: "CAPTURE", cls: "cap" };
  if (m.type === "extract") return { label: "EXTRACT", cls: "cap" };
  if (m.type === "escort") return { label: "ESCORT", cls: "cap" };
  return { label: "DEATHMATCH", cls: "dm" };
}

/** DOM screen manager: persistent shell (topbar + content + bottom nav) + results. */
export class Screens {
  private readonly root: HTMLElement;
  private selectedMap: string = Content.mapOrder[0];
  private rerender: () => void = () => {};

  constructor() {
    const r = document.getElementById("screens");
    if (!r) throw new Error("#screens missing");
    this.root = r;
  }

  hideAll(): void {
    this.root.classList.add("hidden");
    this.root.classList.remove("showcase");
    this.root.replaceChildren();
  }

  // ---------- Shell ----------
  showShell(tab: ShellTab, save: Save, persist: () => void, cb: ShellCb): void {
    this.rerender = () => this.showShell(tab, save, persist, cb);
    this.root.classList.remove("hidden");
    this.root.classList.toggle("showcase", tab === "garage");
    this.root.replaceChildren();

    const shell = el("div", "shell" + (tab === "garage" ? " garage-shell" : ""));
    shell.appendChild(this.topbar(save));

    const content = el("div", "shell-content anim-in");
    if (tab === "missions") content.appendChild(this.missionsView(save, cb));
    else if (tab === "garage") content.appendChild(this.garageView(save, persist, cb));
    else content.appendChild(this.settingsView(save, persist, cb));
    shell.appendChild(content);

    shell.appendChild(this.bottomNav(tab, cb));
    this.root.appendChild(shell);
  }

  private topbar(save: Save): HTMLElement {
    const bar2 = el("div", "topbar");
    bar2.appendChild(el("div", "topbar-title", "APEX WARFARE"));
    const cur = el("div", "currency");
    cur.appendChild(el("span", "cur-icon", "▲"));
    cur.appendChild(el("span", "cur-val", save.data.scrap.toLocaleString()));
    bar2.appendChild(cur);
    return bar2;
  }

  private bottomNav(active: ShellTab, cb: ShellCb): HTMLElement {
    const nav = el("div", "bottomnav");
    const item = (id: ShellTab, label: string, extra = ""): HTMLElement => {
      const b = el("button", `nav-item${active === id ? " active" : ""}${extra ? " " + extra : ""}`, label);
      b.onclick = () => cb.onTab(id);
      return b;
    };
    nav.appendChild(item("garage", "GARAGE"));
    nav.appendChild(item("missions", "⚔ BATTLE", "battle"));
    nav.appendChild(item("settings", "SETTINGS"));
    return nav;
  }

  // ---------- Missions ----------
  private missionsView(save: Save, cb: ShellCb): HTMLElement {
    const wrap = el("div", "missions-view");

    // Online play — real-time PvP / co-op against other players.
    const online = el("div", "online-bar");
    online.appendChild(el("div", "online-title", "PLAY ONLINE"));
    const onlineBtns = el("div", "online-btns");
    const go = el("button", "btn small primary", "⚔ MULTIPLAYER");
    go.onclick = () => cb.openOnline();
    onlineBtns.appendChild(go);
    online.appendChild(onlineBtns);
    wrap.appendChild(online);

    const tabs = el("div", "tabs");
    for (const mapId of Content.mapOrder) {
      const map = Content.map(mapId);
      const tab = el("button", "tab" + (mapId === this.selectedMap ? " active" : ""), map.name);
      tab.onclick = () => {
        this.selectedMap = mapId;
        this.rerender();
      };
      tabs.appendChild(tab);
    }
    wrap.appendChild(tabs);

    const list = el("div", "mission-list");
    for (const m of Content.missionsForMap(this.selectedMap)) list.appendChild(this.missionCard(save, m, cb));
    wrap.appendChild(list);
    return wrap;
  }

  private missionCard(save: Save, m: MissionConfig, cb: ShellCb): HTMLElement {
    const idx = campaignIndexOf(m.id);
    const unlocked = isMissionUnlocked(save, m);
    const badge = missionTypeBadge(m);
    const card = el("div", `mission-card tier-${tierOf(idx)}${unlocked ? "" : " locked"}${m.finale ? " finale" : ""}`);

    const info = el("div", "mission-info");
    const nameRow = el("div", "name-row");
    nameRow.appendChild(el("span", "mission-name", m.name));
    nameRow.appendChild(el("span", `type-badge ${badge.cls}`, badge.label));
    info.appendChild(nameRow);
    info.appendChild(el("div", "mission-tier", `TIER ${ROMAN[tierOf(idx)]}`));
    card.appendChild(info);

    const right = el("div", "mission-right");
    right.appendChild(el("div", "mission-stars", stars(save.stars(m.id))));
    const best = save.bestTime(m.id);
    if (best > 0) right.appendChild(el("div", "mission-best", `best ${fmtTime(best)}`));
    right.appendChild(el("div", "reward-chip", `▲ ${rewardsFor(idx, m.finale).scrapBase}`));
    card.appendChild(right);

    if (unlocked) {
      const play = el("button", "btn small primary", "PLAY");
      play.onclick = () => cb.play(m.id);
      card.appendChild(play);
    } else {
      card.appendChild(el("div", "lock-tag", m.unlock.type === "stars" ? `★ ${m.unlock.required}` : "🔒"));
    }
    return card;
  }

  // ---------- Garage (3D showcase behind) ----------
  private garageView(save: Save, persist: () => void, cb: ShellCb): HTMLElement {
    const wrap = el("div", "garage-view");
    const body = el("div", "garage-body");

    // Left: vehicle cards + stats.
    const left = el("div", "garage-panel left");
    const picker = el("div", "veh-picker");
    Content.playerVehicleOrder.forEach((id, i) => {
      const v = Content.vehicle(id);
      const owned = save.isVehicleUnlocked(id);
      const btn = el("button", `veh-btn tier-${Math.min(2, Math.floor(i / 2))}${id === save.data.selectedVehicle ? " active" : ""}${owned ? "" : " locked"}`);
      btn.appendChild(el("span", "veh-name", v.name));
      btn.appendChild(el("span", "veh-class", owned ? classLabel(v.class) : vehicleLockLabel(v)));
      btn.onclick = () => {
        if (!owned) return;
        save.data.selectedVehicle = id;
        persist();
        cb.onVehicle(id);
        this.rerender();
      };
      picker.appendChild(btn);
    });
    left.appendChild(picker);

    const sel = Content.vehicle(save.data.selectedVehicle);
    const owned = save.ownedUpgrades(sel.upgradeTreeId);
    const resolved = resolveVehicle(sel.id, owned);
    const stats = el("div", "veh-stats");
    stats.appendChild(bar("HP", resolved.vehicle.stats.maxHealth / 300, String(Math.round(resolved.vehicle.stats.maxHealth))));
    stats.appendChild(bar("SPD", resolved.vehicle.movement.maxSpeed / 16, resolved.vehicle.movement.maxSpeed.toFixed(1)));
    stats.appendChild(bar("DMG", resolved.weapon.damage / 40, resolved.weapon.damage.toFixed(0)));
    stats.appendChild(bar("ARM", resolved.vehicle.stats.armor, `${Math.round(resolved.vehicle.stats.armor * 100)}%`));
    left.appendChild(stats);
    body.appendChild(left);

    // Right: upgrade tree with branch pips.
    if (sel.upgradeTreeId) {
      const right = el("div", "garage-panel right");
      const tree = Content.tree(sel.upgradeTreeId);
      const grid = el("div", "tree-grid");
      const branches: UpgradeBranch[] = ["armor", "damage", "mobility", "special"];
      for (const b of branches) {
        const colEl = el("div", "tree-col");
        colEl.appendChild(el("div", "tree-branch", b.toUpperCase()));
        const nodes = tree.branches[b];
        const ownedCount = nodes.filter((n) => save.ownsUpgrade(tree.id, n.id)).length;
        const pips = el("div", "pips");
        for (let i = 0; i < nodes.length; i++) pips.appendChild(el("span", "pip" + (i < ownedCount ? " on" : "")));
        colEl.appendChild(pips);
        for (const node of nodes) {
          const isOwned = save.ownsUpgrade(tree.id, node.id);
          const buyable = isUpgradeBuyable(save, tree, node);
          const n = el("button", "node" + (isOwned ? " owned" : buyable ? " buyable" : " locked"));
          n.appendChild(el("div", "node-label", node.label));
          n.appendChild(el("div", "node-cost", isOwned ? "OWNED" : `▲ ${node.cost}`));
          if (buyable) {
            n.onclick = () => {
              if (save.spendScrap(node.cost)) {
                save.addUpgrade(tree.id, node.id);
                persist();
                this.rerender();
              }
            };
          }
          colEl.appendChild(n);
        }
        grid.appendChild(colEl);
      }
      right.appendChild(grid);
      body.appendChild(right);
    }

    wrap.appendChild(body);

    const plate = el("div", "veh-nameplate");
    plate.appendChild(el("div", "plate-name", sel.name.toUpperCase()));
    plate.appendChild(el("div", "plate-class", classLabel(sel.class)));
    wrap.appendChild(plate);
    return wrap;
  }

  // ---------- Settings ----------
  private settingsView(save: Save, persist: () => void, cb: ShellCb): HTMLElement {
    const wrap = el("div", "settings-view");
    wrap.appendChild(el("div", "screen-title small", "SETTINGS"));

    const volRow = el("div", "set-row");
    volRow.appendChild(el("span", "set-label", "VOLUME"));
    const slider = el("input", "slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round(save.data.settings.volume * 100));
    slider.oninput = () => {
      const v = Number(slider.value) / 100;
      save.data.settings.volume = v;
      cb.onVolume(v);
    };
    slider.onchange = () => persist();
    volRow.appendChild(slider);
    wrap.appendChild(volRow);

    // Motion blur — off by default; opt-in "sense of speed" camera blur (applies next mission).
    const mbRow = el("div", "set-row");
    mbRow.appendChild(el("span", "set-label", "MOTION BLUR"));
    const mbBtn = el("button", "btn toggle");
    const syncMb = (): void => {
      const on = save.data.settings.motionBlur;
      mbBtn.textContent = on ? "ON" : "OFF";
      mbBtn.classList.toggle("on", on);
    };
    syncMb();
    mbBtn.onclick = () => {
      save.data.settings.motionBlur = !save.data.settings.motionBlur;
      syncMb();
      persist();
    };
    mbRow.appendChild(mbBtn);
    wrap.appendChild(mbRow);

    const reset = el("button", "btn ghost", "RESET PROGRESS");
    reset.onclick = () => cb.reset();
    wrap.appendChild(reset);

    wrap.appendChild(el("div", "set-note", "Apex Warfare · CC0 assets · single-player PWA"));
    return wrap;
  }

  // ---------- Results (overlay) ----------
  /** `retry` restarts the same mission immediately (A2) — only surfaced on a loss. */
  showResults(r: MissionResult, mission: MissionConfig, cb: { cont: () => void; retry: () => void }): void {
    this.root.classList.remove("hidden", "showcase");
    this.root.replaceChildren();
    const p = el("div", "screen anim-in");
    this.root.appendChild(p);

    const won = r.outcome === "won";
    p.appendChild(el("div", "screen-title " + (won ? "victory" : "defeat"), won ? "VICTORY" : "DEFEAT"));

    // A2: defeat recap — killer + survival stats, shown before the action buttons.
    if (!won) p.appendChild(this.defeatRecap(r));

    p.appendChild(el("div", "results-stars big", stars(r.stars)));
    p.appendChild(el("div", "screen-sub", `${mission.name} · ${fmtTime(r.timeSec)}`));
    p.appendChild(el("div", "scrap-earn", `+ ${r.scrap} SCRAP`));

    const btnRow = el("div", "results-btns");
    if (!won) {
      const retry = el("button", "btn primary", "RETRY");
      retry.onclick = cb.retry;
      btnRow.appendChild(retry);
    }
    const cont = el("button", "btn" + (won ? " primary" : " ghost"), "CONTINUE");
    cont.onclick = cb.cont;
    btnRow.appendChild(cont);
    p.appendChild(btnRow);
  }

  private defeatRecap(r: MissionResult): HTMLElement {
    const box = el("div", "defeat-recap");
    const killer = r.killerVehicle ? `${(r.killerName ?? "HOSTILE").toUpperCase()} · ${r.killerVehicle.toUpperCase()}` : "UNKNOWN";
    box.appendChild(recapRow("KILLED BY", killer));
    box.appendChild(recapRow("SURVIVED", fmtTime(r.timeSec)));
    box.appendChild(recapRow("KILLS", String(r.kills)));
    box.appendChild(recapRow("DAMAGE DEALT", String(Math.round(r.damageDealt))));
    return box;
  }
}

function recapRow(label: string, value: string): HTMLElement {
  const row = el("div", "recap-row");
  row.appendChild(el("span", "recap-label", label));
  row.appendChild(el("span", "recap-value", value));
  return row;
}
