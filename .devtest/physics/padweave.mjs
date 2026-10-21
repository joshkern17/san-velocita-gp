// Controller weave on a straight: a pad driver holding a line at speed with a wobbly thumb (smoothed noise, seeded),
// old pad steering (__padOld) vs new. Reports the car's yaw-rate wobble, its slip angle and how far it wanders off
// the line: lower = steadier.   node .devtest/physics/padweave.mjs [cars] [km/h] [noise]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';
const ids = (process.argv[2] || 'civic,m5,m1procar,f1').split(','), kmhs = (process.argv[3] || '150,220,290').split(',').map(Number), NZ = +(process.argv[4] || 0.12);
const DT = 1 / 120, ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 };
const run = (id, kmh, old, seed) => {
  globalThis.__padOld = old ? 1 : 0;
  let rs = seed; const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const p = new CarPhysics(CARS[id].spec); p.setAids(physAids(PRESETS.standard.aids)); p.fitTyres('medium'); p.place(0, 0, 0);
  const vt = kmh / 3.6; let t = 0;
  for (; t < 40 && p.speed < vt; t += DT) p.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0, analog: true, pad: true }, ENV);
  if (p.speed < vt - 1) return null;
  let nz = 0, r2 = 0, b2 = 0, off2 = 0, offMax = 0, n = 0;
  for (let k = 0; k < 8 / DT; k++) {
    // (the driver: aims back at the line 40 m ahead, a human's ~0.15 s reaction, plus the thumb's wobble at a few Hz)
    if (k % 12 === 0) nz += (rnd() * NZ - nz) * 0.6;
    const lat = p.x, aim = Math.atan2(-lat, 40) - p.h;
    let sx = Math.max(-1, Math.min(1, -aim * 4 + nz)); const steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
    const e = vt - p.speed;
    p.step(DT, { throttle: Math.max(0, Math.min(1, e * 0.8)), brake: 0, steer, handbrake: 0, analog: true, pad: true, lag: 0.05 }, ENV);
    if (k * DT > 1) { r2 += p.r * p.r; b2 += p.beta * p.beta; off2 += p.x * p.x; offMax = Math.max(offMax, Math.abs(p.x)); n++; }
  }
  return { r: Math.sqrt(r2 / n) * 57.3, b: Math.sqrt(b2 / n) * 57.3, off: Math.sqrt(off2 / n), offMax };
};
for (const id of ids) for (const kmh of kmhs) {
  const out = [];
  for (const old of [1, 0]) {
    const a = { r: 0, b: 0, off: 0, offMax: 0 }; let n = 0;
    for (const seed of [1, 2, 3, 4, 5]) { const m = run(id, kmh, old, seed); if (!m) continue; for (const k in a) a[k] += m[k]; n++; }
    if (!n) { out.push('--'); continue; }
    out.push(`${old ? 'old' : 'new'} yaw ${(a.r / n).toFixed(2)}°/s slip ${(a.b / n).toFixed(2)}° off-line ${(a.off / n).toFixed(2)} m (max ${(a.offMax / n).toFixed(2)})`);
  }
  console.log(`${id.padEnd(9)} ${String(kmh).padStart(3)} km/h  ${out.join('  |  ')}`);
}
