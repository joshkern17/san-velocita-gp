// Controller steering sweep: at a held speed, each stick position (through the Normal 1.6 curve) held until steady:
// lateral g and the fronts' slip past their peak (gripF > 1 = scrubbing wide). Shows where on the stick a car reaches
// its peak cornering, and whether more stick past that only understeers.   node .devtest/physics/padsweep.mjs [cars] [km/h,...]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'civic,m5,m1procar,f1').split(','), speeds = (process.argv[3] || '100,180,250,300').split(',').map(Number);
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, STICK = [0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
for (const id of ids) {
  console.log(`${id}`);
  for (const kmh of speeds) {
    const row = [];
    let best = 0, bestS = 0;
    for (const s of STICK) {
      const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('medium'); p.place(0, 0, 0);
      const vt = kmh / 3.6; let t = 0, steer = 0, g = 0, gf = 0, n = 0, d1 = 0, d2 = 0;
      for (; t < 40 && p.speed < vt; t += DT) p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
      if (p.speed < vt - 1) { row.push('  --  '); continue; }
      for (let k = 0; k < 4 / DT; k++) {
        steer = Math.min(1, k * DT * 3) * Math.pow(s, 1.6);
        const e = vt - p.speed;
        p.step(DT, { throttle: Math.max(0, Math.min(1, e * 0.8)), brake: Math.max(0, Math.min(1, -e * 0.5)), steer, handbrake: 0, analog: true, pad: true }, ENV);
        if (k * DT > 3) { g += Math.abs(p.latG); gf += p.gripF || 0; d1 += p.delta; d2 += p.delta * p.delta; n++; }
      }
      g /= n; gf /= n; const dsd = Math.sqrt(Math.max(0, d2 / n - (d1 / n) ** 2)) * 1000; if (g > best) { best = g; bestS = s; }
      row.push(`${(s * 100).toFixed(0)}%:${g.toFixed(2)}g${gf > 1 ? "*" : " "}` + (process.env.V ? `F${gf.toFixed(2)}R${p.gripR.toFixed(2)}β${(p.beta*57.3).toFixed(1)}~${dsd.toFixed(1)}v${(p.speed*3.6).toFixed(0)}` : ""));
    }
    console.log(`  ${String(kmh).padStart(3)} km/h  peak ${best.toFixed(2)}g @${(bestS * 100).toFixed(0)}%  | ${row.join(' ')}`);
  }
}
