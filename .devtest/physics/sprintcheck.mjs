// dev: the sprint car on a flat dirt plane (plain node, ~1 s): straight-line pace, what the stagger does with the wheel
// straight, and the fastest it holds a circle the size of a half-mile's turns (how sideways, how much counter-steer).
//   node .devtest/physics/sprintcheck.mjs [id] [R m] [aids: standard|off] [key=value spec overrides...]
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';

const [id = 'sprint410', Rarg = '85', aidArg = 'standard', ...over] = process.argv.slice(2);
const RAD = +Rarg, DT = 1 / 240;
const spec = { ...CARS[id].spec };
for (const kv of over) { const [k, v] = kv.split('='); spec[k] = JSON.parse(v); }
const DIRT = { mu: 0.68, extraDrag: 18, gF: 0, gL: 0 };      // (race.js SURFACES.dirt)
const aids = aidArg === 'off' ? { abs: false, tc: 0, stab: false, cs: 0, steer: false, brake: false } : physAids({ ...PRESETS.standard.aids });
function mk(s = spec, v = 0) { const p = new CarPhysics(s); p.setAids(aids); p.fitTyres('dirt'); p.onDirt = true; p.place(0, 0, 0); p.vz = v; return p; }
const ctl = (o) => ({ throttle: 0, brake: 0, steer: 0, handbrake: 0, analog: true, ...o });
const out = {};

// 1. straight line
// (a driver holding it straight: steering against the heading's drift, as a sprint car's driver holds right lock against
// the stagger)
const hold = (p) => Math.max(-1, Math.min(1, p.h * 3 + p.r * 0.6 + (p.beta || 0) * 0.8));
{ const p = mk(); let t = 0, t60 = 0, t100 = 0;
  for (; t < 40; t += DT) { p.step(DT, ctl({ throttle: 1, steer: hold(p) }), DIRT); if (!t60 && p.speed > 26.82) t60 = t; if (!t100 && p.speed > 44.7) t100 = t; }
  out.straight = { '0-60mph s': +t60.toFixed(2), '0-100mph s': +t100.toFixed(2), 'top mph (40 s)': Math.round(p.speed * 2.237) }; }
// distance to 60 / 100 mph matters on a 200 m straight: speed after 200 m from 45 m/s (a corner exit)
{ const p = mk(spec, 45); let d = 0, sw = 0, n = 0; for (let t = 0; t < 10 && d < 200; t += DT) { p.step(DT, ctl({ throttle: 1, steer: hold(p) }), DIRT); d += p.speed * DT; sw += p.delta; n++; }
  out.straight['right lock held on the straight deg'] = +(-sw / n * 57.3).toFixed(1);
  out.straight['200 m from 100 mph -> mph'] = Math.round(p.speed * 2.237); }

// 2. the stagger, wheel straight, holding 40 m/s: which way it turns, how hard
for (const st of [spec.stagger ?? 0, 0]) {
  const s2 = { ...spec, stagger: st }, p = mk(s2, 40); let h0 = 0;
  for (let t = 0; t < 4; t += DT) { p.step(DT, ctl({ throttle: p.speed < 40 ? 0.6 : 0.3 }), DIRT); if (t < DT) h0 = p.h; }
  out['stagger ' + Math.round(st / 0.0254) + '"'] = { 'yaw deg/s (+ left)': +(p.r * 57.3).toFixed(1), 'heading change 4 s deg': +((p.h - h0) * 57.3).toFixed(0) };
}

// 3. hold a circle of radius RAD (left-hander) at speed V: pure pursuit on the circle, throttle on speed
function circle(V) {
  const p = mk(spec, V * 0.9);
  // start on the circle centred at (-RAD, 0) (heading +z, turning left: toward -x... +x is the car's left)
  p.place(0, 0, 0); p.vz = V * 0.9; const cx = RAD, cz = 0;   // (left = +x in this physics: centre to the left)
  let n = 0, lat = 0, beta = 0, steer = 0, err = 0, maxErr = 0, spun = false, vs = 0;
  for (let t = 0; t < 10; t += DT) {
    const dx = p.x - cx, dz = p.z - cz, r = Math.hypot(dx, dz), e = r - RAD;
    const a = Math.atan2(dz, dx) - 12 / RAD;                     // a point 12 m ahead round the circle (counter-clockwise from above = left)
    const tx = cx + RAD * Math.cos(a), tz = cz + RAD * Math.sin(a), lx = tx - p.x, lz = tz - p.z;
    const left = lx * Math.cos(p.h) - lz * Math.sin(p.h), fwd = lx * Math.sin(p.h) + lz * Math.cos(p.h);
    const st = Math.max(-1, Math.min(1, -Math.atan2(left, fwd) * 2.2 + (p.beta || 0) * 1.0));
    p.step(DT, ctl({ steer: st, throttle: Math.max(0, Math.min(1, (V - p.speed) * 0.6 + 0.35)), brake: p.speed > V + 3 ? 0.3 : 0 }), DIRT);
    if (Math.abs(p.beta) > 0.9) { spun = true; break; }
    if (t > 5) { n++; vs += p.speed; lat += Math.abs(p.latG); beta += p.beta; steer += p.delta; err += Math.abs(e); maxErr = Math.max(maxErr, Math.abs(e)); }
  }
  // (held = on the circle AND at the speed asked: a car that can't hold V slows down, and that's not holding it)
  return spun || !n ? null : { V: +(vs / n).toFixed(1), g: +(lat / n).toFixed(2), 'v²/R g': +((vs / n) ** 2 / RAD / 9.81).toFixed(2), 'slip deg': +(beta / n * 57.3).toFixed(1), 'road wheel deg': +(steer / n * 57.3).toFixed(1), 'off line m': +(err / n).toFixed(1), held: maxErr < 4 && vs / n > V - 1.5 };
}
let best = null;
for (let V = 30; V <= 70; V += 1) { const r = circle(V); if (r && r.held) best = r; else if (best && (!r || !r.held)) break; }
out[`circle R${RAD} (flat dirt)`] = best ? { ...best, mph: Math.round(best.V * 2.237) } : 'never held';
// 4. steady cornering on dirt (as setup.js's quick test, a left-hander): speed held, the steering stepped up, 3 s each;
// what it settles at: lateral g, slide angle, balance (rear grip use - front: > 0 the rear's working harder, loose).
// Stops at a spin (past 40° of slide)
function sweep(V) {
  let best = null;
  // (from right lock to left: a staggered car turns tighter than the speed allows on its own and wants counter-steer;
  // - steer = right lock)
  for (const st of [-0.5, -0.4, -0.3, -0.22, -0.15, -0.1, -0.05, 0, 0.03, 0.06, 0.1, 0.15, 0.2, 0.27, 0.35, 0.45, 0.6, 0.8]) {
    const p = mk(spec, V); let g = 0, b = 0, bal = 0, n = 0, spun = false, minV = V;
    for (let t = 0; t < 3; t += DT) {
      p.step(DT, ctl({ steer: -st, throttle: Math.max(0, Math.min(1, (V - p.speed) * 0.8 + 0.4)) }), DIRT);
      if (Math.abs(p.beta) > 0.7) { spun = true; break; }
      if (t > 2) { g += p.r * p.speed / 9.81; b += Math.abs(p.beta); bal += p.useR - p.useF; n++; minV = Math.min(minV, p.speed); }   // (g: the turn to the left, yaw rate × speed)
    }
    if (spun) { if (best) return { ...best, spunAt: st }; continue; }   // (too much right lock: not turning in yet)
    const r = { steer: st, g: +(g / n).toFixed(2), 'slide deg': +(b / n * 57.3).toFixed(1), bal: +(bal / n).toFixed(2), v: +minV.toFixed(0) };
    if (r.g < 0.2) continue;                                              // (not turning left: too much right lock)
    if (r.v < V - 2) { if (!best) continue; break; }                     // (can't hold the speed: too far round)
    if (!best || r.g > best.g) best = r; else if (r.g < best.g * 0.97) break;
  }
  return best;
}
for (const V of [30, 40, 48]) out[`steady corner ${V} m/s (${Math.round(V * 2.237)} mph)`] = sweep(V);
console.log(JSON.stringify(out, null, 1));
