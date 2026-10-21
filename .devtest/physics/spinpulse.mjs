// Wheelspin pulsing under acceleration: flat out in a straight line from 40 km/h, the sound's triggers logged (rear
// grip over its peak -> squeal on > 1.03 / off < 0.97, spin -> the wheelspin loop) and traction control's cut.
// Counts on/off flips per second.   node .devtest/physics/spinpulse.mjs [cars] [aids preset] [auto|manual] [trace]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'capri,m1procar,f40,porsche935').split(','), preset = process.argv[3] || 'standard', auto = (process.argv[4] || 'auto') === 'auto', TR = process.argv[5];
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
for (const id of ids) {
  const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS[preset].aids)); p.fitTyres('medium'); p.place(0, 0, 0); p.auto = auto;
  p.vz = 11; p.gear = 1;
  let t160 = 0, t200 = 0, on = false, flips = 0, onT = 0, spinT = 0, spinFlips = 0, sp = false, tcMin = 1, t = 0;
  const gearRow = {};
  for (; t < 14; t += DT) {
    p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
    if (!auto && p.rpm >= p.p.redline - 150 && p.gear < p.p.gears.length - 1) p.shift(1);
    const g = p.gripR || 0;
    if (!on && g > 1.03) { on = true; flips++; } else if (on && g < 0.97) on = false;
    if (on) onT += DT;
    const s = (p.spin || 0) > 0.02; if (s && !sp) spinFlips++; sp = s; if (s) spinT += DT;
    tcMin = Math.min(tcMin, p.tcK);
    if (!t160 && p.speed * 3.6 >= 160) t160 = t; if (!t200 && p.speed * 3.6 >= 200) t200 = t;
    const gr = gearRow[p.gear] ||= { n: 0, g: 0, flips0: flips, kmh0: p.speed * 3.6 }; gr.n++; gr.g = Math.max(gr.g, g); gr.flips = flips - gr.flips0; gr.kmh = p.speed * 3.6;
    if (TR && Math.round(t * 120) % 3 === 0 && t < 4) console.log(`${t.toFixed(3)} v${(p.speed * 3.6).toFixed(0)} g${p.gear} rpm${p.rpm.toFixed(0)} gripR${g.toFixed(2)} κ${(p.ks[2]).toFixed(3)},${(p.ks[3]).toFixed(3)} tcK${p.tcK.toFixed(2)} spin${(p.spin || 0).toFixed(2)} N${Math.round(p.wheelLoad[2])},${Math.round(p.wheelLoad[3])}`);
  }
  console.log(`${id.padEnd(10)} ${preset} ${auto ? 'auto' : 'manual'}: squeal flips ${flips} (on ${onT.toFixed(1)} s), spin flips ${spinFlips} (${spinT.toFixed(1)} s), TC min ${tcMin.toFixed(2)}, 40-160 ${t160.toFixed(2)} s, 40-200 ${t200.toFixed(2)} s | by gear: ${Object.entries(gearRow).map(([k, r]) => `${k}:${r.kmh0.toFixed(0)}-${r.kmh.toFixed(0)}km/h peak${r.g.toFixed(2)} flips${r.flips}`).join('  ')}`);
}
