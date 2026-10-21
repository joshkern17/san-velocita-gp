// Front vs rear tire wear for a pad driver: laps of straight (flat out) -> brake -> a corner held at a stick position
// with the throttle feathered to keep its speed -> exit flat out. Old pad mapping (__padOld) vs new, auto vs manual.
//   node .devtest/physics/padwear.mjs [cars] [stick]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'm1procar,f40,porsche935').split(','), S = +(process.argv[3] || 0.85);
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) for (const auto of [true, false]) {
  const out = [];
  for (const old of [1, 0]) {
    globalThis.__padOld = old;
    const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('medium'); p.place(0, 0, 0); p.auto = auto; p.wearK = 1;
    const step = (c) => { p.step(DT, { handbrake: 0, analog: true, pad: true, lag: 0.05, steer: 0, throttle: 0, brake: 0, ...c }, ENV);
      if (!auto) { if (p.rpm >= p.p.redline - 150 && p.gear < p.p.gears.length - 1) p.shift(1); if (p.gear > 1 && p.speed < p.p.gears[p.gear - 1] * 0.75) p.shift(-1); } };
    for (let t = 0; t < 4; t += DT) step({ throttle: 1 });
    const wf0 = p.tyre.wf, wr0 = p.tyre.wr;
    for (const vc of [25, 35, 45, 30, 50, 40]) {
      for (let t = 0; t < 6; t += DT) step({ throttle: 1 });                        // straight
      for (let t = 0; t < 4 && p.speed > vc; t += DT) step({ brake: 1 });            // brake
      for (let t = 0; t < 3; t += DT) { const e = vc - p.speed; step({ steer: Math.pow(S, 1.6) * (t < 0.4 ? t / 0.4 : 1), throttle: Math.max(0, Math.min(1, 0.3 + e * 0.5)) }); }
      for (let t = 0; t < 2; t += DT) step({ throttle: 1, steer: Math.pow(S * 0.3, 1.6) }); // exit
    }
    out.push(`${old ? 'old' : 'new'} front ${((wf0 - p.tyre.wf) * 1000).toFixed(2)} rear ${((wr0 - p.tyre.wr) * 1000).toFixed(2)}`);
  }
  console.log(`${id.padEnd(10)} ${auto ? 'auto  ' : 'manual'}  ${out.join('  |  ')}`);
}
