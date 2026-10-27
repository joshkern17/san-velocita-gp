// How hard each car really stops (straight line, full brake, the AI's aids) against what the AI's speed plan assumes
// (race.js learnLimits: a = mu x 1.05 x (g + kd/m v^2)), from 200 km/h (F1 280) down to 60.   node .devtest/physics/brakecheck.mjs [cars]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { AI_AIDS } from '../../js/aids.js';
const ids = (process.argv[2] || 'nsx,r34,corvettec4,rx7fd,m1procar,porsche935,f1').split(','), DT = 1 / 240, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) {
  const C = CARS[id]; if (!C) { console.log('no car', id); continue; }
  for (const grip of [1, 1.15]) {
    const S = C.spec, p = new CarPhysics(S); p.setAids({ ...AI_AIDS }); p.fitTyres('medium'); p.place(0, 0, 0); p.gripMul = grip; p.isAI = true;
    const v0 = (C.cls === 'f1' ? 280 : 200) / 3.6, v1 = 60 / 3.6; p.vx = 0; p.vz = v0; p.gear = S.gears.length - 1;
    // (a second at speed first, so the tyres and suspension settle)
    for (let t = 0; t < 1; t += DT) { p.step(DT, { throttle: 0.6, brake: 0, steer: 0, handbrake: 0 }, ENV); }
    const va = p.speed; let d = 0, t = 0;
    while (p.speed > v1 && t < 20) { p.step(DT, { throttle: 0, brake: 1, steer: 0, handbrake: 0 }, ENV); d += p.speed * DT; t += DT; }
    // the plan's distance for the same drop
    const kdm = S.kd / S.mass, aBk = S.mu * 1.05; let dp = 0;
    for (let v = va; v > v1;) { const a = aBk * (9.81 + kdm * v * v); const dv = a * 0.002; dp += v * 0.002; v -= dv; }
    console.log(`${id.padEnd(11)} grip ${grip}  ${(va * 3.6).toFixed(0)}->60 km/h: car stops in ${d.toFixed(0)} m, the plan assumes ${dp.toFixed(0)} m (car's decel ${(dp / d).toFixed(2)}x the plan's)`);
  }
}
