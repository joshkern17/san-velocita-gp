// Building zones, imported real-world data and footprint utilities.
import { roadLayout } from './roads.js';
import { generateSetting, fitModels, settingOf, paintFlora, natureModel } from './scenery.js';
// Shared by the editor preview and the 3D world so both show exactly the same buildings.

export const STYLE_COLORS = {
  house: '#c9a27a', shop: '#d4b050', apartment: '#a49a8a', office: '#7f97b8', tower: '#5f7aa8', warehouse: '#8f8f86',
};

// branded businesses: placeable as props, and mixed into shop zones. w = frontage, d = depth (metres)
export const BUSINESSES = {
  coffee: { label: 'Coffee Shop',  name: 'BEAN MACHINE', w: 12, d: 11, color: '#8a5a3a' },
  burger: { label: 'Burger Joint', name: 'BURGER DUCK',  w: 15, d: 14, color: '#f4c01a' },
  pizza:  { label: 'Pizza Place',  name: "TONY'S PIZZA", w: 11, d: 12, color: '#c8141c' },
  gas:    { label: 'Gas Station',  name: 'VOLTA FUEL',   w: 24, d: 20, color: '#1d6fd8' },
  mart:   { label: 'Mini Mart',    name: '24/7 QUICK MART', w: 16, d: 13, color: '#2aa0a0' },
  tyres:  { label: 'Tyre Shop',    name: 'RAPID TYRES',  w: 19, d: 15, color: '#e8e8e8' },
};
export const BUSINESS_KEYS = Object.keys(BUSINESSES);

// defaults for each zone type; the editor sliders start from these
export const ZONE_TYPES = {
  houses:     { label: 'Houses',     style: 'house',     roof: 'gable', w: [9, 13],  d: [8, 11],  hMin: 3,  hMax: 6,   gap: 5,  setback: 7,  color: '#e0a060' },
  shops:      { label: 'Shops',      style: 'shop',      roof: 'flat',  w: [10, 16], d: [12, 16], hMin: 4,  hMax: 9,   gap: 0.5, setback: 4, color: '#e8c848', bizMix: 0.35 },
  businesses: { label: 'Businesses', style: 'shop',      roof: 'flat',  w: [11, 16], d: [11, 15], hMin: 4,  hMax: 6,   gap: 4,  setback: 5,  color: '#ff9a3a', bizMix: 1 },
  apartments: { label: 'Apartments', style: 'apartment', roof: 'flat',  w: [18, 28], d: [14, 18], hMin: 12, hMax: 27,  gap: 5,  setback: 6,  color: '#c8b8a0' },
  offices:    { label: 'Offices',    style: 'office',    roof: 'flat',  w: [22, 32], d: [20, 28], hMin: 24, hMax: 60,  gap: 7,  setback: 8,  color: '#8fb0d8' },
  towers:     { label: 'Skyscrapers', style: 'tower',    roof: 'flat',  w: [24, 32], d: [24, 32], hMin: 70, hMax: 180, gap: 14, setback: 10, color: '#6a8ad0' },
  warehouses: { label: 'Warehouses', style: 'warehouse', roof: 'flat',  w: [36, 64], d: [26, 42], hMin: 7,  hMax: 12,  gap: 8,  setback: 8,  color: '#a0a098' },
  trees:      { label: 'Tree Line',  trees: true,        w: [0, 0],   d: [0, 0],   hMin: 0,  hMax: 0,   gap: 10, setback: 5,  color: '#5fa048' },
};

export function newZone(kind, pts) {
  const d = ZONE_TYPES[kind];
  return { kind, pts, side: 'both', hMin: d.hMin, hMax: d.hMax, gap: d.gap, setback: d.setback, size: 1, bizMix: d.bizMix ?? 0, bizTypes: [...BUSINESS_KEYS], seed: Math.floor(Math.random() * 1e9) };
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- polygon helpers ----------
export function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  let t = l > 0 ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
// minimum-area bounding rectangle (tests each edge direction)
export function orientedRect(p) {
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) best = { area, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  const { ux, uz, u0, u1, v0, v1 } = best;
  const pt = (u, v) => [u * ux - v * uz, u * uz + v * ux];
  return { area: best.area, len: u1 - u0, wid: v1 - v0, ux, uz, corners: [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)] };
}

// ---------- zone generation ----------
function resample(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (d) => {
    d = Math.max(0, Math.min(L, d));
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = (d - cum[i - 1]) / seg;
    const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, tx, tz };
  };
  return { L, at };
}

export function generateZone(z) {
  const def = ZONE_TYPES[z.kind];
  const out = { buildings: [], trees: [] };
  if (!def || !z.pts || z.pts.length < 2) return out;
  const rng = mulberry(z.seed || 1);
  const { L, at } = resample(z.pts);
  const sides = z.side === 'left' ? [-1] : z.side === 'right' ? [1] : [-1, 1];
  for (const side of sides) {
    let t = rng() * 3;
    let prev = null;
    while (t < L) {
      if (def.trees) {
        const p = at(t);
        const off = side * (z.setback + (rng() - 0.5) * 2);
        out.trees.push([p.x - p.tz * off, p.z + p.tx * off]);
        t += Math.max(3, z.gap) * (0.75 + rng() * 0.5);
        continue;
      }
      // some lots become a branded business (its own footprint), the rest ordinary buildings
      const pool = (z.bizTypes || BUSINESS_KEYS).filter(k => BUSINESSES[k]);
      const biz = pool.length && (z.bizMix ?? def.bizMix ?? 0) > rng() ? pool[Math.floor(rng() * pool.length)] : null;
      const w = biz ? BUSINESSES[biz].w : lerp(def.w[0], def.w[1], rng()) * z.size, d = biz ? BUSINESSES[biz].d : lerp(def.d[0], def.d[1], rng()) * z.size;
      if (t + w > L + w * 0.3) break;
      const c = at(t + w / 2);
      const rx = -c.tz, rz = c.tx;
      const off = side * (z.setback + d / 2);
      const cx = c.x + rx * off, cz = c.z + rz * off;
      if (!prev || Math.hypot(cx - prev[0], cz - prev[1]) > (w + prev[2]) * 0.45) {
        const hw = w / 2, hd = d / 2;
        const P = (a, b) => [Math.round((cx + c.tx * a + rx * b) * 10) / 10, Math.round((cz + c.tz * a + rz * b) * 10) / 10];
        let h = lerp(Math.min(z.hMin, z.hMax), Math.max(z.hMin, z.hMax), rng() * rng() * 0.6 + rng() * 0.4);
        if (def.style === 'house') h = Math.max(3, Math.round(h / 3) * 3);
        const b = { p: [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)], h, s: def.style, r: def.roof };
        // businesses face the zone line (usually the road)
        if (biz) { b.biz = biz; b.c = [Math.round(cx * 10) / 10, Math.round(cz * 10) / 10]; b.face = Math.atan2(-rx * side, -rz * side); b.h = 6; }
        out.buildings.push(b);
        prev = [cx, cz, w];
      }
      t += w + Math.max(0, z.gap) * (0.6 + rng() * 0.8);
    }
  }
  return out;
}

// ---------- collect every building / tree for a track and drop anything on the circuit ----------
export function collectScenery(track, T, A) {
  const src = [];
  const trees = [];
  const osm = track.osm;
  // buildings you moved / rotated / deleted individually: their originals are hidden (by key),
  // edited ones live on in track.buildings as independent "custom" buildings
  const hidden = new Set(track.hidden || []);
  if (osm) {
    (osm.buildings || []).forEach((b, i) => { const key = 'o' + i; if (!hidden.has(key)) src.push({ ...b, from: 'osm', key }); });
    for (const t of osm.trees || []) trees.push(t);
  }
  (track.zones || []).forEach((z, zi) => {
    const g = generateZone(z);
    g.buildings.forEach((b, k) => { const key = 'z' + z.seed + '_' + k; if (!hidden.has(key)) src.push({ ...b, from: 'zone', zi, key }); });
    for (const t of g.trees) trees.push(t);
  });
  (track.buildings || []).forEach((b, ci) => src.push({ ...b, p: b.p.map(q => q.slice()), from: 'custom', ci }));
  const roads = A.roadL || ((track.roads || []).length ? roadLayout(track, T, A) : null);
  const onRoad = (b) => roads && (b.p.some(q => roads.onRoad(q[0], q[1])) || roads.onRoad(...centroid(b.p)));
  const keep = [], rejected = [];
  for (const b of src) (buildingClear(b.p, T, A) && !onRoad(b) ? keep : rejected).push(b);
  // buildings you draw with zones replace any imported ones they overlap
  const zoneB = keep.filter(b => b.from === 'zone');
  if (zoneB.length && keep.length > zoneB.length) {
    const zg = buildingGrid(zoneB);
    for (let i = keep.length - 1; i >= 0; i--) {
      const b = keep[i]; if (b.from !== 'osm') continue;
      const [cx, cz] = centroid(b.p);
      if (zg.hits(cx, cz, 1) || b.p.some(q => zg.hits(q[0], q[1], 0))) keep.splice(i, 1);
    }
  }
  // PS1-style models onto the zone / imported buildings, then the chosen setting (town, city, forest...) around it all
  fitModels(keep, track, T, A, roads);
  const gen = generateSetting(track, T, A, roads, keep);
  const seed = settingOf(track.env).seed;
  gen.buildings.forEach((b, k) => { const key = 'g' + seed + '_' + k; if (!hidden.has(key)) keep.push({ ...b, from: 'gen', key }); });
  const grid = buildingGrid(keep);
  const treeKeep = trees.filter(t => pointClear(t[0], t[1], 2.5, T, A) && !grid.hits(t[0], t[1], 2) && !(roads && roads.onRoad(t[0], t[1])))
    .map(t => { // zone tree lines / map trees: a model from the track's tree mix (the same one every time for that spot)
      if (t[2]) return t;
      const m = natureModel('tree', mulberry(Math.floor(t[0] * 73.13) ^ Math.floor(t[1] * 91.7)), track.env, true);
      return m ? [t[0], t[1], m.id, m.s] : t;
    });
  for (const t of gen.trees) if (!grid.hits(t[0], t[1], 1)) treeKeep.push(t);
  // the PAINT tool's Nature brush
  const fl = paintFlora(track, T, A, roads);
  for (const t of fl.trees) if (!grid.hits(t[0], t[1], 1)) treeKeep.push(t);
  const props = fl.props.length ? [...gen.props, ...fl.props.filter(q => !grid.hits(q.x, q.z, 0))] : gen.props;
  return { buildings: keep, rejected, trees: treeKeep, props, paving: gen.paving || [], life: { glows: gen.glows || [], spots: gen.spots || [], vents: gen.vents || [] }, grid };
}

// spatial lookup so auto-scenery and trees don't spawn inside real buildings
export function buildingGrid(list, cell = 20) {
  const map = new Map();
  list.forEach((b, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of b.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    b._bb = [x0, z0, x1, z1];
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
      const k = cx + ',' + cz; let a = map.get(k); if (!a) map.set(k, a = []); a.push(i);
    }
  });
  return {
    hits(x, z, r) {
      for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) for (let cz = Math.floor((z - r) / cell); cz <= Math.floor((z + r) / cell); cz++) {
        const a = map.get(cx + ',' + cz); if (!a) continue;
        for (const i of a) { const bb = list[i]._bb; if (x > bb[0] - r && x < bb[2] + r && z > bb[1] - r && z < bb[3] + r) return true; }
      }
      return false;
    },
  };
}

// how far from sample j's centre line things must stay, on the side of the track the point (x, z) is on
// (the pit side's barrier sits far out beyond the pit lane: that mustn't push the other side back too)
const clearOf = (A, T, j, x, z) => {
  if (A.BRIDGE[j]) return T.W[j] / 2 + 2;
  if (x === undefined) return Math.max(A.BL[j], A.BR[j]) + 2;
  const lat = (x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j];
  return (lat < 0 ? A.BL[j] : A.BR[j]) + 2;
};

export function pointClear(x, z, r, T, A) {
  let ok = true;
  A.hash.query(x, z, r + 45, (j) => {
    if (ok && Math.hypot(x - T.X[j], z - T.Z[j]) < clearOf(A, T, j, x, z) + r) ok = false;
  });
  return ok;
}

export function buildingClear(p, T, A) {
  const [cx, cz] = centroid(p);
  let rad = 0; for (const q of p) rad = Math.max(rad, Math.hypot(q[0] - cx, q[1] - cz));
  let ok = true;
  A.hash.query(cx, cz, rad + 45, (j) => {
    if (!ok) return;
    const x = T.X[j], z = T.Z[j], need = clearOf(A, T, j, cx, cz);
    if (Math.hypot(x - cx, z - cz) > rad + need) return;
    if (pointInPoly(x, z, p)) { ok = false; return; }
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (segDist(x, z, a[0], a[1], b[0], b[1]) < need) { ok = false; return; }
    }
  });
  return ok;
}
