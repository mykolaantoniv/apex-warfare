/**
 * Per-vehicle movement profiles shared by server (authority) and client (prediction).
 * Derived from the content JSON but tuned for the arcade netcode: speeds are boosted for a
 * livelier online feel, and each vehicle gets an altitude + water rule so helis/jets fly and
 * ground vehicles stay grounded and can't cross water. Keep engine-free.
 */

export interface MoveProfile {
  /** Top speed, m/s. */
  maxSpeed: number;
  /** Turn rate at full steer, rad/s. */
  turnRate: number;
  /** Velocity approach rate, m/s^2 (higher = snappier accel + stop). */
  accel: number;
  /** Flying vehicle (heli/jet): cruises at altitude and may cross water. */
  fly: boolean;
  /** Rendered/cruise height, m (flyers hover high; ground vehicles sit low). */
  cruiseY: number;
  /** Can traverse water (flyers + boats). Ground vehicles are blocked at the shoreline. */
  water: boolean;
}

const heli = (maxSpeed: number, turnDeg: number, accel: number, cruiseY = 5.5): MoveProfile => ({
  maxSpeed,
  turnRate: (turnDeg * Math.PI) / 180,
  accel,
  fly: true,
  cruiseY,
  water: true,
});
const ground = (maxSpeed: number, turnDeg: number, accel: number, water = false, cruiseY = 0.5): MoveProfile => ({
  maxSpeed,
  turnRate: (turnDeg * Math.PI) / 180,
  accel,
  fly: false,
  cruiseY,
  water,
});

export const MOVE_PROFILES: Record<string, MoveProfile> = {
  "heli-hornet": heli(15, 240, 34),
  "heli-mule": heli(11, 180, 26, 6),
  "heli-pest": heli(13, 200, 30),
  "heli-brute": heli(9.5, 130, 22, 6.5),
  "heli-wasp": heli(16.5, 260, 38),
  "jet-talon": heli(22, 150, 30, 7.5),
  "tank-boulder": ground(8, 140, 20),
  "tank-raider": ground(9, 130, 22),
  "bike-scout": ground(18, 210, 42),
  "boat-gunner": ground(13, 95, 26, true, 0.4),
  "soldier-grunt": ground(7.5, 180, 26),
};

const DEFAULT: MoveProfile = heli(14, 220, 32);

export function profileFor(vehicleId: string): MoveProfile {
  return MOVE_PROFILES[vehicleId] ?? DEFAULT;
}
