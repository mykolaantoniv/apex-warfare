import { Content } from "../data/Content";
import type { GameMode } from "../../shared/net";

export interface LobbyChoice {
  mode: GameMode;
  mapId: string;
  name: string;
  roomId?: string;
}

interface RoomInfo {
  roomId: string;
  clients: number;
  maxClients: number;
  metadata?: { mode?: string; mapId?: string };
}

const NAME_KEY = "apex.playerName";
const KNOWN_MAPS: readonly string[] = Content.mapOrder;

/** Multiplayer lobby overlay: name + mode + map pick, Quickplay, and a live room browser. */
export class Lobby {
  private readonly overlay: HTMLElement;
  private readonly httpBase: string;
  private readonly roomsEl: HTMLElement;
  private readonly modeBtns = new Map<GameMode, HTMLButtonElement>();
  private readonly mapBtns = new Map<string, HTMLButtonElement>();
  private mode: GameMode = "coop";
  private mapId: string;
  private name: string;
  private timer = 0;
  private disposed = false;

  constructor(
    serverUrl: string,
    private readonly onPlay: (choice: LobbyChoice) => void,
    private readonly onBack: () => void,
  ) {
    this.httpBase = serverUrl.replace(/^ws/, "http"); // ws→http, wss→https
    this.name = (localStorage.getItem(NAME_KEY) ?? "Recruit").slice(0, 16) || "Recruit";
    this.mapId = Content.mapOrder[0]!;
    this.roomsEl = el("div", "lobby-rooms");
    this.overlay = this.build();
  }

  show(): void {
    document.body.appendChild(this.overlay);
    void this.refresh();
    this.timer = window.setInterval(() => void this.refresh(), 2500);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.overlay.remove();
  }

  private build(): HTMLElement {
    const overlay = el("div", "lobby");
    const panel = el("div", "lobby-panel");
    panel.appendChild(el("div", "lobby-title", "MULTIPLAYER"));

    // Name.
    const nameRow = el("div", "lobby-row");
    nameRow.appendChild(el("span", "lobby-label", "CALLSIGN"));
    const input = document.createElement("input");
    input.className = "lobby-input";
    input.maxLength = 16;
    input.value = this.name;
    input.oninput = () => {
      this.name = input.value.slice(0, 16) || "Recruit";
      localStorage.setItem(NAME_KEY, this.name);
    };
    nameRow.appendChild(input);
    panel.appendChild(nameRow);

    // Mode toggle.
    const modeRow = el("div", "lobby-row");
    modeRow.appendChild(el("span", "lobby-label", "MODE"));
    const modeWrap = el("div", "seg");
    for (const [m, label] of [["coop", "🤝 CO-OP"], ["pvp", "⚔ PVP"]] as const) {
      const b = el("button", "seg-btn", label);
      b.onclick = () => {
        this.mode = m;
        this.syncToggles();
      };
      this.modeBtns.set(m, b);
      modeWrap.appendChild(b);
    }
    modeRow.appendChild(modeWrap);
    panel.appendChild(modeRow);

    // Map picker.
    const mapRow = el("div", "lobby-row");
    mapRow.appendChild(el("span", "lobby-label", "MAP"));
    const mapWrap = el("div", "seg");
    for (const id of Content.mapOrder) {
      const b = el("button", "seg-btn", Content.map(id).name);
      b.onclick = () => {
        this.mapId = id;
        this.syncToggles();
      };
      this.mapBtns.set(id, b);
      mapWrap.appendChild(b);
    }
    mapRow.appendChild(mapWrap);
    panel.appendChild(mapRow);

    // Quickplay + back.
    const actions = el("div", "lobby-actions");
    const quick = el("button", "btn primary", "QUICKPLAY");
    quick.onclick = () => this.play({ mode: this.mode, mapId: this.mapId, name: this.name });
    const back = el("button", "btn ghost", "BACK");
    back.onclick = () => {
      this.dispose();
      this.onBack();
    };
    actions.append(quick, back);
    panel.appendChild(actions);

    // Room browser.
    panel.appendChild(el("div", "lobby-subhead", "OPEN MATCHES"));
    panel.appendChild(this.roomsEl);

    overlay.appendChild(panel);
    this.syncToggles();
    return overlay;
  }

  private syncToggles(): void {
    for (const [m, b] of this.modeBtns) b.classList.toggle("active", m === this.mode);
    for (const [id, b] of this.mapBtns) b.classList.toggle("active", id === this.mapId);
  }

  private async refresh(): Promise<void> {
    try {
      const res = await fetch(`${this.httpBase}/rooms`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rooms = (await res.json()) as RoomInfo[];
      if (!this.disposed) this.renderRooms(rooms);
    } catch {
      if (!this.disposed) this.renderRooms(null);
    }
  }

  private renderRooms(rooms: RoomInfo[] | null): void {
    this.roomsEl.replaceChildren();
    if (rooms === null) {
      this.roomsEl.appendChild(el("div", "lobby-empty", "Can't reach the server."));
      return;
    }
    if (rooms.length === 0) {
      this.roomsEl.appendChild(el("div", "lobby-empty", "No open matches — start one with Quickplay."));
      return;
    }
    for (const r of rooms) {
      const mode: GameMode = r.metadata?.mode === "pvp" ? "pvp" : "coop";
      const mapId = r.metadata?.mapId ?? KNOWN_MAPS[0]!;
      const mapName = KNOWN_MAPS.includes(mapId) ? Content.map(mapId).name : mapId;
      const row = el("div", "lobby-room");
      row.appendChild(el("span", "lr-mode " + mode, mode === "pvp" ? "PVP" : "CO-OP"));
      row.appendChild(el("span", "lr-map", mapName));
      row.appendChild(el("span", "lr-count", `${r.clients}/${r.maxClients}`));
      const join = el("button", "btn small primary", "JOIN");
      const full = r.clients >= r.maxClients;
      if (full) {
        join.disabled = true;
        join.textContent = "FULL";
      } else {
        join.onclick = () => this.play({ mode, mapId, name: this.name, roomId: r.roomId });
      }
      row.appendChild(join);
      this.roomsEl.appendChild(row);
    }
  }

  private play(choice: LobbyChoice): void {
    this.dispose();
    this.onPlay(choice);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
