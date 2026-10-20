// Free barriers: walls that stand where you put them on the ground (track.dress.free), not beside a stretch of
// track. Each is a line of nodes [x, z, corner?] (corner: 1 = a sharp turn there, else it bends smoothly through)
// and a type (track.js WALL_TYPES); loop: 1 joins its last node back to its first.
//   track.dress.free: [{ type, pts: [[x, z, c?], ...], loop? }]
// A circuit with these has no other barriers (bridge decks keep their parapets): cars hit the walls themselves
// (race.js freeWalls), the world builds them as drawn (world.js buildFreeBarriers), and analyzeTrack still works
// out how far out the wall is beside each bit of track (HAS / BL / BR) for the runoff, scenery and AI.
import { sameStretch } from './track.js';

export const FREE_STEP = 1.5; // (m between the points a free barrier is built from)
export const FREE_CELL = 16;  // (m: the grid its segments are found by)

// the line a barrier runs along, a point every ~FREE_STEP m: [[x, z], ...] (a loop's last point is its first);
// spans (if given) gets, for each point, which node it comes after
export function freeLine(b, spans = null) {
  const P = b.pts, n = P.length; if (!P || n < 2) return P ? P.map(p => [p[0], p[1]]) : [];
  const loop = !!b.loop && n > 2, at = (k) => P[loop ? (k + n) % n : Math.max(0, Math.min(n - 1, k))];
  const out = [[P[0][0], P[0][1]]], nsp = loop ? n : n - 1;
  if (spans) spans.push(0);
  // (a smooth node's tangent runs from the node before it to the one after, a third of the way to each: a corner
  // node has none, so the barrier turns there)
  const tan = (k) => {
    const p = at(k); if (p[2] || (!loop && (k === 0 || k === n - 1))) return [0, 0];
    const a = at(k - 1), c = at(k + 1), la = Math.hypot(p[0] - a[0], p[1] - a[1]), lc = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const tx = c[0] - a[0], tz = c[1] - a[1], tl = Math.hypot(tx, tz) || 1;
    return [tx / tl, tz / tl, la, lc];
  };
  for (let k = 0; k < nsp; k++) {
    const a = at(k), b2 = at(k + 1), ta = tan(k), tb = tan(k + 1), len = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
    const ha = len / 3, hb = len / 3;
    const c1 = [a[0] + ta[0] * ha, a[1] + ta[1] * ha], c2 = [b2[0] - tb[0] * hb, b2[1] - tb[1] * hb];
    const m = Math.max(1, Math.ceil(len / FREE_STEP));
    for (let q = 1; q <= m; q++) {
      const t = q / m, u = 1 - t;
      out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b2[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b2[1]]);
      if (spans) spans.push(q === m ? k + 1 : k);
    }
  }
  return out;
}
export const freeLen = (line) => { let s = 0; for (let k = 1; k < line.length; k++) s += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]); return s; };

// every barrier's segments, and a grid to find the ones near a point: { lines, segs: [ax, az, bx, bz, line#], near }
export function freeLayout(list) {
  const lines = (list || []).filter(b => b && b.pts && b.pts.length >= 2 && b.type !== 'none').map(b => ({ b, type: b.type, line: freeLine(b) }));
  const segs = [], grid = new Map(), key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  lines.forEach((L, n) => {
    for (let k = 0; k + 1 < L.line.length; k++) {
      const [ax, az] = L.line[k], [bx, bz] = L.line[k + 1], s = segs.length;
      segs.push([ax, az, bx, bz, n]);
      const x0 = Math.floor(Math.min(ax, bx) / FREE_CELL), x1 = Math.floor(Math.max(ax, bx) / FREE_CELL), z0 = Math.floor(Math.min(az, bz) / FREE_CELL), z1 = Math.floor(Math.max(az, bz) / FREE_CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const kk = key(cx, cz); let c = grid.get(kk); if (!c) grid.set(kk, c = []); c.push(s); }
    }
  });
  // the segments within r of (x, z) (each once): cb(segment index)
  const seen = new Uint32Array(segs.length); let stamp = 0;
  const near = (x, z, r, cb) => {
    stamp++;
    for (let cx = Math.floor((x - r) / FREE_CELL); cx <= Math.floor((x + r) / FREE_CELL); cx++) for (let cz = Math.floor((z - r) / FREE_CELL); cz <= Math.floor((z + r) / FREE_CELL); cz++) {
      const c = grid.get(key(cx, cz)); if (!c) continue;
      for (const s of c) if (seen[s] !== stamp) { seen[s] = stamp; cb(s); }
    }
  };
  return { lines, segs, near };
}

// where the ray from (x, z) along (dx, dz) first meets a barrier, within len m: [distance, segment] or null
export function freeRay(F, x, z, dx, dz, len) {
  let best = len, bs = -1;
  for (let t = 0; t < len; t += FREE_CELL) {
    const mx = x + dx * (t + FREE_CELL / 2), mz = z + dz * (t + FREE_CELL / 2);
    F.near(mx, mz, FREE_CELL * 0.75, (s) => {
      const [ax, az, bx, bz] = F.segs[s], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) return;
      const qx = ax - x, qz = az - z, u = (qx * ez - qz * ex) / den, v = (qx * dz - qz * dx) / den;
      if (u > 0 && u < best && v >= 0 && v <= 1) { best = u; bs = s; }
    });
    if (bs >= 0 && best <= t + FREE_CELL) break;
  }
  return bs >= 0 ? [best, bs] : null;
}

// For analyzeTrack: beside each bit of track, the first free barrier straight out from the edge, as the barrier
// there: HAS, the offset (from the middle of the road) and its type. One within 40 m counts, or one further out that
// runoff painted out from the road reaches; any further is some other bit of ground's (past a car park or the pit
// lane). Where there's none, the runoff reaches the circuit's own width (`runoff` m past the edge), or as far as the
// paint runs on from it. painted(x, z): runoff paint there.
export function freeOffsets(T, hash, F, HAS, OFF, WT, side, typeIdx, skip, runoff = 0, painted = null) {
  const N = T.N, sep = Math.ceil(60 / T.ds);
  for (let i = 0; i < N; i++) {
    if (skip && skip[i]) continue;
    const h = T.W[i] / 2, rx = T.RX[i] * side, rz = T.RZ[i] * side, x0 = T.X[i] + rx * h, z0 = T.Z[i] + rz * h;
    let hit = freeRay(F, x0, z0, rx, rz, 90);
    // (how far the runoff runs: its own width, then on as long as it's painted, up to the barrier)
    let reach = runoff;
    if (painted) for (let t = 0.5, end = hit ? hit[0] - 0.3 : 90; t < end; t += 1) {
      if (painted(x0 + rx * t, z0 + rz * t)) reach = Math.max(reach, Math.min(end, t + 1)); else if (t > reach) break;
    }
    if (hit && hit[0] > 40 && reach < hit[0] - 3) hit = null;
    // (another stretch's road before it: that's its barrier, not this one's. No road fits in under 6 m)
    if (hit && hit[0] > 6) {
      let other = false;
      for (let t = 3; t < hit[0] - 2 && !other; t += 4) {
        const x = x0 + rx * t, z = z0 + rz * t;
        hash.query(x, z, 14, (j) => { if (!other && Math.hypot(x - T.X[j], z - T.Z[j]) < T.W[j] / 2 && !sameStretch(T, i, j, sep)) other = true; });
      }
      if (other) { HAS[i] = 0; OFF[i] = h + Math.min(reach, hit[0]); continue; }
    }
    if (!hit) { HAS[i] = 0; OFF[i] = h + reach; continue; }
    HAS[i] = 1; OFF[i] = h + hit[0]; if (WT) WT[i] = typeIdx(F.lines[F.segs[hit[1]][4]].type);
  }
}

// The track outlined: a barrier `dist` m from the road all the way round it (and round the pit lane), as smooth
// lines of nodes. Where two stretches of road come nearer than twice that, one barrier runs down the middle between
// them; round a hairpin's inside it rounds off instead of folding. Worked out on a 1 m grid: how far each point is
// from the nearest road edge, and which stretch that is; the barrier is where that distance is `dist`, and where the
// nearest stretch changes nearer in than that.
export function outlineTrack(T, A, dist = 6, type = 'armco') {
  const N = T.N, G = 1, pad = dist + 4, pit = A.pit;
  // each bit of road: centre line from i to i+1, how far out it reaches either side (the pit lane's side reaches
  // across the lane; along the garages, past them)
  const reach = (i, side) => {
    let r = T.W[i] / 2;
    if (pit && pit.side === side && pit.REG[i] >= 0) r = Math.max(r, pit.HIDE && pit.HIDE[i] ? (side < 0 ? A.BL : A.BR)[i] + 14 : pit.OUT[i]);
    return r;
  };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { const r = Math.max(reach(i, -1), reach(i, 1)) + pad; x0 = Math.min(x0, T.X[i] - r); x1 = Math.max(x1, T.X[i] + r); z0 = Math.min(z0, T.Z[i] - r); z1 = Math.max(z1, T.Z[i] + r); }
  x0 = Math.floor(x0); z0 = Math.floor(z0);
  const nx = Math.ceil((x1 - x0) / G) + 2, nz = Math.ceil((z1 - z0) / G) + 2;
  const D = new Float32Array(nx * nz).fill(1e9), S = new Int32Array(nx * nz).fill(-1);
  for (let i = 0; i < N; i++) {
    if (i === T.cut) continue;
    const j = (i + 1) % N, ex = T.X[j] - T.X[i], ez = T.Z[j] - T.Z[i], l2 = ex * ex + ez * ez || 1;
    const rl = [reach(i, -1), reach(j, -1)], rr = [reach(i, 1), reach(j, 1)], R = Math.max(...rl, ...rr) + pad;
    const ax = Math.floor((Math.min(T.X[i], T.X[j]) - R - x0) / G), bx = Math.ceil((Math.max(T.X[i], T.X[j]) + R - x0) / G);
    const az = Math.floor((Math.min(T.Z[i], T.Z[j]) - R - z0) / G), bz = Math.ceil((Math.max(T.Z[i], T.Z[j]) + R - z0) / G);
    for (let gz = Math.max(0, az); gz <= Math.min(nz - 1, bz); gz++) for (let gx = Math.max(0, ax); gx <= Math.min(nx - 1, bx); gx++) {
      const px = x0 + gx * G, pz = z0 + gz * G, t = Math.max(0, Math.min(1, ((px - T.X[i]) * ex + (pz - T.Z[i]) * ez) / l2));
      const cx = T.X[i] + ex * t, cz = T.Z[i] + ez * t, dx = px - cx, dz = pz - cz;
      const side = dx * (T.RX[i] + T.RX[j]) + dz * (T.RZ[i] + T.RZ[j]) > 0 ? 1 : -1, r = (side > 0 ? rr : rl), w = r[0] + (r[1] - r[0]) * t;
      const d = Math.hypot(dx, dz) - w, k = gz * nx + gx;
      if (d < D[k]) { D[k] = d; S[k] = t < 0.5 ? i : j; }
    }
  }
  // (two grid points are on different stretches when their nearest bits of road are: a pit lane's side counts as
  // the track's)
  const sep = Math.ceil((dist * 4 + 40) / T.ds), diff = (a, b) => a >= 0 && b >= 0 && a !== b && !sameStretch(T, a, b, sep);
  // marching squares, cell by cell: the contour at `dist`, and the boundary between stretches where it's nearer in
  const segs = [];
  const P = (gx, gz) => [x0 + gx * G, z0 + gz * G];
  // (each point keyed by the grid edge it's on, or the cell it's the middle of: the same point from either side)
  const keyed = (x, z, key) => { const q = [x, z]; q.key = key; return q; }, ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const lerp = (ka, kb, pa, pb) => { const a = D[ka] - dist, b = D[kb] - dist, f = Math.abs(a - b) < 1e-6 ? 0.5 : a / (a - b); return keyed(pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, 'e' + ek(ka, kb)); };
  for (let gz = 0; gz + 1 < nz; gz++) for (let gx = 0; gx + 1 < nx; gx++) {
    const k = [gz * nx + gx, gz * nx + gx + 1, (gz + 1) * nx + gx + 1, (gz + 1) * nx + gx];
    const p = [P(gx, gz), P(gx + 1, gz), P(gx + 1, gz + 1), P(gx, gz + 1)];
    // (a cell split between two stretches, nearer in than `dist`: the middle line through it)
    const st = k.map(q => S[q]), split = [0, 1, 2, 3].some(e => diff(st[e], st[(e + 1) % 4]));
    if (split && k.every(q => D[q] < dist)) {
      if (k.some(q => D[q] < 1.2)) continue; // (where the two roads all but meet, it stops short of them)
      const mids = [];
      for (let e = 0; e < 4; e++) if (diff(st[e], st[(e + 1) % 4])) { const a = p[e], b = p[(e + 1) % 4]; mids.push(keyed((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 'm' + ek(k[e], k[(e + 1) % 4]))); }
      if (mids.length === 2) segs.push([mids[0], mids[1], 1]);
      else if (mids.length > 2) { const c = keyed((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, 'c' + k[0]); for (const m of mids) segs.push([c, m, 1]); }
      continue;
    }
    let code = 0; for (let e = 0; e < 4; e++) if (D[k[e]] < dist) code |= 1 << e;
    if (code === 0 || code === 15) continue;
    const cut = [];
    for (let e = 0; e < 4; e++) { const a = (code >> e) & 1, b = (code >> ((e + 1) % 4)) & 1; if (a !== b) cut.push(lerp(k[e], k[(e + 1) % 4], p[e], p[(e + 1) % 4])); }
    if (cut.length === 2) segs.push([cut[0], cut[1]]);
    else if (cut.length === 4) { segs.push([cut[0], cut[1]]); segs.push([cut[2], cut[3]]); }
  }
  // (a middle line stops a cell short of the outline it runs into: its loose end is carried on to it)
  {
    const cnt = new Map(), kq0 = (p) => p.key;
    for (const sg of segs) for (const e of [0, 1]) { const q = kq0(sg[e]); cnt.set(q, (cnt.get(q) || 0) + 1); }
    const contour = segs.filter(sg => !sg[2]);
    for (const sg of segs.filter(sg => sg[2])) for (const e of [0, 1]) {
      if (cnt.get(kq0(sg[e])) !== 1) continue;
      const p = sg[e]; let best = null, bd = 2.5;
      for (const c of contour) for (const q of [c[0], c[1]]) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }
      if (best) segs.push([p, best, 1]);
    }
  }
  // join the little segments into lines (breaking where three meet)
  const kq = (p) => p.key, ends = new Map();
  segs.forEach((s, n) => { for (const e of [0, 1]) { const q = kq(s[e]); let a = ends.get(q); if (!a) ends.set(q, a = []); a.push(n); } });
  const used = new Uint8Array(segs.length), lines = [];
  const walk = (n, from) => {
    const line = [segs[n][from], segs[n][1 - from]]; used[n] = 1;
    for (;;) {
      const q = kq(line[line.length - 1]), a = ends.get(q); if (!a || a.length !== 2) break;
      const m = a[0] === n ? a[1] : a[0]; if (used[m]) break;
      used[m] = 1; n = m; line.push(kq(segs[m][0]) === q ? segs[m][1] : segs[m][0]);
    }
    return line;
  };
  // (lines start at their ends or junctions first, then what's left are loops)
  for (const [q, a] of ends) if (a.length !== 2) for (const n of a) if (!used[n]) lines.push(walk(n, kq(segs[n][0]) === q ? 0 : 1));
  for (let n = 0; n < segs.length; n++) if (!used[n]) { const l = walk(n, 0); l.loop = kq(l[0]) === kq(l[l.length - 1]); lines.push(l); }
  // each line smoothed a little, then as few smooth nodes as follow it to 0.35 m
  const out = [];
  for (const l of lines) {
    let len = 0; for (let k = 1; k < l.length; k++) len += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]);
    if (len < 8) continue;
    const loop = !!l.loop, pts = loop ? l.slice(0, -1) : l.slice();
    for (let pass = 0; pass < 3; pass++) {
      const c = pts.map(p => [...p]);
      for (let k = 0; k < pts.length; k++) {
        if (!loop && (k === 0 || k === pts.length - 1)) continue;
        const a = c[(k - 1 + pts.length) % pts.length], b = c[(k + 1) % pts.length];
        pts[k] = [(a[0] + 2 * c[k][0] + b[0]) / 4, (a[1] + 2 * c[k][1] + b[1]) / 4];
      }
    }
    const nodes = simplifyLine(loop ? [...pts, pts[0]] : pts, 0.35);
    if (loop) nodes.pop();
    if (nodes.length < 2) continue;
    out.push({ type, pts: nodes.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), ...(loop && nodes.length > 2 ? { loop: 1 } : {}) });
  }
  return out;
}

// the fewest points of a line that keep within tol m of it (Ramer-Douglas-Peucker), at least one every 40 m
export function simplifyLine(pts, tol) {
  const n = pts.length; if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (b - a < 2) continue;
    const [ax, az] = pts[a], [bx, bz] = pts[b], ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez);
    let bi = -1, bd = tol;
    for (let k = a + 1; k < b; k++) {
      const d = l < 1e-6 ? Math.hypot(pts[k][0] - ax, pts[k][1] - az) : Math.abs((pts[k][0] - ax) * ez - (pts[k][1] - az) * ex) / l;
      if (d > bd) { bd = d; bi = k; }
    }
    if (bi < 0 && l > 40) bi = (a + b) >> 1;
    if (bi >= 0) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// The barriers a circuit has now (worked out, or its own beside-the-track ones), as free ones: each run of wall
// beside the track, in world space, as smooth nodes
export function freeFromTrack(T, A, typeAt) {
  const N = T.N, out = [];
  const add = (run, type, loop) => {
    if (run.length < 3) return;
    const nodes = simplifyLine(loop ? [...run, run[0]] : run, 0.3); if (loop) nodes.pop();
    if (nodes.length >= 2) out.push({ type, pts: nodes.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), ...(loop && nodes.length > 2 ? { loop: 1 } : {}) });
  };
  for (const side of [-1, 1]) {
    const has = side < 0 ? A.HAS_L : A.HAS_R, off = side < 0 ? A.BL : A.BR;
    const at = (q) => { const s = side * off[q]; return [T.X[q] + T.RX[q] * s, T.Z[q] + T.RZ[q] * s]; };
    // (a run starts where the wall does, or changes type, or the track does)
    const start = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) { const p = (i - 1 + N) % N; if (has[i] && (!has[p] || p === T.cut || typeAt(p, side) !== typeAt(i, side))) { start[i] = 1; any = true; } }
    if (!any) { if (has[0]) add(Array.from({ length: N }, (_, q) => at(q)), typeAt(0, side), true); continue; }
    for (let i = 0; i < N; i++) {
      if (!start[i]) continue;
      const type = typeAt(i, side), run = [];
      for (let k = 0; k < N; k++) { const q = (i + k) % N; if (!has[q] || (k > 0 && start[q])) break; run.push(at(q)); if (q === T.cut) break; }
      add(run, type, false);
    }
  }
  return out;
}
