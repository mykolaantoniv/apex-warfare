// Minimal typed event bus. Gameplay -> feel/ui decoupling without per-frame allocations.

export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private readonly map = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Listener<unknown>);
    return () => set?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) (fn as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Game-wide event payloads (extend as systems land). */
export interface GameEvents {
  fire: { position: [number, number, number]; power: number };
  hit: { position: [number, number, number]; power: number };
  death: { position: [number, number, number]; power: number };
  [key: string]: unknown;
}
