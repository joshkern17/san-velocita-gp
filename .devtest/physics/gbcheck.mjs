// Realistic damage (physics.js gbHurt): a standing start to 250 km/h by gearbox damage (the time it takes, shifts
// missed, the gear lost), and a manual downshift that over-revs   node .devtest/physics/gbcheck.mjs [car]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const id = process.argv[2] || 'm1procar', DT = 1 / 240, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
const mk = (gb) => { const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.engOn = true; p.fitTyres('medium'); p.place(0, 0, 0); p.gbHurt(gb); return p; };
for (const gb of [0, 0.2, 0.45, 0.7, 0.9]) {
  let best = 0;
  for (let run = 0; run < 5; run++) {
    const p = mk(gb); let t = 0, misses = 0, was = 0;
    for (; t < 40 && p.speed < 69.4; t += DT) { p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV); if (p.missT > 0 && !was) misses++; was = p.missT > 0; }
    best += t / 5; if (run === 0) console.log(`gb ${gb.toFixed(2)}: lost gear ${p.lostGear || '-'}, misses ${misses}`);
  }
  console.log(`         0-250 km/h ${best.toFixed(2)} s (5 runs)`);
}
const p = mk(0); p.auto = false; p.place(0, 0, 0); p.vz = 50; p.gear = 5;
for (let k = 0; k < 240; k++) p.step(DT, { throttle: 0.3, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
p.shift(-1); p.shift(-1); p.shift(-1);
console.log(`manual: three quick downshifts at ${(p.speed * 3.6).toFixed(0)} km/h -> gear ${p.gear}, gearbox damage ${(p.dmg.gb * 100).toFixed(0)}%`);
