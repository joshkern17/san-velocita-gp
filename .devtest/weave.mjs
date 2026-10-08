// dev: straight-line stability. A car at speed on full throttle gets a short flick of the stick, then the stick is let
// go: how its yaw settles (swings, decay). Then a pad driver holding a lane with a human's reaction delay.
//   node .devtest/weave.mjs [kph]
import { CarPhysics } from '../js/physics.js';
import { CARS } from '../js/cars.js';
import { physAids, PRESETS } from '../js/aids.js';
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, DT = 1 / 240;
const KPH = +(process.argv[2] || 160), IDS = (process.env.CARS || 'm1procar,porsche935,aventus,bx300,rmx,testarossa,jsport,rs964,mustang,m5,m3gtr,civic,f1').split(',');
const AIDS = process.env.SIM ? PRESETS.sim.aids : PRESETS.standard.aids;
const pad = (raw) => { const dz = 0.12, a = Math.abs(raw); return a < dz ? 0 : Math.sign(raw) * Math.pow((a - dz) / (1 - dz), 1.6); };
function mk(id) {
  const sp = process.env.LSD ? { ...CARS[id].spec, lsd: JSON.parse(process.env.LSD) } : CARS[id].spec;
  const p = new CarPhysics(sp); p.setAids(physAids(AIDS)); p.place(0, 0, 0); p.vz = KPH / 3.6;
  const g = p.p.gears; p.gear = Math.max(1, g.findIndex(x => x > KPH / 3.6 * 1.08)); return p;
}
const ctl = (steer, thr = 1) => ({ steer, throttle: thr, brake: 0, handbrake: 0, analog: true, pad: true, lag: 0.05 });
for (const id of IDS) {
  // settle 1 s, flick 0.2 s, let go 3 s
  let p = mk(id);
  for (let i = 0; i < 240; i++) p.step(DT, ctl(0), ENV);
  let rs = [], bs = [];
  for (let i = 0; i < 240 * 3.2; i++) { const t = i * DT; p.step(DT, ctl(t < 0.2 ? pad(0.35) : 0), ENV); if (t >= 0.2) { rs.push(p.r); bs.push(p.beta); } }
  const peaks = []; for (let i = 1; i < rs.length - 1; i++) if (Math.abs(rs[i]) > Math.abs(rs[i - 1]) && Math.abs(rs[i]) >= Math.abs(rs[i + 1]) && Math.abs(rs[i]) > 0.003) peaks.push(rs[i]);
  const swings = peaks.filter((x, i) => i && Math.sign(x) !== Math.sign(peaks[i - 1])).length;
  const bMax = Math.max(...bs.map(Math.abs));
  // a pad driver holding the lane: aims at a point 25 m ahead, reaction delay 0.18 s, small noise
  p = mk(id); for (let i = 0; i < 240; i++) p.step(DT, ctl(0), ENV);
  const q = []; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  let bSum = 0, n = 0, bPk = 0, yPk = 0, rSw = 0, lastS = 0, noise = 0;
  for (let i = 0; i < 240 * 12; i++) {
    const t = i * DT, x = p.x, hd = p.h; // (heading 0 = +z; lateral = x)
    const look = 25, yErr = x + Math.sin(hd) * look; // where the nose points at 25 m
    if (i % 4 === 0) noise += (rnd() * 0.06 - noise * 0.02);
    q.push(Math.max(-1, Math.min(1, yErr * 0.12 + p.r * 0.0 + noise)));
    const raw = q.length > 0.18 * 240 ? q[q.length - 1 - Math.round(0.18 * 240)] : 0;
    p.step(DT, ctl(pad(raw)), ENV);
    if (t > 2) { bSum += p.beta * p.beta; n++; bPk = Math.max(bPk, Math.abs(p.beta)); yPk = Math.max(yPk, Math.abs(p.x)); const s = Math.sign(p.r); if (Math.abs(p.r) > 0.02 && s !== lastS) { if (lastS) rSw++; lastS = s; } }
  }
  console.log(`${id.padEnd(11)} flick: yaw peak ${peaks[0]?.toFixed(3) ?? '-'} swings ${swings} decay ${(peaks.length > 1 ? Math.abs(peaks[1] / peaks[0]) : 0).toFixed(2)} β ${(bMax * 57.3).toFixed(1)}°  | lane: β rms ${(Math.sqrt(bSum / n) * 57.3).toFixed(2)}° pk ${(bPk * 57.3).toFixed(1)}° wander ${yPk.toFixed(2)} m yaw swings ${rSw}  ${(p.speed * 3.6).toFixed(0)}kph`);
}
