// A real circuit's road with the map's glitches taken out: a zig-zag in the line (points a metre or two apart that
// turn one way and straight back), a corner drawn tighter than the road is wide (its inside edge turning round a
// post), and a short sharp dip or crest in its heights (the scan through a culvert). Each is found the way the Track Check finds it (tools/tracks/checklib.js), on the road as the game draws it,
// and fixed at the points it comes from: points almost on top of each other are merged, and the few points at a
// fault are eased towards their neighbours, a little at a time, until it's gone, none more than 4.5 m. The road moves
// only where it was broken; how far is reported, and what's still there after that is left for a hand to fix. Pure: tools/tracks/build.mjs runs it on every circuit it bakes, tools/tracks/cleanroad.mjs
// on the circuits as they are.
import { sampleTrack, densePath } from './track.js';
const densePathOf = (t) => densePath(t, 0.5);

const MERGE = 3;      // m: points closer than this are one point
const MIN_INNER = 4.5; // m: the inside edge of a corner turns round at least this (the check fails under 4)
const MAX_MOVE = 4.5; // m: the furthest any point may move (the road stays where it really is: what's left is reported)

// the faults on the road as the game draws it: [{ i (sample), kind, v }]
export function roadFaults(track, minInner = MIN_INNER) {
  const T = sampleTrack(track), N = T.N, ds = T.ds, idx = (i) => ((i % N) + N) % N;
  const open = !!track.open, main = (i, m) => !open || (i >= Math.round(m / ds) && i <= T.finish - Math.round(m / ds));
  const head = new Float32Array(N); for (let i = 0; i < N; i++) head[i] = Math.atan2(T.FZ[i], T.FX[i]);
  const dh = (a, b) => { let d = head[b] - head[a]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const w10 = Math.max(2, Math.round(10 / ds)), k1 = new Float32Array(N), k10 = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (!main(i, 24)) continue; k1[i] = dh(idx(i - 1), idx(i + 1)) / (2 * ds); k10[i] = dh(idx(i - w10), idx(i + w10)) / (2 * w10 * ds); }
  const out = [];
  for (let i = 0; i < N; i++) {
    if (!main(i, 24)) continue;
    const r1 = Math.abs(k1[i]), a = k1[idx(i - 2)], b = k1[idx(i + 2)];
    if (r1 > 1 / 25 && r1 > 2.5 * Math.abs(k10[i])) out.push({ i, kind: 'kink', v: r1 });
    else if (Math.abs(a) > 1 / 40 && Math.abs(b) > 1 / 40 && Math.sign(a) !== Math.sign(b) && Math.abs(k10[i]) < Math.max(Math.abs(a), Math.abs(b)) / 3) out.push({ i, kind: 'kink', v: Math.max(Math.abs(a), Math.abs(b)) });
    else if (r1 > 1e-6 && 1 / r1 - T.W[i] / 2 < minInner) out.push({ i, kind: 'tight', v: r1 });
  }
  return { T, faults: out };
}

// track: { points: [{ x, z, w, e, b, hi?, ho? }], open, start }. Returns { points, start, merged (points), moved (the
// furthest a point moved, m), movedAt, report, left (faults still there) }; the track itself isn't changed.
// opts: maxMove (m: how far any point may go, MAX_MOVE), minInner (m: the tightest a corner's inside edge may turn,
// MIN_INNER): a circuit can be given more room (tools/tracks/catalog.mjs clean: { ... })
export function cleanRoad(track, { maxPasses = 80, maxMove = MAX_MOVE, minInner = MIN_INNER } = {}) {
  let P = track.points.map(p => ({ ...p }));
  const open = !!track.open, n0 = P.length;
  let start = track.start || 0;
  const orig = P.map(p => [p.x, p.z]);
  const report = [];
  // points almost on top of each other: one point between them (never the start, nor an open road's ends)
  for (let k = P.length - 1; k > 0; k--) {
    const a = P[k - 1], b = P[k];
    if (k === start || k - 1 === start || (open && (k === P.length - 1 || k - 1 === 0))) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) < MERGE) {
      const m = { ...a, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, e: (a.e + b.e) / 2, w: (a.w + b.w) / 2, b: ((a.b || 0) + (b.b || 0)) / 2 };
      delete m.hi; delete m.ho; P.splice(k - 1, 2, m); orig.splice(k, 1); if (k < start) start--;
      report.push({ at: k - 1, kind: 'merged', moved: Math.hypot(a.x - b.x, a.z - b.z) / 2 });
    }
  }
  let startNow = Math.min(start, P.length - 1);
  // a corner tighter than the road is wide, drawn round a point: its middle redrawn as an arc of the radius it needs
  // (the road's half width plus minInner), meeting the way in and the way out where they run straight (a fillet), when
  // that clears it and the corner's apex moves no more than maxMove
  for (let tries = 0; tries < 12; tries++) {
    const t = { ...track, points: P, start: startNow }, { T, faults } = roadFaults(t, minInner);
    const f = faults.find(q => q.kind === 'tight'); if (!f) break;
    const n = P.length, k = Math.round(T.NODE[f.i]) % n, at = (q) => P[((q % n) + n) % n];
    let done = false;
    for (const span of [2, 3]) {
      const a = k - span, b = k + span; if (!open && (startNow > a && startNow < b)) continue; if (open && (a < 1 || b > n - 2)) continue;
      const pa = at(a), pa0 = at(a - 1), pb = at(b), pb1 = at(b + 1);
      const d1 = [pa.x - pa0.x, pa.z - pa0.z], d2 = [pb1.x - pb.x, pb1.z - pb.z], l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2], cr = u1[0] * u2[1] - u1[1] * u2[0], dot = u1[0] * u2[0] + u1[1] * u2[1];
      const turn = Math.atan2(cr, dot); if (Math.abs(turn) < 0.6) continue;
      const R = T.W[f.i] / 2 + minInner + 1.5, sd = Math.sign(turn); // (1.5 m spare: the curve eases into the arc a little tighter)
      // the arc's centre: R to the inside of both lines (the way in from pa, the way out into pb)
      const n1 = [-u1[1] * sd, u1[0] * sd], n2 = [-u2[1] * sd, u2[0] * sd];
      const o1 = [pa.x + n1[0] * R, pa.z + n1[1] * R], o2 = [pb.x + n2[0] * R, pb.z + n2[1] * R];
      // (the two offset lines' crossing: o1 + s u1 = o2 + q u2)
      const den = u1[0] * u2[1] - u1[1] * u2[0]; if (Math.abs(den) < 1e-6) continue;
      const sP = ((o2[0] - o1[0]) * u2[1] - (o2[1] - o1[1]) * u2[0]) / den, C = [o1[0] + u1[0] * sP, o1[1] + u1[1] * sP];
      const T1 = [C[0] - n1[0] * R, C[1] - n1[1] * R], T2 = [C[0] - n2[0] * R, C[1] - n2[1] * R];
      // (the tangent points must lie past pa along the way in and before pb along the way out)
      if ((T1[0] - pa.x) * u1[0] + (T1[1] - pa.z) * u1[1] < 1 || (pb.x - T2[0]) * u2[0] + (pb.z - T2[1]) * u2[1] < 1) continue;
      const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]); let a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), sweep = a2 - a1;
      while (sd > 0 && sweep < 0) sweep += 2 * Math.PI; while (sd < 0 && sweep > 0) sweep -= 2 * Math.PI;
      const m = Math.max(3, Math.ceil(Math.abs(sweep) * R / 6)), ref = at(k), arc = [];
      for (let q = 0; q <= m; q++) { const an = a1 + sweep * q / m; arc.push({ ...ref, x: C[0] + Math.cos(an) * R, z: C[1] + Math.sin(an) * R, e: pa.e + (pb.e - pa.e) * q / m, w: pa.w + (pb.w - pa.w) * q / m, b: (pa.b || 0) + ((pb.b || 0) - (pa.b || 0)) * q / m }); }
      for (const q of arc) { delete q.hi; delete q.ho; }
      const apexMove = Math.min(...arc.map(q => Math.hypot(q.x - ref.x, q.z - ref.z)));
      if (apexMove > maxMove) continue;
      // (in place of the points between a and b)
      const idx = []; for (let q = a + 1; q < b; q++) idx.push(((q % n) + n) % n);
      const Q = [], origQ = []; let st = startNow;
      for (let q = 0; q < n; q++) {
        if (q === idx[0]) { arc.forEach(p => { Q.push(p); origQ.push([p.x, p.z]); }); }
        if (idx.includes(q)) { if (q < startNow) st--; continue; }
        Q.push(P[q]); origQ.push(orig[q]);
      }
      if (idx[0] > idx[idx.length - 1]) continue; // (over the end of the list: left to the easing)
      st = Math.max(0, Math.min(Q.length - 1, st + (idx[0] < startNow ? arc.length : 0)));
      const after = roadFaults({ ...track, points: Q, start: st }, minInner).faults.filter(q => q.kind === 'tight').length;
      if (after < faults.filter(q => q.kind === 'tight').length) { P = Q; orig.length = 0; origQ.forEach(o => orig.push(o)); startNow = st; report.push({ at: k, kind: 'arc', moved: apexMove, R }); done = true; break; }
    }
    if (!done) break;
  }
  // a hairpin drawn as one sharp point between two close ones: that point out, the curve running through its
  // neighbours instead, where that clears the fault and the road stays within MAX_MOVE of where it was
  for (let tries = 0; tries < 20; tries++) {
    const t = { ...track, points: P, start: startNow }, { T, faults } = roadFaults(t, minInner);
    const tight = faults.filter(f => f.kind === 'tight'); if (!tight.length) break;
    let done = false;
    for (const f of tight) {
      const k = Math.round(T.NODE[f.i]) % P.length, a = P[(k - 1 + P.length) % P.length], b = P[(k + 1) % P.length];
      if (k === startNow || (open && (k === 0 || k === P.length - 1)) || Math.hypot(a.x - P[k].x, a.z - P[k].z) > 15 || Math.hypot(b.x - P[k].x, b.z - P[k].z) > 15) continue;
      const Q = P.filter((_, q) => q !== k), st = k < startNow ? startNow - 1 : startNow, t2 = { ...track, points: Q, start: st };
      const after = roadFaults(t2, minInner).faults.length, D = densePathOf(t2), off = Math.min(...D.map(d => Math.hypot(d.x - P[k].x, d.z - P[k].z)));
      if (after < faults.length && off <= maxMove) { P = Q; orig.splice(k, 1); startNow = st; report.push({ at: k, kind: 'apex', moved: off }); done = true; break; }
    }
    if (!done) break;
  }
  // then each fault, eased out at its points (the two either side of where it is), 15% of the way to their
  // neighbours' middle each pass, never more than MAX_MOVE from where it was
  let left = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    const t = { ...track, points: P, start: startNow }, { T, faults } = roadFaults(t, minInner);
    left = faults;
    if (!faults.length) break;
    const touch = new Set();
    for (const f of faults) { const k = Math.floor(T.NODE[f.i]); for (const q of [k - 1, k, k + 1, k + 2]) touch.add(((q % P.length) + P.length) % P.length); }
    const src = P.map(p => ({ ...p }));
    for (const k of touch) {
      if (k === startNow || (open && (k === 0 || k === P.length - 1))) continue;
      const a = src[(k - 1 + P.length) % P.length], b = src[(k + 1) % P.length], p = P[k];
      const nx = p.x + ((a.x + b.x) / 2 - p.x) * 0.15, nz = p.z + ((a.z + b.z) / 2 - p.z) * 0.15;
      const ox = orig[k][0], oz = orig[k][1], d = Math.hypot(nx - ox, nz - oz), f = d > maxMove ? maxMove / d : 1;
      p.x = ox + (nx - ox) * f; p.z = oz + (nz - oz) * f;
      delete p.hi; delete p.ho; // (a point moved takes the automatic curve's handles)
    }
  }
  // heights: a short, sharp dip or crest (the scan seeing through a culvert under the road, or catching a bridge
  // over it: a vertical curve tighter than 60 m) eased out, its points' heights put on a smooth line between the road's
  // either side of it; only over a short stretch (under 80 m), so a real hill is never flattened
  let dips = 0;
  for (let pass = 0; pass < 6; pass++) {
    const T = sampleTrack({ ...track, points: P, start: startNow }), N = T.N, ds = T.ds, w5 = Math.max(1, Math.round(5 / ds)), idx = (i) => ((i % N) + N) % N;
    const bad = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (open && (i < 3 * w5 || i > T.finish - 3 * w5)) continue;
      const g1 = (T.Y[i] - T.Y[idx(i - w5)]) / (w5 * ds), g2 = (T.Y[idx(i + w5)] - T.Y[i]) / (w5 * ds);
      if (Math.abs(g2 - g1) / (w5 * ds) > 1 / 60) bad[i] = 1;
    }
    let fixed = false;
    for (let i = 0; i < N; i++) {
      if (!bad[i] || bad[idx(i - 1)]) continue;
      let j = i; while (bad[idx(j + 1)] && j - i < N) j++;
      const pad = Math.round(25 / ds), a = i - pad, b = j + pad;
      if ((b - a) * ds > 80 + 2 * 25) continue; // (a long stretch: a real hill)
      const ka = Math.floor(T.NODE[idx(a)]), kb = Math.ceil(T.NODE[idx(b)]) % P.length, n = P.length;
      const span = []; for (let k = ka; k !== kb; k = (k + 1) % n) span.push(k); span.push(kb);
      if (span.length < 3 || span.length > 12) continue;
      const ends = [P[span[0]], P[span[span.length - 1]]], along = [0];
      for (let q = 1; q < span.length; q++) along.push(along[q - 1] + Math.hypot(P[span[q]].x - P[span[q - 1]].x, P[span[q]].z - P[span[q - 1]].z));
      const L = along[along.length - 1] || 1;
      for (let q = 1; q < span.length - 1; q++) { const k = span[q]; if (k === startNow && !open) continue; P[k].e = +(ends[0].e + (ends[1].e - ends[0].e) * along[q] / L).toFixed(2); }
      dips++; fixed = true; i = j;
    }
    if (!fixed) break;
  }
  // how far each point moved, for the report (merged points against what they replaced)
  const moved = P.map((p, k) => orig[k] ? Math.hypot(p.x - orig[k][0], p.z - orig[k][1]) : 0);
  const worst = moved.reduce((m, v, k) => v > m[0] ? [v, k] : m, [0, -1]);
  return { points: P, start: startNow, merged: n0 - P.length, moved: +worst[0].toFixed(2), movedAt: worst[1], dips, report, left: left.length };
}
