// Real water from OpenStreetMap: lakes, ponds, reservoirs, wide rivers and harbours, as flat polygons. Shared by the
// real-circuit builder (tools/tracks/bake.js) and the Circuit Designer's map import (geo.js importOSM), drawn by
// realworld.js addWater, with the ground under it lowered into a lake bed (world.js carveWater).
//
//   WATER_QUERY(bbox)            Overpass clauses for every kind of mapped water area
//   isWater(tags)                is this way / relation water?
//   waterPolys(els, geo, box)    Overpass elements -> [{ p: outer ring, h: [holes] }] in local metres
//   waterLevel(w, height)        the surface: just above the low end of its shoreline (height(x, z): the ground)
//   inWater(water, x, z, pad)    the water area this point is in (pad m in from its shore), else null
import { toLocal } from './geo.js';
import { polyArea, pointInPoly } from './zones.js';

export const WATER_QUERY = (bb) => `way["natural"="water"](${bb});relation["natural"="water"](${bb});way["waterway"="riverbank"](${bb});relation["waterway"="riverbank"](${bb});way["landuse"="reservoir"](${bb});relation["landuse"="reservoir"](${bb});way["leisure"="marina"](${bb});`;
export const isWater = (t) => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.leisure === 'marina' || (t.water && t.natural !== 'wetland');

const r1 = (v) => Math.round(v * 10) / 10;
// water ways + multipolygon relations -> [{ p: outer ring, h: [holes] }] in local metres (anything reaching within
// 2 km of box; a ring a point every 3 m or more; ponds under 150 m² left out)
export function waterPolys(els, geo, box) {
  const out = [], L = (g) => g.map(q => { const [x, z] = toLocal(geo, q.lat, q.lon); return [r1(x), r1(z)]; });
  const inBox = (p) => p.some(q => q[0] > box[0] - 2000 && q[0] < box[2] + 2000 && q[1] > box[1] - 2000 && q[1] < box[3] + 2000);
  const thin = (p) => { const o = [p[0]]; for (const q of p) { const l = o[o.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 3) o.push(q); } return o; };
  for (const el of els) {
    if (!isWater(el.tags || {}) || (el.tags || {}).building) continue;
    if (el.type === 'way' && el.geometry && el.geometry.length > 3) {
      const p = thin(L(el.geometry)); if (p.length > 3 && inBox(p) && Math.abs(polyArea(p)) > 150) out.push({ p });
    } else if (el.type === 'relation' && el.members) {
      const rings = (role) => joinRings(el.members.filter(m => m.type === 'way' && m.role === role && m.geometry).map(m => L(m.geometry)));
      const holes = rings('inner').map(thin);
      for (const p0 of rings('outer')) { const p = thin(p0); if (p.length > 3 && inBox(p) && Math.abs(polyArea(p)) > 150) out.push({ p, h: holes.filter(h => h.length > 3) }); }
    }
  }
  return out;
}
// chain way pieces end to end into closed rings
function joinRings(parts) {
  const rings = [], left = parts.map(p => p.slice());
  const same = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
  while (left.length) {
    let ring = left.shift();
    for (let guard = 0; guard < 500 && !same(ring[0], ring[ring.length - 1]); guard++) {
      const k = left.findIndex(p => same(p[0], ring[ring.length - 1]) || same(p[p.length - 1], ring[ring.length - 1]));
      if (k < 0) break;
      let p = left.splice(k, 1)[0]; if (!same(p[0], ring[ring.length - 1])) p = p.reverse();
      ring = ring.concat(p.slice(1));
    }
    if (ring.length > 3) rings.push(ring.slice(0, -1));
  }
  return rings;
}

// The surface. The elevation data has a lake as flat ground at its surface (Lake of the Pines: 13.9 m everywhere 40 m
// out from the shore, give or take 10 cm), so that's the level: its middle, well clear of the shore (the grid blurs the
// banks into it). A pond too small to have a middle the grid can see: the low fifth of its shoreline (a high bank on
// one side doesn't lift it). The low fifth on a big lake was 1.6 m too high: the edge floated over its low banks.
export function waterLevel(w, height) {
  if (w.y != null) return w.y;
  const b = boxOf(w), area = Math.abs(polyArea(w.p)), sp = Math.max(6, Math.sqrt(area / 500));
  const ins = [];
  for (let x = b[0] + sp / 2; x < b[2]; x += sp) for (let z = b[1] + sp / 2; z < b[3]; z += sp) if (inWater([w], x, z, 30)) ins.push(height(x, z));
  if (ins.length >= 12) { ins.sort((p, q) => p - q); return ins[Math.floor(ins.length * 0.5)] + 0.12; }
  const hs = w.p.map(q => height(q[0], q[1])).sort((a, b) => a - b);
  return hs[Math.floor(hs.length * 0.2)] + 0.12;
}

// bounding boxes, once per list
const boxes = new WeakMap();
function boxOf(w) {
  let b = boxes.get(w);
  if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const q of w.p) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); } boxes.set(w, b); }
  return b;
}
export function inWater(water, x, z, pad = 0) {
  for (const w of water || []) {
    const b = boxOf(w);
    const m = Math.max(0, -pad);
    if (x < b[0] - m || z < b[1] - m || x > b[2] + m || z > b[3] + m) continue;
    const inside = pointInPoly(x, z, w.p) && !(w.h || []).some(h => pointInPoly(x, z, h));
    // (pad > 0: that far in from the shore; < 0: up to that far out past it)
    if (inside ? pad <= 0 || shoreDist(w, x, z) >= pad : pad < 0 && shoreDist(w, x, z) < -pad) return w;
  }
  return null;
}
// how far in from the shore (outer ring or an island's)
export function shoreDist(w, x, z) {
  let d = Infinity;
  for (const ring of [w.p, ...(w.h || [])]) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z));
  }
  return d;
}

// The ground under the water, as a lake bed: every vertex of the terrain grid (H: nx x nz heights from gx0, gz0, step
// apart) inside a lake goes below its surface, a little deeper the further it is from the shore (the elevation data
// has a lake as flat ground at the water's edge, which would show through the water or sit level with it).
// list: [{ w, y }] (waterLevel). keep(id): 0..1, how much of the ground there is the circuit's own (its embankments
// and runoff are left alone: a road along the shore keeps its bank). Returns how many vertices were lowered.
export function carveWater(H, nx, nz, gx0, gz0, step, list, keep = null) {
  if (!list.length) return 0;
  const mask = new Int32Array(nx * nz).fill(-1);
  // which lake each vertex is in: scanlines across every ring (even-odd, so islands stay land)
  list.forEach(({ w }, li) => {
    const rings = [w.p, ...(w.h || [])];
    for (let j = 0; j < nz; j++) {
      const z = gz0 + j * step, xs = [];
      for (const r of rings) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const k0 = Math.max(0, Math.ceil((xs[k] - gx0) / step)), k1 = Math.min(nx - 1, Math.floor((xs[k + 1] - gx0) / step));
        for (let q = k0; q <= k1; q++) mask[j * nx + q] = li;
      }
    }
  });
  // how far in from the shore (m): a two-pass chamfer distance from the nearest dry vertex
  const D = new Float32Array(nx * nz);
  for (let i = 0; i < D.length; i++) D[i] = mask[i] >= 0 ? 1e9 : 0;
  const s2 = step * Math.SQRT2;
  for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) { const i = j * nx + k; if (!D[i]) continue; let d = D[i];
    if (k) d = Math.min(d, D[i - 1] + step); if (j) d = Math.min(d, D[i - nx] + step); if (k && j) d = Math.min(d, D[i - nx - 1] + s2); if (j && k < nx - 1) d = Math.min(d, D[i - nx + 1] + s2); D[i] = d; }
  for (let j = nz - 1; j >= 0; j--) for (let k = nx - 1; k >= 0; k--) { const i = j * nx + k; if (!D[i]) continue; let d = D[i];
    if (k < nx - 1) d = Math.min(d, D[i + 1] + step); if (j < nz - 1) d = Math.min(d, D[i + nx] + step); if (k < nx - 1 && j < nz - 1) d = Math.min(d, D[i + nx + 1] + s2); if (j < nz - 1 && k) d = Math.min(d, D[i + nx - 1] + s2); D[i] = d; }
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < 0) continue;
    // (a vertex's distance counts from the shore the grid can see: up to a cell short of the real one)
    const bed = list[mask[i]].y - 0.6 - Math.min(5, Math.max(0, D[i] - step) * 0.12), f = keep ? 1 - keep(i) : 1;
    if (H[i] > bed && f > 0) { H[i] -= (H[i] - bed) * f; n++; }
  }
  return n;
}

// ---------------- streams, ditches, canals, rivers mapped as lines (streetdata.js: track.osm.street.water) ----------
// A bed cut into the terrain grid along each: flat as wide as the water, banks sloping up over `bank` m, its floor the
// ground along the line smoothed (over ~60 m), less the kind's depth, and never rising in the way it flows (the map
// draws a waterway downstream). keep(i) as carveWater (the circuit's own ground isn't cut: a stream goes under the
// track in a culvert). Returns the profiles, for the water on top (realworld.js addStreams): { k, w, pts, bed: [y] }.
const DEPTH = { river: 2.0, canal: 1.2, stream: 0.9, ditch: 0.5, drain: 0.5 };
export function carveStreams(H, nx, nz, gx0, gz0, step, lines, height, keep = null) {
  const out = [];
  for (const ln of lines || []) {
    // the line every ~4 m
    const P = [];
    for (let i = 1; i < ln.pts.length; i++) {
      const a = ln.pts[i - 1], b = ln.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 4));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    if (P.length < 3) continue;
    const g = P.map(q => height(q[0], q[1])), r = 8, sm = g.map((_, i) => { let s = 0, m = 0; for (let k = -r; k <= r; k++) { const v = g[i + k]; if (v !== undefined) { s += v; m++; } } return s / m; });
    const depth = DEPTH[ln.k] || 0.8, bed = new Float32Array(P.length);
    for (let i = 0; i < P.length; i++) bed[i] = Math.min(i ? bed[i - 1] : Infinity, sm[i] - depth); // (downhill only)
    const half = ln.w / 2, bank = Math.max(4, step * 1.2), reach = half + bank;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const k0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + reach - gx0) / step));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - reach - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((Math.max(a[1], b[1]) + reach - gz0) / step));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const x = gx0 + k * step, z = gz0 + j * step, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        const d = Math.hypot(a[0] + dx * u - x, a[1] + dz * u - z); if (d >= reach) continue;
        const floor = bed[i - 1] + (bed[i] - bed[i - 1]) * u, t = d <= half ? 0 : (d - half) / bank;
        const target = floor + depth * 1.15 * t * t * (3 - 2 * t), id = j * nx + k, f = keep ? 1 - keep(id) : 1;
        if (H[id] > target && f > 0) H[id] -= (H[id] - target) * f;
      }
    }
    out.push({ k: ln.k, w: ln.w, pts: P, bed: Array.from(bed) });
  }
  return out;
}
