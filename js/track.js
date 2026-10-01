// Track data model, spline sampling and analysis (shared by editor + race)
import { BUSINESSES } from './zones.js';

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
  tires:      { label: 'Tire Stack', color: '#222',    r: 2 },
  billboard:  { label: 'Billboard',  color: '#d8b43a', r: 7, w: 14, d: 1 },
  cones:      { label: 'Cones',      color: '#ff7a1a', r: 2 },
  lamp:       { label: 'Floodlight', color: '#f3e7a1', r: 1 },
  courthouse: { label: 'Auburn Courthouse', color: '#d9a95f', r: 22, w: 46, d: 32 },
  ...Object.fromEntries(Object.entries(BUSINESSES).map(([k, b]) => [k, { label: b.label, color: b.color, r: Math.max(b.w, b.d) / 2, w: b.w, d: b.d, biz: true }])),
};
// paintable ground (editor PAINT tool). Just grass for now; each entry = colour in the editor + physics
export const PAINTS = {
  grass: { label: 'Grass', color: 'rgba(92,170,64,0.6)', mu: 0.58, drag: 120 },
};
// (the Nature brush, kind 'flora', paints a tree mix from scenery.js FLORA; its ground counts as grass)

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

function crScalar(a, b, c, d, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
}
const smooth = (a, b, u) => a + (b - a) * (u * u * (3 - 2 * u));

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
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(8, Math.ceil(segLen / 0.75));
    for (let k = 0; k < steps; k++) {
      const u = k / steps, p = crPoint(p0, p1, p2, p3, u);
      fine.push({ x: p.x, z: p.z, e: crScalar(p0.e, p1.e, p2.e, p3.e, u), w: smooth(p1.w, p2.w, u), b: smooth(p1.b, p2.b, u), node: i + u });
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
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(8, Math.ceil(segLen / 0.75));
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      const p = crPoint(p0, p1, p2, p3, u);
      fine.push({
        x: p.x, z: p.z,
        e: crScalar(p0.e, p1.e, p2.e, p3.e, u),
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
  finishFrames(T);
  return T;
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
export function analyzeTrack(T, env) {
  const N = T.N;
  const hash = buildHash(T);
  const sep = Math.ceil(40 / T.ds);
  const BRIDGE = new Uint8Array(N);   // this sample passes over another section
  const LIFT = new Float32Array(N);   // tiny visual offset for flat crossings
  for (let i = 0; i < N; i++) {
    hash.query(T.X[i], T.Z[i], 30, (j) => {
      if (circDist(i, j, N) < sep) return;
      const d = Math.hypot(T.X[i] - T.X[j], T.Z[i] - T.Z[j]);
      const dy = T.Y[i] - T.Y[j];
      // the deck spans the lower road's runoff and barriers too (so its embankment can't bury them)
      if (dy > 4 && d < T.W[i] / 2 + T.W[j] / 2 + (env.runoff || 0) + 8) BRIDGE[i] = 1;
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
  // kerbs on corners
  const KERB = new Uint8Array(N);
  if (env.kerbs !== false) {
    const tmp = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (Math.abs(T.K[i]) > 1 / 140) tmp[i] = 1;
    const kd = Math.ceil(10 / T.ds);
    for (let i = 0; i < N; i++) if (tmp[i]) for (let k = -kd; k <= kd; k++) KERB[(i + k + N) % N] = 1;
    for (let i = 0; i < N; i++) if (BR2[i]) KERB[i] = 0;
  }
  return { hash, BRIDGE: BR2, LIFT, BL, BR: BRt, HAS_L, HAS_R, KERB };
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

export function minCurvatureLine(T, margin = 1.6, spacing = 8) {
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
    const lim = Math.max(0, T.W[i] / 2 - margin); lo[j] = -lim; hi[j] = lim;
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
      const ii = i % N, lim = Math.max(0, T.W[ii] / 2 - margin);
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
// A lane parallel to the start/finish straight, separated by a pit wall, with ramps in and out.
// Mutates A.BL / A.BR so barriers (and scenery clearance) move out to the garages.
export const PIT = { width: 9, wallGap: 1.4, speed: 22.2 };

export function buildPitLane(T, A, env) {
  if (env.pits === false || T.open) return null; // (a point-to-point run has no pit lane)
  const N = T.N, ds = T.ds;
  const ramp = 75, nRamp = Math.round(ramp / ds);
  const idxAt = (k) => ((k % N) + N) % N;
  const shifts = [0, 90, -90, 180, -180, 270, -270, 360, -360, 450, -450].map(m => Math.round(m / ds));
  // a long lane first (the garages well down it, so a car coming in quick still stops at the first one), then the
  // old shorter one where a long one doesn't fit
  let nMain;
  for (const Lmain of [Math.max(330, Math.min(420, T.L * 0.2)), Math.max(160, Math.min(320, T.L * 0.16))]) {
    nMain = Math.round(Lmain / ds);
    for (const sh of shifts) {
      const res = tryPit(sh);
      if (res) return res;
    }
  }
  return null;

  function tryPit(sh) {
  const k0 = -Math.round(nMain * 0.55) - nRamp + sh, k1 = Math.round(nMain * 0.45) + nRamp + sh;
  const sides = env.pitSide === 'left' ? [-1] : env.pitSide === 'right' ? [1] : [1, -1];
  const sep = Math.ceil(60 / ds);
  const laneC = (i) => T.W[i] / 2 + PIT.wallGap + 0.6 + PIT.width / 2;
  let side = 0;
  for (const sd of sides) {
    let ok = true;
    for (let k = k0; k <= k1 && ok; k++) {
      const i = idxAt(k);
      if (A.BRIDGE[i] || !(sd < 0 ? A.HAS_L[i] : A.HAS_R[i])) { ok = false; break; }
      // no tight corner on the pit side
      if (sd * T.K[i] > 0 && 1 / Math.abs(T.K[i]) < laneC(i) + PIT.width + 25) { ok = false; break; }
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
    if (ok) { side = sd; break; }
  }
  if (!side) return null;
  const REG = new Int16Array(N).fill(-1);    // position along the pit region, -1 outside
  const CEN = new Float32Array(N).fill(NaN); // lane centre offset (absolute, on the pit side)
  const WALL = new Float32Array(N).fill(NaN);
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
    if (pos >= nRamp && pos <= count - nRamp) {
      WALL[i] = T.W[i] / 2 + PIT.wallGap;
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
  return { side, REG, CEN, WALL, HIDE, boxes, start, end, count, nRamp, commitAt: nRamp, limitIn, limitOut, mainStart: idxAt(k0 + nRamp), mainEnd: idxAt(k1 - nRamp), length: count * ds, width: PIT.width, speed: PIT.speed };
  }
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
    env: { ...defaultEnv('coast'), time: 'dusk', weather: 'overcast', laps: 3, opponents: 0, runoff: 6, barrier: 'concrete', pits: false,
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
