// Tyre temperatures (CarPhysics.tyreHeat): a car lapping a simple pattern on the open plane (a corner held near the
// limit, then a straight), and a car cruising, by mode. Prints the front / rear temperatures over time and the grip
// they give.   node .devtest/physics/tyretemp.mjs [car,car] [mode 1|2]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'f1,m1procar,mustang').split(','), mode = +(process.argv[3] || 1), DT = 1 / 240;
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
const mk = (id, v, blankets) => { const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.tempMode = mode; p.ambT = 30; p.blankets = blankets;
  p.fitTyres('medium'); p.place(0, 0, 0); p.vz = v; p.gear = 3; return p; };
const row = (t, p) => `${String(t).padStart(4)}s  F ${p.tS[0].toFixed(0)}/${p.tC[0].toFixed(0)}  R ${p.tS[2].toFixed(0)}/${p.tC[2].toFixed(0)}  grip ${(p.tempGrip * 100).toFixed(1)}%`;
for (const id of ids) {
  const V = id === 'f1' ? 50 : 30;
  for (const blankets of [true, false]) {
    console.log(`== ${id} lapping, ${blankets ? 'from the warmers' : 'cold'} (mode ${mode})`);
    const p = mk(id, V, blankets); let t = 0;
    for (let k = 0; k < 180 / DT; k++, t += DT) {
      const ph = t % 13, corner = ph < 5;
      const tgt = corner ? V : V * 1.6;
      p.step(DT, { steer: corner ? 0.6 : 0, throttle: p.speed < tgt ? 1 : 0.15, brake: !corner && ph > 11 && p.speed > V ? 1 : 0, handbrake: 0, analog: true, pad: true }, ENV);
      if (k % (15 / DT) === 0) console.log(row(Math.round(t), p));
    }
  }
  console.log(`== ${id} cruising straight at ${V * 1.6} m/s`);
  const p = mk(id, V * 1.6, true);
  for (let k = 0, t = 0; k < 120 / DT; k++, t += DT) { p.step(DT, { steer: 0, throttle: p.speed < V * 1.6 ? 0.8 : 0.2, brake: 0, handbrake: 0, analog: true, pad: true }, ENV); if (k % (30 / DT) === 0) console.log(row(Math.round(t), p)); }
}
