// Setups (js/setup.js): the standard setup must drive exactly like the car's own spec (same numbers from a short
// scripted run), and what measure() reports for a few changes per class.   node .devtest/physics/setupcheck.mjs [cars]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { applySetup, defaultSetup, measure, simpleFields, realisticFields } from '../../js/setup.js';
const ids = (process.argv[2] || 'f1,m1procar,jsport,civic').split(',').filter(id => CARS[id]);
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
const trace = (spec) => { const p = new CarPhysics(spec); p.fitTyres('medium'); p.place(0, 0, 0); p.vz = 30; p.gear = 3; let s = '';
  for (let k = 0; k < 2400; k++) { p.step(1 / 240, { throttle: k < 1200 ? 1 : 0, brake: k > 1800 ? 0.8 : 0, steer: k > 600 && k < 1500 ? 0.4 : 0, handbrake: 0, analog: true, pad: true }, ENV); }
  return [p.x, p.z, p.h, p.u, p.v].map(x => x.toFixed(9)).join(' '); };
for (const id of ids) {
  const S = CARS[id].spec, same = trace(S) === trace(applySetup(S, defaultSetup(id), id));
  console.log(`== ${id}: standard setup ${same ? 'identical to the stock car' : 'DIFFERS from the stock car'}`);
  const f = (m) => `top ${(m.top * 3.6).toFixed(0)} 0-100 ${m.t100.toFixed(2)}s slow ${m.slowG.toFixed(2)}g fast ${m.fastG.toFixed(2)}g stop ${m.stop.toFixed(1)}m bal ${m.bal.toFixed(3)}`;
  console.log('  standard        ', f(measure(applySetup(S, defaultSetup(id), id))));
  const tries = [['downforce', 5], ['downforce', -5], ['handling', 4], ['handling', -4], ['stiff', 5], ['final', 5], ['bias', 0.58]];
  const simple = simpleFields(id);
  for (const [k, v] of tries) { const fd = simple.find(x => x.k === k); if (!fd) continue; const st = defaultSetup(id); fd.set(st, v);
    console.log(`  ${(k + ' ' + v).padEnd(16)}`, f(measure(applySetup(S, st, id)))); }
  for (const [k, v] of [['camF', -4.2], ['camF', -1], ['toeF', -0.3], ['toeR', 0.5]]) { const st = defaultSetup(id); st[k] = v; console.log(`  ${(k + ' ' + v).padEnd(16)}`, f(measure(applySetup(S, st, id)))); }
}
