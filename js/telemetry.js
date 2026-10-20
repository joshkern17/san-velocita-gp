// Lap telemetry: what your car did at every track sample (every 2 m) of a lap, a reference lap to hold it against,
// and a corner-by-corner analysis with coaching notes (the Lap Review screen in the pit garage).
//
// A lap = { time, valid, lap, mode, car, tyre, when, ch: { t, v, thr, brk, steer, gear, lat, sf, sr, s, aid } } with every
// channel a Float32Array over the track samples: t = seconds into the lap, v = m/s, thr / brk 0..1, steer -1..1,
// lat = lateral g, sf / sr = front / rear slip as a share of the tyre's peak (over 1 = past the grip), s = metres off
// the centre line, h = heading (rad, unwrapped), aid = bits of what stepped in (AID_BITS). s + h place the ghost car.

export const CH = ['t', 'v', 'thr', 'brk', 'steer', 'gear', 'lat', 'sf', 'sr', 's', 'h', 'aid'];
export const AID_BITS = { abs: 1, tc: 2, stab: 4, cs: 8, brake: 16, steer: 32, lock: 64, off: 128, hit: 256 };

// the laps you've driven this run of the game, per circuit + car (practice laps are still there in qualifying)
const STORE = new Map();
export const lapKey = (track, T, carId) => `${track.name}|${Math.round(T.L)}|${carId}`;
export const lapsFor = (key) => STORE.get(key) || [];
export const bestLap = (key) => lapsFor(key).reduce((b, l) => (l.valid && (!b || l.time < b.time) ? l : b), null);
export function addLap(key, lap) {
  const list = STORE.get(key) || [];
  list.push(lap);
  if (list.length > 30) list.shift();
  STORE.set(key, list);
  if (lap.valid) savePB(key, lap);
}

// ---------------- recording ----------------
export class LapRecorder {
  constructor(T) { this.T = T; this.cur = null; }
  begin(start) {
    const N = this.T.N;
    this.cur = { start, n: 0, hits: -1 };
    for (const c of CH) this.cur[c] = new Float32Array(N).fill(NaN);
  }
  // every frame the player is on a timed lap (start: when the lap began; a new start begins a new lap)
  sample(car, raceTime, start = car.lapStart) {
    if (!this.cur || this.cur.start !== start) this.begin(start);
    const L = this.cur, i = car.idx, p = car.phys, P = p.p, T = this.T;
    if (T.open && i > T.finish) return;
    // (past the line again: the first samples belong to this lap, not the start of the next)
    if (L.n && i < L.last - T.N / 2) return;
    L.last = i;
    const pkF = P.slipPeak ?? 0.169, pkR = P.slipPeakR ?? pkF, a = p.aidT || {};
    let bits = 0;
    for (const k in a) if (a[k] > 0 && AID_BITS[k]) bits |= AID_BITS[k];
    if (p.lockF || p.lockR) bits |= AID_BITS.lock;
    if (!car.onRoad) bits |= AID_BITS.off;
    // (a hit: the car's hit counter went up since the last sample)
    const hc = car.hits || 0; if (L.hits >= 0 && hc !== L.hits) bits |= AID_BITS.hit; L.hits = hc;
    L.t[i] = raceTime - start; L.v[i] = Math.max(0, p.u); L.thr[i] = p.throttle || 0; L.brk[i] = p.braking || 0;
    L.steer[i] = p.steer || 0; L.gear[i] = p.gear; L.lat[i] = p.latG || 0;
    L.sf[i] = (p.slipF || 0) / pkF; L.sr[i] = (p.slipR || 0) / pkR + (p.spin > 0.05 ? 1 : 0);
    L.s[i] = car.s || 0; L.h[i] = p.h;
    // (aid bits accumulate over the frames spent on one sample)
    L.aid[i] = (isNaN(L.aid[i]) ? 0 : L.aid[i]) | bits;
    L.n++;
  }
  // the lap is over: fill the samples skipped at speed, hand it back (null if it wasn't recorded from its start)
  finish(car, time, meta, start = car.lapStart) {
    const L = this.cur; this.cur = null;
    if (!L || L.start !== start || L.n < 20) return null;
    const n = lapLength(this.T);
    for (const c of CH) fillGaps(L[c], n, c === 'gear' || c === 'aid');
    const ch = {}; for (const c of CH) ch[c] = L[c];
    return { time, ch, ...meta };
  }
}
// samples that make up a lap (a point-to-point run stops at the finish line)
export const lapLength = (T) => (T.open ? T.finish + 1 : T.N);

// linear in-fill between recorded samples (step for gear / aid bits); ends held
function fillGaps(a, n, step) {
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (isNaN(a[i])) continue;
    if (last < 0) for (let k = 0; k < i; k++) a[k] = a[i];
    else if (i - last > 1) for (let k = last + 1; k < i; k++) a[k] = step ? a[last] : a[last] + (a[i] - a[last]) * (k - last) / (i - last);
    last = i;
  }
  if (last < 0) a.fill(0, 0, n); else for (let k = last + 1; k < n; k++) a[k] = a[last];
}

// ---------------- the reference lap ----------------
// A quick, clean lap in this car: the speed plan the AI learned for it (at the pace the racing line uses: a good human,
// a touch under the AI's limit). Time comes from integrating the speeds; brake and throttle from where it slows and gains.
export function referenceLap(T, V, k = 0.94) {
  const N = T.N, n = lapLength(T), ds = T.ds;
  const ch = {}; for (const c of CH) ch[c] = new Float32Array(N).fill(0);
  const v = ch.v;
  for (let i = 0; i < N; i++) v[i] = Math.max(5, V[i] * k);
  ch.t[0] = 0;
  for (let i = 1; i < n; i++) ch.t[i] = ch.t[i - 1] + ds / ((v[i - 1] + v[i]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % N, acc = (v[j] * v[j] - v[i] * v[i]) / (2 * ds);
    ch.brk[i] = acc < -1.5 ? Math.min(1, -acc / 9) : 0;
    ch.thr[i] = acc > 0.3 ? 1 : acc > -1.5 ? 0.35 : 0;
  }
  return { time: ch.t[n - 1] + ds / v[n - 1], ch, ref: true, valid: true };
}

// ---------------- analysis ----------------
// The lap split into one stretch per corner (braking zone to halfway down the next straight), so the stretches add up
// to the whole lap's gap. For each: time lost / gained, and how you and the comparison lap drove it.
export function analyze(lap, cmp, T, corners) {
  const n = lapLength(T), ds = T.ds, a = lap.ch, b = cmp.ch;
  const delta = new Float32Array(n);
  for (let i = 0; i < n; i++) delta[i] = a.t[i] - b.t[i];
  const list = corners.filter(c => c.entry < n);
  const out = [];
  for (let k = 0; k < list.length; k++) {
    const c = list[k], prev = list[k - 1], next = list[k + 1];
    const from = k === 0 ? 0 : Math.round((prev.exit + c.entry) / 2);
    const to = next ? Math.round((c.exit + next.entry) / 2) : n - 1;
    const you = drive(a, c, from, to, ds), them = drive(b, c, from, to, ds);
    const loss = (delta[to] - delta[from]);
    out.push({ n: c.n, dir: c.dir, from, to, entry: c.entry, apex: c.apex, exit: c.exit, loss, you, them, tips: tipsFor(you, them, loss, !!cmp.ref) });
  }
  const top = { v: 0 };
  for (let i = 0; i < n; i++) top.v = Math.max(top.v, a.v[i]);
  return { total: lap.time - cmp.time, delta, corners: out, top: top.v, n, ds };
}

// how a lap drove one corner's stretch
function drive(ch, c, from, to, ds) {
  const clampI = (i) => Math.max(from, Math.min(to, i));
  const apex = c.apex;
  let brakeAt = -1;
  for (let i = from; i <= apex; i++) if (ch.brk[i] > 0.25) { brakeAt = i; break; }
  let minV = Infinity, minAt = apex;
  for (let i = clampI(c.entry - Math.round(20 / ds)); i <= clampI(c.exit + Math.round(20 / ds)); i++) if (ch.v[i] < minV) { minV = ch.v[i]; minAt = i; }
  let thrAt = -1;
  for (let i = minAt; i <= to; i++) if (ch.thr[i] > 0.7) { thrAt = i; break; }
  const exitI = clampI(c.exit + Math.round(60 / ds));
  // coasting: off both pedals between braking and the throttle
  let coast = 0;
  if (brakeAt >= 0) for (let i = brakeAt; i <= (thrAt >= 0 ? thrAt : exitI); i++) if (ch.thr[i] < 0.1 && ch.brk[i] < 0.1) coast += ds / Math.max(3, ch.v[i]);
  let under = 0, slide = 0, off = 0, tc = 0, abs = 0, stab = 0, lock = 0, hit = 0;
  for (let i = from; i <= to; i++) {
    const bits = ch.aid[i] | 0;
    if (i >= c.entry && i <= c.exit && ch.sf[i] > 1.25) under += ds;
    if (i >= minAt && ch.sr[i] > 1.3) slide += ds;
    if (bits & AID_BITS.off) off += ds;
    if (bits & AID_BITS.tc) tc += ds;
    if (bits & AID_BITS.abs) abs += ds;
    if (bits & AID_BITS.stab) stab += ds;
    if (bits & AID_BITS.lock) lock += ds;
    if (bits & AID_BITS.hit) hit++;
  }
  return {
    brakeAt, brakeDist: brakeAt >= 0 ? (apex - brakeAt) * ds : null, // metres before the apex you started braking
    entryV: ch.v[clampI(c.entry)], minV, minAt, exitV: ch.v[exitI],
    thrAt, thrDist: thrAt >= 0 ? (thrAt - minAt) * ds : null,     // metres after the slowest point you were back on the throttle
    coast, under, slide, off, tc, abs, stab, lock, hit,
  };
}

// Coaching notes for one corner, most useful first (at most two). Speeds are m/s here; the screen formats them.
// { key, text } with {v:...} placeholders filled by the screen: {kmh:x} = a speed, {m:x} = metres, {s:x} = seconds.
function tipsFor(y, r, loss, vsRef) {
  const tips = [];
  const lateBrake = y.brakeDist != null && r.brakeDist != null && r.brakeDist - y.brakeDist > 12;
  const earlyBrake = y.brakeDist != null && r.brakeDist != null && y.brakeDist - r.brakeDist > 15;
  if (y.hit) tips.push({ k: 'hit', text: `You hit the barrier here. Brake a little earlier and put a clean exit first.` });
  else if (y.off > 6) tips.push({ k: 'off', text: `You went off the road here. Brake a little earlier and put a clean exit first.` });
  if (y.lock > 4) tips.push({ k: 'lock', text: `The wheels locked under braking. Squeeze the brake on instead of stamping on it.` });
  if (lateBrake && y.minV < r.minV - 1.2) tips.push({ k: 'late', text: `You braked {m:${r.brakeDist - y.brakeDist}} later and overshot: {kmh:${r.minV - y.minV}} slower at the apex. Brake where the ${vsRef ? 'reference' : 'other lap'} does and carry more speed through.` });
  else if (earlyBrake && y.minV <= r.minV + 0.6) tips.push({ k: 'early', text: `You braked {m:${y.brakeDist - r.brakeDist}} earlier than you need to. Try braking later.` });
  if (y.under > 12) tips.push({ k: 'under', text: `The front tires were past their grip for {m:${y.under}}: too fast or too much steering on the way in. Slow a little more, then turn.` });
  if (!lateBrake && y.minV < r.minV - 1.7) tips.push({ k: 'min', text: `{kmh:${r.minV - y.minV}} slower at the slowest point. Ease off the brake as you turn in and let the car roll through.` });
  if (y.thrDist != null && r.thrDist != null && y.thrDist - r.thrDist > 20) tips.push({ k: 'thr', text: `Back on the throttle {m:${y.thrDist - r.thrDist}} later than you could be. Start squeezing it on just after the slowest point.` });
  if (y.coast > 0.35) tips.push({ k: 'coast', text: `{s:${y.coast}} coasting with neither pedal. Blend the brake straight into the throttle.` });
  if (y.slide > 10) tips.push({ k: 'slide', text: `The rear slid on the way out. Feed the throttle in more gently.` });
  else if (y.tc > 15) tips.push({ k: 'tc', text: `Traction control cut in on the exit. A little less throttle early on is faster.` });
  if (y.exitV < r.exitV - 2 && !tips.some(t => t.k === 'thr' || t.k === 'min')) tips.push({ k: 'exit', text: `{kmh:${r.exitV - y.exitV}} slower onto the next straight. A slower entry for a faster exit pays off all the way down it.` });
  if (!tips.length && loss < -0.05) tips.push({ k: 'good', text: `Well driven: you gained time here.` });
  else if (!tips.length && loss > 0.08) tips.push({ k: 'small', text: `A little slower all the way through. Keep working on it.` });
  return tips.slice(0, 2);
}

// ---------------- the ghost: where a recorded lap's car was, t seconds into it ----------------
// { i, f (0..1 to the next sample), s, h, v } or null once that lap is over (binary search on the time channel)
export function lapPoseAt(lap, T, t) {
  const c = lap.ch, n = lapLength(T);
  if (t < 0 || t > lap.time) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.t[m] <= t) lo = m; else hi = m; }
  const dt = c.t[hi] - c.t[lo], f = dt > 1e-4 ? Math.min(1, Math.max(0, (t - c.t[lo]) / dt)) : 0;
  const L = (k) => c[k][lo] + (c[k][hi] - c[k][lo]) * f;
  return { i: lo, f, s: L('s'), h: L('h'), v: L('v') };
}

// ---------------- your best ever (per circuit + car), kept between sessions ----------------
// stored at every other sample, rounded: ~20-40 KB a lap in localStorage, the 12 most recent circuits
const PB_KEY = 'svgp.lapPB', PB_CH = ['t', 'v', 'thr', 'brk', 'steer', 'sf', 'sr', 's', 'h'];
function loadPBs() { try { return JSON.parse(localStorage.getItem(PB_KEY) || '{}'); } catch (e) { return {}; } }
function savePB(key, lap) {
  const all = loadPBs(), old = all[key];
  if (old && old.time <= lap.time) return;
  const pack = { time: lap.time, when: Date.now(), tyre: lap.tyre, N: lap.ch.t.length, ch: {} };
  for (const c of PB_CH) { const a = lap.ch[c], o = []; for (let i = 0; i < a.length; i += 2) o.push(Math.round(a[i] * 1000) / 1000); pack.ch[c] = o; }
  all[key] = pack;
  const keys = Object.keys(all).sort((x, y) => (all[y].when || 0) - (all[x].when || 0));
  for (const k of keys.slice(12)) delete all[k];
  try { localStorage.setItem(PB_KEY, JSON.stringify(all)); } catch (e) {}
}
export function loadPB(key, T) {
  const p = loadPBs()[key]; if (!p || p.N !== T.N) return null;
  const ch = {};
  for (const c of CH) {
    const a = new Float32Array(T.N).fill(0), src = p.ch[c];
    if (src) for (let i = 0; i < T.N; i++) { const k = i / 2, k0 = Math.floor(k), k1 = Math.min(src.length - 1, k0 + 1); a[i] = src[k0] + (src[k1] - src[k0]) * (k - k0); }
    ch[c] = a;
  }
  // (older saves have no line: no s / h, so no ghost from them)
  return { time: p.time, ch, when: p.when, tyre: p.tyre, valid: true, pb: true, hasLine: !!(p.ch.s && p.ch.h) };
}
