// Engine heat (physics.js engineHeat) for every class: lapping a corner/straight pattern flat out for 10 min on a 30°C
// day, in clean air, in a tow the whole time, and with radiator damage. A healthy car must never blow or lose power.
//   node .devtest/physics/engtow.mjs [car,car]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'civic,miata,r34,rs964,m1procar,f1').split(','), DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
function run(id, slip, rad) {
  const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.engOn = true; p.ambT = 30; p.fitTyres('medium');
  p.place(0, 0, 0); p.vz = 25; p.gear = 3; p.dmg.rad = rad; p.slip = slip;
  const V = p.coolV * 0.9; let max = 0, minK = 1, blown = null;
  for (let t = 0; t < 600; t += DT) {
    const ph = t % 20, corner = ph < 5, tgt = corner ? V * 0.7 : 999;
    p.slip = corner ? 0 : slip;
    p.step(DT, { steer: corner ? 0.2 : 0, throttle: p.speed < tgt ? 1 : 0.15, brake: !corner && ph > 18 ? 1 : 0, handbrake: 0, analog: true, pad: true }, ENV);
    if (t > 60) { max = Math.max(max, p.engT); minK = Math.min(minK, p.engK); }
    if (p.engBlown) { blown = t; break; }
  }
  return `${max.toFixed(0)}°C ${Math.round(minK * 100)}%${blown != null ? ` BLOWN ${blown.toFixed(0)}s` : ''}`;
}
let bad = 0;
for (const id of ids) {
  const p = new CarPhysics(CARS[id].spec), clean = run(id, 0, 0), tow = run(id, 1, 0);
  if (/BLOWN| (?!100)\d+%/.test(clean + ' ' + tow)) bad++;
  console.log(`${id.padEnd(9)} coolV ${p.coolV.toFixed(0)} m/s | clean ${clean} | tow ${tow} | rad .35 ${run(id, 0, 0.35)} | rad .35+tow ${run(id, 1, 0.35)} | rad .7 ${run(id, 0, 0.7)} | rad .7+tow ${run(id, 1, 0.7)} | rad .9 ${run(id, 0, 0.9)}`);
}
console.log(bad ? `FAIL: ${bad} healthy car(s) overheating` : 'ok: no healthy car loses power or blows');
