// Few points, real curves: fits a dense path (a drawn stroke, or a track's own sampled centre line) with as few cubic
// Bezier stretches as keep it within a tolerance, the way a designer would lay it out by hand: about a point a
// corner, each with its curve handles (the Circuit Designer's EDIT tool shows and drags them; track.js segCtrl draws
// them). Schneider's curve fitting (Graphics Gems, 1990) in any number of dimensions, so a track's height and width
// can be fitted along with its plan: a hill or a widening needs a point where it changes, the same as a corner does.
// Pure maths, no DOM: node .devtest/spline.mjs measures it.

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const len = (a) => Math.sqrt(dot(a, a));
const unit = (a) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : a.map((_, i) => (i === 0 ? 1 : 0)); };
const plan = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function bez(C, u) {
  const m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
  return C[0].map((_, i) => a * C[0][i] + b * C[1][i] + c * C[2][i] + d * C[3][i]);
}
const bez1 = (C, u) => { const m = 1 - u; return C[0].map((_, i) => 3 * (m * m * (C[1][i] - C[0][i]) + 2 * m * u * (C[2][i] - C[1][i]) + u * u * (C[3][i] - C[2][i]))); };
const bez2 = (C, u) => C[0].map((_, i) => 6 * ((1 - u) * (C[2][i] - 2 * C[1][i] + C[0][i]) + u * (C[3][i] - 2 * C[2][i] + C[1][i])));

function chordParams(Q, f, l) {
  const u = [0];
  for (let i = f + 1; i <= l; i++) u.push(u[u.length - 1] + len(sub(Q[i], Q[i - 1])));
  const L = u[u.length - 1] || 1;
  return u.map(v => v / L);
}
// the two handle lengths along the given tangents that fit the points best (least squares)
function generate(Q, f, l, u, t1, t2) {
  const P0 = Q[f], P3 = Q[l];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const v = u[i], m = 1 - v, b0 = m * m * m, b1 = 3 * m * m * v, b2 = 3 * m * v * v, b3 = v * v * v;
    const A0 = mul(t1, b1), A1 = mul(t2, b2);
    c00 += dot(A0, A0); c01 += dot(A0, A1); c11 += dot(A1, A1);
    const tmp = sub(Q[f + i], add(mul(P0, b0 + b1), mul(P3, b2 + b3)));
    x0 += dot(A0, tmp); x1 += dot(A1, tmp);
  }
  const det = c00 * c11 - c01 * c01, seg = len(sub(P3, P0));
  let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  if (!(al > seg * 1e-3) || !(ar > seg * 1e-3) || al > seg * 2 || ar > seg * 2) al = ar = seg / 3; // (a wild fit: the safe handles)
  return [P0, add(P0, mul(t1, al)), add(P3, mul(t2, ar)), P3];
}
function maxError(Q, f, l, C, u) {
  let worst = 0, at = Math.floor((f + l) / 2);
  for (let i = 1; i < u.length - 1; i++) { const d = len(sub(bez(C, u[i]), Q[f + i])); if (d > worst) { worst = d; at = f + i; } }
  return [worst, at];
}
const reparam = (Q, f, C, u) => u.map((v, i) => {
  const d = sub(bez(C, v), Q[f + i]), q1 = bez1(C, v), q2 = bez2(C, v), den = dot(q1, q1) + dot(d, q2);
  return den ? Math.min(1, Math.max(0, v - dot(d, q1) / den)) : v;
});

function fitCubic(Q, f, l, t1, t2, tol, maxSeg, out) {
  if (l - f === 1) { const d = len(sub(Q[l], Q[f])) / 3; out.push({ C: [Q[f], add(Q[f], mul(t1, d)), add(Q[l], mul(t2, d)), Q[l]], f }); return; }
  let u = chordParams(Q, f, l), C = generate(Q, f, l, u, t1, t2), [err, split] = maxError(Q, f, l, C, u);
  const long = plan(Q[f], Q[l]) > maxSeg;
  if (err < tol && !long) { out.push({ C, f }); return; }
  if (err < tol * 4 && !long) for (let it = 0; it < 6; it++) {
    u = reparam(Q, f, C, u); C = generate(Q, f, l, u, t1, t2); [err, split] = maxError(Q, f, l, C, u);
    if (err < tol) { out.push({ C, f }); return; }
  }
  if (long && err < tol) split = Math.floor((f + l) / 2);
  split = Math.min(l - 1, Math.max(f + 1, split));
  const tc = unit(sub(Q[split - 1], Q[split + 1]));
  fitCubic(Q, f, split, t1, tc, tol, maxSeg, out);
  fitCubic(Q, split, l, mul(tc, -1), t2, tol, maxSeg, out);
}
// split a stretch in two where it's longest (same curve exactly): a loop needs four points at least
function splitLongest(segs) {
  let k = 0; segs.forEach((s, i) => { if (plan(s.C[0], s.C[3]) > plan(segs[k].C[0], segs[k].C[3])) k = i; });
  const [a, b, c, d] = segs[k].C, m = (p, q) => mul(add(p, q), 0.5);
  const ab = m(a, b), bc = m(b, c), cd = m(c, d), abc = m(ab, bc), bcd = m(bc, cd), mid = m(abc, bcd);
  segs.splice(k, 1, { C: [a, ab, abc, mid], f: segs[k].f }, { C: [mid, bcd, cd, d], f: -1 });
}

// pts: [[x, z, ...more dimensions]] along the path (a loop's last point not repeating its first). closed: a loop.
// tol: how far (in those units) the curve may stray. maxSeg: the longest one stretch may run (metres, plan).
// Returns the points: { p (the point, every dimension), ho / hi (handles out / in, every dimension; null at an open
// path's two ends), i (the input point it sits on, or -1 where a loop was split to make up four) }
export function fitPath(pts, { closed = true, tol = 2, maxSeg = 400, min = closed ? 4 : 2 } = {}) {
  const n = pts.length;
  if (n < 3) return pts.map((p, i) => ({ p, ho: null, hi: null, i }));
  const Q = closed ? [...pts, pts[0]] : pts, segs = [];
  const t1 = closed ? unit(sub(pts[1], pts[n - 1])) : unit(sub(pts[1], pts[0]));
  const t2 = closed ? mul(t1, -1) : unit(sub(pts[n - 2], pts[n - 1]));
  fitCubic(Q, 0, Q.length - 1, t1, t2, tol, maxSeg, segs);
  while (segs.length < (closed ? min : min - 1)) splitLongest(segs);
  const out = segs.map((s, k) => ({ p: s.C[0], ho: sub(s.C[1], s.C[0]), hi: null, i: s.f }));
  segs.forEach((s, k) => { const nx = closed ? out[(k + 1) % out.length] : out[k + 1]; if (nx) nx.hi = sub(s.C[2], s.C[3]); });
  if (!closed) { const s = segs[segs.length - 1]; out.push({ p: s.C[3], ho: null, hi: sub(s.C[2], s.C[3]), i: n - 1 }); }
  return out;
}

// A track redrawn with as few points as keep its line within tol metres: a 177-point real circuit becomes a few
// dozen, each with handles. The start stays point 0. The game draws a node's height, width and banking between
// nodes its own way (track.js: heights eased through the nodes' slopes, widths and banking smoothstepped), not along
// the fitted curve, so the refit is then drawn as the game draws it and checked against the road it replaces: where
// its height strays more than ht m (width wt m, banking bt degrees) a node goes in there, splitting that stretch's
// curve where it stands (the line doesn't move) and taking the real road's values. Returns the new points (x, z, w,
// e, b, hi, ho), or null if it wouldn't be fewer.
const EW = 4, WW = 1, BW = 0.5; // (weights against the line's metres, for where the corners and hills are)
export function simplifyTrack(track, densePath, tol = 0.25, { ht = 0.08, wt = 0.2, bt = 0.5 } = {}) {
  const D = densePath(track, 2), open = !!track.open;
  const fit = fitPath(D.map(d => [d.x, d.z, d.e * EW, d.w * WW, d.b * BW]), { closed: !open, tol, maxSeg: 450 });
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, h = (v) => v ? [r1(v[0]), r1(v[1])] : null;
  const near = (x, z) => { let best = 1e18, k = 0; D.forEach((d, j) => { const e = (d.x - x) ** 2 + (d.z - z) ** 2; if (e < best) { best = e; k = j; } }); return k; };
  // (a node takes the real road's height, width and banking where it sits)
  let P = fit.map(f => {
    const at = f.i >= 0 ? f.i : near(f.p[0], f.p[1]), d = D[at];
    return { x: f.p[0], z: f.p[1], w: d.w, e: Math.max(0, d.e), b: d.b, hi: f.hi && f.hi.slice(0, 2), ho: f.ho && f.ho.slice(0, 2), at };
  });
  const out = () => P.map(q => { const pt = { x: r1(q.x), z: r1(q.z), w: r1(q.w), e: r2(q.e), b: r1(q.b) }; const hi = h(q.hi), ho = h(q.ho); if (hi) pt.hi = hi; if (ho) pt.ho = ho; return pt; });
  for (let pass = 0; pass < 60; pass++) {
    // the refit as the game draws it, against the road it replaces (each sample of that road: the nearest of the
    // refit's, looked for close to the same share of the lap)
    const B = densePath({ ...track, points: out(), start: 0 }, 0.5), nB = B.length;
    const worst = new Map(); // (per stretch: its worst sample, by how far past the tolerance)
    let k = 0; // (followed along: each sample's match is looked for just past the last one's, so a crossover's other level is never picked)
    for (let i = 0; i < D.length; i++) {
      let best = 1e18, g = k;
      for (let o = -6; o <= 30; o++) { const j = open ? g + o : ((g + o) % nB + nB) % nB; if (j < 0 || j >= nB) continue; const e = (B[j].x - D[i].x) ** 2 + (B[j].z - D[i].z) ** 2; if (e < best) { best = e; k = j; } }
      const bad = Math.max(Math.abs(B[k].e - D[i].e) / ht, Math.abs(B[k].w - D[i].w) / wt, Math.abs(B[k].b - D[i].b) / bt);
      if (bad <= 1) continue;
      let s = P.length - 1; for (let n = 0; n < P.length; n++) if (P[n].at <= i) s = n; // (the stretch it's on)
      if (open && s >= P.length - 1) continue;
      if (!worst.has(s) || worst.get(s)[1] < bad) worst.set(s, [i, bad]);
    }
    if (!worst.size) break;
    // split each of those stretches there (de Casteljau: the same curve, in two)
    for (const [s, [i]] of [...worst].sort((a, b) => b[0] - a[0])) {
      const p1 = P[s], p2 = P[(s + 1) % P.length];
      const C = [[p1.x, p1.z], [p1.x + p1.ho[0], p1.z + p1.ho[1]], [p2.x + p2.hi[0], p2.z + p2.hi[1]], [p2.x, p2.z]];
      let u = 0.5, bu = 1e18;
      for (let k = 1; k < 200; k++) { const q = bez(C, k / 200), e = (q[0] - D[i].x) ** 2 + (q[1] - D[i].z) ** 2; if (e < bu) { bu = e; u = k / 200; } }
      const m = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      const ab = m(C[0], C[1]), bc = m(C[1], C[2]), cd = m(C[2], C[3]), abc = m(ab, bc), bcd = m(bc, cd), mid = m(abc, bcd);
      p1.ho = [ab[0] - C[0][0], ab[1] - C[0][1]]; p2.hi = [cd[0] - C[3][0], cd[1] - C[3][1]];
      const d = D[i];
      P.splice(s + 1, 0, { x: mid[0], z: mid[1], w: d.w, e: Math.max(0, d.e), b: d.b, hi: [abc[0] - mid[0], abc[1] - mid[1]], ho: [bcd[0] - mid[0], bcd[1] - mid[1]], at: i });
    }
  }
  return P.length >= track.points.length ? null : out();
}
// a drawn stroke ([[x, z]], already smoothed) as a road: a point about every corner
export const fitStroke = (pts, open, tol = 3) => fitPath(pts, { closed: !open, tol, maxSeg: 400 }).map(f => ({ x: f.p[0], z: f.p[1], ...(f.hi ? { hi: f.hi.slice(0, 2) } : {}), ...(f.ho ? { ho: f.ho.slice(0, 2) } : {}) }));

// Distances along the lap from one version of a road to another (a refit: simplifyTrack): A, B the two roads'
// densePath samples. Returns d (m along A) -> m along B, where B passes closest to A's spot there (looked for near
// the same share of the lap, so a crossover's other level is never picked).
export function lapRemap(A, B, open = false) {
  const cum = (P) => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z)); return c; };
  const ca = cum(A), cb = cum(B);
  const La = ca[ca.length - 1] + (open ? 0 : Math.hypot(A[0].x - A[A.length - 1].x, A[0].z - A[A.length - 1].z));
  const Lb = cb[cb.length - 1] + (open ? 0 : Math.hypot(B[0].x - B[B.length - 1].x, B[0].z - B[B.length - 1].z));
  const at = (P, c, L, d) => { // (the spot d m along P)
    d = open ? Math.max(0, Math.min(c[c.length - 1], d)) : ((d % L) + L) % L;
    let lo = 0, hi = c.length - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    const j = c[lo + 1] !== undefined && d > c[lo] ? lo + 1 : lo, p = P[lo], q = P[j === lo ? (open ? lo : (lo + 1) % P.length) : j];
    const seg = (j === lo ? Math.hypot(q.x - p.x, q.z - p.z) : c[j] - c[lo]) || 1, f = Math.min(1, (d - c[lo]) / seg);
    return { x: p.x + (q.x - p.x) * f, z: p.z + (q.z - p.z) * f };
  };
  const n = B.length;
  return (d) => {
    const s = at(A, ca, La, d), g = d * Lb / La;
    let lo = 0, hi = n - 1; const gg = open ? g : ((g % Lb) + Lb) % Lb;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cb[m] <= gg) lo = m; else hi = m; }
    let best = 1e18, k = lo;
    const win = Math.ceil(80 / (Lb / n));
    for (let o = -win; o <= win; o++) {
      const j = open ? lo + o : ((lo + o) % n + n) % n; if (j < 0 || j >= n) continue;
      const e = (B[j].x - s.x) ** 2 + (B[j].z - s.z) ** 2; if (e < best) { best = e; k = j; }
    }
    // (onto the stretch either side of the nearest sample)
    let out = cb[k];
    for (const j2 of [k - 1, k + 1]) {
      const j = open ? j2 : (j2 + n) % n; if (j < 0 || j >= n) continue;
      const a = j2 < k ? B[j] : B[k], b = j2 < k ? B[k] : B[j], ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az; if (!l2) continue;
      const t = ((s.x - a.x) * ax + (s.z - a.z) * az) / l2;
      if (t >= 0 && t <= 1) { out = (j2 < k ? cb[k] - Math.sqrt(l2) * (1 - t) : cb[k] + Math.sqrt(l2) * t); break; }
    }
    // (a distance given past the line, under 0 or over a lap, stays on that side of it)
    if (!open && d < 0 && out > Lb / 2) out -= Lb;
    if (!open && d >= La && out < Lb / 2) out += Lb;
    return Math.round(out * 10) / 10;
  };
}
// a track's dressing (track.dress: its pit lane, kerbs, walls and barriers, all placed by m along the lap) moved onto
// a refit road so everything stays where it was: map (lapRemap's) for what's only a distance along the lap; place
// (d, off, side) -> [d, off] for a node out to one side, where it stands on the ground (a barrier 25 m out round a
// corner would swing with the slightest turn of the road), else the map's d and the same offset
export function remapDress(dress, map, place = null) {
  if (!dress) return dress;
  const D = JSON.parse(JSON.stringify(dress)), node = (p, side) => { const [d, off] = place ? place(p[0], p[1], side) : [map(p[0]), p[1]]; p[0] = Math.round(d * 10) / 10; p[1] = Math.round(off * 100) / 100; };
  if (D.pit) {
    if (Array.isArray(D.pit.pts)) for (const p of D.pit.pts) node(p, D.pit.side < 0 ? -1 : 1);
    for (const k of ['main', 'wall']) if (Array.isArray(D.pit[k])) D.pit[k] = D.pit[k].map(map);
  }
  for (const k of ['kerbs', 'walls']) if (Array.isArray(D[k])) for (const s of D[k]) { if (s.a != null) s.a = map(s.a); if (s.b != null) s.b = map(s.b); }
  if (Array.isArray(D.barriers)) for (const w of D.barriers) if (Array.isArray(w.pts)) for (const p of w.pts) node(p, w.side < 0 ? -1 : 1);
  return D;
}
