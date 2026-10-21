// A light bend flat out on a pad: at top speed, full throttle, the stick pushed to x and held 1.2 s, then let go.
// Max slide angle, whether it spun (> 30°), peak g. Old pad mapping (__padOld) vs new.   node .devtest/physics/padbend.mjs [cars] [aids preset]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'm1procar,porsche935,capri,f40').split(','), preset = process.argv[3] || 'standard';
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) {
  // top speed first (flat out on a long straight)
  const p0 = new CarPhysics(CARS[id].spec); p0.fitTyres('medium'); p0.place(0, 0, 0);
  for (let t = 0; t < 60; t += DT) p0.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
  const top = p0.speed;
  console.log(`${id}  top ${(top * 3.6).toFixed(0)} km/h  (${preset} aids)`);
  for (const old of [1, 0]) {
    globalThis.__padOld = old;
    const row = [];
    for (const s of [0.15, 0.25, 0.35, 0.5, 0.7]) {
      const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS[preset].aids)); p.fitTyres('medium'); p.place(0, 0, 0);
      for (let t = 0; t < 60 && p.speed < top - 1; t += DT) p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
      let maxB = 0, maxG = 0;
      for (let t = 0; t < 4; t += DT) {
        const steer = t < 1.2 ? Math.pow(s, 1.6) : 0;
        p.step(DT, { throttle: 1, brake: 0, steer, handbrake: 0, analog: true, pad: true, lag: 0.05 }, ENV);
        maxB = Math.max(maxB, Math.abs(p.beta)); maxG = Math.max(maxG, Math.abs(p.latG));
      }
      row.push(`${(s * 100).toFixed(0)}%: ${(maxB * 57.3).toFixed(1)}°${maxB > 0.52 ? ' SPIN' : ''} ${maxG.toFixed(2)}g`);
    }
    console.log(`  ${old ? 'old' : 'new'}  ${row.join('  ')}`);
  }
}
