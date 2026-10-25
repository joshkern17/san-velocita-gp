// LiDAR ground heights near the track: USGS 3DEP bare-earth elevation (laser-scanned, 1 m across most of the USA)
// in 512 m tiles round the track, stored in the track (terrain.fine) and blended into its 30 m hills (terrain.js
// rawHeight), so the road, the ground, the streets, houses and trees all stand on the real ground. The 30 m data is
// a surface model blurred by its grid: a road cut into a hillside comes out half way up the slope, and a bank or a
// wall beside the road drags it up or down. Bare earth has no buildings, trees or bridges in it (a bridge is the
// valley under it: roadProfile's despike takes the road straight across).
//
//   lidarCovers(geo)                    is the place inside a LiDAR source's area (USA: 3DEP)
//   fetchLidar(track, T, opts)          -> the tiles round the track not already in track.terrain.fine (each
//                                          { x0, z0, step, nx, nz, lo, data, cov }), downloaded 4 at a time
//   lidarStats(terr)                    { tiles, cover (share of cells with data), kb }
import { toLatLon } from './geo.js';

const SERVICE = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
export const LIDAR_ATTR = 'Ground heights: USGS 3D Elevation Program (3DEP)';
export const TILE_M = 512, GET_PX = 256, KEEP = 4; // (a tile: 512 m, downloaded at 2 m, kept at 4 m)
const NODATA = -32768;

// (the 50 states and territories, roughly: a box per area; the service answers no data outside its own coverage)
const US = [[24.3, -125, 49.5, -66.8], [51, -180, 71.6, -129.9], [18.8, -160.4, 22.4, -154.7], [17.8, -67.4, 18.6, -65.2]];
export const lidarCovers = (geo) => !!geo && US.some(([s, w, n, e]) => geo.lat >= s && geo.lat <= n && geo.lon >= w && geo.lon <= e);

// the tile grid: tiles 512 m square on whole multiples of 512 m from the track's origin
const tileKey = (i, j) => i + ',' + j;
export function tilesNear(T, margin = 300) {
  const want = new Set(), n = T.open ? T.finish + 1 : T.N;
  for (let s = 0; s < n; s += Math.max(1, Math.round(20 / T.ds))) {
    const x = T.X[s], z = T.Z[s];
    for (let i = Math.floor((x - margin) / TILE_M); i <= Math.floor((x + margin) / TILE_M); i++) for (let j = Math.floor((z - margin) / TILE_M); j <= Math.floor((z + margin) / TILE_M); j++) {
      // (the nearest point of that tile within the margin)
      const dx = Math.max(i * TILE_M - x, 0, x - (i + 1) * TILE_M), dz = Math.max(j * TILE_M - z, 0, z - (j + 1) * TILE_M);
      if (Math.hypot(dx, dz) <= margin) want.add(tileKey(i, j));
    }
  }
  return [...want].map(k => k.split(',').map(Number));
}

// The image is asked for with square pixels in lat / lon (the server stretches a box to square pixels if they aren't:
// a square image of a 512 m tile came back 658 m north-south at 39 N, hills squashed and a step at every seam). So
// GET_PX columns across the tile and as many rows as fill its height, the box grown by under a row to fit them whole.
async function getTile(geo, i, j, signal) {
  const x0 = i * TILE_M, z0 = j * TILE_M;
  const [latN, lonW] = toLatLon(geo, x0, z0), [latS, lonE] = toLatLon(geo, x0 + TILE_M, z0 + TILE_M); // (z is south)
  const px = (lonE - lonW) / GET_PX, rows = Math.round((latN - latS) / px), mid = (latN + latS) / 2;
  const top = mid + rows * px / 2, bot = mid - rows * px / 2;
  const url = `${SERVICE}?bbox=${lonW},${bot},${lonE},${top}&bboxSR=4326&imageSR=4326&size=${GET_PX},${rows}&format=bsq&pixelType=F32&noData=-9999&interpolation=RSP_BilinearInterpolation&f=image`;
  let lastErr;
  for (let k = 0; k < 5; k++) { // (the server throws the odd 502 when busy: five goes, waiting 1, 2, 4, 8 s)
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error('LiDAR server error ' + r.status);
      const buf = await r.arrayBuffer();
      if (buf.byteLength < GET_PX * rows * 4) throw new Error('LiDAR tile came back short');
      // (rows from the north edge, `top`; padding after them). Row / column of a local point:
      const f = new Float32Array(buf, 0, GET_PX * rows);
      return { f, rows, at: (x, z) => [(top - (latN + (latS - latN) * (z - z0) / TILE_M)) / px - 0.5, (x - x0) / TILE_M * GET_PX - 0.5] };
    } catch (e) { lastErr = e; if (signal && signal.aborted) throw e; if (k < 4) await new Promise(res => setTimeout(res, 1000 * 2 ** k)); }
  }
  throw lastErr;
}

// -> 4 m cells: each the mean of the image at four points 1 m round its middle (less noise than one sample), packed as
// int16 centimetres above the tile's lowest point (decimetres where it spans more than 327 m: a mountainside)
function packTile(i, j, { f, rows, at }) {
  const n = TILE_M / KEEP, h = new Float32Array(n * n);
  const px = (r, c) => { const v = f[r * GET_PX + c]; return isFinite(v) && v > -1000 ? v : NaN; };
  const bil = (x, z) => { // (bilinear over the corners that have data)
    let [r, c] = at(x, z); r = Math.max(0, Math.min(rows - 1.001, r)); c = Math.max(0, Math.min(GET_PX - 1.001, c));
    const r0 = Math.floor(r), c0 = Math.floor(c), u = c - c0, v = r - r0;
    let s = 0, w = 0;
    for (const [dr, dc, k] of [[0, 0, (1 - u) * (1 - v)], [0, 1, u * (1 - v)], [1, 0, (1 - u) * v], [1, 1, u * v]]) { const q = px(r0 + dr, c0 + dc); if (!isNaN(q) && k > 0) { s += q * k; w += k; } }
    return w > 0.25 ? s / w : NaN;
  };
  let lo = Infinity, hi = -Infinity, have = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = i * TILE_M + (c + 0.5) * KEEP, z = j * TILE_M + (r + 0.5) * KEEP;
    let s = 0, m = 0;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const v = bil(x + dx, z + dz); if (!isNaN(v)) { s += v; m++; } }
    const v = m ? s / m : NaN; h[r * n + c] = v;
    if (m) { lo = Math.min(lo, v); hi = Math.max(hi, v); have++; }
  }
  if (!have) return null;
  const unit = hi - lo > 327 ? 0.1 : 0.01, a = new Int16Array(n * n);
  for (let q = 0; q < a.length; q++) a[q] = isFinite(h[q]) ? Math.min(32767, Math.round((h[q] - lo) / unit)) : NODATA;
  const bytes = new Uint8Array(a.buffer); let s = '';
  for (let q = 0; q < bytes.length; q += 8192) s += String.fromCharCode.apply(null, bytes.subarray(q, q + 8192));
  // (cell centres: 2 m in from the tile's corner, every 4 m. v 2: the north-south fix; tiles without it are re-downloaded)
  return { i, j, v: 2, x0: i * TILE_M + KEEP / 2, z0: j * TILE_M + KEEP / 2, step: KEEP, nx: n, nz: n, lo: Math.round(lo * 100) / 100, unit, data: btoa(s), cov: Math.round(have / (n * n) * 100) / 100 };
}

// opts: { margin (m round the track), onStatus(msg), signal }. Returns the new tiles (empty: all there already) and
// how many came back with no data at all (outside the coverage).
export async function fetchLidar(track, T, { margin = 300, onStatus = () => {}, signal } = {}) {
  if (!track.geo) throw new Error('Set a real location first.');
  const have = new Set(((track.terrain && track.terrain.fine) || []).filter(t => t.v === 2).map(t => tileKey(t.i, t.j)));
  const todo = tilesNear(T, margin).filter(([i, j]) => !have.has(tileKey(i, j)));
  const out = []; let done = 0, empty = 0;
  onStatus(`Downloading LiDAR heights… 0/${todo.length}`);
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length) {
      const [i, j] = queue.shift();
      const t = packTile(i, j, await getTile(track.geo, i, j, signal));
      if (t) out.push(t); else empty++;
      onStatus(`Downloading LiDAR heights… ${++done}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { tiles: out, empty, asked: todo.length };
}

export function lidarStats(terr) {
  const F = (terr && terr.fine) || [];
  if (!F.length) return null;
  return { tiles: F.length, cover: F.reduce((s, t) => s + t.cov, 0) / F.length, kb: Math.round(F.reduce((s, t) => s + t.data.length, 0) / 1024) };
}
