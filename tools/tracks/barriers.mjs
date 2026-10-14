// A real circuit's barriers laid out to sculpt: one barrier down each side, an even distance from the track edge,
// with as few nodes as keep it smooth. Each stretch between two nodes is a curve with handles (the Circuit Designer's
// "free" stretch, js/track.js barrierLine), fitted to the even line to within TOL, so a node dragged in the editor
// keeps the barrier smooth instead of cutting straight across to the next one. Where the even line can't go (the
// inside of a corner tighter than the distance, or a part of the track running close by) it comes in, smoothly.
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/barriers.mjs <id> [distance m, default env.runoff] [--write]
// --write: into tracks/real/dress/<id>.json (build.mjs keeps it through rebuilds) and tracks/real/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTrack, analyzeTrack, barrierLine, trackFrame } from '../../js/track.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), WRITE = args.includes('--write'), pos = args.filter(a => !a.startsWith('--'));
const id = pos[0], f = path.join(ROOT, 'tracks/real', id + '.json');
const track = JSON.parse(fs.readFileSync(f, 'utf8'));
const TOL = +(process.env.TOL || 0.5); // (m: how far the fitted curve may stray from the even line)
const DIST = +(pos[1] || track.env.runoff || 14);

const T = sampleTrack(track), N = T.N, L = T.L;
const A = analyzeTrack(T, track.env, track.paint, track.osm, null);
const wrap = (i) => ((i % N) + N) % N;

// ---- how far out the even line can go at each sample, per side ----
const CELL = 12, grid = new Map(), key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
for (let i = 0; i < N; i++) { const k = key(T.X[i], T.Z[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
const Wmax = Math.max(...T.W);
const near = (x, z, r) => { const out = [], c = Math.ceil(r / CELL), gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) { const l = grid.get((gx + a) + ',' + (gz + b)); if (l) out.push(...l); } return out; };
const ptAt = (i, side, s) => { const o = side * (T.W[i] / 2 + s); return [T.X[i] - T.FZ[i] * o, T.Z[i] + T.FX[i] * o]; };
// (the barrier's point there must be no nearer any other bit of track than its own: the inside of a corner folds
// over itself past that, and a stretch running close by would have it standing on its runoff)
const fits = (i, side, s) => {
  const [x, z] = ptAt(i, side, s);
  for (const j of near(x, z, Wmax / 2 + s + 2)) if (Math.hypot(x - T.X[j], z - T.Z[j]) - T.W[j] / 2 < s - 0.5) return false;
  return true;
};
function offsets(side) {
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = DIST; while (s > 1 && !fits(i, side, s)) s -= 0.5; raw[i] = s; }
  // smooth: the lowest within 20 m either side, then averaged over 30 m twice (never further out than it fits)
  const w = Math.round(20 / T.ds), m = Math.round(15 / T.ds);
  let o = Float32Array.from(raw, (_, i) => { let v = Infinity; for (let k = -w; k <= w; k++) v = Math.min(v, raw[wrap(i + k)]); return v; });
  for (let pass = 0; pass < 2; pass++) o = Float32Array.from(o, (_, i) => { let v = 0; for (let k = -m; k <= m; k++) v += o[wrap(i + k)]; return v / (2 * m + 1); });
  return Float32Array.from(o, (v, i) => Math.min(v, raw[i]));
}

// ---- Schneider's curve fitting (Graphics Gems, 1990): cubic Beziers through points, error under TOL ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = (a) => Math.hypot(a[0], a[1]), unit = (a) => mul(a, 1 / (len(a) || 1));
const bez = (c, t) => { const m = 1 - t; return add(add(mul(c[0], m * m * m), mul(c[1], 3 * m * m * t)), add(mul(c[2], 3 * m * t * t), mul(c[3], t * t * t))); };
function fitCubic(P, a, b, t1, t2, out) {
  if (b - a === 1) { const d = len(sub(P[b], P[a])) / 3; out.push([P[a], add(P[a], mul(t1, d)), add(P[b], mul(t2, d)), P[b]]); return; }
  let u = [0]; for (let k = a + 1; k <= b; k++) u.push(u[u.length - 1] + len(sub(P[k], P[k - 1]))); const tot = u[u.length - 1]; u = u.map(v => v / tot);
  const gen = () => { // (least squares handle lengths along the given tangents)
    let C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
    for (let k = 0; k < u.length; k++) {
      const t = u[k], m = 1 - t, A1 = mul(t1, 3 * m * m * t), A2 = mul(t2, 3 * m * t * t);
      C00 += dot(A1, A1); C01 += dot(A1, A2); C11 += dot(A2, A2);
      const tmp = sub(P[a + k], add(mul(P[a], m * m * m + 3 * m * m * t), mul(P[b], 3 * m * t * t + t * t * t)));
      X0 += dot(A1, tmp); X1 += dot(A2, tmp);
    }
    const det = C00 * C11 - C01 * C01, seg = len(sub(P[b], P[a]));
    let al = det ? (X0 * C11 - X1 * C01) / det : 0, be = det ? (C00 * X1 - C01 * X0) / det : 0;
    if (al < seg * 1e-3 || be < seg * 1e-3) al = be = seg / 3;
    return [P[a], add(P[a], mul(t1, al)), add(P[b], mul(t2, be)), P[b]];
  };
  const err = (c) => { let e = 0, at = (a + b) >> 1; for (let k = 1; k < u.length - 1; k++) { const d = len(sub(bez(c, u[k]), P[a + k])); if (d > e) { e = d; at = a + k; } } return [e, at]; };
  let c = gen(), [e, at] = err(c);
  if (e < TOL) { out.push(c); return; }
  if (e < TOL * 4) for (let it = 0; it < 6; it++) { // (reparameterise: each point's t nearer its closest on the curve)
    u = u.map((t, k) => { const m = 1 - t, q = bez(c, t), d1 = add(add(mul(sub(c[1], c[0]), 3 * m * m), mul(sub(c[2], c[1]), 6 * m * t)), mul(sub(c[3], c[2]), 3 * t * t));
      const d2 = add(mul(add(sub(c[2], mul(c[1], 2)), c[0]), 6 * m), mul(add(sub(c[3], mul(c[2], 2)), c[1]), 6 * t)), r = sub(q, P[a + k]);
      const den = dot(d1, d1) + dot(r, d2); return den ? Math.min(1, Math.max(0, t - dot(r, d1) / den)) : t; });
    c = gen(); [e, at] = err(c); if (e < TOL) { out.push(c); return; }
  }
  const tc = unit(sub(P[at - 1], P[at + 1]));
  fitCubic(P, a, at, t1, tc, out); fitCubic(P, at, b, mul(tc, -1), t2, out);
}

// ---- one barrier per side (split where a bridge carries the track) ----
const barriers = [];
const stats = [];
for (const side of [-1, 1]) {
  const off = offsets(side);
  const on = (i) => !A.BRIDGE[i] && !(A.OVERPASS && A.OVERPASS[i]);
  // runs of samples to fit; a whole lap starts on the straightest spot, and ends where it starts
  const runs = [];
  if ([...Array(N).keys()].every(on)) {
    let s0 = 0, best = Infinity; const w = Math.round(60 / T.ds);
    for (let i = 0; i < N; i += 2) { let k = 0; for (let q = -w; q <= w; q++) k += Math.abs(T.K[wrap(i + q)]); if (k < best) { best = k; s0 = i; } }
    runs.push([...Array(N + 1).keys()].map(k => wrap(s0 + k)));
  } else {
    let s0 = 0; while (on(s0)) s0++;
    for (let k = 1, run = null; k <= N; k++) { const i = wrap(s0 + k); if (on(i)) (run ||= []).push(i); else if (run) { if (run.length > 3) runs.push(run); run = null; } if (k === N && run && run.length > 3) runs.push(run); }
  }
  for (const run of runs) {
    const closed = run[0] === run[run.length - 1];
    // (the even line, its little wiggles from the mapped centre line smoothed out over ~12 m: they'd cost a node each)
    const raw = run.map(i => ptAt(i, side, off[i])), sw = Math.round(6 / T.ds), n = raw.length;
    const P = raw.map((_, k) => { let x = 0, z = 0, c = 0; for (let q = -sw; q <= sw; q++) { let j = k + q; if (closed) j = ((j % (n - 1)) + (n - 1)) % (n - 1); else if (j < 0 || j >= n) continue; x += raw[j][0]; z += raw[j][1]; c++; } return [x / c, z / c]; });
    if (closed) P[n - 1] = P[0];
    const tan = (k) => unit(sub(P[Math.min(P.length - 1, k + 1)], P[Math.max(0, k - 1)]));
    let t1 = tan(0), t2 = mul(tan(P.length - 1), -1);
    if (closed) { t1 = unit(sub(P[1], P[P.length - 2])); t2 = mul(t1, -1); }
    const curves = []; fitCubic(P, 0, P.length - 1, t1, t2, curves);
    // nodes: each curve's ends, its handles in the track's frame there ([m along, m further out])
    const idxOf = (pt) => { let bi = 0, bd = Infinity; for (let k = 0; k < P.length; k++) { const d = len(sub(P[k], pt)); if (d < bd) { bd = d; bi = k; } } return bi; };
    const frame = (i) => trackFrame(T, T.D[i]);
    const hnd = (i, h) => { const F = frame(i); return [+(h[0] * F.fx + h[1] * F.fz).toFixed(2), +((h[0] * F.rx + h[1] * F.rz) * side).toFixed(2)]; };
    const pts = [];
    let k0 = 0;
    curves.forEach((c, n) => {
      const k1 = n === curves.length - 1 ? P.length - 1 : idxOf(c[3]), i0 = run[k0], i1 = run[k1];
      if (n === 0) pts.push([+T.D[i0].toFixed(1), +off[i0].toFixed(2), { f: 1 }]);
      pts[pts.length - 1][2].ho = hnd(i0, sub(c[1], c[0]));
      const last = n === curves.length - 1;
      pts.push([+T.D[i1].toFixed(1), +off[i1].toFixed(2), last ? { hi: hnd(i1, sub(c[2], c[3])) } : { f: 1, hi: hnd(i1, sub(c[2], c[3])) }]);
      k0 = k1;
    });
    barriers.push({ side, type: track.env.barrier && track.env.barrier !== 'none' ? track.env.barrier : 'tires', pts });
    // (check: the line the game draws from these nodes, against the even line)
    const line = barrierLine(barriers[barriers.length - 1], T); let worst = 0;
    for (const [d, o] of line) { const i = wrap(Math.round(d / T.ds)); worst = Math.max(worst, Math.abs(o - off[i])); }
    stats.push(`${side < 0 ? 'left ' : 'right'}: ${pts.length} nodes over ${(run.length * T.ds / 1000).toFixed(2)} km${closed ? ' (the whole lap)' : ''}, ` +
      `${DIST} m out (${Math.min(...run.map(i => off[i])).toFixed(1)} m at the closest), off the even line by ${worst.toFixed(2)} m at most`);
  }
}
console.log(`${track.name}: ${stats.join('\n  ')}`);
if (WRITE) {
  const df = path.join(ROOT, 'tracks/real/dress', id + '.json');
  const dress = fs.existsSync(df) ? JSON.parse(fs.readFileSync(df, 'utf8')) : { kerbs: [], walls: [] };
  dress.barriers = barriers;
  fs.mkdirSync(path.dirname(df), { recursive: true }); fs.writeFileSync(df, JSON.stringify(dress, null, 1));
  track.dress = { ...(track.dress || {}), barriers }; fs.writeFileSync(f, JSON.stringify(track));
  console.log(`written: tracks/real/dress/${id}.json and tracks/real/${id}.json`);
}
if (process.env.SEGS) for (const b of barriers) console.log(b.side, b.pts.map((p, k) => k ? Math.round(((p[0] - b.pts[k - 1][0]) % L + L) % L) : 0).join(' '));
