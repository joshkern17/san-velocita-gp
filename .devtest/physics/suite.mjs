// Physics test suite: the scenarios every physics change is checked against (plain node, no browser).
//
//   node .devtest/physics/suite.mjs           run, and compare with baseline.json (prints what moved)
//   node .devtest/physics/suite.mjs --save    run, and save the results as the new baseline
//   node .devtest/physics/suite.mjs --only=stop,exit   just some groups
//
// Every number is a measurement of the physics in js/physics.js driving a car through a scripted manoeuvre (no AI,
// no track: a flat open plane). docs/PHYSICS.md says what each one should look like and why.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CarPhysics } from '../../js/physics.js';
import { CARS } from '../../js/cars.js';
import { physAids, PRESETS } from '../../js/aids.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, 'baseline.json');
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const ENV = { mu: 1, extraDrag: 0, gF: 0, gL: 0 }, DT = 1 / 240;

// a car on the open plane: id, aids (preset name or partial override), start speed, gear, tyre
function car(id, { aids = {}, v = 0, gear = 1, tyre = 'medium' } = {}) {
  const p = new CarPhysics(CARS[id].spec);
  p.setAids(physAids({ ...PRESETS.standard.aids, ...aids }));
  p.fitTyres(tyre); p.place(0, 0, 0); p.vz = v; p.gear = gear;
  return p;
}
// drive for T seconds: ctl(t, p) -> controls; each(t, p) called every step
function drive(p, T, ctl, each) {
  for (let i = 0; i < T / DT; i++) {
    const t = i * DT;
    p.step(DT, { brake: 0, throttle: 0, steer: 0, handbrake: 0, analog: true, pad: true, ...ctl(t, p) }, ENV);
    if (each && each(t, p) === false) break;
  }
  return p;
}
const deg = (r) => +(r * 57.2958).toFixed(1), r2 = (x) => +x.toFixed(2), r1 = (x) => +x.toFixed(1);

const GROUPS = {
  // lateral g and slip angles at a steer sweep (holding ~108 km/h): how much grip, which end gives up first
  corner() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'f1']) for (const st of [0.15, 0.3, 0.6]) {
      const V = id === 'f1' ? 50 : 30; let lat = 0, n = 0;
      const p = drive(car(id, { v: V, gear: 3 }), 4, (t, p) => ({ steer: st, throttle: p.speed < V ? 0.6 : 0.2 }), (t, p) => { if (t > 3) { lat += Math.abs(p.latG); n++; } });
      out[`${id} steer ${st}`] = { g: r2(lat / n), slipF: deg(p.slipF), slipR: deg(p.slipR) };
    }
    return out;
  },
  // straight-line stops from 126 km/h: ABS, a stamp without ABS (locks), a squeeze without ABS
  stop() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'f1']) for (const [abs, b] of [['on', 1], ['off', 1], ['off', 0.7]]) {
      let lock = 0;
      const p = drive(car(id, { aids: { abs }, v: 35, gear: 4 }), 8, () => ({ brake: b }), (t, p) => { if (p.lockF || p.lockR) lock += DT; if (t > 0.1 && p.speed < 0.5) return false; });
      out[`${id} ABS ${abs} brake ${b}`] = { m: r1(Math.hypot(p.x, p.z)), lockedS: r2(lock) };
    }
    return out;
  },
  // braking hard while turning in from 115 km/h: how far it turns, how much the rear steps out
  brakeTurn() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'aventus', 'f1']) for (const abs of ['on', 'off']) {
      let maxB = 0;
      const p = drive(car(id, { aids: { abs }, v: 32, gear: 3 }), 1.4, (t) => ({ brake: 1, steer: t > 0.2 ? 0.5 : 0 }), (t, p) => { maxB = Math.max(maxB, Math.abs(p.beta)); });
      out[`${id} ABS ${abs}`] = { headingDeg: deg(Math.abs(p.h)), maxSlideDeg: deg(maxB) };
    }
    return out;
  },
  // 0-100 km/h with traction control high / low / off
  launch() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'gtr', 'f1']) for (const tc of ['high', 'low', 'off']) {
      let t100 = 0;
      drive(car(id, { aids: { tc } }), 15, () => ({ throttle: 1 }), (t, p) => { if (p.speed >= 27.78) { t100 = t; return false; } });
      out[`${id} TC ${tc}`] = { s: r2(t100) };
    }
    return out;
  },
  // a corner exit the way a player drives it: unwind the steering while squeezing the throttle on. Max slide, swings
  exit() {
    const out = {};
    for (const id of ['m1procar', 'jsport', 'mustang', 'rs964', 'f1']) for (const [tc, stab] of [['high', 'on'], ['low', 'on'], ['off', 'on'], ['off', 'off']]) for (const V of [15, 25]) {
      let maxB = 0, flips = 0, last = 0;
      drive(car(id, { aids: { tc, stab }, v: V, gear: V < 20 ? 2 : 3, tyre: 'soft' }), 3.5, (t) => ({
        steer: t < 1 ? 0.45 : Math.max(0, 0.45 * (1 - (t - 1) / 1.5)), throttle: t < 1 ? 0.3 : Math.min(1, 0.3 + (t - 1) / 0.6 * 0.7),
      }), (t, p) => { if (t > 1) { maxB = Math.max(maxB, Math.abs(p.beta)); const sg = Math.sign(p.beta); if (Math.abs(p.beta) > 0.02 && sg !== last) { if (last) flips++; last = sg; } } });
      out[`${id} TC ${tc} SC ${stab} ${Math.round(V * 3.6)}km/h`] = { maxSlideDeg: deg(maxB), swings: flips };
    }
    return out;
  },
  // braking while turning into a fast kink at 245 km/h, then power; and an ordinary trail-brake at 126 km/h
  kink() {
    const out = {};
    for (const id of ['m1procar', 'aventus', 'bx300', 'rmx', 'jsport', 'mustang']) {
      const run = (V, st, bT, T) => { let m = 0; drive(car(id, { v: V, gear: V > 50 ? 5 : 3, tyre: 'soft' }), T, (t) => (t < bT ? { steer: t > 0.2 || bT > 1 ? st : 0, brake: 1 } : { steer: st, throttle: 1 }), (t, p) => { m = Math.max(m, Math.abs(p.beta)); }); return deg(m); };
      out[id] = { fastKinkDeg: run(68, 0.25, 0.6, 2.4), trailBrakeDeg: run(35, 0.5, 1.4, 1.4) };
    }
    return out;
  },
  // a hard lane-change flick at speed, then hands off: does it settle, or keep yawing / oscillate
  stability() {
    const out = {};
    for (const id of Object.keys(CARS)) for (const V of [25, 50, 75]) {
      const s = CARS[id].spec; if (V > s.gears[s.gears.length - 1] * 0.95) continue;
      let maxB = 0, after = 0, flips = 0, last = 0, nan = false;
      drive(car(id, { v: V, gear: Math.max(1, s.gears.findIndex(g => g > V)) }), 4, (t) => ({ steer: t < 0.35 ? 0.5 : t < 0.7 ? -0.5 : 0, throttle: 0.5 }), (t, p) => {
        if (isNaN(p.x)) { nan = true; return false; }
        maxB = Math.max(maxB, Math.abs(p.beta));
        if (t > 1.2) { after = Math.max(after, Math.abs(p.r)); const sg = Math.sign(p.r); if (Math.abs(p.r) > 0.02 && sg !== last) { flips++; last = sg; } }
      });
      out[`${id} ${Math.round(V * 3.6)}km/h`] = { maxSlideDeg: deg(maxB), yawAfter: r2(after), flips, nan };
    }
    return out;
  },
  // a handbrake flick at 79 km/h then counter-steer and lift: slide angle at release and after
  flick() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'rs964']) {
      const at = {};
      drive(car(id, { aids: { tc: 'off' }, v: 22, gear: 2 }), 1.6, (t) => (t < 0.6 ? { steer: 0.6, throttle: 1, handbrake: t > 0.3 ? 1 : 0 } : { steer: -0.5 }), (t, p) => { for (const k of [0.6, 1.0, 1.5]) if (Math.abs(t - k) < DT / 2) at[`${k}s`] = deg(p.beta); });
      out[id] = at;
    }
    return out;
  },
  // a held drift after a handbrake flick: fixed counter-steer, steady throttle (TC high = its drift mode)
  drift() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar']) for (const tc of ['high', 'off']) for (const thr of [0.5, 1]) {
      const at = {};
      drive(car(id, { aids: { tc }, v: 22, gear: 2 }), 3.2, (t) => (t < 0.6 ? { steer: 0.6, throttle: 1, handbrake: t > 0.3 ? 1 : 0 } : { steer: -0.3, throttle: thr }), (t, p) => { for (const k of [1.1, 2.1, 3.1]) if (Math.abs(t - k) < DT / 2) at[`${k}s`] = `${deg(p.beta)}° ${r1(p.speed)}m/s`; });
      out[`${id} TC ${tc} thr ${thr}`] = at;
    }
    return out;
  },
  // a drift held by a driver (closed loop, after a handbrake flick): counter-steer toward zero front slip, more when
  // past the target angle; throttle up when under it. Can it be held for the whole run, at what angle, speed, g?
  // (stage 3 removed the drift carve / push cheats: a held drift corners a little under grip driving, and slows)
  driftHold() {
    const out = {};
    for (const id of ['jsport', 'mustang', 'm1procar', 'aventus', 'testarossa', 'm5']) for (const tc of ['off', 'high']) {
      const p = car(id, { aids: tc === 'off' ? { tc: 'off', stab: 'off', cs: 'off' } : {}, v: 22, gear: 2 });
      let s = 0, held = 0, spun = false, sv = 0, sb = 0, sr = 0, n = 0, ie = 0;
      drive(p, 8, (t, p) => {
        if (t < 0.6) return { steer: 0.6, throttle: 1, handbrake: t > 0.3 ? 1 : 0 };
        if (!s) s = Math.sign(p.beta) || 1;
        const e = p.beta * s - 0.45; ie += e * DT;
        const zs = Math.atan2(p.v + p.p.a * p.r, Math.max(Math.abs(p.u), 4)), dd = zs + s * (0.6 * e - 0.1 * p.r * s - 0.08);
        return { steer: Math.max(-1, Math.min(1, -dd / (p.p.maxSteer * 1.25))), throttle: Math.max(0, Math.min(1, 0.5 - e - 0.2 * ie)), pad: false };
      }, (t, p) => {
        if (t <= 1.2) return; const b = p.beta * s;
        if (Math.abs(p.beta) < 0.12) return false; if (b > 1.3) { spun = true; return false; }
        held = t - 1.2; sv += p.speed; sb += b; sr += Math.abs(p.r); n++;
      });
      const v = sv / Math.max(1, n), r = sr / Math.max(1, n);
      out[`${id} TC ${tc}`] = { heldS: r1(held), spun, angleDeg: deg(sb / Math.max(1, n)), kmh: Math.round(v * 3.6), g: r2(v * r / 9.81) };
    }
    return out;
  },
  // the aero map: front share of the downforce cruising at ~230 km/h, braking hard, then on full power (the balance
  // moves forward as the nose dips), and total downforce over kd·u² (≈ 1 at the reference ride height)
  aero() {
    const out = {};
    for (const id of ['f1', 'm1procar', 'aventus']) {
      const p = car(id, { v: 64, gear: 5 }), at = {};
      drive(p, 3.5, (t) => ({ brake: t > 1.5 && t < 2.5 ? 1 : 0, throttle: t > 1.5 && t < 2.5 ? 0 : t > 2.5 ? 1 : 0.6 }), (t, p) => {
        for (const [k, tk] of [['cruise', 1.4], ['braking', 1.8], ['power', 3.3]]) if (Math.abs(t - tk) < DT / 2) at[k] = `${(p.Df / (p.Df + p.Dr) * 100).toFixed(1)}% x${((p.Df + p.Dr) / (p.p.kd * p.u * p.u)).toFixed(2)}`;
      });
      out[id] = at;
    }
    return out;
  },
  // what the pad's grip rumble reads (share of grip used, slip past the peak) in everyday situations
  grip() {
    const out = {};
    const cases = {
      'cruise 100 km/h': [28, () => ({ throttle: 0.35 }), 3], 'brisk corner': [28, (t, p) => ({ throttle: p.speed < 28 ? 0.5 : 0.3, steer: 0.15 }), 4],
      'on the limit': [28, (t, p) => ({ throttle: p.speed < 28 ? 0.5 : 0.3, steer: 0.25 }), 4], 'understeer': [28, (t, p) => ({ throttle: p.speed < 28 ? 0.5 : 0.3, steer: 0.6 }), 4],
      'power out of a slow corner': [12, () => ({ throttle: 1, steer: 0.35 }), 2.5],
    };
    for (const [k, [V, ctl, T]] of Object.entries(cases)) {
      let uf = 0, ur = 0, gf = 0, gr = 0;
      drive(car('jsport', { v: V, gear: 3 }), T, ctl, (t, p) => { if (t > T - 1) { uf = Math.max(uf, p.useF); ur = Math.max(ur, p.useR); gf = Math.max(gf, p.gripF); gr = Math.max(gr, p.gripR); } });
      out[k] = { useF: r2(uf), useR: r2(ur), slipF: r2(gf), slipR: r2(gr) };
    }
    return out;
  },
  // cost: ms per simulated minute of driving (one car)
  speed() {
    // (warmed up first, on a minute of the same driving: otherwise this mostly measures the JIT compiling the code)
    const p = car('mustang', { v: 40, gear: 4 });
    for (let k = 0; k < 2; k++) drive(p, 60, (t) => ({ throttle: 0.7, brake: Math.sin(t * 0.8) > 0.8 ? 1 : 0, steer: Math.sin(t) * 0.3 }));
    const t0 = performance.now();
    drive(p, 60, (t) => ({ throttle: 0.7, brake: Math.sin(t * 0.8) > 0.8 ? 1 : 0, steer: Math.sin(t) * 0.3 }));
    return { msPerMinute: Math.round(performance.now() - t0) };
  },
};

const results = {};
for (const [k, fn] of Object.entries(GROUPS)) if (!only.length || only.includes(k)) results[k] = fn();

if (args.includes('--save')) { writeFileSync(BASE, JSON.stringify(results, null, 1)); console.log('saved baseline:', Object.keys(results).join(', ')); process.exit(0); }

// compare with the baseline: print every number that moved more than a little (speed is just reported)
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;
let moved = 0;
const walk = (a, b, path) => {
  if (typeof a === 'object' && a) { for (const k of Object.keys(a)) walk(a[k], b ? b[k] : undefined, path + ' / ' + k); return; }
  if (path.startsWith('speed')) return;
  const changed = typeof a === 'number' ? b === undefined || Math.abs(a - b) > Math.max(0.05 * Math.abs(b), Math.abs(b) < 3 ? 0.04 : 0.6) : a !== b;
  if (changed) { moved++; console.log(`  ${path.slice(3)}: ${b === undefined ? '(new)' : b} -> ${a}`); }
};
for (const [k, v] of Object.entries(results)) {
  console.log(`== ${k}`);
  if (k === 'speed') { console.log(`  ${v.msPerMinute} ms per simulated minute (baseline ${base?.speed?.msPerMinute ?? '?'})`); continue; }
  if (!base || !base[k]) { console.log(JSON.stringify(v, null, 1)); continue; }
  const before = moved; walk(v, base[k], ''); if (moved === before) console.log('  (unchanged)');
}
if (base) console.log(moved ? `\n${moved} numbers moved from the baseline: check them against the targets in docs/PHYSICS.md` : '\nall unchanged from the baseline');
