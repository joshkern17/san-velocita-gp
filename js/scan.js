// Real houses and trees near the track (USA): every building's outline from FEMA's USA Structures (public domain,
// traced from aerial photos by Oak Ridge National Laboratory) and every tree from the USGS 3DEP LiDAR point clouds
// (the laser survey the ground heights come from, every return kept). Within `band` m of the track these replace the
// made-up scenery: the houses the map import puts on empty lots, the setting's woods. Further out the setting goes on.
//
// The point clouds here only tell ground from not-ground, so the rest is ours: a return inside a FEMA outline is
// that roof (its height), anything else 3 m+ over the ground is a crown. Read at EPT depth 8, ~0.5 returns / m²
// (a sixth of the full survey's download): on Joeger 2 it found 88% of the canopy the full survey did, no false
// crowns, the same heights. The ground is the track's own LiDAR (terrain.fine: the same survey, within 10 cm).
//
//   scanCovers(geo)                       is it in the USA (lidar.js)
//   fetchScan(track, T, opts)             -> track.scan { v, band, houses: [{ p, k, use, h }], trees: packed, src, date }
//   scanTrees(scan)                       [[x, z, h], ...]
//   scanStats(scan)                       { houses, trees, kb }
//   inScanBand(track) -> (x, z) => is this inside the scanned strip (where the real world replaces the made-up)
//   scanDrift(track, T)                   how far the track has moved off the line the scan was taken along (m)
import { toLatLon, toLocal } from './geo.js';
import { rawHeight } from './terrain.js';
import { lidarCovers } from './lidar.js';
import { pointInPoly, polyArea } from './zones.js';

export const SCAN_ATTR = 'Buildings: FEMA USA Structures (ORNL). Trees: USGS 3DEP LiDAR point clouds';
export const SCAN_BAND = 150, DEPTH = 8;
export const scanCovers = lidarCovers;
const FEMA = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query';
const EPT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/';
const INDEX = 'https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson';
const RE = 6378137;
const merc = (la, lo) => [RE * lo * Math.PI / 180, RE * Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360))];
const unmerc = (x, y) => [(2 * Math.atan(Math.exp(y / RE)) - Math.PI / 2) * 180 / Math.PI, x / RE * 180 / Math.PI];
const r1 = (v) => Math.round(v * 10) / 10;

// the line a scan is taken along: the track's samples every 10 m
export function scanLine(T) { const o = []; for (let i = 0; i < T.N; i += Math.max(1, Math.round(10 / T.ds))) o.push([r1(T.X[i]), r1(T.Z[i])]); return o; }
// the strip within `band` of a line, as 10 m cells (a cell is in if its middle is)
function bandGrid(line, band, C = 10) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of line) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 -= band + C; z0 -= band + C; x1 += band + C; z1 += band + C;
  const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C), g = new Uint8Array(nx * nz), r = Math.ceil(band / C);
  for (let s = 0; s < line.length; s++) { // (the line's points and its midpoints: 5 m apart)
    for (const [px, pz] of s + 1 < line.length ? [line[s], [(line[s][0] + line[s + 1][0]) / 2, (line[s][1] + line[s + 1][1]) / 2]] : [line[s]]) {
      const ci = Math.floor((px - x0) / C), cj = Math.floor((pz - z0) / C);
      for (let j = Math.max(0, cj - r); j <= Math.min(nz - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++)
        if (!g[j * nx + i] && Math.hypot(x0 + (i + 0.5) * C - px, z0 + (j + 0.5) * C - pz) < band) g[j * nx + i] = 1;
    }
  }
  const has = (x, z) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); return i >= 0 && j >= 0 && i < nx && j < nz && !!g[j * nx + i]; };
  const cells = []; for (let q = 0; q < g.length; q++) if (g[q]) cells.push([x0 + (q % nx + 0.5) * C, z0 + (Math.floor(q / nx) + 0.5) * C]);
  return { has, cells, box: [x0, z0, x1, z1], C };
}
// (the strip a saved scan covers, along the line it was taken along: moving the track later doesn't move it)
const bandCache = new WeakMap();
export function inScanBand(track) {
  const s = track.scan; if (!s || !s.line) return null;
  let g = bandCache.get(s); if (!g) { g = bandGrid(s.line, s.band); bandCache.set(s, g); }
  return g.has;
}
// how far the track has moved off the scanned line (m, the worst sample): past ~25 m it wants scanning again
export function scanDrift(track, T) {
  const s = track.scan; if (!s || !s.line || !T) return 0;
  const C = 50, grid = new Map(); for (const [x, z] of s.line) { const k = Math.floor(x / C) + ',' + Math.floor(z / C); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z]); }
  let worst = 0;
  for (let i = 0; i < T.N; i += Math.max(1, Math.round(20 / T.ds))) {
    let d = Infinity; const cx = Math.floor(T.X[i] / C), cz = Math.floor(T.Z[i] / C);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [x, z] of grid.get((cx + a) + ',' + (cz + b)) || []) d = Math.min(d, Math.hypot(x - T.X[i], z - T.Z[i]));
    worst = Math.max(worst, Math.min(d, C * 1.5));
  }
  return worst;
}

// ---------------- buildings: FEMA USA Structures ----------------
// FEMA's use classes -> ours (k): the kind of building the scenery makes of it
const USE = { Residential: 'house', Commercial: 'shop', Industrial: 'warehouse', Agriculture: 'barn', Education: 'school', Government: 'civic', Assembly: 'hall', Utility: 'utility', Unclassified: '' };
async function fetchJSON(url, signal, tries = 5) {
  let last;
  for (let k = 0; k < tries; k++) {
    try { const r = await fetch(url, { signal }); if (!r.ok) throw new Error('server error ' + r.status); return await r.json(); }
    catch (e) { last = e; if (signal && signal.aborted) throw e; if (k < tries - 1) await new Promise(res => setTimeout(res, 1000 * 2 ** k)); }
  }
  throw last;
}
async function fetchBuildings(geo, G, onStatus, signal) {
  // 500 m squares over the strip, 4 at a time, each paged (the server sends up to 2000 a go)
  const SQ = 500, [bx0, bz0, bx1, bz1] = G.box, squares = [];
  for (let x = bx0; x < bx1; x += SQ) for (let z = bz0; z < bz1; z += SQ) if (G.cells.some(c => c[0] >= x && c[0] < x + SQ && c[1] >= z && c[1] < z + SQ)) squares.push([x, z]);
  const seen = new Set(), out = []; let done = 0;
  const queue = squares.slice();
  const worker = async () => {
    while (queue.length) {
      const [x, z] = queue.shift(), [n, w] = toLatLon(geo, x, z), [s, e] = toLatLon(geo, x + SQ, z + SQ);
      for (let off = 0; ; off += 2000) {
        const q = `geometry=${w},${s},${e},${n}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,OCC_CLS,PRIM_OCC,HEIGHT&outSR=4326&geometryPrecision=7&resultOffset=${off}&resultRecordCount=2000&f=json`;
        const j = await fetchJSON(`${FEMA}?${q}`, signal);
        if (j.error) throw new Error('building server: ' + (j.error.message || 'error'));
        for (const f of j.features || []) {
          const a = f.attributes, id = a.OBJECTID; if (seen.has(id) || !f.geometry || !f.geometry.rings) continue; seen.add(id);
          let p = f.geometry.rings[0].map(([lo, la]) => { const [px, pz] = toLocal(geo, la, lo); return [r1(px), r1(pz)]; });
          if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
          p = p.filter((q2, i) => { const o = p[(i + p.length - 1) % p.length]; return Math.hypot(q2[0] - o[0], q2[1] - o[1]) > 0.3; });
          if (p.length < 3 || Math.abs(polyArea(p)) < 12) continue;
          let cx = 0, cz = 0; for (const q2 of p) { cx += q2[0]; cz += q2[1]; } cx /= p.length; cz /= p.length;
          if (!G.has(cx, cz)) continue;
          const b = { p, k: USE[a.OCC_CLS] ?? '', use: a.PRIM_OCC || '' };
          if (a.HEIGHT > 0) b.h = r1(a.HEIGHT);
          out.push(b);
        }
        if (!j.exceededTransferLimit) break;
      }
      onStatus(`Downloading buildings… ${++done}/${squares.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

// ---------------- trees (and roof heights): the 3DEP point clouds ----------------
let indexP = null; // (the surveys' outlines: 2.5 MB, once per session)
const loadIndex = (signal) => indexP || (indexP = fetchJSON(INDEX, signal).catch(e => { indexP = null; throw e; }));
function inRing(lo, la, r) { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [x1, y1] = r[i], [x2, y2] = r[k]; if ((y1 > la) !== (y2 > la) && lo < (x2 - x1) * (la - y1) / (y2 - y1) + x1) c = !c; } return c; }
// the survey covering most of the track, newest first among equals
async function pickSurvey(geo, T, signal) {
  const idx = await loadIndex(signal), pts = [];
  for (let i = 0; i < T.N; i += Math.max(1, Math.round(200 / T.ds))) pts.push(toLatLon(geo, T.X[i], T.Z[i]));
  let best = null;
  for (const f of idx.features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let n = 0; for (const [la, lo] of pts) if (polys.some(p => inRing(lo, la, p[0]))) n++;
    if (!n) continue;
    const year = +((f.properties.name.match(/(19|20)\d\d/) || [0])[0]);
    if (!best || n > best.n || (n === best.n && year > best.year)) best = { name: f.properties.name, n, year };
  }
  return best && { ...best, cover: best.n / pts.length };
}
let lazP = null;
async function lazPerf() {
  if (lazP) return lazP;
  if (typeof document === 'undefined') { // (node: the dev checks)
    const { createRequire } = await import('node:module'), fs = await import('node:fs');
    const req = createRequire(import.meta.url); globalThis.window ??= globalThis;
    const f = req('../vendor/laz-perf/laz-perf.js'), bin = fs.readFileSync(new URL('../vendor/laz-perf/laz-perf.wasm', import.meta.url));
    return (lazP = f({ wasmBinary: bin }));
  }
  lazP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/laz-perf/laz-perf.js'; s.onload = res; s.onerror = () => rej(new Error('could not load the LiDAR decoder')); document.head.appendChild(s); })
    .then(() => window.createLazPerf({ locateFile: (p) => 'vendor/laz-perf/' + p }));
  return lazP;
}
// one EPT chunk (a whole LAZ file) -> each return through fn(x, y, z, cls) in web mercator metres
function eachPoint(L, buf, fn) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true);
  const ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);
  const p = L._malloc(u8.length); L.HEAPU8.set(u8, p);
  const zf = new L.LASZip(); zf.open(p, u8.length);
  const n = zf.getCount(), len = zf.getPointLength(), fmt = zf.getPointFormat() & 0x3f, q = L._malloc(len);
  try {
    for (let i = 0; i < n; i++) {
      zf.getPoint(q); const d = new DataView(L.HEAPU8.buffer, q, len);
      const rb = d.getUint8(14), nret = fmt >= 6 ? rb >> 4 : (rb >> 3) & 7; // (how many returns that pulse had: one off a roof, several through a tree)
      fn(d.getInt32(0, true) * sx + ox, d.getInt32(4, true) * sy + oy, d.getInt32(8, true) * sz + oz, fmt >= 6 ? d.getUint8(16) : d.getUint8(15) & 31, nret);
    }
  } finally { zf.delete(); L._free(p); L._free(q); }
  return n;
}
async function fetchTrees(track, T, G, houses, onStatus, signal) {
  const terr = track.terrain, geo = track.geo;
  onStatus('Finding the laser survey…');
  const sv = await pickSurvey(geo, T, signal);
  if (!sv) return { trees: [], survey: null };
  const base = EPT + sv.name, ept = await fetchJSON(`${base}/ept.json`, signal), [bx0, by0, , bx1] = ept.bounds, side = bx1 - bx0;
  // the strip's cells in mercator, for which chunks it touches
  const mc = G.cells.map(([x, z]) => merc(...toLatLon(geo, x, z))), mh = G.C * 1.3 / 2 + 1;
  const hier = new Map(), loadH = async (k) => { const j = await fetchJSON(`${base}/ept-hierarchy/${k}.json`, signal); for (const [a, v] of Object.entries(j)) hier.set(a, v); };
  await loadH('0-0-0-0');
  const keys = [];
  const walk = async (d, x, y, z, cand) => {
    const k = `${d}-${x}-${y}-${z}`; let n = hier.get(k); if (n === undefined) return;
    if (n === -1) { await loadH(k); n = hier.get(k); }
    const s = side / 2 ** d, ax = bx0 + x * s, ay = by0 + y * s;
    const here = cand.filter(i => mc[i][0] > ax - mh && mc[i][0] < ax + s + mh && mc[i][1] > ay - mh && mc[i][1] < ay + s + mh);
    if (!here.length) return;
    if (n > 0) keys.push(k);
    if (d < DEPTH) for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) await walk(d + 1, x * 2 + a, y * 2 + b, z * 2 + c, here);
  };
  await walk(0, 0, 0, 0, mc.map((_, i) => i));
  // buildings by 8 m cell (which outline a return falls in)
  const HB = 8, hb = new Map(), samples = houses.map(() => []);
  houses.forEach((b, i) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    b._bb = [x0, z0, x1, z1]; for (let cx = Math.floor((x0 - 1.5) / HB); cx <= Math.floor((x1 + 1.5) / HB); cx++) for (let cz = Math.floor((z0 - 1.5) / HB); cz <= Math.floor((z1 + 1.5) / HB); cz++) { const k = cx + ',' + cz; if (!hb.has(k)) hb.set(k, []); hb.get(k).push(i); } });
  // the canopy: the highest crown return in each 2 m cell
  const TC = 2, can = new Map();
  const L = await lazPerf();
  let done = 0, bytes = 0, pts = 0;
  const queue = keys.slice();
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift(), r = await fetch(`${base}/ept-data/${k}.laz`, { signal });
      if (!r.ok) { onStatus(`(a LiDAR chunk wasn't there: ${r.status})`); continue; }
      const buf = await r.arrayBuffer(); bytes += buf.byteLength;
      pts += eachPoint(L, buf, (mx, my, z, cls, nret) => {
        if (cls === 2 || cls === 7 || cls === 18) return; // (ground, noise)
        const [la, lo] = unmerc(mx, my), [x, zz] = toLocal(geo, la, lo);
        if (!G.has(x, zz)) return;
        const hag = z - (rawHeight(terr, x, zz) + terr.lo); if (hag < 1) return;
        let near = false;
        for (const i of hb.get(Math.floor(x / HB) + ',' + Math.floor(zz / HB)) || []) {
          const bb = houses[i]._bb; if (x < bb[0] - 1.5 || x > bb[2] + 1.5 || zz < bb[1] - 1.5 || zz > bb[3] + 1.5) continue;
          // (a roof: single returns only; a crown hanging over it gives several, and its height isn't the roof's)
          if (pointInPoly(x, zz, houses[i].p)) { if (nret <= 1) samples[i].push(hag); return; }
          near = true;
        }
        if (near) return; // (the eaves and gutters just outside an outline: neither roof nor tree)
        const c = Math.floor(x / TC) + ',' + Math.floor(zz / TC);
        if (hag > (can.get(c) || 0)) can.set(c, hag);
      });
      onStatus(`Downloading LiDAR trees… ${++done}/${keys.length} (${(bytes / 1048576).toFixed(0)} MB)`);
      await new Promise(res => setTimeout(res, 0)); // (let the page breathe between chunks)
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  // roof heights: the high end of the returns inside each outline (a roof, not the gutter)
  houses.forEach((b, i) => { delete b._bb; const s = samples[i]; if (b.h || s.length < 4) return; s.sort((a, c) => a - c); const h = s[Math.floor(s.length * 0.8)]; if (h > 2) b.h = r1(Math.min(60, h)); });
  // trees: a crown cell 3 m+ that's the highest within 4.5 m
  const trees = [], RR = Math.ceil(4.5 / TC);
  for (const [k, v] of can) {
    if (v < 3) continue;
    const [i, j] = k.split(',').map(Number); let top = true;
    for (let b = -RR; b <= RR && top; b++) for (let a = -RR; a <= RR; a++) { if ((a || b) && a * a + b * b <= RR * RR && (can.get((i + a) + ',' + (j + b)) || 0) > v) { top = false; break; } }
    const x = r1((i + 0.5) * TC), z = r1((j + 0.5) * TC);
    if (top && G.has(x, z)) trees.push([x, z, r1(Math.min(50, v))]); // (a cell's middle can sit just past the strip's edge)
  }
  return { trees, survey: { name: sv.name, year: sv.year, cover: Math.round(sv.cover * 100) / 100, chunks: keys.length, mb: Math.round(bytes / 1048576), points: pts } };
}

// trees packed for the save: int16 x, z (half metres), uint8 height (0.2 m): 5 bytes a tree, base64
function packTrees(list) {
  const b = new Uint8Array(list.length * 5), dv = new DataView(b.buffer);
  list.forEach(([x, z, h], i) => { dv.setInt16(i * 5, Math.max(-32767, Math.min(32767, Math.round(x * 2))), true); dv.setInt16(i * 5 + 2, Math.max(-32767, Math.min(32767, Math.round(z * 2))), true); dv.setUint8(i * 5 + 4, Math.min(255, Math.round(h * 5))); });
  let s = ''; for (let q = 0; q < b.length; q += 8192) s += String.fromCharCode.apply(null, b.subarray(q, q + 8192));
  return btoa(s);
}
const treeCache = new WeakMap();
export function scanTrees(scan) {
  if (!scan || !scan.trees) return [];
  let t = treeCache.get(scan); if (t) return t;
  const bin = atob(scan.trees), dv = new DataView(Uint8Array.from(bin, c => c.charCodeAt(0)).buffer); t = [];
  for (let i = 0; i + 5 <= bin.length; i += 5) t.push([dv.getInt16(i, true) / 2, dv.getInt16(i + 2, true) / 2, dv.getUint8(i + 4) / 5]);
  treeCache.set(scan, t); return t;
}
export const scanStats = (scan) => scan && { houses: scan.houses.length, trees: Math.floor(atob(scan.trees).length / 5), kb: Math.round(JSON.stringify(scan).length / 1024) };

// opts: { band (m from the track), onStatus(msg), signal }. Needs the track's LiDAR ground (terrain.fine).
export async function fetchScan(track, T, { band = SCAN_BAND, onStatus = () => {}, signal } = {}) {
  if (!track.geo) throw new Error('Set a real location first.');
  if (!track.terrain || !(track.terrain.fine || []).length) throw new Error('Get the LiDAR ground heights first.');
  const line = scanLine(T), G = bandGrid(line, band), t0 = Date.now();
  onStatus('Downloading buildings…');
  const houses = await fetchBuildings(track.geo, G, onStatus, signal);
  const { trees, survey } = await fetchTrees(track, T, G, houses, onStatus, signal);
  return { v: 1, band, line, houses, trees: packTrees(trees), src: { buildings: 'FEMA USA Structures', survey }, date: Date.now(), secs: Math.round((Date.now() - t0) / 1000) };
}
