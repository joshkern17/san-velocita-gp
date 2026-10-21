// Standing starts, automatic vs manual (shifting at the redline): 0-60/0-100/0-160 km/h   node .devtest/physics/launchcheck.mjs [cars]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'civic,m1procar,m3gtr,f1').split(','), DT = 1 / 240, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) {
  if (!CARS[id]) { console.log('no car', id); continue; }
  const row = [];
  for (const auto of [true, false]) {
    const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('medium'); p.place(0, 0, 0); p.auto = auto;
    const marks = [60, 100, 160], at = {}; let t = 0, rpm1 = 0;
    for (; t < 30 && p.speed * 3.6 < 160; t += DT) {
      p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
      if (!auto && p.rpm >= p.p.redline - 150 && p.gear < p.p.gears.length - 1) p.shift(1);
      if (Math.abs(t - 0.5) < DT / 2) rpm1 = p.rpm;
      for (const m of marks) if (!at[m] && p.speed * 3.6 >= m) at[m] = t;
    }
    row.push(`${auto ? 'auto  ' : 'manual'} ${marks.map(m => `0-${m} ${at[m] ? at[m].toFixed(2) : '--'}`).join('  ')}  (rpm @0.5s ${rpm1.toFixed(0)})`);
  }
  console.log(`${id} (idle ${CARS[id].spec.idle}, red ${CARS[id].spec.redline})\n  ${row.join('\n  ')}`);
}
