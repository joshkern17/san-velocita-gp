// dev: a car round a half-mile oval in plain node (~1-2 s), driven by the race AI's own steering + throttle rules
// (race.js: pure pursuit damped by the yaw rate, the throttle / slip easing, the plan's braking curve), on dirt or
// tarmac, flat or banked. For each corner speed the plan asks for, it laps; the fastest that holds the track (no
// spin, never off the road) is the car's lap. Prints that lap and how it drove it.
//   node .devtest/physics/sprintoval.mjs [id] [bank°] [surface dirt|tarmac] [key=value spec overrides...]
import { CarPhysics, LOCK_K } from '../../js/physics.js';
import { CARS, ARCHIVED } from '../../js/cars.js';
import { AI_AIDS } from '../../js/aids.js';

const [id = 'sprint410', bankArg = '0', surf = 'dirt', ...over] = process.argv.slice(2);
const ALL = { ...ARCHIVED, ...CARS }, spec = { ...ALL[id].spec };
for (const kv of over) { const [k, v] = kv.split('='); spec[k] = JSON.parse(v); }
const PAD = process.env.DRIVER === 'pad', BANK = +bankArg * Math.PI / 180, DIRT = surf === 'dirt', GRIP = DIRT ? 0.68 : 1, DRAG = DIRT ? 18 : 0;
const RC = 95, LS = (805 - 2 * Math.PI * RC) / 2, W = 15, DS = 1;   // turns' radius (the line), straights, track width
// the oval's centre line, anticlockwise (left turns): straight up +z from (0,0), a half circle to the left, back down
const P = [];
const seg = (n, f) => { for (let i = 0; i < n; i++) P.push(f(i / n)); };
seg(LS, t => ({ x: 0, z: t * LS, h: 0, k: 0 }));
seg(Math.round(Math.PI * RC), t => { const a = t * Math.PI; return { x: RC - RC * Math.cos(a), z: LS + RC * Math.sin(a), h: a, k: 1 / RC }; });
seg(LS, t => ({ x: 2 * RC, z: LS - t * LS, h: Math.PI, k: 0 }));
seg(Math.round(Math.PI * RC), t => { const a = t * Math.PI; return { x: RC + RC * Math.cos(a), z: -RC * Math.sin(a), h: Math.PI + a, k: 1 / RC }; });
const N = P.length, L = N * DS;
// a point's heading as the car's convention: velocity (sin h, cos h) in x/z, left = +x when h = 0
for (const p of P) { p.sh = Math.sin(p.h); p.ch = Math.cos(p.h); }
const aBk = spec.mu * GRIP * 1.05, kdm = spec.kd / spec.mass;

function lap(vc) {
  // the plan: vc in the turns, the car's top on the straights, braked down to the turns on the AI's curve
  const vmax = spec.gears[spec.gears.length - 1] * 0.99, V = P.map(p => p.k ? vc : vmax);
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const nx = V[(i + 1) % N]; V[i] = Math.min(V[i], Math.sqrt(nx * nx + 2 * aBk * (9.81 + kdm * nx * nx) * DS)); }
  const c = new CarPhysics(spec); c.setAids(AI_AIDS); c.isAI = !PAD; c.fitTyres(DIRT ? 'dirt' : 'medium'); c.onDirt = DIRT;
  c.place(0, 0, 0); c.vz = vc; c.h = 0;
  let idx = 0, lapN = 0, lapT = 0, t = 0, best = Infinity, maxE = 0, turnB = 0, turnN = 0, maxB = 0, tcSum = 0, nS = 0, weave = 0, lastB = 0;
  const okS = spec.slideOK ?? 0, okG = okS / (spec.slipPeakR ?? spec.slipPeak ?? 0.169), DT = 1 / 120;
  for (; t < 70 && lapN < 4; t += DT) {
    // nearest centre-line point (local search)
    let bi = idx, bd = 1e9; for (let k = -6; k <= 12; k++) { const j = (idx + k + N) % N, d = (P[j].x - c.x) ** 2 + (P[j].z - c.z) ** 2; if (d < bd) { bd = d; bi = j; } }
    if (bi < idx - N / 2) { lapN++; if (lapN > 1) best = Math.min(best, t - lapT); lapT = t; }
    idx = bi;
    const p = P[idx], e = (c.x - p.x) * p.ch - (c.z - p.z) * p.sh;   // across the line (+ = left of it)
    // AI steering: pure pursuit damped by the yaw rate (race.js)
    const u = c.u, Ld = 5 + Math.abs(u) * 0.26, j = (idx + Math.round(Ld / DS)) % N, q = P[j];
    const dx = q.x - c.x, dz = q.z - c.z, sn = Math.sin(c.h), cs = Math.cos(c.h);
    const fwd = dx * sn + dz * cs, left = dx * cs - dz * sn, alpha = Math.atan2(left, fwd), kap = 2 * Math.sin(alpha) / Ld;
    const delta = Math.atan(spec.L * kap) - 0.6 * spec.L * (c.r - u * kap) / Math.max(Math.abs(u), 5);
    const maxLock = spec.maxSteer / (1 + Math.abs(u) * LOCK_K);
    let steer = Math.max(-1, Math.min(1, -delta / maxLock));
    if (PAD) {   // (DRIVER=pad: .devtest/padrun.mjs's pad driver: the stick at the line ahead, counter-steering what it sees)
      const la2 = (idx + Math.round((8 + c.speed * 0.35) / DS)) % N, q2 = P[la2], dx2 = q2.x - c.x, dz2 = q2.z - c.z;
      const l2 = dx2 * cs - dz2 * sn, f2 = dx2 * sn + dz2 * cs, sx = Math.max(-1, Math.min(1, -Math.atan2(l2, f2) * 2.5 + (c.beta || 0) * 1.2));
      steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
    } else if (c.speed > 8 && Math.abs(c.beta || 0) < 0.12) {
      const zs = Math.atan2(u * Math.tan(c.beta || 0) + spec.a * c.r, Math.max(Math.abs(u), 4)), pk = (spec.slipPeak ?? 0.169) * 1.05;
      const want = -steer * maxLock, held = Math.max(zs - pk, Math.min(zs + pk, want)); if (held !== want) steer = Math.max(-1, Math.min(1, -held / maxLock));
    }
    // AI throttle on the plan (looked at a little ahead), easing for the rear's slip and grip
    const la = (idx + Math.round((6 + u * 0.3) / DS)) % N, err = V[la] - u;
    let thr = err > 0 ? Math.min(1, 0.3 + err * 0.35) : 0, brk = err < -0.6 ? Math.min(1, -err * 0.4) : 0;
    if (PAD) { thr = u < V[la] ? 1 : 0; brk = u > V[la] + 2 ? 1 : 0; }
    if (!PAD && (c.slipR || 0) > 0.14 + 0.6 * okS) thr *= 0.6;
    const rearOver = (c.gripR || 0) - okG - Math.max(0.9, c.gripF || 0); if (!PAD && rearOver > 0) thr *= Math.max(0.25, 1 - rearOver * 4);
    // banking: gravity's component down the slope, toward the inside of the turn (left), in the turns
    const gL = p.k ? 9.81 * Math.sin(BANK) : 0;
    c.step(DT, { steer, throttle: thr, brake: brk, handbrake: 0, analog: true, pad: PAD, lag: 0.05 }, { mu: GRIP, extraDrag: DRAG, gF: 0, gL });
    if (Math.abs(c.beta) > 1.0 || Math.abs(e) > W / 2 + 1) {   // (spun, or off the road)
      if (process.env.WHY) console.log(`  vc ${vc}: ${Math.abs(c.beta) > 1 ? 'spun' : 'off ' + (e > 0 ? 'inside' : 'outside')} at ${t.toFixed(1)} s, ${p.k ? 'turn' : 'straight'} m${idx} v${c.speed.toFixed(0)} β${(c.beta * 57.3).toFixed(0)} steer${steer.toFixed(2)} thr${thr.toFixed(2)} brk${brk.toFixed(2)} gripF${(c.gripF || 0).toFixed(2)} gripR${(c.gripR || 0).toFixed(2)} tc${c.tcK.toFixed(2)}`);
      return null;
    }
    if (lapN >= 1) {
      maxE = Math.max(maxE, Math.abs(e)); tcSum += c.tcK; nS++;
      if (p.k) { turnB += Math.abs(c.beta); turnN++; maxB = Math.max(maxB, Math.abs(c.beta)); }
      else if (Math.sign(c.beta) !== Math.sign(lastB) && Math.abs(c.beta) > 0.05) weave++;
      if (Math.abs(c.beta) > 0.05) lastB = c.beta;
    }
  }
  if (!isFinite(best)) return null;
  return { vc, lap: +best.toFixed(2), 'turn slide°': +(turnB / turnN * 57.3).toFixed(1), 'max slide°': +(maxB * 57.3).toFixed(0), 'max off line m': +maxE.toFixed(1), 'tc mean': +(tcSum / nS).toFixed(2), 'straight weaves/lap': +(weave / 3).toFixed(1) };
}
let best = null;
for (let vc = 26; vc <= 62; vc += 1) { const r = lap(vc); if (r && (!best || r.lap < best.lap)) best = r; else if (!r && best) break; }
console.log(id, `oval ${Math.round(L)} m (turns R${RC}), ${DIRT ? 'dirt' : 'tarmac'}, bank ${bankArg}°:`, best ? { ...best, 'turn mph': Math.round(best.vc * 2.237) } : 'never made a clean lap');
