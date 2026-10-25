// Real-world elevation: AWS Terrain Tiles (Terrarium PNGs, free, no key) -> a compact height grid stored
// in the track, so hills survive offline play and online sharing without fetching anything again.
// Terrarium decoding: metres = R * 256 + G + B / 256 - 32768.
import { toLatLon } from './geo.js';
import { nodeHandles } from './track.js';

const TILE = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const TERRAIN_ATTR = 'Elevation: AWS Terrain Tiles (Mapzen / USGS / SRTM and others)';
export const EXAG_MAX = 4;

const lon2px = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2px = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };

function loadTile(z, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const to = setTimeout(() => reject(new Error('Elevation server timed out.')), 20000);
    img.onload = () => {
      clearTimeout(to);
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(256 * 256);
        for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        resolve(h);
      } catch (e) { reject(new Error('The browser blocked reading elevation data (open the game through the app / local server).')); }
    };
    img.onerror = () => { clearTimeout(to); reject(new Error('Could not download elevation data. Check your internet connection.')); };
    img.src = TILE(z, x, y);
  });
}

// heights (metres above sea level) on a grid over box = [x0, z0, x1, z1] (local metres around geo)
export async function fetchElevation(geo, box, step = 16, onStatus = () => {}) {
  const [x0, z0, x1, z1] = box;
  const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => toLatLon(geo, x, z));
  const lats = corners.map(c => c[0]), lons = corners.map(c => c[1]);
  const la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  // zoom whose pixels are about half the grid step (finer is wasted), at most 36 tiles
  const mppAt0 = 156543.03 * Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
  let z = Math.max(8, Math.min(15, Math.floor(Math.log2(mppAt0 / Math.max(2, step / 2))))), tx0, tx1, ty0, ty1;
  for (; z >= 8; z--) {
    tx0 = Math.floor(lon2px(lo0, z) / 256); tx1 = Math.floor(lon2px(lo1, z) / 256);
    ty0 = Math.floor(lat2px(la1, z) / 256); ty1 = Math.floor(lat2px(la0, z) / 256);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 36) break;
  }
  const tiles = new Map(), jobs = [];
  let done = 0;
  const total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  onStatus(`Downloading elevation… 0/${total}`);
  const queue = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) queue.push([tx, ty]);
  // 6 at a time, one retry each (slow tiles used to time the whole download out)
  const worker = async () => {
    while (queue.length) {
      const [tx, ty] = queue.shift();
      let h; try { h = await loadTile(z, tx, ty); } catch (e) { h = await loadTile(z, tx, ty); }
      tiles.set(tx + ',' + ty, h); onStatus(`Downloading elevation… ${++done}/${total}`);
    }
  };
  for (let k = 0; k < 6; k++) jobs.push(worker());
  await Promise.all(jobs);
  const px = (gx, gy) => {
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = tiles.get(tx + ',' + ty);
    if (!t) return NaN;
    return t[(Math.floor(gy) - ty * 256) * 256 + (Math.floor(gx) - tx * 256)];
  };
  const sample = (lat, lon) => { // bilinear
    const gx = lon2px(lon, z) - 0.5, gy = lat2px(lat, z) - 0.5, ix = Math.floor(gx), iy = Math.floor(gy), u = gx - ix, v = gy - iy;
    const a = px(ix, iy), b = px(ix + 1, iy), c = px(ix, iy + 1), d = px(ix + 1, iy + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
  let h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    const [lat, lon] = toLatLon(geo, x0 + k * step, z0 + j * step);
    h[j * nx + k] = sample(lat, lon);
  }
  // fill gaps (edges of the tile set) and knock off single-pixel noise
  for (let i = 0; i < h.length; i++) if (!isFinite(h[i])) h[i] = 0;
  h = blur(h, nx, nz);
  return { x0, z0, step, nx, nz, h, zoom: z };
}

function blur(h, nx, nz) {
  const o = new Float32Array(h.length);
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) {
    let s = 0, w = 0;
    for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
      const jj = j + dj, kk = k + dk; if (jj < 0 || kk < 0 || jj >= nz || kk >= nx) continue;
      const wt = dj || dk ? 1 : 2; s += h[jj * nx + kk] * wt; w += wt;
    }
    o[j * nx + k] = s / w;
  }
  return o;
}

// ---- compact storage: int16 decimetres above the lowest point, base64 ----
export function packTerrain(g) {
  let lo = Infinity; for (const v of g.h) lo = Math.min(lo, v);
  const a = new Int16Array(g.h.length);
  for (let i = 0; i < a.length; i++) a[i] = Math.max(-32768, Math.min(32767, Math.round((g.h[i] - lo) * 10)));
  const bytes = new Uint8Array(a.buffer);
  let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { x0: g.x0, z0: g.z0, step: g.step, nx: g.nx, nz: g.nz, lo: Math.round(lo * 10) / 10, data: btoa(s), exag: 1, ground: true, base: 0 };
}
const cache = new WeakMap();
function grid(terr) {
  let h = cache.get(terr);
  if (!h) {
    const bin = atob(terr.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = new Int16Array(bytes.buffer);
    h = new Float32Array(a.length); for (let i = 0; i < a.length; i++) h[i] = a[i] / 10;
    cache.set(terr, h);
  }
  return h;
}
// ---- LiDAR tiles (terrain.fine: lidar.js) over the 30 m grid ----
// Each tile's cells decoded to metres above the grid's lowest point (terr.lo), NaN where it has no data, and which of
// its four sides have no tile next to them: towards those it fades into the 30 m grid over FINE_BLEND m (the two
// models differ by a metre or so, and a lot more where the 30 m one blurred a slope), so there's no step.
const FINE_BLEND = 96, fineCache = new WeakMap();
function fineTiles(terr) {
  let m = fineCache.get(terr);
  if (m) return m;
  m = new Map();
  for (const t of terr.fine) m.set(t.i * 65536 + t.j, t);
  for (const t of terr.fine) {
    const bin = atob(t.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = new Int16Array(bytes.buffer), h = new Float32Array(a.length), off = t.lo - terr.lo;
    for (let i = 0; i < a.length; i++) h[i] = a[i] === -32768 ? NaN : a[i] * (t.unit || 0.01) + off;
    const has = (di, dj) => m.has((t.i + di) * 65536 + t.j + dj);
    m.set(t.i * 65536 + t.j, { ...t, h, edge: [has(-1, 0), has(1, 0), has(0, -1), has(0, 1)] });
  }
  fineCache.set(terr, m);
  return m;
}
const FINE_TILE = 512; // (lidar.js TILE_M)
// the LiDAR height here and how much it counts (0: none here, use the 30 m grid; 1: all). Between the last cell of one
// tile and the first of the next, it reads across into the neighbour (clamped to its own edge cells, a slope had a
// step there: 1.8 m on Placer Hills' 45% canyon sides).
function fineAt(terr, x, z) {
  const i = Math.floor(x / FINE_TILE), j = Math.floor(z / FINE_TILE), M = fineTiles(terr), t = M.get(i * 65536 + j);
  if (!t) return null;
  const st = t.step, n = t.nx, half = st / 2; // (cell centres half a cell in from each tile's corner, n to a side)
  const fx = (x - half) / st, fz = (z - half) / st, gx = Math.floor(fx), gz = Math.floor(fz), u = fx - gx, v = fz - gz;
  const cell = (cx, cz) => { // (a cell anywhere on the tile grid: NaN if its tile isn't there)
    const ti = Math.floor(cx / n), tj = Math.floor(cz / n), o = ti === i && tj === j ? t : M.get(ti * 65536 + tj);
    return o ? o.h[(cz - tj * n) * n + (cx - ti * n)] : NaN;
  };
  const a = cell(gx, gz), b = cell(gx + 1, gz), c = cell(gx, gz + 1), d = cell(gx + 1, gz + 1);
  let s = 0, w = 0; // (only the corners with data)
  if (a === a) { const g = (1 - u) * (1 - v); s += a * g; w += g; }
  if (b === b) { const g = u * (1 - v); s += b * g; w += g; }
  if (c === c) { const g = (1 - u) * v; s += c * g; w += g; }
  if (d === d) { const g = u * v; s += d * g; w += g; }
  if (w < 0.5) return null;
  const lx = x - i * FINE_TILE, lz = z - j * FINE_TILE;
  let e = Infinity;
  if (!t.edge[0]) e = Math.min(e, lx); if (!t.edge[1]) e = Math.min(e, FINE_TILE - lx);
  if (!t.edge[2]) e = Math.min(e, lz); if (!t.edge[3]) e = Math.min(e, FINE_TILE - lz);
  const f = Math.min(1, e / FINE_BLEND);
  return { h: s / w, w: f * f * (3 - 2 * f) * Math.min(1, (w - 0.5) * 2) };
}

// real height (metres above the lowest point of the grid) at a local position: the LiDAR where there is some, else
// (and fading into it) the 30 m grid; clamps at the grid's edges
export function rawHeight(terr, x, z) {
  const c = coarseHeight(terr, x, z);
  if (!terr.fine || !terr.fine.length) return c;
  const f = fineAt(terr, x, z);
  return f ? c + (f.h - c) * f.w : c;
}
function coarseHeight(terr, x, z) {
  const h = grid(terr), { nx, nz, step } = terr;
  const fx = Math.max(0, Math.min(nx - 1.001, (x - terr.x0) / step)), fz = Math.max(0, Math.min(nz - 1.001, (z - terr.z0) / step));
  const k = Math.floor(fx), j = Math.floor(fz), u = fx - k, v = fz - j;
  const a = h[j * nx + k], b = h[j * nx + k + 1], c = h[(j + 1) * nx + k], d = h[(j + 1) * nx + k + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
// height as the game uses it: relative to the circuit's lowest point, times the exaggeration
export const gameHeight = (terr, x, z) => (rawHeight(terr, x, z) - terr.base) * terr.exag;
export const inGrid = (terr, x, z) => x >= terr.x0 && z >= terr.z0 && x <= terr.x0 + (terr.nx - 1) * terr.step && z <= terr.z0 + (terr.nz - 1) * terr.step;

// Project the terrain onto the circuit: node heights follow the ground (smoothed along the road so the
// surface doesn't copy every bump of the elevation model), adding nodes where the hills change between
// widely spaced nodes. `sample(track)` must return the sampled track (sampleTrack).
// The road's own height profile from the real ground. The elevation data is a coarse grid (16-40 m), so on a road
// cut into a steep hillside it mixes in the slope above and below the road and the raw profile lurches (a 26%
// plunge on a 9% mountain road). A real road is built smooth and never steeper than it has to be: so the profile
// is a smooth best fit to the data, never steeper than terr.maxGrade (real metres per metre, default 18%: Eau Rouge
// and the Corkscrew keep their drama), with gentle vertical curves. The land is then shaped round the road
// (cuttings and embankments, world.js).
export const MAX_GRADE = 0.18;
// fine: the heights are LiDAR (lidar.js), the ground itself to a few cm: smoothed over ~25 m (enough to take out the
// curb, a gutter, a parked car the scan saw through), and first despiked: bare-earth data has no bridges in it (a
// bridge comes out as the stream or road under it, a pit metres deep), so a stretch that drops steeply and climbs back
// within 80 m is taken straight across, as the real road is.
export function roadProfile(raw, ds, open, maxGrade = MAX_GRADE, fine = false) {
  if (fine) raw = despike(Float32Array.from(raw), ds, open);
  const N = raw.length, at = open ? (i) => Math.max(0, Math.min(N - 1, i)) : (i) => ((i % N) + N) % N;
  const box = (src, r) => { // moving average (prefix sums), r samples each side
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -r; k <= r; k++) s += src[at(i + k)]; out[i] = s / (2 * r + 1); }
    return out;
  };
  // the data, smoothed over ~70 m (hillside noise is about one grid cell wide)
  const sr = fine ? 6 : 18, data = box(box(raw, Math.max(1, Math.round(sr / ds))), Math.max(1, Math.round(sr / ds)));
  const G = maxGrade * ds;
  // the steepest the road may be: run forwards and backwards clamping each step, and average the two (the average
  // of two profiles that both obey the limit obeys it too). A loop starts both runs at its lowest point.
  const limit = (y) => {
    let s0 = 0; if (!open) for (let i = 1; i < N; i++) if (y[i] < y[s0]) s0 = i;
    const f = new Float32Array(N), b = new Float32Array(N), e0 = open ? N - 1 : s0; // (backwards: from the far end)
    for (let k = 0; k < N; k++) { const i = (s0 + k) % N, p = (s0 + k - 1 + N) % N; f[i] = k ? Math.max(f[p] - G, Math.min(f[p] + G, y[i])) : y[i]; }
    for (let k = 0; k < N; k++) { const i = (e0 - k + N * 2) % N, p = (e0 - k + 1 + N * 2) % N; b[i] = k ? Math.max(b[p] - G, Math.min(b[p] + G, y[i])) : y[i]; }
    for (let i = 0; i < N; i++) y[i] = (f[i] + b[i]) / 2;
    return y;
  };
  let y = limit(Float32Array.from(data));
  // settle it: pulled towards the data, eased (vertical curves), back within the limit
  const r = Math.max(1, Math.round(10 / ds));
  for (let it = 0; it < 24; it++) {
    for (let i = 0; i < N; i++) y[i] += (data[i] - y[i]) * 0.5;
    y = limit(box(y, r));
  }
  return box(y, r); // (an average of profiles within the limit is within it too)
}

// (tools/tracks/build.mjs despike, at any spacing: a grade over SPIKE_GRADE across 8 m, then the opposite within 80 m)
const SPIKE_GRADE = 0.2;
export function despike(h, ds, open) {
  const N = h.length, at = (i) => (open ? Math.max(0, Math.min(N - 1, i)) : ((i % N) + N) % N);
  const k = Math.max(1, Math.round(8 / ds)), span = Math.round(80 / ds), lim = SPIKE_GRADE * k * ds;
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (let i = 0; i < (open ? N - k : N); i++) {
      const g = h[at(i + k)] - h[i];
      if (Math.abs(g) < lim) continue;
      let j = -1;
      for (let q = k; q <= span && (!open || i + q + k < N); q++) { const g2 = h[at(i + q + k)] - h[at(i + q)]; if (Math.sign(g2) === -Math.sign(g) && Math.abs(g2) >= lim * 0.5) j = i + q + k; }
      if (j < 0) continue;
      const ha = h[at(i)], hb = h[at(j)];
      for (let q = i + 1; q < j; q++) h[at(q)] = ha + (hb - ha) * (q - i) / (j - i);
      any = true; i = j - 1;
    }
    if (!any) break;
  }
  return h;
}

export function projectOntoTrack(track, sample) {
  const terr = track.terrain; if (!terr) return 0;
  let added = 0;
  for (let pass = 0; pass < 6; pass++) {
    const T = sample(track), N = T.N, P = track.points, n = P.length;
    // (point-to-point: the run-off past the finish and the grid behind the start follow the road on)
    // (in driving order: a point-to-point track's samples start with the grid behind the start line at cut + 1)
    const ord = new Int32Array(N); for (let k = 0; k < N; k++) ord[k] = T.open ? (T.cut + 1 + k) % N : k;
    const raw = new Float32Array(N); for (let k = 0; k < N; k++) raw[k] = rawHeight(terr, T.X[ord[k]], T.Z[ord[k]]);
    const fit = roadProfile(raw, T.ds, !!T.open, terr.maxGrade ?? MAX_GRADE, !!(terr.fine && terr.fine.length)), sm = new Float32Array(N);
    for (let k = 0; k < N; k++) sm[ord[k]] = fit[k];
    let lo = Infinity; for (let i = 0; i < N; i++) lo = Math.min(lo, sm[i]);
    terr.base = lo;
    // where does each node sit?
    const at = new Int32Array(n).fill(-1);
    for (let i = 0; i < N; i++) { const nd = Math.round(T.NODE[i]) % n; if (at[nd] < 0 || Math.abs(T.NODE[i] - Math.round(T.NODE[i])) < Math.abs(T.NODE[at[nd]] - Math.round(T.NODE[at[nd]]))) at[nd] = i; }
    for (let k = 0; k < n; k++) if (at[k] >= 0) P[k].e = Math.round((sm[at[k]] - lo) * terr.exag * 10) / 10;
    // (a node no sample lands next to - two nodes a metre apart - takes the profile where it stands, never 0)
    for (let k = 0; k < n; k++) if (at[k] < 0) {
      let bi = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = (T.X[i] - P[k].x) ** 2 + (T.Z[i] - P[k].z) ** 2; if (d < bd) { bd = d; bi = i; } }
      P[k].e = Math.round((sm[bi] - lo) * terr.exag * 10) / 10;
    }
    if (pass === 5) break;
    // insert nodes where the road between two nodes misses the profile by > 35 cm
    const T2 = sample(track), ins = [];
    for (let k = 0; k < (T2.open ? n - 1 : n); k++) { // (point-to-point: nothing after the last node)
      let worst = 0, wi = -1, len = 0;
      for (let i = 0; i < T2.N; i++) if (Math.floor(T2.NODE[i]) === k && (!T2.open || i < T2.finish)) {
        len += T2.ds;
        const dev = Math.abs(T2.Y[i] - (sm[Math.min(N - 1, Math.round(i * N / T2.N))] - lo) * terr.exag);
        if (dev > worst) { worst = dev; wi = i; }
      }
      // (not right by a node: the curve point for its height is there already)
      const u = wi >= 0 ? T2.NODE[wi] - k : 0, b = P[(k + 1) % n];
      if (worst > 0.35 && len > 10 && wi >= 0 && u > 0.1 && u < 0.9 && Math.hypot(T2.X[wi] - P[k].x, T2.Z[wi] - P[k].z) > 5 && Math.hypot(T2.X[wi] - b.x, T2.Z[wi] - b.z) > 5) ins.push({ k, u, e: sm[Math.min(N - 1, Math.round(wi * N / T2.N))] });
    }
    if (!ins.length) break;
    // A new node splits its stretch's curve where it stands (de Casteljau: the same curve, in two), so the road doesn't
    // move. Every handle round it is pinned first: the automatic curve through a node bends with its neighbours, and
    // the new one is a neighbour now. (Inserted plain, on a curve with handles, the old handles bent the two halves
    // out of shape - a node could end up behind the one before it - and the road folded into a pit.)
    // (an automatic handle comes from the two nodes either side, so the stretches before and after the split one
    // are pinned too: the handles out of the node before it and into the node after it)
    const H = P.map((_, k) => nodeHandles(track, k)), r2 = (v) => Math.round(v * 100) / 100;
    const at2 = (k) => track.open ? (k >= 0 && k < n ? k : -1) : ((k % n) + n) % n;
    const pin = (k, end) => { const q = at2(k); if (q >= 0 && !P[q][end] && H[q][end]) P[q][end] = H[q][end].map(r2); };
    for (const { k } of ins) { pin(k - 1, 'ho'); pin(k, 'hi'); pin(k, 'ho'); pin(k + 1, 'hi'); pin(k + 1, 'ho'); pin(k + 2, 'hi'); }
    ins.sort((a, b) => b.k - a.k); // (back to front, so indices stay valid)
    for (const { k, u, e } of ins) {
      const a = P[k], kb = (k + 1) % n, b = P[kb], ho = a.ho, hi = b.hi;
      if (!ho || !hi) continue;
      const L = (p, q) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
      const P0 = [a.x, a.z], P1 = [a.x + ho[0], a.z + ho[1]], P2 = [b.x + hi[0], b.z + hi[1]], P3 = [b.x, b.z];
      const Q0 = L(P0, P1), Q1 = L(P1, P2), Q2 = L(P2, P3), R0 = L(Q0, Q1), R1 = L(Q1, Q2), S = L(R0, R1);
      a.ho = [r2(Q0[0] - P0[0]), r2(Q0[1] - P0[1])]; b.hi = [r2(Q2[0] - P3[0]), r2(Q2[1] - P3[1])];
      P.splice(k + 1, 0, { x: r2(S[0]), z: r2(S[1]), w: a.w + (b.w - a.w) * u, e: Math.round((e - lo) * terr.exag * 10) / 10, b: a.b + (b.b - a.b) * u, hi: [r2(R0[0] - S[0]), r2(R0[1] - S[1])], ho: [r2(R1[0] - S[0]), r2(R1[1] - S[1])] });
      if ((track.start || 0) > k) track.start++;
      added++;
    }
  }
  return added;
}
