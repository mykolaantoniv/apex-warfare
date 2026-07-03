import { Client } from "colyseus.js";

const endpoint = "ws://localhost:2567";
const a = await new Client(endpoint).joinOrCreate("arena", { name: "Alpha", mode: "pvp" });
const b = await new Client(endpoint).joinById(a.roomId, { name: "Bravo" });
console.log("joined room", a.roomId);
await new Promise((r) => setTimeout(r, 300));

const me = a.state.players.get(a.sessionId);
const foe = a.state.players.get(b.sessionId);
const start = { x: me.x, z: me.z, foeHp: foe.hp };
console.log("Alpha start:", { x: me.x.toFixed(1), z: me.z.toFixed(1), team: me.team });
console.log("Bravo start:", { x: foe.x.toFixed(1), z: foe.z.toFixed(1), team: foe.team, hp: foe.hp });

// Alpha charges Bravo at full throttle, steering to face it, firing continuously.
let seq = 0;
const drive = setInterval(() => {
  const m = a.state.players.get(a.sessionId);
  const f = a.state.players.get(b.sessionId);
  if (!m || !f) return;
  const want = Math.atan2(f.x - m.x, f.z - m.z);
  const d = ((want - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  a.send("input", { seq: ++seq, moveX: Math.max(-1, Math.min(1, d * 3)), moveY: 1, firing: true, switchTarget: false, special: false });
}, 40);

await new Promise((r) => setTimeout(r, 7000));
clearInterval(drive);
await new Promise((r) => setTimeout(r, 150));

const movedM = Math.hypot(me.x - start.x, me.z - start.z);
const dmg = start.foeHp - foe.hp;
console.log("Alpha end:", { x: me.x.toFixed(1), z: me.z.toFixed(1), seqAck: me.lastInputSeq, shots: me.fireEvent, kills: me.kills });
console.log("Bravo end:", { hp: foe.hp.toFixed(0), alive: foe.alive, deaths: foe.deaths });
console.log(`RESULT  moved=${movedM.toFixed(1)}m  shotsFired=${me.fireEvent}  inputAck=${me.lastInputSeq}  dmgToBravo=${dmg.toFixed(0)}`);
const pass = movedM > 5 && me.lastInputSeq > 0 && me.fireEvent > 0 && dmg > 0;
console.log(pass ? "PASS ✅ authoritative movement + input-ack + combat all verified" : "FAIL");
process.exit(pass ? 0 : 1);
