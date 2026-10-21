// A fast S: settled in a left at speed, then the stick snapped to the same amount right. Time for the yaw to reverse
// and reach 80% of its new steady value, and the peak g on the way. Old pad mapping (__padOld) vs new.
//   node .devtest/physics/padflick.mjs [cars] [km/h] [stick]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'm5,m1procar,f40,f1').split(','), kmh = +(process.argv[3] || 190), S = +(process.argv[4] || 0.8);
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) {
  const out = [];
  for (const old of [1, 0]) {
    globalThis.__padOld = old;
    const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('medium'); p.place(0, 0, 0);
    const vt = kmh / 3.6, hold = (st, T, each) => { for (let t = 0; t < T; t += DT) { const e = vt - p.speed;
      p.step(DT, { throttle: Math.max(0, Math.min(1, e * 0.8)), brake: Math.max(0, Math.min(1, -e * 0.5)), steer: st, handbrake: 0, analog: true, pad: true, lag: 0.05 }, ENV); each && each(t); } };
    for (let t = 0; t < 40 && p.speed < vt; t += DT) p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
    const st = Math.pow(S, 1.6); hold(-st, 2.5); const r0 = p.r;
    let t80 = null, tz = null;
    hold(st, 2, (t) => { if (tz == null && Math.sign(p.r) !== Math.sign(r0)) tz = t; if (t80 == null && -p.r / r0 > 0.8) t80 = t; });
    out.push(`${old ? 'old' : 'new'} yaw ${(r0 * 57.3).toFixed(1)}°/s, reversed ${tz?.toFixed(2)} s, 80% ${t80?.toFixed(2)} s`);
  }
  console.log(`${id.padEnd(9)} ${out.join('  |  ')}`);
}
