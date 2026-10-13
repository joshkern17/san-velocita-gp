// Track data model, spline sampling and analysis (shared by editor + race)
import { BUSINESSES } from './zones.js';
import { runoffReach, realWallOffsets, surfaceGrid } from './runoff.js';

export const SPACING = 2; // metres between track samples

export const THEMES = {
  grass:  { label: 'Countryside', runoff: 14, barrier: 'tires' },
  desert: { label: 'Desert',      runoff: 12, barrier: 'armco' },
  city:   { label: 'City Streets', runoff: 3, barrier: 'concrete' },
  coast:  { label: 'Coastal Island', runoff: 10, barrier: 'armco' },
};

export const PROP_TYPES = {
  tree:       { label: 'Oak Tree',   color: '#3f7a2c', r: 4 },
  pine:       { label: 'Pine',       color: '#2c5a2f', r: 3 },
  blossom:    { label: 'Cherry Blossom', color: '#f09ac0', r: 3.5 },
  autumn:     { label: 'Autumn Tree', color: '#d8872c', r: 4 },
  birch:      { label: 'Birch',      color: '#dfe8c8', r: 3 },
  willow:     { label: 'Willow',     color: '#6f9a48', r: 4 },
  bare:       { label: 'Bare Tree',  color: '#6e5a48', r: 3.5 },
  palm:       { label: 'Palm',       color: '#7aa23a', r: 3 },
  cactus:     { label: 'Joshua Tree', color: '#5f8f3a', r: 2.5 },
  bush:       { label: 'Bush',       color: '#4f8a3a', r: 1.5 },
  flowers:    { label: 'Flowers',    color: '#e88ab8', r: 1.2 },
  rock:       { label: 'Rock',       color: '#8a6a52', r: 3 },
  building:   { label: 'Building',   color: '#8d8d99', r: 12, w: 22, d: 18 },
  tower:      { label: 'Tower',      color: '#6f7890', r: 14, w: 24, d: 24 },
  grandstand: { label: 'Grandstand', color: '#3b64b8', r: 20, w: 50, d: 14 },
  bleachers:  { label: 'Bleachers', color: '#9aa0a8', r: 6, w: 7.8, d: 7.4, back: true }, // (your model: front edge at its origin, the rest behind)
  tires:      { label: 'Tire Stack', color: '#222',    r: 2 },
  billboard:  { label: 'Billboard',  color: '#d8b43a', r: 7, w: 14, d: 1 },
  cones:      { label: 'Cones',      color: '#ff7a1a', r: 2 },
  lamp:       { label: 'Floodlight', color: '#f3e7a1', r: 1 },
  courthouse: { label: 'Auburn Courthouse', color: '#d9a95f', r: 22, w: 46, d: 32 },
  ...Object.fromEntries(Object.entries(BUSINESSES).map(([k, b]) => [k, { label: b.label, color: b.color, r: Math.max(b.w, b.d) / 2, w: b.w, d: b.d, biz: true }])),
};
// paintable ground (editor PAINT tool): colour in the editor. Paved and gravel are runoff (runoff.js): painted
// beside the track they replace its surface there, and painted out past the barrier they move it back
export const PAINTS = {
  grass: { label: 'Grass', color: 'rgba(92,170,64,0.6)' },
  paved: { label: 'Paved', color: 'rgba(150,152,160,0.8)', runoff: true },
  gravel: { label: 'Gravel', color: 'rgba(214,186,128,0.85)', runoff: true },
};
// (the Nature brush, kind 'flora', paints a tree mix from scenery.js FLORA; its ground counts as grass)

// A real circuit's dressing (track.dress, laid out in the Track Studio: studio.html): its curbs and barriers stretch by
// stretch, as the real one has them. a..b: metres along the lap (b < a: across the line); side -1 left, 1 right.
//   kerbs: [{ a, b, side, style, c?, type?, w?, tin?, tout? }]  style: a KERB_STYLES key (its two colors; c: [c1, c2]
//          your own instead), type: a KERB_TYPES key (default raised), w: width (m, default 1.3), tin / tout: the
//          tapered wedge it starts / ends with (m along the track: its width grows from nothing over that).
//          With any, only these have curbs (no automatic ones). Edited in the Circuit Designer (CURBS) and Track Studio
//   walls: [{ a, b, side, type, off? }]  type: a WALL_TYPES key ('none': no barrier there); off: metres out from the
//          track edge (else where the barrier already stands). (Track Studio's; barriers, below, replace them)
//   barriers: [{ side, type, pts: [[d, off], ...] }]  every barrier the track has (with this, there are no others):
//          nodes in lap order, d m along the lap (it may run across the line), off m out from the track edge; straight
//          between them. Edited in the Circuit Designer (BARRIERS); a track's automatic ones turned into these: autoBarriers
export const KERB_STYLES = {
  rw: { label: 'Red / White', c: ['#c3221f', '#e9e6df'] },
  bw: { label: 'Blue / White', c: ['#1f48a8', '#e9e6df'] },
  gw: { label: 'Green / White', c: ['#1f7a34', '#e9e6df'] },
  yb: { label: 'Yellow / Black', c: ['#e2bb1a', '#1c1c1c'] },
  rg: { label: 'Red / Green', c: ['#c3221f', '#2a7a30'] },
  w: { label: 'White', c: ['#e9e6df', '#cfccc4'] },
};
export const WALL_TYPES = {
  concrete: { label: 'Concrete' }, armco: { label: 'Armco' }, tires: { label: 'Tire Wall' },
  fence: { label: 'Fence Only' }, none: { label: 'None' },
};
// how it rises from the road edge: raised (up to KERB_H at its outer edge, rumble strips), flat (painted, no rise),
// sawtooth (raised, with deep ridges you feel), sausage (a tall round hump: it kicks the car if you cut over it)
export const KERB_TYPES = {
  raised: { label: 'Raised' }, flat: { label: 'Flat' }, saw: { label: 'Sawtooth' }, sausage: { label: 'Sausage' },
};
export const KERB_W = 1.3, SAUSAGE_H = 0.13;
const WALL_KEYS = Object.keys(WALL_TYPES);
export const wallTypeAt = (A, i, side, env) => (A.WT && WALL_KEYS[A.WT[side < 0 ? 0 : 1][i] - 1]) || env.barrier;
// the curb on this side at sample i (its stretch: A.kerbs), or null; its width there (tapered ends: less); its colors
export const kerbOf = (A, i, side) => { const k = A.KI && A.KI[side < 0 ? 0 : 1][i]; return k ? A.kerbs[k - 1] : null; };
export const kerbW = (A, i, side) => (A.KW ? A.KW[side < 0 ? 0 : 1][i] : 0);
export const kerbOn = (A, i, side) => kerbW(A, i, side) > 0.05;
export const kerbColors = (k) => (k.c && k.c.length === 2 ? k.c : (KERB_STYLES[k.style] || KERB_STYLES.rw).c);
export const kerbStyleAt = (A, i, side) => { const k = kerbOf(A, i, side); return k ? k.style || 'rw' : null; };
// the automatic curbs (KERB: a sample has them both sides) as stretches, to edit
export function autoKerbs(T, KERB) {
  const N = T.N, out = [];
  const start = KERB.findIndex((v, i) => v && !KERB[(i - 1 + N) % N]);
  if (start < 0) return KERB[0] ? [-1, 1].map(side => ({ a: 0, b: +(T.L - 0.1).toFixed(1), side, style: 'rw' })) : out;
  for (let k = 0; k < N; k++) {
    const i = (start + k) % N; if (!KERB[i] || KERB[(i - 1 + N) % N]) continue;
    let j = i; while (KERB[(j + 1) % N] && (j + 1) % N !== i) j = (j + 1) % N;
    for (const side of [-1, 1]) out.push({ a: +T.D[i].toFixed(1), b: +T.D[j].toFixed(1), side, style: 'rw' });
  }
  return out;
}
// a dressing's stretches with [a, b] on this side taken out (the ones it overlaps cut short or split); L: lap length
export function cutStretches(list, a, b, side, L) {
  const parts = (p, q) => (p <= q ? [[p, q]] : [[p, L], [0, q]]), out = [];
  for (const s of list) {
    if (s.side !== side) { out.push(s); continue; }
    let pieces = parts(s.a, s.b);
    for (const [ca, cb] of parts(a, b)) pieces = pieces.flatMap(([pa, pb]) => {
      if (cb <= pa || ca >= pb) return [[pa, pb]];
      const r = []; if (ca > pa) r.push([pa, ca]); if (cb < pb) r.push([cb, pb]); return r;
    });
    // (one across the line comes back in two: join them)
    const e = pieces.findIndex(p => p[1] >= L - 1e-6), z = pieces.findIndex(p => p[0] <= 1e-6);
    if (e >= 0 && z >= 0 && e !== z) { pieces[e] = [pieces[e][0], pieces[z][1]]; pieces.splice(z, 1); }
    const cut0 = pieces.length !== 1 || pieces[0][0] !== s.a, cut1 = pieces.length !== 1 || pieces[0][1] !== s.b;
    for (const [pa, pb] of pieces) if ((((pb - pa) % L) + L) % L > 1) {
      const n = { ...s, a: +pa.toFixed(1), b: +pb.toFixed(1) };
      if (cut0 && pa !== s.a) delete n.tin; if (cut1 && pb !== s.b) delete n.tout; // (a cut end is square)
      out.push(n);
    }
  }
  return out;
}
// How far along a line of nodes ([[d, off], ...], d m along the lap, in lap order) each node is from its first, node to
// node: a barrier or pit lane all the way round ends on (or a hair past) where it starts, and the last node's d less
// the first's would make it no length at all (a track reshaped a little shorter: 4220.1 m on a 4220.09 m lap).
export function nodeU(P, L) {
  const U = [0];
  for (let k = 1; k < P.length; k++) U.push(Math.min(L, U[k - 1] + ((((P[k][0] - P[k - 1][0]) % L) + L) % L)));
  return U;
}

// The track's frame d m along the lap (between samples): centre, forward, right, width.
export function trackFrame(T, d) {
  const u = ((d % T.L) + T.L) % T.L / T.ds, i = Math.floor(u) % T.N, j = (i + 1) % T.N, f = u - Math.floor(u), l = (a, b) => a + (b - a) * f;
  let fx = l(T.FX[i], T.FX[j]), fz = l(T.FZ[i], T.FZ[j]); const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
  return { x: l(T.X[i], T.X[j]), z: l(T.Z[i], T.Z[j]), fx, fz, rx: -fz, rz: fx, w: l(T.W[i], T.W[j]) };
}
// A point beside the track as [d m along the lap, m out from the edge on that side], looked for between d = a and b
// (m along the lap, a little either side): where the track's cross-section through it is.
export function trackProject(T, x, z, side, a, b) {
  const L = T.L, n = Math.ceil((((b - a) % L) + L) % L / T.ds) + 1, i0 = Math.floor(a / T.ds);
  // (between two neighbouring cross-sections: on the outside of a tight corner they fan out wider than a sample apart;
  // the nearest such pair, as one far round the lap can line up too)
  let bi = -1, bv = Infinity;
  const AL = (i) => (x - T.X[i]) * T.FX[i] + (z - T.Z[i]) * T.FZ[i];
  for (let k = -6; k <= n + 6; k++) {
    const i = (((i0 + k) % T.N) + T.N) % T.N, j = (i + 1) % T.N, ai = AL(i), aj = AL(j);
    if (ai < -1e-6 || aj > 1e-6) continue;
    const ac = (x - T.X[i]) * T.RX[i] + (z - T.Z[i]) * T.RZ[i];
    if (ac * side < 0) continue;
    if (Math.abs(ac) < bv) { bv = Math.abs(ac); bi = ai / Math.max(1e-6, ai - aj) < 0.5 ? i : j; }
  }
  if (bi < 0) return null;
  // (then onto the track's frame between samples, as trackFrame puts a node back: the same spot both ways)
  let d = T.D[bi], F;
  for (let it = 0; it < 8; it++) { F = trackFrame(T, d); const al = (x - F.x) * F.fx + (z - F.z) * F.fz; d += Math.max(-T.ds, Math.min(T.ds, al * 0.7)); if (Math.abs(al) < 0.02) break; }
  F = trackFrame(T, d);
  return [(((d % L) + L) % L), ((x - F.x) * F.rx + (z - F.z) * F.rz) * side - F.w / 2];
}
// A barrier's line as [d, off] points close enough together to join straight (track.dress.barriers). A node is
// [d, off] or [d, off, { f, ho, hi }]: f, the stretch from it to the next runs free across the ground (straight, or
// bent by the handles), not along the track; ho / hi, its handles out to the next node / in from the one before, as
// [m along the track, m further out] from the node, so they turn with the track when it's reshaped. Without f, a
// stretch keeps the same distance from the edge as it goes (changing evenly from one node's to the next's).
export function barrierLine(w, T) {
  const P = w.pts, L = T.L, U = nodeU(P, L), d0 = P[0][0], side = w.side, out = [[P[0][0], P[0][1]]];
  if (!P.some(p => p[2] && (p[2].f || p[2].ho || p[2].hi))) return P;
  const at = (d, off) => { const F = trackFrame(T, d), s = side * (F.w / 2 + off); return { x: F.x + F.rx * s, z: F.z + F.rz * s, F }; };
  for (let k = 0; k + 1 < P.length; k++) {
    const a = P[k], b = P[k + 1], o = a[2] || {};
    if (o.f) {
      const A = at(a[0], a[1]), B = at(b[0], b[1]), oi = b[2] || {};
      const hand = (Q, h) => ({ x: Q.x + Q.F.fx * h[0] + Q.F.rx * side * h[1], z: Q.z + Q.F.fz * h[0] + Q.F.rz * side * h[1] });
      const c1 = o.ho ? hand(A, o.ho) : { x: A.x + (B.x - A.x) / 3, z: A.z + (B.z - A.z) / 3 };
      const c2 = oi.hi ? hand(B, oi.hi) : { x: B.x + (A.x - B.x) / 3, z: B.z + (A.z - B.z) / 3 };
      const len = Math.hypot(c1.x - A.x, c1.z - A.z) + Math.hypot(c2.x - c1.x, c2.z - c1.z) + Math.hypot(B.x - c2.x, B.z - c2.z);
      // points along it, ~1.5 m apart, and closer wherever a little of it covers a lot of the track (well out past
      // the apex of a tight corner, the track's cross-sections all but meet): no more than 2.5 m round the lap apart
      const n = Math.max(2, Math.ceil(len / 1.5));
      const pt = (t) => { const m = 1 - t, x = m * m * m * A.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * B.x, z = m * m * m * A.z + 3 * m * m * t * c1.z + 3 * m * t * t * c2.z + t * t * t * B.z;
        const pr = trackProject(T, x, z, side, d0 + U[k] - 10, d0 + U[k + 1] + 10); return pr ? { u: (((pr[0] - d0) % L) + L) % L, pr } : null; };
      const pts = [];
      const fill = (t0, p0, t1, p1, depth) => {
        if (depth > 10 || !p0 || !p1 || Math.abs(p1.u - p0.u) <= 2.5) return;
        const tm = (t0 + t1) / 2, pm = pt(tm);
        fill(t0, p0, tm, pm, depth + 1); if (pm) pts.push(pm); fill(tm, pm, t1, p1, depth + 1);
      };
      let tp = 0, pp = { u: U[k], pr: [a[0], a[1]] };
      for (let q = 1; q <= n; q++) {
        const t = q / n, p = q === n ? { u: U[k + 1], pr: [b[0], b[1]] } : pt(t);
        if (!p) continue;
        fill(tp, pp, t, p, 0); if (q < n) pts.push(p); tp = t; pp = p;
      }
      let last = U[k];
      for (const { u, pr } of pts) {
        if (u <= last + 0.05 || u >= U[k + 1] - 0.05) continue; // (never backwards: the inside of a hairpin)
        last = u; out.push([pr[0], Math.max(0.3, pr[1])]);
      }
    }
    out.push([b[0], b[1]]);
  }
  return out;
}

// A track's barriers as they stand (A: analyzeTrack's) as editable ones (dress.barriers): each unbroken run of one
// type on one side, its nodes as few as follow it to 0.6 m (and one every 80 m at most). Bridge decks are left out.
export function autoBarriers(T, A, env) {
  const N = T.N, out = [];
  for (const side of [-1, 1]) {
    const has = side < 0 ? A.HAS_L : A.HAS_R, off = side < 0 ? A.BL : A.BR;
    const on = (i) => has[i] && !A.BRIDGE[i] && !(A.OVERPASS && A.OVERPASS[i]) && i !== T.cut;
    const type = (i) => wallTypeAt(A, i, side, env);
    // (start somewhere a run doesn't carry on through)
    let s0 = 0; while (s0 < N && on(s0) && on((s0 - 1 + N) % N) && type(s0) === type((s0 - 1 + N) % N)) s0++;
    if (s0 >= N) s0 = 0;
    for (let k = 0; k < N; k++) {
      const i = (s0 + k) % N; if (!on(i)) continue;
      const p = (i - 1 + N) % N; if (k > 0 && on(p) && type(p) === type(i)) continue;
      const run = [i]; let j = i;
      while (run.length < N && on((j + 1) % N) && type((j + 1) % N) === type(i) && (j + 1) % N !== s0) { j = (j + 1) % N; run.push(j); }
      if (run.length < 2) continue;
      const pts = run.map(q => [T.D[q], off[q] - T.W[q] / 2]);
      // (fewest nodes: Douglas-Peucker on [m along, m out], along measured from the run's start)
      const u = run.map((q, n) => n * T.ds), keep = new Uint8Array(run.length); keep[0] = keep[run.length - 1] = 1;
      const rdp = (a, b) => { let bi = -1, bd = 0.6; for (let n = a + 1; n < b; n++) { const f = (u[n] - u[a]) / (u[b] - u[a]), e = Math.abs(pts[n][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * f)); if (e > bd) { bd = e; bi = n; } } if (bi < 0 && u[b] - u[a] > 80) bi = (a + b) >> 1; if (bi >= 0) { keep[bi] = 1; rdp(a, bi); rdp(bi, b); } };
      rdp(0, run.length - 1);
      out.push({ side, type: type(i), pts: pts.filter((_, n) => keep[n]).map(([d, o]) => [+d.toFixed(1), +o.toFixed(2)]) });
    }
  }
  return out;
}
// the samples a dressing stretch covers
export function stretchIdx(T, a, b) {
  const out = [], L = T.L;
  a = ((a % L) + L) % L; b = ((b % L) + L) % L;
  for (let i = 0; i < T.N; i++) { const d = T.D[i]; if (a <= b ? d >= a && d <= b : d >= a || d <= b) out.push(i); }
  return out;
}

// env.barrier: 'tires' | 'armco' | 'concrete', or 'none': no walls to see or hit, just a soft invisible border where
// the runoff ends (the world's edge: a road through open country, a street race between buildings). env.dress false:
// no circuit dressing (gantries, corner boards).
export function defaultEnv(theme = 'grass') {
  return {
    theme, time: 'day', weather: 'clear', laps: 3, opponents: 7,
    runoff: THEMES[theme].runoff, barrier: THEMES[theme].barrier,
    scenery: 0.7, kerbs: true, pits: true, pitSide: 'auto',
  };
}

export function cloneTrack(t) { return JSON.parse(JSON.stringify(t)); }

export function newTrack(name = 'Untitled Circuit') {
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * 320, z: Math.sin(a) * 200, w: 13, e: 0, b: 0 });
  }
  return { version: 1, name, points: pts, props: [], env: defaultEnv('grass'), start: 0 };
}

// ---------- Spline helpers ----------

function crPoint(p0, p1, p2, p3, u) {
  // centripetal Catmull-Rom
  const d01 = Math.max(1e-3, Math.pow(Math.hypot(p1.x - p0.x, p1.z - p0.z), 0.5));
  const d12 = Math.max(1e-3, Math.pow(Math.hypot(p2.x - p1.x, p2.z - p1.z), 0.5));
  const d23 = Math.max(1e-3, Math.pow(Math.hypot(p3.x - p2.x, p3.z - p2.z), 0.5));
  const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
  const t = t1 + u * (t2 - t1);
  const L = (a, b, ta, tb) => {
    const k = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

const smooth = (a, b, u) => a + (b - a) * (u * u * (3 - 2 * u));

// Curve handles (the Circuit Designer's EDIT tool): a node may carry ho / hi, its handles out to the next node and in
// from the one before, as [dx, dz] from it. A stretch with a handle at either end is a cubic Bezier through them; the
// end without one takes the handle the automatic curve (centripetal Catmull-Rom) would have, so a node no one has
// touched keeps the curve it always had.
const CR_EPS = 1e-3;
function autoOut(p0, p1, p2, p3) { const q = crPoint(p0, p1, p2, p3, CR_EPS); return [(q.x - p1.x) / CR_EPS / 3, (q.z - p1.z) / CR_EPS / 3]; }
function autoIn(p0, p1, p2, p3) { const q = crPoint(p0, p1, p2, p3, 1 - CR_EPS); return [(q.x - p2.x) / CR_EPS / 3, (q.z - p2.z) / CR_EPS / 3]; }
function segCtrl(p0, p1, p2, p3) {
  if (!p1.ho && !p2.hi) return null;
  const o = p1.ho || autoOut(p0, p1, p2, p3), i = p2.hi || autoIn(p0, p1, p2, p3);
  return { c1: { x: p1.x + o[0], z: p1.z + o[1] }, c2: { x: p2.x + i[0], z: p2.z + i[1] } };
}
function segPoint(p0, p1, p2, p3, u, cc) {
  if (!cc) return crPoint(p0, p1, p2, p3, u);
  const m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u;
  return { x: a * p1.x + b * cc.c1.x + c * cc.c2.x + d * p2.x, z: a * p1.z + b * cc.c1.z + c * cc.c2.z + d * p2.z };
}
const segLength = (p1, p2, cc) => cc ? Math.hypot(cc.c1.x - p1.x, cc.c1.z - p1.z) + Math.hypot(cc.c2.x - cc.c1.x, cc.c2.z - cc.c1.z) + Math.hypot(p2.x - cc.c2.x, p2.z - cc.c2.z) : Math.hypot(p2.x - p1.x, p2.z - p1.z);
// a node's handles as they stand (its own, else the automatic curve's), [dx, dz] from it; null where there's no stretch
export function nodeHandles(track, k) {
  const P = track.points, n = P.length;
  if (n < 2) return { hi: null, ho: null };
  const ghost = (a, b) => ({ x: 2 * a.x - b.x, z: 2 * a.z - b.z });
  const at = (j) => track.open ? (j < 0 ? ghost(P[0], P[1]) : j >= n ? ghost(P[n - 1], P[n - 2]) : P[j]) : P[((j % n) + n) % n];
  const hasOut = !track.open || k < n - 1, hasIn = !track.open || k > 0;
  const p = P[k];
  return {
    ho: hasOut ? (p.ho || autoOut(at(k - 1), p, at(k + 1), at(k + 2))) : null,
    hi: hasIn ? (p.hi || autoIn(at(k - 2), at(k - 1), p, at(k + 1))) : null,
  };
}
// Elevation between nodes: Catmull-Rom with the slopes measured per metre (each node's slope from its neighbours'
// heights over the real distance between them), so the grade runs on smoothly through a node even when the
// nodes either side are 5 m and 100 m away (plain Catmull-Rom assumes even spacing and kinks there). With evenly
// spaced nodes it's exactly plain Catmull-Rom.
function crElev(p0, p1, p2, p3, u) {
  const L0 = Math.max(0.1, Math.hypot(p1.x - p0.x, p1.z - p0.z)), L1 = Math.max(0.1, Math.hypot(p2.x - p1.x, p2.z - p1.z)), L2 = Math.max(0.1, Math.hypot(p3.x - p2.x, p3.z - p2.z));
  const m1 = (p2.e - p0.e) / (L0 + L1) * L1, m2 = (p3.e - p1.e) / (L1 + L2) * L1;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1.e + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2.e + (u3 - u2) * m2;
}

// Point-to-point tracks (track.open): the road runs from the first node (start line) to the last (finish line).
// The game adds a straight grid lead-in behind the start and a braking run-off past the finish, ending in walls.
// Samples are laid out [start .. finish .. run-off end | back of the grid .. just behind the start], so sample 0
// is still the start line and everything that wraps round the lap (grid slots behind the line, lookaheads) keeps
// working. The one gap is between T.cut (end of the run-off) and T.cut + 1 (back of the grid): nothing joins there.
export const OPEN_RUNOFF = 300, OPEN_LEADIN = 170, OPEN_END_WALL = 4; // (wall face: metres past the last sample)
export const minNodes = (track) => track.open ? 2 : 4;
export const trackReady = (track) => !!track && Array.isArray(track.points) && track.points.length >= minNodes(track);
// k samples along from i, stopping at a point-to-point track's two dead ends
export function stepIdx(T, i, k) {
  const N = T.N;
  if (T.cut < 0) return (((i + k) % N) + N) % N;
  const base = T.cut + 1, lin = (i - base + N) % N; // 0 = back of the grid, N-1 = end of the run-off
  return (Math.max(0, Math.min(N - 1, lin + k)) + base) % N;
}
// does sample i join on to sample i+1?
export const joins = (T, i) => i !== T.cut;

function sampleOpen(track) {
  const pts = track.points, n = pts.length;
  const fine = [];
  const ghost = (a, b) => ({ x: 2 * a.x - b.x, z: 2 * a.z - b.z, e: 2 * a.e - b.e, w: a.w, b: a.b });
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const p0 = i > 0 ? pts[i - 1] : ghost(p1, p2), p3 = i + 2 < n ? pts[i + 2] : ghost(p2, p1);
    const cc = segCtrl(p0, p1, p2, p3), segLen = segLength(p1, p2, cc);
    const steps = Math.max(8, Math.ceil(segLen / 0.75));
    for (let k = 0; k < steps; k++) {
      const u = k / steps, p = segPoint(p0, p1, p2, p3, u, cc);
      fine.push({ x: p.x, z: p.z, e: crElev(p0, p1, p2, p3, u), w: smooth(p1.w, p2.w, u), b: smooth(p1.b, p2.b, u), node: i + u });
    }
  }
  const last = pts[n - 1];
  fine.push({ x: last.x, z: last.z, e: last.e, w: last.w, b: last.b, node: n - 1 });
  const m = fine.length;
  const cum = new Float64Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].z - fine[i - 1].z);
  const Lrace = Math.max(1, cum[m - 1]);
  const nMain = Math.max(12, Math.round(Lrace / SPACING)), ds = Lrace / nMain;
  const nRun = Math.round(OPEN_RUNOFF / ds), nLead = Math.round(OPEN_LEADIN / ds);
  const N = nMain + 1 + nRun + nLead;
  const T = {
    N, L: N * ds, ds, open: true, cut: nMain + nRun, finish: nMain, raceL: Lrace,
    X: new Float32Array(N), Z: new Float32Array(N), Y: new Float32Array(N),
    W: new Float32Array(N), B: new Float32Array(N),
    FX: new Float32Array(N), FZ: new Float32Array(N),
    RX: new Float32Array(N), RZ: new Float32Array(N),
    K: new Float32Array(N), D: new Float32Array(N), NODE: new Float32Array(N),
  };
  const put = (i, x, z, e, w, b, node) => { T.X[i] = x; T.Z[i] = z; T.Y[i] = Math.max(0, e); T.W[i] = w; T.B[i] = b * Math.PI / 180; T.NODE[i] = node; T.D[i] = i * ds; };
  let j = 0;
  for (let i = 0; i <= nMain; i++) {
    const d = Math.min(Lrace, i * ds);
    while (j < m - 2 && cum[j + 1] < d) j++;
    const a = fine[j], b = fine[j + 1], seg = cum[j + 1] - cum[j];
    const k = seg > 1e-6 ? Math.max(0, Math.min(1, (d - cum[j]) / seg)) : 0;
    put(i, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, a.e + (b.e - a.e) * k, a.w + (b.w - a.w) * k, a.b + (b.b - a.b) * k, a.node + (b.node - a.node) * k);
  }
  // straight run-off past the finish, straight lead-in behind the start (level, unbanked, same width)
  const dirAt = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const back = Math.max(0, m - 1 - Math.max(2, Math.round(8 / 0.75)));
  const [ex, ez] = dirAt(fine[back], fine[m - 1]);
  const [sx, sz] = dirAt(fine[0], fine[Math.min(m - 1, Math.max(2, Math.round(8 / 0.75)))]);
  for (let k = 1; k <= nRun; k++) put(nMain + k, last.x + ex * k * ds, last.z + ez * k * ds, last.e, last.w, last.b * Math.max(0, 1 - k * ds / 40), n - 1);
  const first = pts[0];
  for (let k = 1; k <= nLead; k++) put(N - k, first.x - sx * k * ds, first.z - sz * k * ds, first.e, first.w, first.b * Math.max(0, 1 - k * ds / 40), 0);
  easeY(T);
  finishFrames(T);
  return T;
}

// forward / right vectors and curvature from the sample positions
function finishFrames(T) {
  const N = T.N, ds = T.ds;
  for (let i = 0; i < N; i++) {
    const p = stepIdx(T, i, -1), q = stepIdx(T, i, 1);
    let fx = T.X[q] - T.X[p], fz = T.Z[q] - T.Z[p];
    const l = Math.hypot(fx, fz) || 1;
    fx /= l; fz /= l;
    T.FX[i] = fx; T.FZ[i] = fz;
    T.RX[i] = -fz; T.RZ[i] = fx;
  }
  // signed curvature: positive = turning right (+s side)
  const Kraw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = stepIdx(T, i, -2), q = stepIdx(T, i, 2);
    const cr = T.FX[p] * T.FZ[q] - T.FZ[p] * T.FX[q];
    const span = T.cut < 0 ? 4 : Math.max(1, (q - p + N) % N);
    Kraw[i] = Math.asin(Math.max(-1, Math.min(1, cr))) / (span * ds);
  }
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += Kraw[stepIdx(T, i, k)];
    T.K[i] = s / 7;
  }
}

// Sample the track into evenly spaced points. Sample 0 = start line.
export function sampleTrack(track) {
  if (track.open) return sampleOpen(track);
  const src = track.points;
  const n = src.length;
  const s0 = ((track.start || 0) % n + n) % n;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(src[(s0 + i) % n]);

  const fine = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const cc = segCtrl(p0, p1, p2, p3), segLen = segLength(p1, p2, cc);
    const steps = Math.max(8, Math.ceil(segLen / 0.75));
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      const p = segPoint(p0, p1, p2, p3, u, cc);
      fine.push({
        x: p.x, z: p.z,
        e: crElev(p0, p1, p2, p3, u),
        w: smooth(p1.w, p2.w, u),
        b: smooth(p1.b, p2.b, u),
        node: ((s0 + i) % n) + u,
      });
    }
  }
  const m = fine.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = fine[i], b = fine[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.z - a.z);
  }
  const L = cum[m];
  const N = Math.max(24, Math.round(L / SPACING));
  const ds = L / N;

  const T = {
    N, L, ds, open: false, cut: -1, finish: 0, raceL: L,
    X: new Float32Array(N), Z: new Float32Array(N), Y: new Float32Array(N),
    W: new Float32Array(N), B: new Float32Array(N),
    FX: new Float32Array(N), FZ: new Float32Array(N),
    RX: new Float32Array(N), RZ: new Float32Array(N),
    K: new Float32Array(N), D: new Float32Array(N), NODE: new Float32Array(N),
  };
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = i * ds;
    while (j < m - 1 && cum[j + 1] < d) j++;
    const a = fine[j], b = fine[(j + 1) % m];
    const seg = cum[j + 1] - cum[j];
    const k = seg > 1e-6 ? (d - cum[j]) / seg : 0;
    T.X[i] = a.x + (b.x - a.x) * k;
    T.Z[i] = a.z + (b.z - a.z) * k;
    T.Y[i] = Math.max(0, a.e + (b.e - a.e) * k);
    T.W[i] = a.w + (b.w - a.w) * k;
    T.B[i] = (a.b + (b.b - a.b) * k) * Math.PI / 180;
    T.D[i] = d;
    let nd = b.node < a.node ? b.node + n : b.node;
    T.NODE[i] = (a.node + (nd - a.node) * k) % n;
  }
  easeY(T);
  finishFrames(T);
  return T;
}

// A light smoothing of the road's height over +-4 m: the spline runs at an uneven speed through tight hairpins,
// which leaves ~10 cm of jitter between samples (felt as a buzz over the bumps). Nothing a driver can see is changed.
function easeY(T) {
  const N = T.N, src = T.Y.slice(), open = T.cut >= 0, base = T.cut + 1;
  for (let i = 0; i < N; i++) {
    let s = 0;
    if (open) { const lin = (i - base + N) % N; for (let k = -2; k <= 2; k++) s += src[(base + Math.max(0, Math.min(N - 1, lin + k))) % N]; }
    else for (let k = -2; k <= 2; k++) s += src[(i + k + N) % N];
    T.Y[i] = s / 5;
  }
}

// ---------- spatial hash ----------
export function buildHash(T, cell = 24) {
  const map = new Map();
  for (let i = 0; i < T.N; i++) {
    const key = Math.floor(T.X[i] / cell) + ',' + Math.floor(T.Z[i] / cell);
    let a = map.get(key);
    if (!a) map.set(key, a = []);
    a.push(i);
  }
  return {
    cell,
    query(x, z, r, cb) {
      const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell);
      const r0 = Math.floor((z - r) / cell), r1 = Math.floor((z + r) / cell);
      for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
        const a = map.get(cx + ',' + cz);
        if (a) for (let k = 0; k < a.length; k++) cb(a[k]);
      }
    },
  };
}

export const circDist = (a, b, N) => { const d = Math.abs(a - b) % N; return Math.min(d, N - d); };

// ---------- analysis: bridges, barriers ----------
// paint: the track's painted strokes (runoff painted past the barrier moves it back); osm: a real circuit's map data
// (track.osm): where it has barriers (walls), the barrier stands where they do, past the runoff its photos see (surface);
// dress: a real circuit's curbs and barriers stretch by stretch (track.dress, above)
export function analyzeTrack(T, env, paint = null, osm = null, dress = null) {
  const N = T.N;
  const hash = buildHash(T);
  const sep = Math.ceil(40 / T.ds);
  const BRIDGE = new Uint8Array(N);   // this sample passes over another section
  const LIFT = new Float32Array(N);   // tiny visual offset for flat crossings
  // A bridge is where the road really passes over another part of the track: the two roads overlap (CROSS).
  // Near enough to a real crossing, the deck also spans the lower road's runoff and barriers (so its embankment
  // can't bury them). Two sections that only run close at different heights (the two legs of a chicane or hairpin
  // on a hillside) are not a bridge: they stay on the ground.
  const CROSS = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    hash.query(T.X[i], T.Z[i], 30, (j) => {
      if (circDist(i, j, N) < sep) return;
      const d = Math.hypot(T.X[i] - T.X[j], T.Z[i] - T.Z[j]);
      if (T.Y[i] - T.Y[j] > 4 && d < (T.W[i] + T.W[j]) * 0.5 + 1) CROSS[i] = 1;
    });
  }
  const nearCross = new Uint8Array(N), reachC = Math.ceil(30 / T.ds);
  for (let i = 0; i < N; i++) if (CROSS[i]) for (let k = -reachC; k <= reachC; k++) nearCross[(i + k + N) % N] = 1;
  for (let i = 0; i < N; i++) {
    hash.query(T.X[i], T.Z[i], 30, (j) => {
      if (circDist(i, j, N) < sep) return;
      const d = Math.hypot(T.X[i] - T.X[j], T.Z[i] - T.Z[j]);
      const dy = T.Y[i] - T.Y[j];
      if (nearCross[i] && dy > 4 && d < T.W[i] / 2 + T.W[j] / 2 + (env.runoff || 0) + 8) BRIDGE[i] = 1;
      if (d < (T.W[i] + T.W[j]) * 0.5 + 6) {
        if (Math.abs(dy) <= 4 && i > j && d < (T.W[i] + T.W[j]) * 0.5) LIFT[i] = 0.06;
      }
    });
  }
  // dilate bridge flags so decks extend past the crossing
  const dil = Math.ceil(14 / T.ds);
  const BR2 = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (BRIDGE[i]) for (let k = -dil; k <= dil; k++) BR2[(i + k + N) % N] = 1;

  const runoff = env.runoff;
  const offL = new Float32Array(N), offR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const half = T.W[i] / 2;
    let base = BR2[i] ? half + 0.8 : half + runoff;
    let l = base, r = base;
    const k = T.K[i];
    if (Math.abs(k) > 1e-4) {
      const rad = 1 / Math.abs(k);
      const lim = Math.max(half + 1.2, rad * 0.8);
      if (k > 0) r = Math.min(r, lim); else l = Math.min(l, lim);
    }
    offL[i] = l; offR[i] = r;
  }
  // smooth offsets: windowed min then average
  const smoothArr = (a) => {
    const w = 6, m = new Float32Array(N), o = new Float32Array(N);
    for (let i = 0; i < N; i++) { let v = 1e9; for (let k = -w; k <= w; k++) v = Math.min(v, a[(i + k + N) % N]); m[i] = v; }
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -w; k <= w; k++) s += m[(i + k + N) % N]; o[i] = s / (2 * w + 1); }
    return o;
  };
  const BL = smoothArr(offL), BRt = smoothArr(offR);
  // wider on the outside of fast corners and braking zones, and wherever the runoff's been painted out (runoff.js)
  const RZ = runoffReach(T, env, paint, computeSpeedProfile(T, new Float32Array(N), { mu: 2.3, kdm: 0.0035, vmax: 88, brake: 1.0 }).V, hash, sep, BR2, [BL, BRt]);
  // a real circuit: where the map has a barrier, that's where it stands (nearer or further than the layout's)
  // (eased into the layout's over ~15 m where the mapped barrier starts or ends)
  // On the inside of a tight bend the mapped barrier can lie past the bend's centre (behind a chicane's other leg, round
  // a hairpin): further out than a wall square to the track can stand there without folding back on itself. There's
  // no wall near the road there at all: none (a gap, NOWALL), and the offset held inside the fold so the unfolding
  // below never drags the wall in on the stretches either side.
  const RW = osm && realWallOffsets(T, osm.walls, hash, sep, env.theme === 'city' ? 1 : 4, surfaceGrid(osm.surface));
  const NOWALL = [new Uint8Array(N), new Uint8Array(N)];
  if (RW) for (const [s, O] of [[0, BL], [1, BRt]]) {
    const cap = wallCaps(T, s ? 1 : -1);
    for (let i = 0; i < N; i++) {
      const lim = Math.max(T.W[i] / 2 + 0.3, cap[i] - 0.5);
      if (RW[s][i] === RW[s][i] && RW[s][i] > lim) { RW[s][i] = lim; NOWALL[s][i] = 1; }
      if (O[i] > lim) { O[i] = lim; if (RW[s][i] !== RW[s][i]) NOWALL[s][i] = 1; } // (nothing mapped there either)
    }
  }
  if (RW) for (const [s, O] of [[0, BL], [1, BRt]]) {
    const R = RW[s], has = new Float32Array(N), e = Math.max(1, Math.round(15 / T.ds));
    for (let i = 0; i < N; i++) has[i] = R[i] === R[i] ? 1 : 0;
    if (!has.some(Boolean)) continue;
    // (the nearest mapped value along the track, for the eased ends)
    const near = new Float32Array(N).fill(NaN), dist = new Float32Array(N).fill(Infinity);
    for (const dir of [1, -1]) {
      let v = NaN, d = Infinity;
      for (let n = 0; n < 2 * N; n++) {
        const i = ((dir > 0 ? n : -n) % N + N) % N;
        if (has[i]) { v = R[i]; d = 0; } else d++;
        if (n >= N && d < dist[i]) { dist[i] = d; near[i] = v; }
      }
    }
    for (let i = 0; i < N; i++) {
      if (BR2[i]) continue;
      let wsum = 0; for (let k = -e; k <= e; k++) wsum += has[(i + k + N) % N];
      const wt = has[i] ? 1 : Math.min(1, wsum / e) * 0.999;
      if (!(wt > 0)) continue;
      const v = has[i] ? R[i] : near[i];
      if (v === v) O[i] = O[i] * (1 - wt) + v * wt;
    }
  }
  const BMAX = [unfold(T, BL, -1), unfold(T, BRt, 1)];
  // barrier gaps where the barrier would sit on another section's road/runoff
  const HAS_L = new Uint8Array(N).fill(1), HAS_R = new Uint8Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    for (const side of [-1, 1]) {
      const off = side < 0 ? BL[i] : BRt[i];
      const qx = T.X[i] + T.RX[i] * off * side, qz = T.Z[i] + T.RZ[i] * off * side;
      let gap = false;
      hash.query(qx, qz, runoff + 20, (j) => {
        if (gap || circDist(i, j, N) < sep) return;
        if (Math.abs(T.Y[i] - T.Y[j]) > 4.5) return;
        const d = Math.hypot(qx - T.X[j], qz - T.Z[j]);
        const rj = BR2[j] ? T.W[j] / 2 + 1 : T.W[j] / 2 + runoff * 0.9;
        if (d < rj) gap = true;
      });
      if (gap) (side < 0 ? HAS_L : HAS_R)[i] = 0;
    }
  }
  for (let i = 0; i < N; i++) { if (NOWALL[0][i]) HAS_L[i] = 0; if (NOWALL[1][i]) HAS_R[i] = 0; }
  // the dressing's barriers: what stands where, stretch by stretch (WT: WALL_TYPES index + 1, 0 = the track's own)
  let WT = null;
  if (dress && dress.walls && dress.walls.length) {
    WT = [new Uint8Array(N), new Uint8Array(N)];
    for (const w of dress.walls) {
      const si = w.side < 0 ? 0 : 1, has = si ? HAS_R : HAS_L, off = si ? BRt : BL, t = WALL_KEYS.indexOf(w.type) + 1;
      if (!t) continue;
      for (const i of stretchIdx(T, w.a, w.b)) {
        if (BR2[i]) continue; // (a bridge deck keeps its parapet)
        if (w.type === 'none') { has[i] = 0; continue; }
        has[i] = 1; WT[si][i] = t;
        if (w.off != null) off[i] = T.W[i] / 2 + Math.max(0.5, w.off);
      }
    }
  }
  // the dressing's own barriers: they're all there is (bridge decks keep their parapets)
  if (dress && Array.isArray(dress.barriers)) {
    WT = WT || [new Uint8Array(N), new Uint8Array(N)];
    for (let i = 0; i < N; i++) if (!BR2[i]) { HAS_L[i] = 0; HAS_R[i] = 0; WT[0][i] = WT[1][i] = 0; }
    for (const w of dress.barriers) {
      const P = w.pts && w.pts.length >= 2 ? barrierLine(w, T) : w.pts, si = w.side < 0 ? 0 : 1, has = si ? HAS_R : HAS_L, off = si ? BRt : BL, t = WALL_KEYS.indexOf(w.type) + 1;
      if (!P || P.length < 2 || !t || w.type === 'none') continue;
      const L = T.L, d0 = P[0][0], U = nodeU(P, L);
      const len = U[U.length - 1];
      for (let i = 0; i < N; i++) {
        if (BR2[i]) continue;
        const u = ((T.D[i] - d0) % L + L) % L; if (u > len) continue;
        let k = 0; while (k < U.length - 2 && U[k + 1] < u) k++;
        const f = U[k + 1] > U[k] ? Math.min(1, (u - U[k]) / (U[k + 1] - U[k])) : 0;
        has[i] = 1; WT[si][i] = t; off[i] = T.W[i] / 2 + Math.max(0.3, P[k][1] + (P[k + 1][1] - P[k][1]) * f);
      }
    }
  }
  // kerbs: the dressing's own, else on the corners (both sides, 10 m either side of anything tighter than 140 m)
  const KERB = new Uint8Array(N);
  let kerbs = dress && dress.kerbs && dress.kerbs.length ? dress.kerbs : null;
  if (!kerbs && env.kerbs !== false && env.surface !== 'dirt') { // (dirt tracks have none)
    const tmp = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (Math.abs(T.K[i]) > 1 / 140) tmp[i] = 1;
    const kd = Math.ceil(10 / T.ds);
    for (let i = 0; i < N; i++) if (tmp[i]) for (let k = -kd; k <= kd; k++) KERB[(i + k + N) % N] = 1;
    for (let i = 0; i < N; i++) if (BR2[i]) KERB[i] = 0;
    kerbs = autoKerbs(T, KERB);
  }
  // per side and sample: which stretch (KI: its index + 1) and how wide it is there (KW, tapered at its ends)
  const KI = [new Int16Array(N), new Int16Array(N)], KW = [new Float32Array(N), new Float32Array(N)];
  kerbs.forEach((k, n) => {
    const si = k.side < 0 ? 0 : 1, w = k.w ?? KERB_W, L = T.L, a = ((k.a % L) + L) % L, len = (((k.b - a) % L) + L) % L;
    for (const i of stretchIdx(T, k.a, k.b)) {
      if (BR2[i]) continue;
      const u = (((T.D[i] - a) % L) + L) % L, v = len - u; // (m from its start, to its end)
      const f = Math.min(1, k.tin > 0 ? u / k.tin : 1, k.tout > 0 ? v / k.tout : 1);
      KI[si][i] = n + 1; KW[si][i] = w * Math.max(0, f);
    }
  });
  for (let i = 0; i < N; i++) KERB[i] = KW[0][i] > 0.05 || KW[1][i] > 0.05 ? 1 : 0;
  return { hash, BRIDGE: BR2, LIFT, BL, BR: BRt, HAS_L, HAS_R, KERB, KI, KW, kerbs, WT, RZ, BMAX, realWalls: !!RW };
}

// No loops in the wall. On a corner's inside, a line standing off the centre line further than the corner is tight
// runs backwards and crosses itself (the wall, and the physics' wall with it, folds into a bow tie). From sample i
// to j, the line moves along the track by (Cj - Ci).Fi + off[j] side Rj.Fi (Ri is square to Fi, so off[i] drops out):
// on the inside that caps off[j] where it would still move forward a quarter of a sample (and the same seen from j
// caps off[i]). Where the wall is past its cap, it's eased in (the dent spread out along the track, never less than
// needed, the bigger the further), never onto the track. Returns the caps (the furthest out anything along the wall may stand: its top, the
// ground it holds back).
// the furthest out a wall on that side may stand at each sample before it folds back on itself
function wallCaps(T, side) {
  const N = T.N, M = 0.25 * T.ds, cap = new Float32Array(N).fill(1e9);
  for (let i = 0; i < N; i++) {
    if (i === T.cut) continue;
    const j = (i + 1) % N, dx = T.X[j] - T.X[i], dz = T.Z[j] - T.Z[i];
    const a = -side * (T.RX[j] * T.FX[i] + T.RZ[j] * T.FZ[i]); // (> 0: j's normal leans back along i's heading)
    if (a > 1e-4) cap[j] = Math.min(cap[j], (dx * T.FX[i] + dz * T.FZ[i] - M) / a);
    const b = side * (T.RX[i] * T.FX[j] + T.RZ[i] * T.FZ[j]);
    if (b > 1e-4) cap[i] = Math.min(cap[i], (dx * T.FX[j] + dz * T.FZ[j] - M) / b);
  }
  return cap;
}
function unfold(T, off, side) {
  const N = T.N, cap = wallCaps(T, side);
  const dent = new Float32Array(N);
  let any = false;
  for (let i = 0; i < N; i++) if (off[i] > cap[i]) { dent[i] = off[i] - cap[i]; any = true; }
  if (!any) return cap;
  // spread as a cone (the wall comes in at most 1 m in every 1.7 m along: a big dent swings in from further back),
  // both ways round (twice round a lap, so it carries over the line), then rounded off
  const fall = T.ds / 1.7, c = new Float32Array(N), laps = T.cut < 0 ? 2 : 1;
  const sweep = (dir) => {
    let v = 0;
    for (let n = 0; n < N * laps; n++) {
      const i = T.cut < 0 ? ((dir > 0 ? n : -n) % N + N) % N : stepIdx(T, dir > 0 ? T.cut + 1 : T.cut, dir * n);
      v = (T.cut >= 0 && n === 0) ? dent[i] : Math.max(dent[i], v - fall);
      c[i] = Math.max(c[i], v);
    }
  };
  sweep(1); sweep(-1);
  const w = Math.max(2, Math.round(6 / T.ds)), m = new Float32Array(N);
  for (let i = 0; i < N; i++) { let v = 0; for (let k = -w; k <= w; k++) v = Math.max(v, c[stepIdx(T, i, k)]); m[i] = v; }
  for (let i = 0; i < N; i++) {
    let v = 0; for (let k = -w; k <= w; k++) v += m[stepIdx(T, i, k)];
    if (v > 0) off[i] = Math.max(T.W[i] / 2 + 0.3, off[i] - v / (2 * w + 1));
  }
  return cap;
}

// ---------- racing line & speed profile ----------
// Racing line. The old "elastic band" relaxation found the SHORTEST path (hugged every inside).
// Real lines trade distance for speed: wide on entry, clip the apex, run out wide on exit,
// which is what the minimum-curvature line does.
// (Tested against the real car physics: the pure minimum-curvature line beat the old line by 1-11%
//  per lap, while "optimising" it further on the simple lap-time model made the AI slower and scrappier.)
export function computeRacingLine(T, margin = 1.6) {
  return minCurvatureLine(T, margin);
}
const LINE_CAR = { mu: 1.75 * 1.3, kdm: 2.2 / 740, vmax: 95, brake: 1 };

export function shortestLine(T, margin = 1.6, iters = 260) {
  const N = T.N;
  const O = new Float32Array(N);
  const k = Math.max(2, Math.round(8 / T.ds));
  const px = new Float32Array(N), pz = new Float32Array(N);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < N; i++) { px[i] = T.X[i] + T.RX[i] * O[i]; pz[i] = T.Z[i] + T.RZ[i] * O[i]; }
    for (let i = 0; i < N; i++) {
      const a = (i - k + N) % N, b = (i + k) % N;
      const tx = (px[a] + px[b]) / 2, tz = (pz[a] + pz[b]) / 2;
      const want = (tx - T.X[i]) * T.RX[i] + (tz - T.Z[i]) * T.RZ[i];
      const lim = T.W[i] / 2 - margin;
      O[i] = Math.max(-lim, Math.min(lim, O[i] + (want - O[i]) * 0.6));
    }
  }
  return O;
}

// margin: m from each edge, or a per-sample array of them (race.js lineMargins: less at the kerbs)
export function minCurvatureLine(T, margin = 1.6, spacing = 8) {
  const mAt = typeof margin === 'number' ? () => margin : (i) => margin[i];
  // Quadratic program: minimise sum |second difference of the line|^2 over the lateral offsets,
  // with the track edges as box limits. Solved exactly (dense Cholesky + active set) on nodes
  // every ~8 m, then interpolated smoothly back to every sample.
  const N = T.N, open = T.cut >= 0;
  const M = Math.max(12, Math.min(420, Math.round((N * T.ds) / spacing)));
  const idx = new Int32Array(M), lo = new Float64Array(M), hi = new Float64Array(M);
  const cx = new Float64Array(M), cz = new Float64Array(M), nx = new Float64Array(M), nz = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    // (point-to-point: nodes run from the back of the grid to the end of the run-off, both ends included)
    const i = open ? (T.cut + 1 + Math.round((j * (N - 1)) / (M - 1))) % N : Math.min(N - 1, Math.round((j * N) / M)); idx[j] = i;
    cx[j] = T.X[i]; cz[j] = T.Z[i]; nx[j] = T.RX[i]; nz[j] = T.RZ[i];
    const lim = Math.max(0, T.W[i] / 2 - mAt(i)); lo[j] = -lim; hi[j] = lim;
  }
  const w = (j) => ((j % M) + M) % M;
  // D2'D2: the sum of (second difference)^2 over every run of three nodes (a loop wraps; an open road doesn't)
  const SR = Array.from({ length: M }, () => new Map());
  for (let c = open ? 1 : 0; c < (open ? M - 1 : M); c++) {
    const tri = [[w(c - 1), 1], [c, -2], [w(c + 1), 1]];
    for (const [p, vp] of tri) for (const [q, vq] of tri) SR[p].set(q, (SR[p].get(q) || 0) + vp * vq);
  }
  const ST = SR.map(r => [...r]); // per node: [[k, s], ...]
  // H_jk = (n_j . n_k) * S_jk ; b_j = -n_j . (S C)_j
  const Hjk = (j, k, s) => s * (nx[j] * nx[k] + nz[j] * nz[k]);
  const b = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    let sx = 0, sz = 0;
    for (const [k, s] of ST[j]) { sx += s * cx[k]; sz += s * cz[k]; }
    b[j] = -(nx[j] * sx + nz[j] * sz);
  }
  const a = new Float64Array(M);
  const state = new Int8Array(M); // 0 free, -1 at lo, +1 at hi
  const grad = (j) => { let g = -b[j]; for (const [k, s] of ST[j]) g += Hjk(j, k, s) * a[k]; return g; };
  for (let it = 0; it < 40; it++) {
    // solve for the free variables with the active ones pinned
    const F = []; const pos = new Int32Array(M).fill(-1);
    for (let j = 0; j < M; j++) if (!state[j]) { pos[j] = F.length; F.push(j); }
    for (let j = 0; j < M; j++) if (state[j]) a[j] = state[j] < 0 ? lo[j] : hi[j];
    const n = F.length;
    if (n) {
      const A = new Float64Array(n * n), r = new Float64Array(n);
      for (let q = 0; q < n; q++) {
        const j = F[q];
        r[q] = b[j];
        A[q * n + q] += 1e-7;
        for (const [k, s] of ST[j]) {
          const h = Hjk(j, k, s);
          if (pos[k] >= 0) A[q * n + pos[k]] += h; else r[q] -= h * a[k];
        }
      }
      choleskySolve(A, r, n);
      for (let q = 0; q < n; q++) a[F[q]] = r[q];
    }
    let changed = false;
    // pin violators
    for (let j = 0; j < M; j++) if (!state[j]) {
      if (a[j] > hi[j] + 1e-6) { state[j] = 1; changed = true; } else if (a[j] < lo[j] - 1e-6) { state[j] = -1; changed = true; }
    }
    // release pinned points that want to move back inside the track
    if (!changed) for (let j = 0; j < M; j++) if (state[j]) {
      const g = grad(j);
      if ((state[j] > 0 && g > 1e-9) || (state[j] < 0 && g < -1e-9)) { state[j] = 0; changed = true; }
    }
    if (!changed) break;
  }
  for (let j = 0; j < M; j++) a[j] = Math.max(lo[j], Math.min(hi[j], a[j]));
  // Catmull-Rom back to every sample (no kinks at the nodes)
  const O = new Float32Array(N);
  if (open) { const e = idx[M - 1]; O[e] = Math.max(lo[M - 1], Math.min(hi[M - 1], a[M - 1])); }
  const cl = (j) => open ? Math.max(0, Math.min(M - 1, j)) : w(j);
  for (let j = 0; j < (open ? M - 1 : M); j++) {
    const i0 = idx[j], i1 = j + 1 < M ? (idx[j + 1] < i0 ? idx[j + 1] + N : idx[j + 1]) : idx[0] + N;
    const p0 = a[cl(j - 1)], p1 = a[j], p2 = a[cl(j + 1)], p3 = a[cl(j + 2)];
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / (i1 - i0), t2 = t * t, t3 = t2 * t;
      const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      const ii = i % N, lim = Math.max(0, T.W[ii] / 2 - mAt(ii));
      O[ii] = Math.max(-lim, Math.min(lim, v));
    }
  }
  return O;
}
// in-place dense Cholesky solve of A x = r (A symmetric positive definite, n x n)
function choleskySolve(A, r, n) {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] * A[j * n + k];
    d = Math.sqrt(Math.max(d, 1e-12)); A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / d;
    }
  }
  for (let i = 0; i < n; i++) { let s = r[i]; for (let k = 0; k < i; k++) s -= A[i * n + k] * r[k]; r[i] = s / A[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = r[i]; for (let k = i + 1; k < n; k++) s -= A[k * n + i] * r[k]; r[i] = s / A[i * n + i]; }
}

// local search on lap time: push smooth "bumps" of the line in or out and keep what's quicker
export function optimizeLine(T, O, margin = 1.6, car = LINE_CAR, budgetMs = 350) {
  const N = T.N, t0 = performance.now();
  O = Float32Array.from(O);
  let best = lineLapTime(T, O, car);
  const lim = (i) => Math.max(0, T.W[i] / 2 - margin);
  const trial = new Float32Array(N);
  for (const [width, step] of [[40, 1.2], [24, 0.7], [14, 0.4]]) {
    const h = Math.max(2, Math.round(width / T.ds)), stride = Math.max(1, Math.round(h / 2));
    let improved = true;
    for (let round = 0; round < 3 && improved; round++) {
      improved = false;
      for (let c = 0; c < N; c += stride) {
        if (performance.now() - t0 > budgetMs) return O;
        for (const dir of [1, -1]) {
          trial.set(O);
          let changed = false;
          for (let k = -h; k <= h; k++) {
            const i = (c + k + N) % N, wgt = 0.5 + 0.5 * Math.cos((Math.PI * k) / h);
            const v = Math.max(-lim(i), Math.min(lim(i), O[i] + dir * step * wgt));
            if (v !== O[i]) changed = true;
            trial[i] = v;
          }
          if (!changed) continue;
          const t = lineLapTime(T, trial, car);
          if (t < best - 1e-4) { best = t; O.set(trial); improved = true; break; }
        }
      }
    }
  }
  return O;
}

// simulated lap time along a line (grip + downforce limited corners, braking and power-limited acceleration)
export function lineLapTime(T, O, car = LINE_CAR) {
  const N = T.N, V = computeSpeedProfile(T, O, car).V;
  const seg = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    seg[i] = Math.hypot(T.X[j] + T.RX[j] * O[j] - T.X[i] - T.RX[i] * O[i], T.Z[j] + T.RZ[j] * O[j] - T.Z[i] - T.RZ[i] * O[i]);
  }
  const Va = Float32Array.from(V);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    const p = (i - 1 + N) % N, pv = Va[p];
    const acc = Math.min(car.mu * 9.81, 700000 / 740 / Math.max(pv, 8)) - 0.0013 * pv * pv;
    Va[i] = Math.min(V[i], Math.sqrt(Math.max(0, pv * pv + 2 * Math.max(0.5, acc) * seg[p])));
  }
  let t = 0;
  for (let i = 0; i < N; i++) t += seg[i] / Math.max(5, (Va[i] + Va[(i + 1) % N]) / 2);
  return t;
}

export function computeSpeedProfile(T, O, car) {
  const N = T.N;
  const { mu, kdm, vmax } = car;
  const brakeK = car.brake ?? 0.8;
  const g = 9.81;
  const LX = new Float32Array(N), LZ = new Float32Array(N);
  for (let i = 0; i < N; i++) { LX[i] = T.X[i] + T.RX[i] * O[i]; LZ[i] = T.Z[i] + T.RZ[i] * O[i]; }
  const V = new Float32Array(N);
  const k = Math.max(2, Math.round(6 / T.ds));
  for (let i = 0; i < N; i++) {
    const a = (i - k + N) % N, b = (i + k) % N;
    const ax = LX[a], az = LZ[a], bx = LX[i], bz = LZ[i], cx = LX[b], cz = LZ[b];
    const A = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
    const la = Math.hypot(bx - ax, bz - az), lb = Math.hypot(cx - bx, cz - bz), lc = Math.hypot(cx - ax, cz - az);
    const kap = (4 * A) / Math.max(1e-6, la * lb * lc);
    const den = kap - mu * kdm;
    V[i] = den <= 0 ? vmax : Math.min(vmax, Math.sqrt(mu * g / den));
  }
  // braking pass (backwards, twice around for closed loop). Point-to-point: stop by the end of the run-off.
  const cut = T.cut ?? -1;
  if (cut >= 0) V[cut] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      if (i === cut) continue;
      const nx = V[(i + 1) % N];
      const aB = mu * (g + kdm * nx * nx) * brakeK;
      V[i] = Math.min(V[i], Math.sqrt(nx * nx + 2 * aB * T.ds));
    }
  }
  // acceleration pass for lap estimate (power-limited); point-to-point: a standing start at the back of the grid
  const Vacc = Float32Array.from(V);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const pv = cut >= 0 && i === (cut + 1) % N ? 0 : Vacc[(i - 1 + N) % N];
      const acc = Math.min(mu * g, 700000 / 740 / Math.max(pv, 8)) - 0.0013 * pv * pv;
      Vacc[i] = Math.min(V[i], Math.sqrt(Math.max(0, pv * pv + 2 * Math.max(0.5, acc) * T.ds)));
    }
  }
  let lap = 0;
  const upto = cut >= 0 ? T.finish : N; // (point-to-point: start line to finish line)
  for (let i = 0; i < upto; i++) lap += T.ds / Math.max(5, Vacc[i]);
  return { V, lapEstimate: lap };
}


// ---------- pit lane ----------
// A lane parallel to the start/finish straight, separated by a pit wall, with ramps in and out: 100 m long, so the
// lane leaves (and rejoins) the track at a shallow angle, its tarmac tapering out of the track edge (75 m where a
// longer one doesn't fit, so the pits stay where they always were).
// Mutates A.BL / A.BR so barriers (and scenery clearance) move out to the garages.
// wallGap: the least room from the track edge to the pit wall (it stands where the barrier would, flush with it,
// up to maxGap out); strip: the teams' stands between the wall and the fast lane (js/pitwall.js), behind a line
export const PIT = { width: 9, wallGap: 1.4, maxGap: 45, strip: 2.0, speed: 22.2 };
// the catch fence's height (Circuit tab: env.fenceH metres over the barrier, 0 for none); else as the barrier comes
export const fenceHeight = (env, dflt) => env.fenceH ?? dflt ?? (env.barrier === 'armco' ? 1.65 : 2.8);

// line: a real circuit's mapped pit lane ([[x, z]...], track.osm.pitLane): the lane runs where it really does.
// surf: what the ground beside the road is (runoff.js surfaceGrid: a reference model's, or aerial photos'): a lane
// made up here only goes where that ground is paved (not through a grandstand or a dune), or there's none.
// own: the track's own pit lane, placed by hand (track.dress.pit: ownPitLane), else line: a real circuit's mapped one
export function buildPitLane(T, A, env, line = null, surf = null, own = null) {
  if (env.pits === false || T.open) return null; // (a point-to-point run has no pit lane)
  if (own && own.pts && own.pts.length > 1) return ownPitLane(T, A, own);
  if (line && line.length > 1) { const real = realPitLane(T, A, line); if (real) return real; }
  const N = T.N, ds = T.ds;
  let nRamp;
  const idxAt = (k) => ((k % N) + N) % N;
  const shifts = [0, 90, -90, 180, -180, 270, -270, 360, -360, 450, -450].map(m => Math.round(m / ds));
  // a long lane first (the garages well down it, so a car coming in quick still stops at the first one), then the
  // old shorter one where a long one doesn't fit
  let nMain, cap;
  // (the wall where the barrier would be; where the lane doesn't fit out there, as close as it can go)
  for (cap of [PIT.maxGap, PIT.wallGap]) for (const Lmain of [Math.max(330, Math.min(420, T.L * 0.2)), Math.max(160, Math.min(320, T.L * 0.16))]) {
    nMain = Math.round(Lmain / ds);
    for (const sh of shifts) for (const ramp of [100, 75]) {
      nRamp = Math.round(ramp / ds);
      const res = tryPit(sh);
      if (res) return res;
    }
  }
  return null;

  function tryPit(sh) {
  const k0 = -Math.round(nMain * 0.55) - nRamp + sh, k1 = Math.round(nMain * 0.45) + nRamp + sh;
  const sides = env.pitSide === 'left' ? [-1] : env.pitSide === 'right' ? [1] : [1, -1];
  const sep = Math.ceil(60 / ds);
  // the wall: its track face where the barrier would be, all along it (G: from the track edge to the wall's middle,
  // by position along the pit region; eased over ~10 m so it runs smooth; the ramps take the main part's ends')
  const G = new Float32Array(k1 - k0 + 1);
  const gapAt = (i) => G[Math.max(nRamp, Math.min(k1 - k0 - nRamp, (i - idxAt(k0) + N) % N))];
  const laneC = (i) => T.W[i] / 2 + gapAt(i) + 0.6 + PIT.strip + PIT.width / 2;
  let side = 0;
  for (const sd of sides) {
    const raw = new Float32Array(k1 - k0 + 1), w = Math.max(1, Math.round(10 / ds));
    for (let k = k0; k <= k1; k++) { const i = idxAt(k); raw[k - k0] = Math.max(PIT.wallGap, Math.min(cap, (sd < 0 ? A.BL : A.BR)[i] - T.W[i] / 2 + 0.25)); }
    for (let q = nRamp; q <= k1 - k0 - nRamp; q++) {
      let v = 0, n = 0;
      for (let d = -w; d <= w; d++) { const r = Math.max(nRamp, Math.min(k1 - k0 - nRamp, q + d)); v += raw[r]; n++; }
      G[q] = Math.max(raw[q], v / n); // (never nearer the track than the barrier would be)
    }
    // (a real circuit's mapped barriers step in and out: the pit wall runs straight, at their usual distance)
    if (A.realWalls) { const m = [...G.subarray(nRamp, k1 - k0 - nRamp + 1)].sort((a, b) => a - b), v = m[m.length >> 1]; if (v === v) G.fill(v, nRamp, k1 - k0 - nRamp + 1); }
    let ok = true;
    for (let k = k0; k <= k1 && ok; k++) {
      const i = idxAt(k);
      if (A.BRIDGE[i] || !(sd < 0 ? A.HAS_L[i] : A.HAS_R[i])) { ok = false; break; }
      // no tight corner on the pit side
      if (sd * T.K[i] > 0 && 1 / Math.abs(T.K[i]) < laneC(i) + PIT.width + 25) { ok = false; break; }
      // the way in (the entry ramp and the start of the wall) on a straight or a gentle bend: a tight corner there,
      // either way, sends cars running wide on its exit into the pit entry
      if (k - k0 < nRamp + Math.round(30 / ds) && Math.abs(T.K[i]) > 1 / 120) { ok = false; break; }
      // room: nothing else of the circuit where the lane and garages go
      const out = laneC(i) + PIT.width / 2 + 16;
      for (const o of [laneC(i), out]) {
        const x = T.X[i] + T.RX[i] * o * sd, z = T.Z[i] + T.RZ[i] * o * sd;
        A.hash.query(x, z, 30, (j) => {
          if (!ok || circDist(i, j, N) < sep) return;
          if (Math.hypot(x - T.X[j], z - T.Z[j]) < T.W[j] / 2 + 6) ok = false;
        });
      }
    }
    // (on the measured ground: the lane's middle on paved ground along most of the garages' stretch)
    if (ok && surf) {
      let paved = 0, n = 0;
      for (let k = k0 + nRamp; k <= k1 - nRamp; k += 2) { const i = idxAt(k), o = laneC(i) * sd; n++; if (surf.at(T.X[i] + T.RX[i] * o, T.Z[i] + T.RZ[i] * o) === 1) paved++; }
      if (paved < n * 0.7) ok = false;
    }
    if (ok) { side = sd; break; }
  }
  if (!side) return null;
  const REG = new Int16Array(N).fill(-1);    // position along the pit region, -1 outside
  const CEN = new Float32Array(N).fill(NaN); // lane centre offset (absolute, on the pit side)
  const WALL = new Float32Array(N).fill(NaN);
  const OUT = new Float32Array(N).fill(NaN); // the outer edge of the lane's tarmac (on the ramps: tapering from the track edge)
  const off = side < 0 ? A.BL : A.BR;
  const HIDE = new Uint8Array(N);
  // (reaching here means the lane fits, so it's safe to move the barriers)
  const count = k1 - k0;
  for (let k = k0; k <= k1; k++) {
    const i = idxAt(k), pos = k - k0;
    REG[i] = pos;
    const edge = T.W[i] / 2 - 2.2;
    let f;
    if (pos < nRamp) f = pos / nRamp; else if (pos > count - nRamp) f = (count - pos) / nRamp; else f = 1;
    f = f * f * (3 - 2 * f);
    CEN[i] = edge + (laneC(i) - edge) * f;
    OUT[i] = T.W[i] / 2 + (laneC(i) + PIT.width / 2 - T.W[i] / 2) * f;
    if (pos >= nRamp && pos <= count - nRamp) {
      WALL[i] = T.W[i] / 2 + gapAt(i);
      off[i] = CEN[i] + PIT.width / 2 + 0.6;       // the garage fronts are the barrier here
      HIDE[i] = 1;
    } else off[i] = Math.max(off[i], CEN[i] + PIT.width / 2 + 0.6);
  }
  // along the main part: the pit wall starts (the line you're committed at), the speed limit line a little after it,
  // then the team boxes, the first one far enough down the lane to stop for from a quick entry
  const mainLen = (count - 2 * nRamp) * ds;
  const lead = Math.max(30, Math.min(110, mainLen - 11 * 15 - 25));
  const boxes = [];
  const b0 = k0 + nRamp + Math.round(lead / ds), step = Math.round(15 / ds);
  for (let n = 0; n < 12; n++) { const k = b0 + n * step; if (k < k1 - nRamp - 4) boxes.push(idxAt(k)); }
  const limitIn = nRamp + Math.round(Math.min(40, lead * 0.4) / ds), limitOut = count - nRamp - Math.round(20 / ds);
  const start = idxAt(k0), end = idxAt(k1);
  // pit lane length and time lost vs. racing past (rough)
  return { side, REG, CEN, WALL, OUT, HIDE, boxes, reach: gapAt(idxAt(k0 + nRamp)) + 0.6 + PIT.strip + PIT.width, gap: gapAt(idxAt(k0 + nRamp)), gapOut: gapAt(idxAt(k1 - nRamp)), strip: PIT.strip, start, end, count, nRamp, commitAt: nRamp, limitIn, limitOut, mainStart: idxAt(k0 + nRamp), mainEnd: idxAt(k1 - nRamp), length: count * ds, width: PIT.width, speed: PIT.speed };
  }
}

// A real circuit's pit lane, from its mapped centre line: for each sample of the circuit, how far out the lane runs
// (the nearest point of it square to the track, on the side it's on). From where it leaves the track to where it
// joins it again; gaps (where it cuts inside a hairpin, past the ends of the normals) are bridged. The ramps are its
// ends (nRamp in, nRampOut out), the garages along the straight part in between. Same shape as buildPitLane's.
function realPitLane(T, A, line) {
  const N = T.N, ds = T.ds, idxAt = (k) => ((k % N) + N) % N;
  const Q = [];
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1));
    for (let j = 0; j < n; j++) Q.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]);
  }
  Q.push(line[line.length - 1]);
  const CELL = 20, grid = new Map();
  Q.forEach((q, k) => { const key = Math.floor(q[0] / CELL) + ',' + Math.floor(q[1] / CELL); let a = grid.get(key); if (!a) grid.set(key, a = []); a.push(k); });
  const lat = new Float32Array(N).fill(NaN);
  for (let i = 0; i < N; i++) {
    let best = Infinity;
    for (let cx = Math.floor((T.X[i] - 60) / CELL); cx <= Math.floor((T.X[i] + 60) / CELL); cx++) for (let cz = Math.floor((T.Z[i] - 60) / CELL); cz <= Math.floor((T.Z[i] + 60) / CELL); cz++) {
      const a = grid.get(cx + ',' + cz); if (!a) continue;
      for (const k of a) {
        const dx = Q[k][0] - T.X[i], dz = Q[k][1] - T.Z[i], along = dx * T.FX[i] + dz * T.FZ[i], l = dx * T.RX[i] + dz * T.RZ[i];
        if (Math.abs(along) < 1.5 && Math.abs(l) < 60 && Math.abs(l) < Math.abs(best)) best = l;
      }
    }
    if (best !== Infinity) lat[i] = best;
  }
  // the side: where most of it is; the run: the longest stretch on that side (gaps under 200 m bridged)
  let sum = 0; for (let i = 0; i < N; i++) if (lat[i] === lat[i]) sum += Math.sign(lat[i]);
  const side = sum >= 0 ? 1 : -1, on = (i) => lat[i] === lat[i] && lat[i] * side > 0;
  const gapMax = Math.round(200 / ds);
  let start = -1;
  for (let i = 0; i < N; i++) if (!on(i) && on(idxAt(i + 1))) { // (a run's start: walk it, bridging gaps, measure it)
    let k = 1, last = 1, miss = 0;
    while (k < N) { if (on(idxAt(i + k))) { last = k; miss = 0; } else if (++miss > gapMax) break; k++; }
    if (start < 0 || last > start[1]) start = [i + 1, last];
  }
  if (!Array.isArray(start) || start[1] * ds < 150) return null;
  const k0 = start[0], count = start[1] - 1;
  // the lane's offset along the run (absolute, on its side), gaps interpolated, eased over ~10 m
  const raw = new Float32Array(count + 1); let prev = -1;
  for (let pos = 0; pos <= count; pos++) {
    const i = idxAt(k0 + pos);
    if (on(i)) {
      raw[pos] = Math.abs(lat[i]);
      if (prev >= 0 && pos - prev > 1) for (let q = prev + 1; q < pos; q++) raw[q] = raw[prev] + (raw[pos] - raw[prev]) * (q - prev) / (pos - prev);
      prev = pos;
    }
  }
  const w = Math.max(1, Math.round(10 / ds)), cen = new Float32Array(count + 1);
  for (let pos = 0; pos <= count; pos++) { let v = 0, n = 0; for (let d = -w; d <= w; d++) { const q = pos + d; if (q < 0 || q > count) continue; v += raw[q]; n++; } cen[pos] = v / n; }
  return pitAlong(T, A, side, k0, count, cen, null, { real: true });
}

// a pit lane as it is (buildPitLane's) as one to edit by hand (track.dress.pit): its centre line's nodes (as few as
// follow it to 0.3 m) and its garages' stretch
export function pitToOwn(T, pit) {
  const idx = []; for (let i = 0; i < T.N; i++) if (pit.REG[i] >= 0) idx.push(i);
  idx.sort((a, b) => pit.REG[a] - pit.REG[b]);
  const pts = idx.map(i => [T.D[i], pit.CEN[i] - T.W[i] / 2]), u = idx.map((_, n) => n * T.ds), keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const rdp = (a, b) => { let bi = -1, bd = 0.3; for (let n = a + 1; n < b; n++) { const f = (u[n] - u[a]) / (u[b] - u[a]), e = Math.abs(pts[n][1] - (pts[a][1] + (pts[b][1] - pts[a][1]) * f)); if (e > bd) { bd = e; bi = n; } } if (bi >= 0) { keep[bi] = 1; rdp(a, bi); rdp(bi, b); } };
  rdp(0, pts.length - 1);
  return { side: pit.side, pts: pts.filter((_, n) => keep[n]).map(([d, o]) => [+d.toFixed(1), +o.toFixed(2)]), main: [+T.D[pit.mainStart].toFixed(1), +T.D[pit.mainEnd].toFixed(1)] };
}
// A pit lane placed by hand (track.dress.pit, the Circuit Designer's PIT LANE tool): { side, pts: [[d, off], ...],
// main?: [d0, d1] }. pts: its centre line, nodes in lap order, d m along the lap, off m out from the track edge (its
// first and last a little inside it: where it leaves and rejoins the track); main: the garages and pit wall, m along
// the lap (else the longest straight stretch clear of the track).
export function ownPitLane(T, A, own) {
  const ds = T.ds, L = T.L, P = own.pts, d0 = P[0][0], norm = (d) => ((d % L) + L) % L;
  const U = nodeU(P, L);
  const len = U[U.length - 1], count = Math.round(len / ds), k0 = Math.round(d0 / ds);
  if (count * ds < 40) return null;
  const cen = new Float32Array(count + 1);
  for (let pos = 0, k = 0; pos <= count; pos++) {
    const u = pos * ds; while (k < U.length - 2 && U[k + 1] < u) k++;
    const f = U[k + 1] > U[k] ? Math.max(0, Math.min(1, (u - U[k]) / (U[k + 1] - U[k]))) : 0;
    cen[pos] = T.W[((k0 + pos) % T.N + T.N) % T.N] / 2 + P[k][1] + (P[k + 1][1] - P[k][1]) * f;
  }
  const main = own.main && own.main.length === 2 ? [Math.round(norm(own.main[0] - d0) / ds), Math.round(norm(own.main[1] - d0) / ds)] : null;
  return pitAlong(T, A, own.side < 0 ? -1 : 1, k0, count, cen, main && main[0] < main[1] && main[1] <= count ? main : null, { own: true });
}

// the pit lane's shape (buildPitLane's) from its centre line: cen[pos] m out (on its side) for the samples k0..k0+count;
// main: [first, last] pos of the garages' stretch, else the longest one clear of the track and straight or gently
// curved (radius over 250 m: never round a hairpin, where the lane cuts inside it); before it the way in, after it the
// way out (each as long as it really is)
function pitAlong(T, A, side, k0, count, cen, main, extra) {
  const N = T.N, ds = T.ds, idxAt = (k) => ((k % N) + N) % N, k1 = k0 + count;
  const CEN = new Float32Array(N).fill(NaN), REG = new Int16Array(N).fill(-1), WALL = new Float32Array(N).fill(NaN), OUT = new Float32Array(N).fill(NaN), HIDE = new Uint8Array(N);
  // the garages and the pit wall: the longest stretch where the lane is clear of the track and the track runs straight
  // or gently curved (radius over 250 m: never round a hairpin, where the lane cuts inside it); before it the way in,
  // after it the way out (each as long as it really is)
  const clear = (pos) => cen[pos] - PIT.width / 2 >= T.W[idxAt(k0 + pos)] / 2 + 1.5; // (the lane's edge clear of the track's)
  const cw = Math.max(2, Math.round(5 / ds)); // (the bend averaged over ~10 m: a mapped centre line wobbles)
  const calm = (pos) => { let k = 0; for (let d = -cw; d <= cw; d++) k += T.K[idxAt(k0 + pos + d)]; return Math.abs(k / (2 * cw + 1)) < 1 / 250; };
  let mA = main ? Math.max(1, main[0]) : -1, mB = main ? Math.min(count - 1, main[1]) : -1;
  if (!main) for (let pos = 0, run = -1; pos <= count + 1; pos++) {
    const ok = pos <= count && clear(pos) && calm(pos);
    if (ok && run < 0) run = pos;
    if (!ok && run >= 0) { if (pos - 1 - run > mB - mA) { mA = run; mB = pos - 1; } run = -1; }
  }
  if (mA < 0 || (mB - mA) * ds < (main ? 20 : 120)) return null;
  const nRamp = mA, nRampOut = count - mB;
  const off = side < 0 ? A.BL : A.BR;
  for (let pos = 0; pos <= count; pos++) {
    const i = idxAt(k0 + pos), half = T.W[i] / 2;
    REG[i] = pos; CEN[i] = Math.max(half - 2.2, cen[pos]);
    OUT[i] = Math.max(half, CEN[i] + PIT.width / 2);
    if (pos >= mA && pos <= mB) {
      WALL[i] = Math.max(half + 0.8, CEN[i] - PIT.width / 2 - PIT.strip - 0.6); // (where the stands' strip doesn't fit, it's squeezed)
      off[i] = CEN[i] + PIT.width / 2 + 0.6; HIDE[i] = 1;
    } else off[i] = Math.max(off[i], CEN[i] + PIT.width / 2 + 0.6);
  }
  const mainLen = (mB - mA) * ds;
  const lead = Math.max(30, Math.min(110, mainLen - 11 * 15 - 25));
  const boxes = [], b0 = k0 + mA + Math.round(lead / ds), step = Math.round(15 / ds);
  for (let n = 0; n < 12; n++) { const k = b0 + n * step; if (k < k0 + mB - 4) boxes.push(idxAt(k)); }
  const limitIn = mA + Math.round(Math.min(40, lead * 0.4) / ds), limitOut = mB - Math.round(20 / ds);
  const gapAt = (i) => WALL[i] - T.W[i] / 2;
  const mS = idxAt(k0 + mA), mE = idxAt(k0 + mB);
  return { side, REG, CEN, WALL, OUT, HIDE, boxes, reach: gapAt(mS) + 0.6 + PIT.strip + PIT.width, gap: gapAt(mS), gapOut: gapAt(mE), strip: PIT.strip, start: idxAt(k0), end: idxAt(k1), count, nRamp, nRampOut, commitAt: nRamp, limitIn, limitOut, mainStart: mS, mainEnd: mE, length: count * ds, width: PIT.width, speed: PIT.speed, ...extra };
}

export function trackStats(T) {
  let turns = 0, inTurn = false, minR = Infinity;
  const upto = T.open ? T.finish + 1 : T.N; // (point-to-point: start to finish only)
  for (let i = 0; i < upto; i++) {
    const a = Math.abs(T.K[i]);
    if (a > 1 / 150 && !inTurn) { turns++; inTurn = true; }
    else if (a < 1 / 250) inTurn = false;
    if (a > 1e-5) minR = Math.min(minR, 1 / a);
  }
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < T.N; i++) { ymin = Math.min(ymin, T.Y[i]); ymax = Math.max(ymax, T.Y[i]); }
  return { length: T.raceL ?? T.L, turns, minRadius: minR, elevMin: ymin, elevMax: ymax, open: !!T.open };
}

// lateral position helpers
export function surfaceY(T, i, f, s) {
  const j = i === T.cut ? i : (i + 1) % T.N;
  const y = T.Y[i] + (T.Y[j] - T.Y[i]) * f;
  const b = T.B[i] + (T.B[j] - T.B[i]) * f;
  const w = T.W[i] / 2;
  return y + Math.max(-w, Math.min(w, s)) * Math.sin(b);
}

// grid slot positions (behind start line)
export function gridSlot(T, k) {
  const back = 10 + k * 8;
  let idx = Math.round(-back / T.ds);
  idx = ((idx % T.N) + T.N) % T.N;
  const side = k % 2 === 0 ? -1 : 1;
  const s = side * T.W[idx] * 0.22;
  return {
    idx, s,
    x: T.X[idx] + T.RX[idx] * s,
    z: T.Z[idx] + T.RZ[idx] * s,
    heading: Math.atan2(T.FX[idx], T.FZ[idx]),
  };
}

// ---------- preset tracks ----------
function P(x, z, w = 13, e = 0, b = 0) { return { x, z, w, e, b }; }
const setting = (kind, o = {}) => ({ kind, pitBuildings: false, density: 0.7, height: 0.5, green: 0.5, furniture: 0.6, litter: 0.5, streetTrees: 0.5, life: 0.6, seed: 1, models: true, flora: 'auto', ...o });
// Nature brush along a stretch of road (trees stop at the barriers, so this lines the road with them)
const natureAlong = (pts, mix, r, d, seed) => ({ kind: 'flora', mix, r, d, seed, pts: pts.map(p => [p.x, p.z]) });

export function presetTracks() {
  const list = [];

  // one-shot downhill touge through the cherry blossom: hairpins for drifting, armco close to the road
  {
    const pts = [
      P(0, 0, 11, 96), P(120, 12, 10, 92), P(230, -8, 10, 88), P(330, 25, 10, 84), P(378, 62, 10, 81, 3),
      P(384, 108, 10, 78, 3), P(350, 140, 10, 75), P(285, 148, 10, 72), P(195, 172, 10, 68), P(105, 205, 10, 64),
      P(25, 190, 10, 61), P(-55, 228, 10, 58), P(-118, 262, 10, 55, -3), P(-125, 315, 10, 52, -3), P(-72, 342, 10, 49),
      P(30, 322, 10, 45), P(128, 360, 10, 41), P(228, 340, 10, 37), P(318, 378, 10, 33), P(378, 420, 10, 30, 3),
      P(372, 478, 10, 27, 3), P(305, 492, 10, 24), P(200, 470, 10, 20), P(112, 518, 10, 16), P(12, 498, 10, 12),
      P(-80, 536, 10, 8), P(-180, 556, 11, 5),
    ];
    list.push({
      version: 1, name: 'Sakura Pass', open: true, start: 0,
      desc: 'Drift · point-to-point · a downhill mountain road through the cherry blossom, one shot, top to bottom',
      env: { ...defaultEnv('grass'), time: 'day', weather: 'clear', laps: 1, opponents: 0, runoff: 4, barrier: 'armco', pits: false,
        setting: setting('forest', { flora: 'blossom', seed: 88, green: 0.75 }) },
      props: [], points: pts,
      paint: [natureAlong(pts, 'blossom', 30, 0.85, 11), natureAlong(pts.slice(0, 3), 'meadow', 26, 0.7, 12), natureAlong(pts.slice(-3), 'meadow', 30, 0.7, 13)],
    });
  }

  // grand prix: long start straight, fast sweepers, esses, a hairpin and a chicane over rolling autumn farmland
  {
    const pts = [
      P(-350, 0, 15, 0), P(0, 0, 15, 0), P(350, 0, 15, 0), P(470, 15, 14, 1, 3), P(510, 80, 14, 3, 3),
      P(500, 180, 14, 6), P(450, 260, 13, 9), P(360, 290, 13, 12), P(300, 250, 13, 13), P(240, 290, 13, 14),
      P(200, 380, 13, 15, -3), P(240, 470, 13, 15, -2), P(330, 520, 13, 14), P(430, 540, 13, 12), P(520, 580, 13, 10, 4),
      P(540, 660, 13, 9, 4), P(480, 720, 13, 8), P(360, 700, 14, 7), P(220, 660, 14, 6), P(80, 680, 13, 5),
      P(-40, 640, 13, 5, -3), P(-100, 560, 13, 6), P(-80, 460, 13, 7), P(-140, 380, 13, 8), P(-230, 360, 13, 8),
      P(-320, 300, 13, 7, 4), P(-380, 200, 13, 5, 4), P(-420, 100, 14, 3), P(-420, 30, 14, 1),
    ];
    list.push({
      version: 1, name: 'Maple Ridge GP', start: 0,
      desc: 'Grand Prix · fast sweepers, esses, a hairpin and a chicane over autumn hills',
      env: { ...defaultEnv('grass'), time: 'day', weather: 'clear', laps: 5, opponents: 11, setting: setting('country', { flora: 'autumn', seed: 214, green: 0.7 }) },
      props: [], points: pts,
      // woods through the esses and down the back of the circuit, a meadow by the hairpin
      paint: [natureAlong(pts.slice(5, 13), 'autumn', 55, 0.6, 21), natureAlong(pts.slice(19, 27), 'autumn', 55, 0.6, 22), natureAlong(pts.slice(14, 18), 'meadow', 45, 0.55, 23)],
    });
  }

  // tight night street loop in the backstreets: square corners, a long sweeper and a hairpin
  list.push({
    version: 1, name: 'Kanjo Night Loop', start: 0,
    desc: 'Drift · street loop at night · square corners, a long sweeper and a hairpin between the vending machines',
    env: { ...defaultEnv('city'), time: 'night', weather: 'clear', laps: 3, opponents: 3, pits: false,
      setting: setting('japan', { flora: 'blossom', seed: 57, streetTrees: 0.6, life: 0.8 }) },
    props: [],
    points: [
      P(-200, 0, 12), P(100, 0, 12), P(180, 10, 11), P(215, 50, 11), P(220, 140, 11),
      P(200, 190, 11), P(150, 205, 11), P(60, 200, 11), P(20, 230, 11), P(10, 290, 11),
      P(30, 350, 11), P(90, 380, 11), P(160, 372, 11), P(205, 410, 11), P(195, 470, 11),
      P(140, 500, 11), P(-60, 500, 11), P(-170, 480, 12), P(-250, 410, 12), P(-270, 320, 12),
      P(-245, 240, 11), P(-200, 190, 11), P(-230, 120, 11), P(-265, 60, 11), P(-245, 12, 12),
    ],
  });

  // wide open dock loop for linking long drifts
  list.push({
    version: 1, name: 'Harbour Drift Yard', start: 0,
    desc: 'Drift · a wide loop between the container stacks · long sweepers to link, 16 m of tarmac',
    env: { ...defaultEnv('coast'), time: 'dusk', weather: 'overcast', laps: 3, opponents: 0, runoff: 6, runoffStyle: 'paved', barrier: 'concrete', pits: false,
      setting: setting('docks', { seed: 31, density: 0.8 }) },
    props: [],
    points: [
      P(-150, 0, 16, 2), P(80, 0, 16, 2), P(175, 30, 16, 2), P(215, 110, 16, 2), P(175, 190, 16, 2),
      P(80, 205, 16, 2), P(10, 165, 16, 2), P(-55, 190, 16, 2), P(-85, 260, 16, 2), P(-155, 312, 16, 2),
      P(-245, 285, 16, 2), P(-275, 200, 16, 2), P(-250, 120, 16, 2), P(-280, 50, 16, 2), P(-240, 6, 16, 2),
    ],
  });

  // short, flowing club circuit up and over a wooded hill
  list.push({
    version: 1, name: 'Pinewood Sprint', start: 0,
    desc: 'Club circuit · up and over a wooded hill at dusk · quick laps, close racing',
    env: { ...defaultEnv('grass'), time: 'dusk', weather: 'clear', laps: 5, opponents: 9, setting: setting('forest', { flora: 'pine', seed: 402 }) },
    props: [],
    points: [
      P(-325, 0, 14, 0), P(65, 0, 14, 0), P(260, -26, 13, 1), P(390, -117, 12, 4, 3), P(430, -260, 12, 8),
      P(364, -377, 12, 12), P(234, -390, 12, 14), P(130, -312, 12, 15), P(26, -351, 12, 15), P(-78, -429, 12, 14, -3),
      P(-208, -442, 12, 12), P(-325, -364, 12, 9), P(-364, -247, 12, 7, 3), P(-468, -156, 12, 5), P(-520, -52, 13, 3),
      P(-468, 13, 13, 1),
    ],
  });

  // seaside street circuit: palm-lined promenade, square corners in town
  list.push({
    version: 1, name: 'Palm Bay Circuit', start: 0,
    desc: 'Street circuit · a seaside town at sunset · palm-lined promenade and tight corners through the streets',
    env: { ...defaultEnv('coast'), time: 'dusk', weather: 'clear', laps: 4, opponents: 9, runoff: 4, barrier: 'concrete',
      setting: setting('town', { flora: 'palms', seed: 1207, streetTrees: 0.7 }) },
    props: [],
    points: [
      P(-300, 0, 13, 2), P(100, 0, 13, 2), P(250, 0, 12, 2), P(290, 15, 12, 2), P(300, 60, 12, 2),
      P(300, 200, 12, 3), P(320, 260, 12, 4), P(380, 300, 12, 5), P(470, 300, 12, 5), P(520, 330, 12, 5),
      P(530, 390, 12, 5), P(500, 440, 12, 4), P(420, 460, 13, 4), P(200, 460, 13, 3), P(80, 480, 12, 3),
      P(20, 520, 12, 3), P(-40, 520, 12, 3), P(-90, 470, 12, 3), P(-100, 380, 12, 2), P(-160, 330, 12, 2),
      P(-280, 320, 12, 2), P(-330, 280, 12, 2), P(-350, 200, 12, 2), P(-350, 60, 12, 2), P(-330, 15, 13, 2),
    ],
  });

  return list;
}

// the original four built-ins (kept for old saves and in the editor's Presets list)
export function archivedTracks() {
  const list = [];

  list.push({
    version: 1, name: 'Pine Hollow Park', start: 0,
    env: { ...defaultEnv('grass'), time: 'day', weather: 'clear', laps: 3 },
    props: [],
    points: [
      P(-300, 0, 14), P(0, 0, 14), P(260, 0, 14), P(400, 30, 13, 0, 4), P(450, 140, 13, 2),
      P(390, 250, 12, 4), P(270, 260, 12, 5), P(170, 200, 12, 6), P(70, 230, 12, 8),
      P(20, 340, 12, 12, -3), P(-90, 420, 12, 14), P(-230, 400, 12, 11), P(-290, 310, 12, 8),
      P(-360, 250, 13, 5), P(-480, 210, 13, 3, 5), P(-540, 110, 13, 1), P(-500, 25, 14, 0),
    ],
  });

  list.push({
    version: 1, name: 'Harborview Streets', start: 0,
    env: { ...defaultEnv('city'), time: 'dusk', weather: 'clear', laps: 3, opponents: 7 },
    props: [],
    points: [
      P(-120, 0, 12), P(120, 0, 12), P(300, 0, 12), P(335, 10, 11), P(345, 45, 11),
      P(345, 190, 11), P(335, 225, 11), P(300, 235, 11), P(180, 235, 11), P(150, 250, 11),
      P(140, 285, 11), P(140, 380, 11), P(128, 412, 11), P(95, 420, 11), P(-60, 420, 11),
      P(-110, 400, 11, 1), P(-150, 350, 11, 2), P(-200, 330, 11, 2), P(-235, 300, 11, 1), P(-240, 250, 11),
      P(-240, 60, 11), P(-230, 20, 11), P(-195, 3, 12),
    ],
  });

  // figure-8 with a bridge
  const f8 = [];
  const n8 = 18;
  for (let i = 0; i < n8; i++) {
    const t = (i / n8) * Math.PI * 2;
    f8.push(P(Math.sin(t) * 560, Math.sin(2 * t) * 260, 14, 9 + Math.cos(t) * 9, 0));
  }
  list.push({
    version: 1, name: 'Red Mesa Canyon', start: 0,
    env: { ...defaultEnv('desert'), time: 'day', weather: 'clear', laps: 3 },
    props: [], points: f8,
  });

  const cs = [];
  const nc = 16;
  for (let i = 0; i < nc; i++) {
    const t = (i / nc) * Math.PI * 2;
    const r = 400 + 90 * Math.sin(3 * t) + 40 * Math.cos(5 * t);
    cs.push(P(Math.cos(t) * r * 1.2, Math.sin(t) * r, 13, 2 + 3 * Math.sin(2 * t) + 3, 0));
  }
  list.push({
    version: 1, name: 'Bayside Night Run', start: 0,
    env: { ...defaultEnv('coast'), time: 'night', weather: 'rain', laps: 3 },
    props: [], points: cs,
  });

  return list;
}
