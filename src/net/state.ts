/**
 * Client-side structural mirror of the server's Colyseus schema (server/src/schema.ts).
 * We deliberately do NOT import the server's Schema classes — that would pull the
 * @colyseus/schema decorator runtime into the client bundle. colyseus.js hydrates the
 * live `room.state` into objects with exactly these fields, so a plain interface is enough.
 */

/** Minimal read view over a Colyseus MapSchema (what we actually use on the client). */
export interface StateMap<V> {
  forEach(cb: (value: V, key: string) => void): void;
  get(key: string): V | undefined;
  readonly size: number;
}

export interface NetPlayer {
  id: string;
  name: string;
  vehicleId: string;
  team: number;
  bot: boolean;
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  kills: number;
  deaths: number;
  alive: boolean;
  lastInputSeq: number;
  fireEvent: number;
}

export interface NetArena {
  mode: string;
  mapId: string;
  tick: number;
  over: boolean;
  winnerTeam: number;
  scoreA: number;
  scoreB: number;
  scoreTarget: number;
  players: StateMap<NetPlayer>;
}
