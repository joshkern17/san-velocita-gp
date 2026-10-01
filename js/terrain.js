// Real-world elevation: AWS Terrain Tiles (Terrarium PNGs, free, no key) -> a compact height grid stored
// in the track, so hills survive offline play and online sharing without fetching anything again.
// Terrarium decoding: metres = R * 256 + G + B / 256 - 32768.
import { toLatLon } from './geo.js';

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
// real height (metres above the lowest point of the grid) at a local position; clamps at the edges
export function rawHeight(terr, x, z) {
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
export function projectOntoTrack(track, sample) {
  const terr = track.terrain; if (!terr) return 0;
  let added = 0;
  for (let pass = 0; pass < 3; pass++) {
    const T = sample(track), N = T.N, P = track.points, n = P.length;
    // real height along the road, smoothed over ~50 m
    const raw = new Float32Array(N); for (let i = 0; i < N; i++) raw[i] = rawHeight(terr, T.X[i], T.Z[i]);
    const r = Math.max(1, Math.round(25 / T.ds)), sm = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -r; k <= r; k++) s += raw[(i + k + N) % N]; sm[i] = s / (2 * r + 1); }
    let lo = Infinity; for (let i = 0; i < N; i++) lo = Math.min(lo, sm[i]);
    terr.base = lo;
    // where does each node sit?
    const at = new Int32Array(n).fill(-1);
    for (let i = 0; i < N; i++) { const nd = Math.round(T.NODE[i]) % n; if (at[nd] < 0 || Math.abs(T.NODE[i] - Math.round(T.NODE[i])) < Math.abs(T.NODE[at[nd]] - Math.round(T.NODE[at[nd]]))) at[nd] = i; }
    for (let k = 0; k < n; k++) if (at[k] >= 0) P[k].e = Math.round((sm[at[k]] - lo) * terr.exag * 10) / 10;
    if (pass === 2) break;
    // insert nodes where the road between two nodes misses the real profile by > 2.5 m
    const T2 = sample(track), ins = [];
    for (let k = 0; k < (T2.open ? n - 1 : n); k++) { // (point-to-point: nothing after the last node)
      let worst = 0, wi = -1, len = 0;
      for (let i = 0; i < T2.N; i++) if (Math.floor(T2.NODE[i]) === k && (!T2.open || i < T2.finish)) {
        len += T2.ds;
        const dev = Math.abs(T2.Y[i] - (sm[Math.min(N - 1, Math.round(i * N / T2.N))] - lo) * terr.exag);
        if (dev > worst) { worst = dev; wi = i; }
      }
      if (worst > 2.5 && len > 40 && wi >= 0) ins.push({ k, i: wi, T: T2 });
    }
    if (!ins.length) break;
    // insert back to front so indices stay valid
    ins.sort((a, b) => b.k - a.k);
    for (const { k, i, T: Ts } of ins) {
      const a = P[k], b = P[(k + 1) % n], f = Ts.NODE[i] - k;
      P.splice(k + 1, 0, { x: Ts.X[i], z: Ts.Z[i], w: a.w + (b.w - a.w) * f, e: 0, b: a.b + (b.b - a.b) * f });
      if ((track.start || 0) > k) track.start++;
      added++;
    }
  }
  return added;
}
