import { integrateMove, type MoveState } from "../shared/sim";
import { profileFor } from "../shared/vehicles";
import { worldFor, inWater } from "../shared/maps";

// map-locker (Highland Pass): water rect centered x=48, width 34 → spans x 31..65.
const world = worldFor("map-locker");
const water = world.water!;
const tank = profileFor("tank-boulder"); // ground, water:false
const heli = profileFor("heli-hornet"); // fly, water:true

// Both start west of the water at x=20 and drive due +X (yaw=PI/2) straight at it.
function driveEast(id: string, steps: number): MoveState {
  const s: MoveState = { x: 20, z: 0, yaw: Math.PI / 2, vx: 0, vz: 0 };
  const p = id === "tank" ? tank : heli;
  for (let i = 0; i < steps; i++) integrateMove(s, 0, 1, 1 / 30, p, world);
  return s;
}

const t = driveEast("tank", 80);
const h = driveEast("heli", 80);
const tankInWater = inWater(t.x, t.z, water);
const heliInWater = inWater(h.x, h.z, water);
console.log(`TANK end x=${t.x.toFixed(1)} inWater=${tankInWater}  (should stop near west shore x~31, NOT in water)`);
console.log(`HELI end x=${h.x.toFixed(1)} inWater=${heliInWater}  (should fly into the water region)`);
console.log(`cruiseY: heli=${heli.cruiseY} (flies), tank=${tank.cruiseY} (ground)`);
console.log(`maxSpeed: bike=${profileFor("bike-scout").maxSpeed}, tank=${tank.maxSpeed}, jet=${profileFor("jet-talon").maxSpeed}`);

const pass = !tankInWater && t.x < 33 && heliInWater && heli.cruiseY > 3 && tank.cruiseY < 1;
console.log(pass ? "PASS ✅ tank blocked at shoreline; heli flies over water; altitudes differ" : "FAIL");
process.exit(pass ? 0 : 1);
