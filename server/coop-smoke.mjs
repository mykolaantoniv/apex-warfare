import { Client } from "colyseus.js";

const a = await new Client("ws://localhost:2567").joinOrCreate("arena", { name: "Hero", mode: "coop", vehicleId: "heli-hornet" });
await new Promise((r) => setTimeout(r, 300));

let bots = 0;
let humans = 0;
a.state.players.forEach((p) => (p.bot ? bots++ : humans++));
console.log("mode:", a.state.mode, "| humans:", humans, "| bots:", bots, "| scoreTarget:", a.state.scoreTarget);

// Record initial bot positions to prove AI moves them.
const startPos = new Map();
a.state.players.forEach((p, id) => { if (p.bot) startPos.set(id, { x: p.x, z: p.z }); });

// Human chases the nearest living bot at full throttle, firing.
let seq = 0;
const drive = setInterval(() => {
  const me = a.state.players.get(a.sessionId);
  if (!me) return;
  let bx = 0, bz = 0, best = Infinity, found = false;
  a.state.players.forEach((t) => {
    if (!t.bot || !t.alive) return;
    const d = (t.x - me.x) ** 2 + (t.z - me.z) ** 2;
    if (d < best) { best = d; bx = t.x; bz = t.z; found = true; }
  });
  const want = found ? Math.atan2(bx - me.x, bz - me.z) : me.yaw;
  const dd = ((want - me.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  a.send("input", { seq: ++seq, moveX: Math.max(-1, Math.min(1, dd * 3)), moveY: 1, firing: true, switchTarget: false, special: false });
}, 40);

// Poll for match end (up to 45s).
let overAt = 0;
const t0 = Date.now();
while (Date.now() - t0 < 45000) {
  await new Promise((r) => setTimeout(r, 500));
  if (a.state.over) { overAt = (Date.now() - t0) / 1000; break; }
}
clearInterval(drive);

let botsAlive = 0, moved = 0;
a.state.players.forEach((p, id) => {
  if (!p.bot) return;
  if (p.alive) botsAlive++;
  const s = startPos.get(id);
  if (s && Math.hypot(p.x - s.x, p.z - s.z) > 3) moved++;
});
console.log(`botsMoved(AI): ${moved}/${bots} | scoreA(human kills): ${a.state.scoreA} | botsAlive: ${botsAlive} | over: ${a.state.over} | winnerTeam: ${a.state.winnerTeam}${overAt ? " @" + overAt + "s" : ""}`);
const pass = bots === 5 && humans === 1 && moved >= 3 && a.state.scoreA > 0;
const fullWin = a.state.over && a.state.winnerTeam === 1;
console.log(pass ? (fullWin ? "PASS ✅ co-op: bots+AI+scoring+VICTORY all verified" : "PASS ✅ co-op bots+AI+scoring verified (match not fully won in window)") : "FAIL");
process.exit(pass ? 0 : 1);
