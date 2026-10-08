// Realistic damage (physics.js engineHeat): water temperature lapping a simple pattern (a corner, then a straight),
// by radiator damage: where it settles, the power it costs, when it lets go   node .devtest/physics/engcheck.mjs [car]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const id = process.argv[2] || 'm1procar', DT = 1 / 240, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const rad of [0, 0.2, 0.35, 0.5, 0.7, 0.9]) {
  const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.engOn = true; p.ambT = 30; p.fitTyres('medium');
  p.place(0, 0, 0); p.vz = 30; p.gear = 3; p.dmg.rad = rad;
  const V = id === 'f1' ? 50 : 30, marks = []; let blown = null;
  for (let t = 0; t < 600; t += DT) {
    const ph = t % 13, corner = ph < 5, tgt = corner ? V : V * 1.6;
    p.step(DT, { steer: corner ? 0.25 : 0, throttle: p.speed < tgt ? 1 : 0.15, brake: !corner && ph > 11 && p.speed > V ? 1 : 0, handbrake: 0, analog: true, pad: true }, ENV);
    if (Math.abs(t % 60) < DT) marks.push(`${Math.round(t)}s ${p.engT.toFixed(0)}°/${Math.round(p.engK * 100)}%`);
    if (p.engBlown && blown == null) { blown = t; break; }
  }
  console.log(`rad ${rad.toFixed(2)}: ${marks.join('  ')}${blown != null ? `  BLOWN at ${blown.toFixed(0)} s` : ''}`);
}
