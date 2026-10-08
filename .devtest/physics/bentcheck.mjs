// Realistic damage (physics.js addBend): a car with one corner bent, steering straight: how far it pulls off line
// and how fast it turns (the pull a driver has to hold), the tyre it scrubs, and steady cornering grip both ways
//   node .devtest/physics/bentcheck.mjs [cars]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'f1,m1procar,jsport').split(','), DT = 1 / 240, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
const mk = (id, bent, k = 0) => { const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.bentOn = true; p.fitTyres('medium'); p.place(0, 0, 0); p.vz = 40; p.gear = 5; if (bent) { p.addBend(k, bent); p.bentDir[k] = -1; } return p; };
for (const id of ids) for (const b of [0, 0.25, 0.5, 1]) {
  const p = mk(id, b); let w0 = p.tyre.wf;
  for (let t = 0; t < 3; t += DT) p.step(DT, { steer: 0, throttle: p.speed < 40 ? 0.6 : 0.2, brake: 0, handbrake: 0, analog: true, pad: true }, ENV);
  const side = p.x, yaw = p.h * 57.3;
  const g = (st) => { const q = mk(id, b); let s = 0, n = 0; for (let t = 0; t < 3; t += DT) { q.step(DT, { steer: st, throttle: q.speed < 30 ? 0.6 : 0.2, brake: 0, handbrake: 0, analog: true, pad: true }, ENV); if (t > 2) { s += Math.abs(q.latG); n++; } } return s / n; };
  console.log(`${id.padEnd(9)} bent ${b.toFixed(2)}: after 3 s straight ${side.toFixed(1)} m off line, heading ${yaw.toFixed(1)}°; corner g left ${g(0.3).toFixed(2)} right ${g(-0.3).toFixed(2)}`);
}
