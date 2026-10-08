// Settings: whole environments (small town, big city, industrial estate, forest...) generated around a circuit
// from the PS1-style model library (envlib.js), plus fitting those models onto zone / OpenStreetMap buildings.
//
// A setting lives in track.env.setting = { kind, density, height, green, furniture, litter, streetTrees, life, seed,
// models, streets }. Everything is
// deterministic (seeded), so the editor preview, the race and every online player get exactly the same world.
// Output feeds collectScenery (zones.js): model buildings are ordinary footprints with an `m` (model id), so the
// editor can select, move, rotate and delete them like any other building.
import { envAssets, envAsset, envReady } from './envlib.js';
import { buildingClear, pointClear, orientedRect, centroid, polyArea } from './zones.js';

// weights per class; rows: extra rows of buildings behind the frontage; props: expected count per 100 m of frontage
export const SETTINGS = {
  none: { label: 'Classic', desc: 'The original procedural scenery for the location (plus any zones and imported buildings).' },
  town: {
    label: 'Small Town', theme: 'grass', tags: ['town', 'suburb'],
    desc: 'Main street shops, laundromats and brick blocks along the circuit, houses and trees behind, a church and a water tower.',
    front: { shop: 5, kiosk: 2, midrise: 2, house: 1.5 }, back: { house: 3, shop: 1.5, midrise: 1, kiosk: 1 }, rows: 0, setback: 6, gap: [1, 6], gapM: 2, alleysD: 0.3, fill: 0.85,
    streets: { cross: 'street', par: 'street', spacing: [75, 115], depth: 32 }, streetFront: { house: 4, shop: 2, kiosk: 1, midrise: 1 },
    trees: { broad: 3, thin: 2, pine: 1.5 }, green: 0.55, street: 0.6, pave: 'slabs',
    props: { lamp: 2.6, bin: 2, phone: 0.5, vending: 0.6, mailbox: 0.8, meter: 0.8, bags: 1, van: 0.3 },
    landmarks: ['church', 'in_watertower', 'in_radio'], nLandmarks: 2,
  },
  city: {
    label: 'Big City', theme: 'city', tags: ['city', 'downtown'],
    desc: 'Brick blocks and shopfronts on the circuit, towers behind them and a skyline on the horizon (it lights up at night).',
    front: { midrise: 4, shop: 3, highrise: 1 }, back: { highrise: 3, tower: 2, midrise: 2 }, rows: 1, setback: 5, gap: [0.3, 3], gapM: 0, alleysD: 0.35, fill: 0.95,
    streets: { cross: 'street', par: 'avenue', spacing: [70, 100], depth: 38 }, streetFront: { midrise: 3, highrise: 2, shop: 2, tower: 0.6 },
    trees: { broad: 1, thin: 1 }, green: 0.18, street: 0.5, skyline: 1, pave: 'slabs',
    props: { lamp: 3, bin: 3, phone: 1, vending: 1, meter: 1.5, mailbox: 0.8, bags: 1.5, dumpster: 0.6, barrier: 0.4, van: 0.4, ac: 0.4 },
    landmarks: [], nLandmarks: 0,
  },
  industrial: {
    label: 'Industrial Estate', theme: 'grass', tags: ['industrial', 'docks'],
    desc: 'Warehouses, factories, tanks and chimneys, yards full of containers, pallets and barrels behind chain-link fences.',
    front: { warehouse: 4, industrial: 3, kiosk: 1.2 }, back: { warehouse: 3, industrial: 2 }, rows: 0, setback: 9, gap: [4, 14], gapM: 8, alleysD: 0.1, fill: 0.75,
    streets: { cross: 'street', par: 'street', spacing: [120, 180], depth: 60, walk: 0 }, streetFront: { warehouse: 3, industrial: 2, kiosk: 1 },
    trees: { broad: 1, thin: 0.5 }, green: 0.15, street: 0, pave: 'concrete',
    props: { container: 2, dumpster: 1, crate: 2, barrel: 2, barrier: 1.2, tyre: 0.8, van: 0.5, panel: 0.4, fence: 5 },
    landmarks: ['in_tank_1', 'in_tank_2', 'in_chimney_4', 'in_chimney_5', 'in_silo', 'in_substation', 'in_powerplant', 'pi_silo', 'in_watertower'], nLandmarks: 5,
  },
  docks: {
    label: 'Harbour Docks', theme: 'coast', tags: ['docks', 'industrial'],
    desc: 'Container stacks, gantry cranes and warehouses on the waterfront.',
    front: { warehouse: 3, industrial: 1, kiosk: 1 }, back: { warehouse: 3, industrial: 1 }, rows: 1, setback: 10, gap: [6, 20], gapM: 12, alleysD: 0, fill: 0.6,
    trees: { broad: 0.5 }, green: 0.05, street: 0, pave: 'concrete',
    props: { container: 6, crate: 1.5, barrel: 1.5, barrier: 1, van: 0.4, fence: 3 },
    landmarks: ['in_crane', 'in_crane', 'in_crane', 'in_tank_1', 'in_tank_2'], nLandmarks: 4,
  },
  forest: {
    label: 'Forest', theme: 'grass', tags: ['forest', 'country'],
    desc: 'Deep pine woods right up to the barriers, clearings, the odd cabin and an old church.',
    front: {}, back: {}, rows: 0, fill: 0,
    trees: { pine: 6, broad: 1.5 }, green: 1, forest: true, street: 0,
    props: {}, landmarks: ['church', 'in_radio', 'in_hut_2', 'in_hut_3'], nLandmarks: 3,
  },
  country: {
    label: 'Countryside', theme: 'grass', tags: ['country', 'town'],
    desc: 'Open farmland: barns and sheds, silos and a water tower, hedges, tree lines and a lonely farmhouse.',
    front: { warehouse: 1, kiosk: 1, house: 1 }, back: { warehouse: 1, kiosk: 1 }, rows: 0, setback: 25, gap: [40, 120], gapM: 60, alleysD: 0, fill: 0.35,
    trees: { broad: 3, pine: 1.5, thin: 0.5 }, green: 0.5, hedges: true, street: 0,
    props: { tyre: 0.2, barrel: 0.3, crate: 0.2 }, landmarks: ['in_silo', 'pi_silo', 'in_watertower', 'church', 'in_radio'], nLandmarks: 3,
  },
  japan: {
    label: 'Japanese Streets', theme: 'city', tags: ['japan', 'city'],
    desc: 'Narrow shopfronts crowded with signboards and vending machines, blocks and panel towers behind.',
    front: { facade: 5, shop: 3, midrise: 1 }, back: { midrise: 2, highrise: 2, shop: 1 }, rows: 0, setback: 5, gap: [0, 1.5], gapM: 0, alleysD: 0.45, fill: 1,
    streets: { cross: 'alley', par: 'street', spacing: [55, 85], depth: 26 }, streetFront: { facade: 3, shop: 3, midrise: 2 },
    trees: { broad: 0.5 }, green: 0.1, street: 0.2, pave: 'slabs',
    props: { vending: 4, sign: 5, lamp: 2.5, bin: 1.5, bags: 1, meter: 0.5 },
    landmarks: ['jp_warehouse'], nLandmarks: 1,
  },
};
export const SETTING_KEYS = Object.keys(SETTINGS);
export const defaultSetting = (kind = 'none') => ({ kind, pitBuildings: false, density: 0.7, height: 0.5, green: 0.5, furniture: 0.6, litter: 0.5, streetTrees: 0.5, life: 0.6, seed: 1, models: true, flora: 'auto' });
// (older tracks saved a single 'clutter' slider: it stands in for furniture and litter)
export const settingOf = (env) => { const s = { ...defaultSetting(), ...((env && env.setting) || {}) }; const c = env && env.setting && env.setting.clutter; if (c !== undefined) { if (env.setting.furniture === undefined) s.furniture = c; if (env.setting.litter === undefined) s.litter = c; } return s; };

// ---------------- flora: tree mixes ----------------
// A mix = weights per tree class (trees) and per ground-cover kind (under: grass | flower | bush | rock), all from the
// PS1 model library. A setting grows its woods from one (setting.flora, or the setting's own mix when 'auto'), the
// PAINT tool's Nature brush paints one, and the classic scenery / placed tree props take their models from one too.
// ground: the brush also lays grass under it (desert scrub and rocks don't).
export const FLORA = {
  auto:    { label: 'Setting default', color: '#6fae4a' },
  mixed:   { label: 'Mixed Woods', color: '#5c9a3e', trees: { broad: 3, pine: 2, birch: 1, autumn: 0.35 }, under: { grass: 2, bush: 1, rock: 0.25 }, ground: true },
  pine:    { label: 'Pine Forest', color: '#2f6a3a', trees: { pine: 1 }, under: { grass: 1.2, bush: 0.6, rock: 0.4 }, ground: true },
  blossom: { label: 'Cherry Blossom', color: '#f09ac0', trees: { blossom: 6, broad: 0.4 }, under: { grass: 2, flower: 1.2 }, ground: true },
  autumn:  { label: 'Autumn', color: '#d8872c', trees: { autumn: 6, bare: 0.6, pine: 0.8 }, under: { grass: 1.2, bush: 0.5, rock: 0.3 }, ground: true },
  park:    { label: 'Park', color: '#7cc050', trees: { broad: 3, birch: 1, blossom: 0.8, willow: 0.5 }, under: { grass: 1, flower: 0.6, bush: 1 }, ground: true },
  palms:   { label: 'Palms', color: '#9ccc3a', trees: { palm: 1 }, under: { bush: 0.6, grass: 0.8 }, ground: true },
  desert:  { label: 'Desert Scrub', color: '#c9a060', trees: { desert: 1 }, under: { rock: 2, grass: 0.3 } },
  winter:  { label: 'Winter', color: '#b8c4cc', trees: { bare: 4, pine: 1.2 }, under: { rock: 0.5 } },
  meadow:  { label: 'Meadow', brush: true, color: '#b4dc6a', trees: { broad: 1, blossom: 0.3 }, treeK: 0.12, under: { grass: 4, flower: 2, bush: 0.5 }, underK: 2.2, ground: true },
  rocks:   { label: 'Rocks', brush: true, color: '#9a938a', trees: {}, treeK: 0, under: { rock: 1 }, underK: 0.5 },
};
export const FLORA_KEYS = Object.keys(FLORA);
const THEME_FLORA = { grass: 'mixed', desert: 'desert', city: 'park', coast: 'palms' };
export const floraOf = (env) => { const f = env && env.setting && env.setting.flora; return f && f !== 'auto' && FLORA[f] ? f : null; }; // chosen in the World tab
export const floraFor = (env) => floraOf(env) || THEME_FLORA[env && env.theme] || 'mixed';               // ...or the location's
// scale ranges per kind (the rocks in the pack are small stones: boulders need more)
const FLORA_SCALE = { rock: [1.2, 3.6], grass: [0.8, 1.5], flower: [0.8, 1.3], bush: [0.8, 1.35] };

// model pools per tree class / ground-cover kind
const floraCache = new Map();
export function floraPool(kind) {
  if (!envReady()) return [];
  let l = floraCache.get(kind); if (l) return l;
  if (kind === 'grass') l = envAssets({ cat: 'grass' });
  else if (kind === 'rock') l = envAssets({ cat: 'rock' });
  else if (kind === 'flower') l = envAssets({ cat: 'bush' }).filter(a => a.cls === 'flower' || /flower/.test(a.id));
  else if (kind === 'bush') l = envAssets({ cat: 'bush' }).filter(a => a.cls !== 'flower' && !/flower/.test(a.id));
  else l = envAssets({ cat: 'tree', cls: kind });
  floraCache.set(kind, l);
  return l;
}
const pickAsset = (rng, l) => { let s = 0; for (const a of l) s += a.w ?? 1; let r = rng() * s; for (const a of l) { r -= a.w ?? 1; if (r <= 0) return a; } return l[l.length - 1]; };
// a kind from a weights table, only among kinds that have models
const pickKind = (rng, w) => pickW(rng, Object.entries(w || {}).filter(([k, v]) => v > 0 && floraPool(k).length));

// Tree / nature props (placed with the PROPS tool, or the classic auto scenery) -> a model from the library.
// Placed props are exactly the kind you picked; auto scenery trees follow the track's tree mix.
export const PROP_FLORA = { tree: 'broad', pine: 'pine', palm: 'palm', cactus: 'desert', blossom: 'blossom', autumn: 'autumn', birch: 'birch', willow: 'willow', bare: 'bare', bush: 'bush', flowers: 'flower', rock: 'rock' };
export function natureModel(type, rng, env, auto = false) {
  let kind = PROP_FLORA[type]; if (!kind) return null;
  if (auto && (type === 'tree' || type === 'pine' || type === 'palm' || type === 'cactus')) kind = pickKind(rng, FLORA[floraFor(env)].trees) || kind;
  const l = floraPool(kind); if (!l.length) return null;
  const a = pickAsset(rng, l), [s0, s1] = FLORA_SCALE[kind] || [0.8, 1.2];
  return { id: a.id, s: +(s0 + rng() * (s1 - s0)).toFixed(2) };
}

// ---------------- Nature brush (PAINT tool) ----------------
// stroke: { kind: 'flora', mix, r, d (density 0..1), seed, pts }. Trees and ground cover are scattered inside the
// brush path (seeded, so everyone sees the same), kept off the circuit and roads; a later Erase stroke removes them.
const nearStroke = (st, x, z) => {
  const p = st.pts || [], r = st.r || 8;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[Math.min(p.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < r) return true;
  }
  return false;
};
// The PAINT tool's Erase brush. what: letters for what it removes, g grass paint, n trees & plants, b buildings
// (older strokes have none: grass and plants). Things the world made (a setting's woods, zone tree lines, map
// trees and buildings) go wherever any eraser touches them; Nature strokes painted after an eraser still grow.
export const eraseHits = (st, letter) => (st.what || 'gn').includes(letter);
export function eraser(track, letter) {
  const list = (track.paint || []).filter(st => st.kind === 'erase' && eraseHits(st, letter) && (st.pts || []).length)
    .map(st => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of st.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } const r = st.r || 8; return { st, b: [x0 - r, z0 - r, x1 + r, z1 + r] }; });
  if (!list.length) return null;
  return (x, z) => { for (const e of list) if (x > e.b[0] && x < e.b[2] && z > e.b[1] && z < e.b[3] && nearStroke(e.st, x, z)) return true; return false; };
}
export function erasedAt(track, x, z, letter) { const f = eraser(track, letter); return !!(f && f(x, z)); }
// trees, bushes, grass, flowers, rocks: what the Nature eraser removes
export const isNature = (id) => { const a = envAsset(id); return !!a && (a.cat === 'tree' || a.cat === 'bush' || a.cat === 'grass' || a.cat === 'rock'); };

export function paintFlora(track, T, A, roads) {
  const out = { trees: [], props: [] };
  const strokes = track.paint || [];
  if (!envReady() || !T || !strokes.some(s => s.kind === 'flora')) return out;
  const occ = occupancy(2.4);
  let budget = 14000; // ground cover overall
  strokes.forEach((st, si) => {
    if (st.kind !== 'flora' || !(st.pts || []).length) return;
    const F = FLORA[st.mix] || FLORA.mixed, r = st.r || 12, pts = st.pts, dens = st.d ?? 0.6;
    const rng = mulberry((st.seed || si + 1) * 7331 + 101);
    const erased = (x, z) => { for (let k = si + 1; k < strokes.length; k++) if (strokes[k].kind === 'erase' && eraseHits(strokes[k], 'n') && nearStroke(strokes[k], x, z)) return true; return false; };
    // area: the segments' strips plus the round ends
    const segs = []; let len = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > 0.01) { segs.push([pts[i], pts[i + 1], l]); len += l; } }
    const area = len * 2 * r + Math.PI * r * r;
    const at = () => {
      if (!segs.length || rng() < (Math.PI * r * r) / area) { // the round cap
        const e = rng() < 0.5 || !segs.length ? pts[0] : pts[pts.length - 1], a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
        return [e[0] + Math.cos(a) * d, e[1] + Math.sin(a) * d];
      }
      let u = rng() * len, sg = segs[0]; for (const q of segs) { sg = q; if ((u -= q[2]) <= 0) break; }
      const [a, b, l] = sg, t = rng(), o = (rng() * 2 - 1) * r, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
      return [a[0] + (b[0] - a[0]) * t + nx * o, a[1] + (b[1] - a[1]) * t + nz * o];
    };
    // (off the track / roads: try again nearby; erased: that spot's share is simply gone)
    const ok = (x, z, pad) => pointClear(x, z, pad, T, A) && !(roads && roads.onRoad(x, z, pad));
    const nT = Math.min(1500, Math.round(area * lerp(1 / 900, 1 / 70, dens) * (F.treeK ?? 1)));
    for (let k = 0, tries = 0; k < nT && tries < nT * 3; tries++) {
      const [x, z] = at();
      if (!occ.freePt(x, z) || !ok(x, z, 2)) continue;
      if (erased(x, z)) { k++; continue; }
      const kind = pickKind(rng, F.trees); if (!kind) break;
      out.trees.push([+x.toFixed(2), +z.toFixed(2), pickAsset(rng, floraPool(kind)).id, +(0.8 + rng() * 0.45).toFixed(2)]);
      occ.markPt(x, z); k++;
    }
    const nU = Math.min(budget, Math.round(area * lerp(1 / 260, 1 / 14, dens) * (F.underK ?? 1)));
    for (let k = 0, tries = 0; k < nU && tries < nU * 2; tries++) {
      const [x, z] = at();
      const kind = pickKind(rng, F.under); if (!kind) break;
      if (!ok(x, z, kind === 'rock' ? 1.5 : 0.5)) continue;
      if (erased(x, z)) { k++; continue; }
      const [s0, s1] = FLORA_SCALE[kind] || [0.8, 1.2];
      out.props.push({ id: pickAsset(rng, floraPool(kind)).id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: +(s0 + rng() * (s1 - s0)).toFixed(2) });
      k++; budget--;
    }
  });
  return out;
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
function pickW(rng, entries) { // [[item, weight]]
  let s = 0; for (const e of entries) s += e[1];
  if (s <= 0) return null;
  let r = rng() * s; for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}

// ---------------- occupancy (everything placed so far) ----------------
function occupancy(cell = 3) {
  const map = new Set();
  const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
  // sample a rectangle (centre, axes, half sizes) on a lattice
  const lattice = (r, pad, fn) => {
    const hw = r.hw + pad, hd = r.hd + pad, nu = Math.max(1, Math.ceil(hw * 2 / (cell * 0.7))), nv = Math.max(1, Math.ceil(hd * 2 / (cell * 0.7)));
    for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
      const u = -hw + (2 * hw * a) / nu, v = -hd + (2 * hd * b) / nv;
      if (fn(r.x + r.ux * u - r.ux2 * v, r.z + r.uz * u + r.uz2 * v) === false) return false;
    }
    return true;
  };
  return {
    free: (r, pad = 0.5) => lattice(r, pad, (x, z) => !map.has(key(x, z))),
    mark: (r, pad = 0) => lattice(r, pad, (x, z) => { map.add(key(x, z)); }),
    freePt: (x, z) => !map.has(key(x, z)),
    markPt: (x, z) => map.add(key(x, z)),
  };
}
// a rectangle: centre, local +X axis (ux, uz), half width (along X) / half depth (along Z). Local +Z = front.
const rect = (x, z, ux, uz, hw, hd) => ({ x, z, ux, uz, ux2: uz, uz2: ux, hw, hd });
// corners in the footprint order the world expects: (-x,-z) (+x,-z) (+x,+z) (-x,+z); local +Z = (-uz, ux)
function corners(r) {
  const fx = -r.uz, fz = r.ux; // front direction
  const P = (u, v) => [Math.round((r.x + r.ux * u + fx * v) * 100) / 100, Math.round((r.z + r.uz * u + fz * v) * 100) / 100];
  return [P(-r.hw, -r.hd), P(r.hw, -r.hd), P(r.hw, r.hd), P(-r.hw, r.hd)];
}

// ---------------- class pools ----------------
function pool(cls, tags, extra = {}) {
  let list = envAssets({ cat: extra.cat || 'building', cls, tags });
  if (!list.length) list = envAssets({ cat: extra.cat || 'building', cls });
  return list;
}
function classWeights(base, height) {
  const w = { ...base };
  const tall = lerp(0.25, 2.6, height), low = lerp(1.8, 0.35, height);
  for (const k of Object.keys(w)) { if (k === 'highrise' || k === 'tower') w[k] *= tall; if (k === 'house' || k === 'kiosk') w[k] *= low; }
  return Object.entries(w);
}

// ---------------- the generator ----------------
// Returns { buildings: [footprints with m], trees: [[x, z, id, scale]], props: [{ id, x, z, rot, s }] }
export function generateSetting(track, T, A, roads, taken) {
  const st = settingOf(track.env), S = SETTINGS[st.kind];
  const out = { buildings: [], trees: [], props: [] };
  if (!S || st.kind === 'none' || !envReady() || !T) return out;
  const rng = mulberry((st.seed || 1) * 7919 + 17);
  const occ = occupancy(1.25);
  const N = T.N, tags = S.tags;
  // what's already there (zones, imports, your own buildings) stays: mark it
  for (const b of taken || []) {
    const r = orientedRect(b.p); if (!r) continue;
    const [cx, cz] = centroid(r.corners);
    occ.mark(rect(cx, cz, r.ux, r.uz, r.len / 2, r.wid / 2), 1);
  }
  const pit = A.pit;
  const nearPit = (x, z, m) => {
    if (!pit) return false;
    let hit = false;
    A.hash.query(x, z, 30 + m, (j) => {
      if (hit || pit.REG[j] < 0) return;
      const sl = ((x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j]) * pit.side;
      const back = pit.CEN[j] + pit.width / 2 + (st.pitBuildings ? 17.5 : 12 + 2 * m); // (behind the garages, if wanted)
      if (Math.abs((x - T.X[j]) * T.FX[j] + (z - T.Z[j]) * T.FZ[j]) < T.ds * 2 + m && sl > T.W[j] / 2 - 1 && sl - (st.pitBuildings ? m : 0) < back) hit = true;
    });
    return hit;
  };
  const onRoad = (x, z, pad = 0) => !!(roads && roads.onRoad(x, z, pad));
  // (onRoad has a 1.6 m safety margin built in: buildings may come right up to the back of the sidewalk)
  const rectOnRoad = (r) => corners(r).some(q => onRoad(q[0], q[1], -1.3)) || onRoad(r.x, r.z, -1.3) || (roads && [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([a, b]) => onRoad(r.x + r.ux * r.hw * a * 2 - r.uz * r.hd * b * 2, r.z + r.uz * r.hw * a * 2 + r.ux * r.hd * b * 2, -1.3)));
  const place = (asset, r, extra = {}) => {
    const p = corners(r);
    const probe = extra.tight ? { ...r, hw: Math.max(0.5, r.hw - 1.4), hd: Math.max(0.5, r.hd - 1.4) } : r;
    if (!buildingClear(p, T, A) || rectOnRoad(r) || nearPit(r.x, r.z, Math.max(r.hw, r.hd)) || !occ.free(probe, extra.tight ? 0 : 1)) return false;
    occ.mark(r, extra.tight ? 0 : 1.5);
    if (!asset.id) out.buildings.push({ p, h: asset.h, s: 'house', r: 'gable', ...extra.meta }); // classic procedural house
    else out.buildings.push({ p, h: +(asset.h * (extra.sy || 1)).toFixed(1), s: styleOf(asset), r: 'flat', m: asset.id, ...extra.meta });
    return true;
  };
  const density = st.density, furn = st.furniture, litter = st.litter, green = st.green * (S.green ?? 0.5) * 2;
  // trees: the chosen tree mix, or the setting's own (from models tagged for it)
  const FL = floraOf(track.env) && FLORA[floraOf(track.env)];
  const treePool = (cls) => { if (FL) return floraPool(cls); let l = envAssets({ cat: 'tree', cls, tags }); if (!l.length) l = envAssets({ cat: 'tree', cls }); return l; };
  const streetPool = () => { const l = FL ? Object.keys(FL.trees).filter(k => k !== 'pine' && k !== 'desert').flatMap(k => floraPool(k)) : []; return l.length ? l : envAssets({ cat: 'tree', cls: ['broad', 'thin'], tags }); };
  out.glows = []; out.spots = []; out.vents = [];

  // ---- building rows along a polyline (the circuit or a road) ----
  // line(i) -> { x, z, fx, fz } (forward), off(i, side) -> distance from the line to the first row's front
  // Orderly rows: building fronts sit flush on a line a fixed setback from the road (or barrier), each front
  // a straight chord of that line, so on a straight they form a clean street wall and round a bend they follow it.
  // Spacing between them is exact (0 = terraced, wall to wall); now and then an alley opens up instead.
  const gapM = st.gap ?? S.gapM ?? 3, alleyK = st.alleys ?? S.alleysD ?? 0.2;
  const rows = (len, at, off, sideOf, weights, opts) => {
    for (const side of [-1, 1]) {
      let d = rng() * 4, lastEnd = null;
      while (d < len - 4) {
        const cls = pickW(rng, weights);
        let list = cls ? pool(cls, tags) : [];
        if (!list.length) list = pool(['shop', 'midrise'], tags);
        const asset = list.length ? pickW(rng, list.map(a => [a, a.w ?? 1])) : null;
        if (!asset) { d += 10; continue; }
        const w = asset.w, dp = asset.d;
        // vacant lots (Density)
        if (rng() < (1 - density) * 0.55 + (1 - opts.fill) * 0.3) { d += w + gapM; lastEnd = null; continue; }
        const A0 = at(d), B0 = at(d + w); if (!A0 || !B0) break;
        const P = (c) => { const nx = -c.fz * sideOf(side), nz = c.fx * sideOf(side), o = off(c, side); return [c.x + nx * o, c.z + nz * o, nx, nz]; };
        const pa = P(A0), pb = P(B0);
        let ux = pb[0] - pa[0], uz = pb[1] - pa[1]; const cl = Math.hypot(ux, uz) || 1; ux /= cl; uz /= cl;
        const onx = (pa[2] + pb[2]) / 2, onz = (pa[3] + pb[3]) / 2; // outward (away from the road)
        if (-uz * onx + ux * onz > 0) { ux = -ux; uz = -uz; }     // local +Z (the front) must face the road
        const fx = -uz, fz = ux, mx = (pa[0] + pb[0]) / 2 - fx * dp / 2, mz = (pa[1] + pb[1]) / 2 - fz * dp / 2;
        const r = rect(mx, mz, ux, uz, Math.max(w, cl) / 2, dp / 2);
        if (place(asset, r, { tight: true })) {
          opts.onPlaced && opts.onPlaced(asset, r, A0, side, -fx, -fz, off(A0, side));
          d += w;
          // an alley, or the normal spacing
          if (opts.alleys && rng() < alleyK * 0.5) {
            const aw = 4 + rng() * 1.5, C = at(d + aw / 2);
            if (C) { const pc2 = P(C); alleys.push({ x: pc2[0], z: pc2[1], nx: pc2[2], nz: pc2[3], tx: C.fx * sideOf(side), tz: C.fz * sideOf(side), w: aw, depth: dp }); }
            d += aw;
          } else d += gapM;
        } else d += 2;
      }
    }
  };
  const alleys = [];
  // the circuit as a polyline
  const lapAt = (d) => { const f = ((d / T.ds) % N + N) % N, i = Math.floor(f), j = (i + 1) % N, t = f - i; return { x: lerp(T.X[i], T.X[j], t), z: lerp(T.Z[i], T.Z[j], t), fx: T.FX[i], fz: T.FZ[i], i }; };
  // (with buildings behind the pit lane, the pit side's building line steps back behind the garages)
  const pitBack = (i, sd) => pit && st.pitBuildings && pit.side === sd && pit.REG[i] >= 0 ? pit.CEN[i] + pit.width / 2 + 17 : 0;
  const barS = [A.BL, A.BR].map((arr, si) => { const o = new Float32Array(N), W2 = Math.round(30 / T.ds), sd = si ? 1 : -1; for (let i = 0; i < N; i++) { let m = 0; for (let k = -W2; k <= W2; k++) { const q = (i + k + N) % N; m = Math.max(m, arr[q], pitBack(q, sd)); } o[i] = m; } return o; });
  const barrierOff = (c, side) => Math.max((side < 0 ? barS[0] : barS[1])[c.i], T.W[c.i] / 2 + 3);
  // frontage strips (between barrier and building fronts) for street props / trees
  const strips = [];
  if (S.rows !== undefined && Object.keys(S.front || {}).length) {
    const nRows = (S.rows || 0) + Math.round(st.height * 1.6 * (S.rows ? 1 : 0));
    for (let row = 0; row <= nRows; row++) {
      const weights = classWeights(row === 0 ? S.front : S.back, st.height + row * 0.15);
      const setback = (st.setback ?? S.setback ?? 6) + row * (38 + st.height * 18);
      rows(T.L, lapAt, (c, side) => barrierOff(c, side) + setback, (s) => s, weights, {
        fill: S.fill * (row ? 0.85 : 1), alleys: row === 0,
        onPlaced: row === 0 ? (asset, r, c, side, nx, nz, front) => strips.push({ asset, r, nx, nz, front, bar: barrierOff(c, side), c }) : null,
      });
    }
  }
  // along your roads: buildings face the street
  if (roads && roads.pieces && Object.keys(S.front || {}).length) {
    for (const pc of roads.pieces) {
      const s = pc.s; if (s.length < 3 || s.some(q => q.elev)) continue;
      const cum = [0]; for (let k = 1; k < s.length; k++) cum.push(cum[k - 1] + Math.hypot(s[k].x - s[k - 1].x, s[k].z - s[k - 1].z));
      const at = (d) => { if (d > cum[cum.length - 1]) return null; let k = 1; while (k < s.length - 1 && cum[k] < d) k++; const a = s[k - 1], b = s[k], t = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), fx: a.tx, fz: a.tz }; };
      const half = pc.w / 2 + pc.walk + 0.3 + Math.max(0, (st.setback ?? S.setback ?? 6) - 5) * 0.5;
      rows(cum[cum.length - 1], at, () => half, (sd) => -sd, classWeights(S.streetFront || S.front, st.height), {
        fill: S.fill, alleys: true,
        onPlaced: (asset, r, c, side, nx, nz, front) => strips.push({ asset, r, nx, nz, front, bar: pc.w / 2 + pc.walk * 0.5, c, road: true }),
      });
    }
  }

  // ---- landmarks ----
  const nL = Math.round((S.nLandmarks || 0) * lerp(0.6, 1.3, density));
  const lm = (S.landmarks || []).filter(id => envAsset(id));
  for (let k = 0, tries = 0; k < nL && lm.length && tries < 80; tries++) {
    const a = envAsset(lm[k % lm.length === 0 && k ? Math.floor(rng() * lm.length) : k % lm.length]);
    const i = Math.floor(rng() * N), side = rng() < 0.5 ? -1 : 1, off = barrierOff({ i }, side) + 30 + rng() * 140 + Math.max(a.w, a.d) / 2;
    const x = T.X[i] + T.RX[i] * off * side, z = T.Z[i] + T.RZ[i] * off * side;
    const ang = rng() * Math.PI * 2;
    if (place(a, rect(x, z, Math.cos(ang), Math.sin(ang), a.w / 2, a.d / 2), { meta: { lm: 1 } })) k++;
  }

  // ---- skyline: towers out on the horizon (big city) ----
  if (S.skyline) {
    const towers = envAssets({ cat: 'building', cls: ['tower', 'highrise'], tags: ['city', 'downtown'] });
    const n = Math.round(30 * S.skyline * lerp(0.4, 1.6, st.height));
    let cx = 0, cz = 0; for (let i = 0; i < N; i++) { cx += T.X[i]; cz += T.Z[i]; } cx /= N; cz /= N;
    let R = 0; for (let i = 0; i < N; i++) R = Math.max(R, Math.hypot(T.X[i] - cx, T.Z[i] - cz));
    for (let k = 0, tries = 0; k < n && towers.length && tries < n * 6; tries++) {
      const a = towers[Math.floor(rng() * towers.length)], ang = rng() * Math.PI * 2, rr = R + 160 + rng() * 260;
      const x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr, sy = 1 + rng() * 0.6 * st.height;
      if (place(a, rect(x, z, Math.cos(ang + 1.3), Math.sin(ang + 1.3), a.w / 2, a.d / 2), { sy, meta: { far: 1 } })) { out.buildings[out.buildings.length - 1].h = +(a.h * sy).toFixed(1); k++; }
    }
  }

  // ---- at night: a ring of lit-window towers far out on the horizon ----
  if (S.skyline && track.env.time === 'night') {
    const ns = envAssets({ cat: 'skyline' });
    let cx = 0, cz = 0; for (let i = 0; i < N; i++) { cx += T.X[i]; cz += T.Z[i]; } cx /= N; cz /= N;
    let R = 0; for (let i = 0; i < N; i++) R = Math.max(R, Math.hypot(T.X[i] - cx, T.Z[i] - cz));
    for (let k = 0; k < 70 && ns.length; k++) {
      const a = ns[Math.floor(rng() * ns.length)], ang = (k / 70) * Math.PI * 2 + rng() * 0.08, rr = R + 320 + rng() * 260;
      out.props.push({ id: a.id, x: +(cx + Math.cos(ang) * rr).toFixed(1), z: +(cz + Math.sin(ang) * rr).toFixed(1), rot: +(rng() * 6.28).toFixed(2), s: +(0.8 + rng() * 0.7 * (0.5 + st.height)).toFixed(2) });
    }
  }

  // ---- street props in the frontage strips ----
  const propOf = (cls, cat = 'prop') => { let l = envAssets({ cat, cls, tags }); if (!l.length) l = envAssets({ cat, cls }); return l; };
  const addProp = (id, x, z, rot, s = 1) => { if (!occ.freePt(x, z)) return false; out.props.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), s }); glowFor(id, x, z, rot, s); return true; };
  // how a bit of rubbish comes to rest: cans / cups / bottles mostly on their sides (and free to roll), wrappers
  // and paper bags flat on their faces (blow about), bin bags slumped. Tilts are small for everything else.
  const TAU = Math.PI * 2;
  const junkPose = (id) => {
    const a = envAsset(id); if (!a) return {};
    if (/can_|cup|bottle/.test(id) && !/flat/.test(id)) return rng() < 0.75 ? { tz: Math.PI / 2 + (rng() - 0.5) * 0.12, sp: rng() * TAU, mv: 'roll', round: 1 } : { tx: (rng() - 0.5) * 0.18, tz: (rng() - 0.5) * 0.18 };
    if (/chip_bag|paper_bag/.test(id)) return { tx: Math.PI / 2 + (rng() - 0.5) * 0.3, mv: 'blow' };
    if (a.cls === 'bags') return { tx: (rng() - 0.5) * 0.45, tz: (rng() - 0.5) * 0.45, mv: 'bag' };
    if (a.cls === 'trash') return { tx: (rng() - 0.5) * 0.12, tz: (rng() - 0.5) * 0.12 };
    return {};
  };
  // things that light up at night: vending machines, phone boxes, signboards (some flicker)
  const glowFor = (id, x, z, rot, s = 1) => {
    const a = envAsset(id); if (!a) return;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    if (a.cls === 'vending') out.glows.push({ x: +(x + fx * (a.d / 2 + 0.08)).toFixed(2), z: +(z + fz * (a.d / 2 + 0.08)).toFixed(2), y: 1.1, c: rng() < 0.5 ? [0.75, 0.85, 1] : [1, 0.95, 0.8], r: 0.75, a: 0.55, f: rng() < 0.12 ? 1 : 0 });
    else if (a.cls === 'phone') out.glows.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: 1.9, c: [0.9, 0.95, 1], r: 0.8, a: 0.6, f: rng() < 0.2 ? 1 : 0 });
    else if (a.cat === 'lamp') out.glows.push({ x: +x.toFixed(2), z: +z.toFixed(2), y: +(a.h * s * 0.95).toFixed(2), c: [1, 0.74, 0.42], r: 1.1, f: rng() < 0.04 ? 1 : 0 });
    else if (a.cat === 'sign') out.glows.push({ x: +(x + fx * 0.4).toFixed(2), z: +(z + fz * 0.4).toFixed(2), y: +(a.h * s * 0.6).toFixed(2), c: [[1, 0.3, 0.5], [0.3, 0.9, 1], [1, 0.8, 0.3], [0.5, 1, 0.4]][Math.floor(rng() * 4)], r: 3, f: rng() < 0.3 ? 1 : 0 });
  };
  const P = S.props || {};
  const lamps = propOf('street', 'lamp'), signs = envAssets({ cat: 'sign', tags });
  out.paving = [];
  for (const sp of strips) {
    const { r, nx, nz, front, bar } = sp, gapW = front - bar; // room between the barrier (or kerb) and the building front
    // paved forecourt / pavement from the barrier to the shopfronts (towns and cities)
    if (!sp.road && S.pave && gapW > 1) {
      const u0 = -r.hw - 3, u1 = r.hw + 3, t0 = -0.5, t1 = gapW - 0.3;
      const Q = (u, t) => [+(r.x + r.ux * u - nx * (r.hd + t)).toFixed(2), +(r.z + r.uz * u - nz * (r.hd + t)).toFixed(2)];
      out.paving.push({ p: [Q(u0, t0), Q(u1, t0), Q(u1, t1), Q(u0, t1)], k: S.pave });
    }
    const along = (u, t) => [r.x + r.ux * u - nx * (r.hd + t), r.z + r.uz * u - nz * (r.hd + t)]; // t: distance in front of the building
    const faceTrack = Math.atan2(-nx, -nz); // props face away from the building (towards the track)
    const perLot = r.hw * 2 / 100 * furn * 2, perLotL = r.hw * 2 / 100 * litter * 2;
    const LITTER = { bags: 1, dumpster: 1, crate: 1, barrel: 1, tyre: 1, barrier: 0.5 };
    const chance = (k) => rng() < (P[k] || 0) * (LITTER[k] ? perLotL : perLot);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    if (gapW > 2.2) {
      if (lamps.length && chance('lamp')) { const [x, z] = along((rng() - 0.5) * r.hw * 2, gapW - 1.2); addProp(pick(lamps).id, x, z, faceTrack + Math.PI); }
      for (const [k, cls] of [['bin', 'bin'], ['phone', 'phone'], ['vending', 'vending'], ['meter', 'meter'], ['mailbox', 'mailbox']]) {
        const list = propOf(cls); if (!list.length) continue;
        let n = 0; while (chance(k) && n++ < 3) { const [x, z] = along((rng() - 0.5) * r.hw * 1.8, cls === 'vending' || cls === 'phone' ? 0.8 : 1 + rng() * Math.min(2, gapW - 1.5)); addProp(pick(list).id, x, z, faceTrack + (cls === 'meter' ? Math.PI : 0)); }
      }
      if (signs.length && P.sign) { let n = 0; while (rng() < P.sign * perLot && n++ < 3) { const [x, z] = along((rng() - 0.5) * r.hw * 1.6, 0.4); addProp(pick(signs).id, x, z, faceTrack, 1); } }
      // street trees
      if (S.street && rng() < S.street * st.green * 1.4 && gapW > 3.5) {
        const tl = streetPool(); if (tl.length) { const [x, z] = along((rng() - 0.5) * r.hw * 1.6, gapW - 1.8); if (occ.freePt(x, z)) out.trees.push([+x.toFixed(2), +z.toFixed(2), pick(tl).id, +(0.8 + rng() * 0.3).toFixed(2)]); }
      }
    }
    // beside / behind the building: bags, dumpsters, crates, barrels, containers, vans
    const yard = (u, v) => [r.x + r.ux * u - nx * v, r.z + r.uz * u - nz * v];
    for (const [k, cls, dist] of [['bags', 'bags', 0], ['dumpster', 'dumpster', 0], ['crate', 'crate', 1], ['barrel', 'barrel', 1], ['tyre', 'tyre', 1], ['ac', 'ac', 0], ['panel', 'panel', 0], ['barrier', 'barrier', 2]]) {
      const list = propOf(cls); if (!list.length || !P[k]) continue;
      let n = 0;
      while (chance(k) && n++ < 4) {
        const sideU = (rng() < 0.5 ? -1 : 1) * (r.hw + 1.2 + rng() * 2);
        const [x, z] = dist === 2 ? along((rng() - 0.5) * r.hw * 2, gapW * 0.5) : yard(sideU, (rng() - 0.3) * r.hd * 1.4);
        const id = pick(list).id, rot = (dist === 2 ? faceTrack : Math.atan2(r.ux, r.uz)) + (cls === 'barrel' || cls === 'crate' ? rng() * 6 : Math.round(rng() * 4) * Math.PI / 2);
        if (addProp(id, x, z, rot)) {
          // crates and barrels come in little clusters
          if (cls === 'crate' || cls === 'barrel') for (let q = 0; q < 2 + rng() * 4; q++) addProp(pick(list).id, x + (rng() - 0.5) * 2.4, z + (rng() - 0.5) * 2.4, rng() * 6);
        }
      }
    }
    if (P.container && rng() < P.container * perLot) { // a stack of shipping containers in the yard
      const list = propOf('container');
      if (list.length) {
        const a = list[0], [x, z] = yard((rng() < 0.5 ? -1 : 1) * (r.hw + a.d / 2 + 2), r.hd * (rng() - 0.5)), rot = Math.atan2(r.ux, r.uz) + Math.PI / 2;
        const cr = rect(x, z, Math.cos(-rot), Math.sin(-rot), a.w / 2, a.d / 2);
        if (buildingClear(corners(cr), T, A) && occ.free(cr, 0.5) && !rectOnRoad(cr)) {
          occ.mark(cr, 0.5);
          const h = 1 + Math.floor(rng() * 3);
          for (let q = 0; q < h; q++) out.props.push({ id: a.id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rot + (rng() - 0.5) * 0.06).toFixed(3), s: 1, y: +(q * a.h).toFixed(2) });
        }
      }
    }
    if (P.van && rng() < P.van * perLot) { const vl = envAssets({ cat: 'vehicle' }); if (vl.length) { const [x, z] = yard((rng() < 0.5 ? -1 : 1) * (r.hw + 2.5), r.hd * (rng() - 0.5)); addProp(vl[0].id, x, z, Math.atan2(r.ux, r.uz) + (rng() < 0.5 ? 0 : Math.PI)); } }
    // chain-link fence along the front of industrial lots
    if (P.fence && !sp.road && rng() < 0.7) {
      const fl = envAssets({ cat: 'fence' });
      if (fl.length) {
        const seg = fl[0].w, n = Math.floor(r.hw * 2 / seg);
        for (let q = 0; q < n; q++) { const [x, z] = along(-r.hw + seg * (q + 0.5), Math.min(gapW - 1, 3)); if (!onRoad(x, z, 1)) out.props.push({ id: fl[q % fl.length].id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +Math.atan2(r.ux, r.uz).toFixed(3) + Math.PI / 2, s: 1 }); }
      }
    }
  }

  out.alleys = alleys;
  // ---- alleys between buildings: dumpsters, bin bags, bins, a payphone at the mouth, litter, the odd crate ----
  {
    const dumps = propOf('dumpster'), bins = propOf('bin'), bags = propOf('bags'), phones = propOf('phone'), crates = propOf('crate'), acs = propOf('ac');
    const junkL = propOf('junk'), flatL = envAssets({ cat: 'prop', cls: 'litter' }), pk = (l) => l[Math.floor(rng() * l.length)];
    for (const al of alleys) {
      // alley frame: u across it (along the street), v into it (away from the street)
      const P3 = (u, v) => [al.x + al.tx * u + al.nx * v, al.z + al.tz * u + al.nz * v];
      const depth = Math.max(8, al.depth), hw = al.w / 2 - 0.3;
      const Q = (u, v) => { const [x, z] = P3(u, v); return [+x.toFixed(2), +z.toFixed(2)]; };
      out.paving.push({ p: [Q(-al.w / 2, 0), Q(al.w / 2, 0), Q(al.w / 2, depth), Q(-al.w / 2, depth)], k: 'concrete' });
      const rr = rect(...P3(0, depth / 2), al.tx, al.tz, al.w / 2, depth / 2); occ.mark(rr, 0);
      const wallRot = (sd) => Math.atan2(-al.tx * sd, -al.tz * sd); // facing across the alley from the wall on side sd
      const put = (list, u, v, rot, extra = {}) => { if (!list.length) return null; const id = pk(list).id, [x, z] = P3(u, v); out.props.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), s: 1, ...extra }); glowFor(id, x, z, rot); out.spots.push([+x.toFixed(1), +z.toFixed(1)]); return id; };
      const sd = rng() < 0.5 ? -1 : 1;
      // dumpster against one wall, long side along it
      if (dumps.length && rng() < 0.85) { const a = dumps[0]; put(dumps, sd * (hw - a.w / 2), depth * (0.35 + rng() * 0.3), wallRot(sd) + Math.PI / 2 * (a.d > a.w ? 1 : 0)); }
      // bin bags piled next to it
      for (let k = 0, n = 2 + Math.floor(rng() * 4 * (0.5 + litter)); k < n; k++) { const id = pk(bags).id; put([envAsset(id)], sd * (hw - 0.4 - rng() * 0.6), depth * (0.2 + rng() * 0.2), rng() * 6.28, { lit: 1, ...junkPose(id) }); }
      // bins on the other side
      for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) put(bins, -sd * (hw - 0.35), depth * (0.25 + k * 0.12 + rng() * 0.1), rng() * 6.28);
      // payphone at the mouth
      if (rng() < 0.55) put(phones, -sd * (hw - 0.3), 0.8, wallRot(-sd));
      if (crates.length && rng() < 0.35) for (let k = 0; k < 3; k++) put(crates, -sd * (hw - 0.6 - rng() * 0.5), depth * (0.6 + rng() * 0.3), rng() * 6.28);
      if (acs.length && rng() < 0.5) put(acs, sd * (hw - 0.3), depth * (0.75 + rng() * 0.15), wallRot(sd));
      // litter all over the floor
      for (let k = 0, n = Math.round((3 + rng() * 5) * (0.4 + litter)); k < n; k++) {
        const l = junkL.length && rng() < 0.55 ? junkL : flatL; if (!l.length) continue;
        const id = pk(l).id, [x, z] = P3((rng() - 0.5) * al.w * 0.8, rng() * depth);
        out.props.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: +(0.85 + rng() * 0.3).toFixed(2), lit: 1, ...junkPose(id) });
      }
    }
  }

  // ---- sidewalks along every road: furniture at the kerb and against the walls, litter, street trees ----
  const FURN = S.furniture || { bin: 3, meter: 1.5, phone: 0.8, vending: 1, mailbox: 1, bench: 2, hydrant: 1.5, planter: 1, newsbox: 0.8 };
  const KERB = { bin: 1, meter: 1, hydrant: 1, bench: 1, planter: 1 }; // (the rest stand against the building side)
  const furnPool = Object.entries(FURN).map(([cls, w]) => [cls, w, propOf(cls)]).filter(e => e[2].length);
  const litterFlat = envAssets({ cat: 'prop', cls: 'litter' }), bagsL = propOf('bags'), boxesL = propOf('trash');
  const treeSt = streetPool();
  const pk = (l) => l[Math.floor(rng() * l.length)];
  if (roads && roads.pieces && Object.keys(S.front || {}).length) for (const pc of roads.pieces) {
    const S2 = pc.s, hw = pc.w / 2, wk = pc.walk;
    if (wk < 1.5 || S2.length < 6 || S2.some(q => q.elev)) continue;
    for (const side of [-1, 1]) {
      let nextF = rng() * 12, nextT = rng() * 20, nextS = 0;
      for (let i = 3; i < S2.length - 3; i++) {
        const q = S2[i]; let bad = false;
        for (let k = -2; k <= 2; k++) { const o = S2[i + k]; if (o && (o.j || o.jend || o.span)) bad = true; }
        if (bad || (i - 4) % 13 === 0 || (i - 4) % 13 === 1 || (i - 4) % 13 === 12) continue; // junctions, street lamps
        const nx = -q.tz * side, nz = q.tx * side, P2 = (off) => [q.x + nx * off, q.z + nz * off];
        const toRoad = Math.atan2(-nx, -nz);
        if (q.d >= nextS) { const [x, z] = P2(hw + wk * 0.6); out.spots.push([+x.toFixed(1), +z.toFixed(1)]); nextS = q.d + 8; }
        if (furnPool.length && q.d >= nextF) {
          const cls = pickW(rng, furnPool.map(e => [e[0], e[1]])), e = furnPool.find(f => f[0] === cls), a = pk(e[2]);
          const kerb = KERB[cls], off = kerb ? hw + 0.65 + (cls === 'bench' ? 0.3 : 0) : hw + wk - Math.max(0.45, a.d / 2 + 0.15);
          const [x, z] = P2(off);
          const rot = cls === 'bench' ? toRoad + Math.PI : kerb ? toRoad + (cls === 'meter' ? Math.PI : 0) : toRoad;
          out.props.push({ id: a.id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), s: 1 }); glowFor(a.id, x, z, rot);
          // vending machines like company
          if (cls === 'vending' && rng() < 0.4) { const [x2, z2] = [x + q.tx * (a.w + 0.15), z + q.tz * (a.w + 0.15)]; out.props.push({ id: pk(e[2]).id, x: +x2.toFixed(2), z: +z2.toFixed(2), rot: +rot.toFixed(3), s: 1 }); glowFor(a.id, x2, z2, rot); }
          nextF = q.d + lerp(30, 3.5, furn) * (0.5 + rng() * 1.0);
        }
        if (treeSt.length && wk >= 2.2 && st.streetTrees > 0 && q.d >= nextT) {
          const [x, z] = P2(hw + 1.05);
          out.trees.push([+x.toFixed(2), +z.toFixed(2), pk(treeSt).id, +(0.6 + rng() * 0.25).toFixed(2)]);
          nextT = q.d + lerp(60, 11, st.streetTrees) * (0.8 + rng() * 0.4);
        }
        // litter: in the gutter and on the pavement, bags piled against the walls
        if (litterFlat.length && rng() < litter * 0.3) { const [x, z] = P2(hw - 0.25 + rng() * (wk * 0.8)); const jl = propOf('junk'), jid = pk(jl.length && rng() < 0.5 ? jl : litterFlat).id; out.props.push({ ...junkPose(jid), lit: 1, id: jid, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: +(0.85 + rng() * 0.3).toFixed(2) }); }
        if (bagsL.length && rng() < litter * 0.06) {
          const n = 1 + Math.floor(rng() * 4 * litter);
          for (let b = 0; b < n; b++) { const [x, z] = P2(hw + wk - 0.4 - rng() * 0.5), bid = pk(bagsL).id; out.props.push({ ...junkPose(bid), lit: 1, id: bid, x: +(x + q.tx * (rng() - 0.5) * 1.6).toFixed(2), z: +(z + q.tz * (rng() - 0.5) * 1.6).toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: +(0.9 + rng() * 0.3).toFixed(2) }); }
          if (boxesL.length && rng() < 0.5) { const [x, z] = P2(hw + wk - 0.6); out.props.push({ id: pk(boxesL).id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: 1 }); }
        }
      }
    }
    // steam from vents in the road (towns and cities)
    if (S.pave === 'slabs') for (let i = 6; i < S2.length - 6; i += 7) if (!S2[i].j && rng() < 0.12) out.vents.push([+(S2[i].x + (rng() - 0.5) * hw).toFixed(1), +S2[i].z.toFixed(1)]);
  }
  // ---- litter along the circuit itself: in the gutter at the track edge, against the barriers and on the
  // pavement beyond them (so you actually see it while racing) ----
  if (S.pave && litter > 0) {
    const flat = litterFlat, junk = propOf('junk'), step = 2.5;
    const onPit = (i, side) => pit && pit.REG[i] >= 0 && pit.side === side;
    for (const side of [-1, 1]) for (let d = rng() * step; d < T.L; d += step) {
      const i = Math.floor(d / T.ds) % N; if (onPit(i, side) || A.BRIDGE[i]) continue;
      const half = T.W[i] / 2, bar = side < 0 ? A.BL[i] : A.BR[i], kerb = A.KERB[i] ? 1.3 : 0;
      const at = (off) => [T.X[i] + T.RX[i] * off * side + T.FX[i] * (rng() - 0.5) * 2, T.Z[i] + T.RZ[i] * off * side + T.FZ[i] * (rng() - 0.5) * 2];
      const r = rng(), k = litter;
      let off = -1, list = null, sc = 1;
      if (r < 0.36 * k) { off = half - 0.25 - rng() * 0.7; list = rng() < 0.35 ? junk : flat; sc = 1; }                        // blown into the edge of the track
      else if (r < 0.62 * k && bar - half > 1) { off = bar - 0.35 - rng() * 0.5; list = rng() < 0.4 ? junk : flat; sc = 1; }  // swept up against the barrier
      else if (r < 0.78 * k) { off = bar + 0.6 + rng() * 2.5; list = rng() < 0.45 ? junk : rng() < 0.8 ? flat : bagsL; }     // pavement outside
      if (off < 0 || !list || !list.length) continue;
      const [x, z] = at(off);
      if (onRoad(x, z, -1.2) && off > bar) continue;
      // litter collects in little drifts
      const nC = rng() < 0.45 ? 1 + Math.floor(rng() * 3) : 0, a0 = rng() * TAU;
      for (let c = 0; c <= nC; c++) {
        const ang = a0 + c * 2.1, rr = c ? 0.45 + rng() * 0.5 : 0; // spread round in a ring so they don't overlap
        const cx2 = x + Math.cos(ang) * rr, cz2 = z + Math.sin(ang) * rr, l2 = c ? (rng() < 0.5 ? junk : flat) : list;
        if (!l2.length) continue;
        const id = pk(l2).id;
        out.props.push({ id, x: +cx2.toFixed(2), z: +cz2.toFixed(2), rot: +(rng() * TAU).toFixed(2), s: +(sc * (0.85 + rng() * 0.4)).toFixed(2), lit: 1, ...junkPose(id) });
      }
      if (off > bar) out.spots.push([+x.toFixed(1), +z.toFixed(1)]);
    }
  }
  // frontage strips count as sidewalk for the blowing litter too
  for (const sp of strips) out.spots.push([+(sp.r.x - sp.nx * (sp.r.hd + 1.5)).toFixed(1), +(sp.r.z - sp.nz * (sp.r.hd + 1.5)).toFixed(1)]);

  // ---- vegetation ----
  const treeW = Object.entries((FL ? FL.trees : S.trees) || {}).filter(([k]) => treePool(k).length);
  const bushes = envAssets({ cat: 'bush' });
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let i = 0; i < N; i++) { bx0 = Math.min(bx0, T.X[i]); bx1 = Math.max(bx1, T.X[i]); bz0 = Math.min(bz0, T.Z[i]); bz1 = Math.max(bz1, T.Z[i]); }
  const M = S.forest ? 380 : 320; bx0 -= M; bx1 += M; bz0 -= M; bz1 += M;
  const area = (bx1 - bx0) * (bz1 - bz0);
  const vn = (x, z) => { const s = Math.sin(x * 0.013 + st.seed) * Math.cos(z * 0.011 - st.seed * 0.7) + Math.sin((x + z) * 0.0071 + st.seed * 1.3) * 0.6; return s; };
  const nT = Math.round(area / 1e6 * (S.forest ? 2600 : 700) * green);
  const treeOk = (x, z, r) => occ.freePt(x, z) && pointClear(x, z, r, T, A) && !onRoad(x, z, 1.5) && !nearPit(x, z, 4);
  for (let k = 0, tries = 0; k < nT && treeW.length && tries < nT * 4; tries++) {
    const x = lerp(bx0, bx1, rng()), z = lerp(bz0, bz1, rng());
    // clumps and clearings
    const nv = vn(x, z);
    if (S.forest ? nv < -0.55 : nv < 0.1 && rng() < 0.8) continue;
    if (!treeOk(x, z, 2.5)) continue;
    const list = treePool(pickW(rng, treeW)); if (!list.length) continue;
    const a = list[Math.floor(rng() * list.length)];
    out.trees.push([+x.toFixed(2), +z.toFixed(2), a.id, +(0.75 + rng() * 0.55).toFixed(2)]); occ.markPt(x, z); k++;
  }
  // bushes: around the edges of the woods / along fences and buildings
  // (a tree mix brings its own ground cover: grass tufts, flowers, shrubs, rocks)
  const nB = Math.round(nT * (FL ? (S.forest ? 0.5 : 1) : S.forest ? 0.35 : 0.6));
  for (let k = 0, tries = 0; k < nB && bushes.length && tries < nB * 4; tries++) {
    const x = lerp(bx0, bx1, rng()), z = lerp(bz0, bz1, rng());
    if (vn(x, z) < -0.2 || !treeOk(x, z, 1.5)) continue;
    const kind = FL && pickKind(rng, FL.under), [s0, s1] = FLORA_SCALE[kind] || [0.8, 1.4];
    const id = kind ? pickAsset(rng, floraPool(kind)).id : bushes[Math.floor(rng() * bushes.length)].id;
    out.props.push({ id, x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rng() * 6.28).toFixed(2), s: +(s0 + rng() * (s1 - s0)).toFixed(2) }); k++;
  }
  // hedgerows / tree lines across the fields (countryside)
  if (S.hedges) {
    for (let h = 0; h < 10 * green + 2; h++) {
      let x = lerp(bx0, bx1, rng()), z = lerp(bz0, bz1, rng()); const ang = rng() * Math.PI, len = 60 + rng() * 160;
      for (let s = 0; s < len; s += 4 + rng() * 3) {
        const px = x + Math.cos(ang) * s, pz = z + Math.sin(ang) * s;
        if (!treeOk(px, pz, 2)) continue;
        if (rng() < 0.25) { const tl = treePool('broad'); if (tl.length) out.trees.push([+px.toFixed(2), +pz.toFixed(2), tl[Math.floor(rng() * tl.length)].id, 0.8]); }
        else if (bushes.length) out.props.push({ id: bushes[Math.floor(rng() * bushes.length)].id, x: +px.toFixed(2), z: +pz.toFixed(2), rot: rng() * 6, s: 1.1 });
        occ.markPt(px, pz);
      }
    }
  }
  return out;
}

// ---------------- town streets ----------------
// Off the circuit's straights: side streets every block (they meet the track at closed junctions, like a street
// circuit on race day) and a street running parallel one block back. Buildings then front the circuit and these
// streets. They're ordinary roads (sidewalks, lamps, markings, junctions) generated from the seed, not stored.
export function genStreets(track, T, A) {
  const st = settingOf(track.env), S = SETTINGS[st.kind];
  if (!S || !S.streets || !T || !A || st.streets === false) return [];
  const G = S.streets, rng = mulberry((st.seed || 1) * 97 + 3), N = T.N, ds = T.ds, pit = A.pit;
  const out = [];
  const W = (k) => ({ street: 8, avenue: 13, alley: 5 }[k] || 8), WK = (k) => G.walk ?? ({ street: 2.5, avenue: 3.2, alley: 0 }[k] ?? 2.5);
  const road = (kind, pts) => ({ kind, pts: pts.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]), w: W(kind), walk: WK(kind), lines: kind === 'alley' ? 'none' : kind === 'avenue' ? 'double' : 'dash', meet: 'barrier', gen: true });
  // is a point well clear of every part of the circuit except around sample `home`?
  const clearOf = (x, z, home, m) => {
    let ok = true;
    A.hash.query(x, z, m + 40, (j) => {
      if (!ok) return;
      const dd = Math.abs(j - home), cd = Math.min(dd, N - dd) * ds;
      if (home >= 0 && cd < 60) return;
      if (Math.hypot(x - T.X[j], z - T.Z[j]) < Math.max(A.BL[j], A.BR[j]) + m) ok = false;
    });
    return ok;
  };
  // straights: runs with gentle curvature, at least ~2 blocks long
  const low = new Uint8Array(N); for (let i = 0; i < N; i++) low[i] = Math.abs(T.K[i]) < 1 / 260 ? 1 : 0;
  let start = 0; while (start < N && low[start]) start++;
  if (start >= N) start = 0;
  const runs = [];
  for (let k = 0, i0 = -1; k <= N; k++) {
    const i = (start + k) % N, on = k < N && low[i];
    if (on && i0 < 0) i0 = k; else if (!on && i0 >= 0) { if ((k - i0) * ds > G.spacing[0] * 1.6) runs.push([start + i0, start + k - 1]); i0 = -1; }
  }
  for (const [a0, a1] of runs) for (const side of [-1, 1]) {
    const at = (k) => ((k % N) + N) % N;
    if (pit) { let hit = false; for (let k = a0; k <= a1; k++) if (pit.REG[at(k)] >= 0 && pit.side === side) { hit = true; break; } if (hit) continue; }
    const bar = (i) => Math.max(side < 0 ? A.BL[i] : A.BR[i], T.W[i] / 2 + 3);
    let barMax = 0; for (let k = a0; k <= a1; k++) barMax = Math.max(barMax, bar(at(k)));
    const parOff = barMax + (S.setback || 6) + G.depth + W(G.par) / 2 + WK(G.par) + 1;
    const P = (i, off) => [T.X[i] + T.RX[i] * off * side, T.Z[i] + T.RZ[i] * off * side];
    // parallel street (split where it would run into another part of the circuit)
    let cur = [];
    const flush = () => { if (cur.length >= 3) out.push(road(G.par, cur)); cur = []; };
    const step = Math.max(1, Math.round(12 / ds));
    for (let k = a0 - Math.round(20 / ds); k <= a1 + Math.round(20 / ds); k += step) {
      const i = at(k), q = P(i, parOff);
      if (clearOf(q[0], q[1], i, W(G.par) / 2 + 6)) cur.push(q); else flush();
    }
    flush();
    // cross streets from the circuit out past the parallel street
    let d = G.spacing[0] * (0.4 + rng() * 0.4);
    const len = (a1 - a0) * ds;
    while (d < len - 25) {
      const i = at(a0 + Math.round(d / ds)), pts = [];
      for (let o = bar(i) + 3; o <= parOff + G.depth + 20; o += 8) {
        const q = P(i, o);
        if (!clearOf(q[0], q[1], o < bar(i) + 30 ? i : -1, W(G.cross) / 2 + 4) && o > bar(i) + 30) break;
        pts.push(q);
      }
      if (pts.length >= 4) out.push(road(G.cross, pts));
      d += lerp(G.spacing[0], G.spacing[1], rng());
    }
  }
  return out;
}

export const styleOf = (a) => ({ house: 'house', kiosk: 'shop', shop: 'shop', facade: 'shop', midrise: 'apartment', highrise: 'office', tower: 'tower', industrial: 'warehouse', warehouse: 'warehouse' }[a.cls] || (a.cat === 'landmark' ? 'warehouse' : 'shop'));

// ---------------- models onto zone / imported buildings ----------------
// Picks the model whose footprint best matches each building (stretching at most ~35% either way), turns its
// front towards the nearest road or the circuit, and sizes it to the building's height. Houses always become one
// of the PSX houses (any setting, models on or off); other buildings that don't fit anything (odd shapes) stay as
// the classic extruded blocks unless a setting is on.
// the nearest road / circuit point to (cx, cz), or null
export function frontTarget(cx, cz, roads, T, A) {
  let tx = null, tz = null, bd = Infinity;
  if (roads) for (const pc of roads.pieces) for (const q of pc.s) { const d = (q.x - cx) ** 2 + (q.z - cz) ** 2; if (d < bd) { bd = d; tx = q.x; tz = q.z; } }
  if (T && A && (bd > 60 * 60)) A.hash.query(cx, cz, 200, (j) => { const d = (T.X[j] - cx) ** 2 + (T.Z[j] - cz) ** 2; if (d < bd) { bd = d; tx = T.X[j]; tz = T.Z[j]; } });
  return tx === null ? null : [tx, tz];
}
// the PSX houses (paintable: any wall, roof and colour)
export const houseAssets = () => envAssets({ cat: 'building', cls: 'house' }).filter(a => a.paint);
// A house on a footprint: the PSX house whose shape suits it best, its door towards the street, kept to its
// own proportions (scaled evenly, 80-120%). Sets b.m, b.p, b.h. rng: picks among close fits.
export function fitHouse(b, rng, roads, T, A) {
  const list = houseAssets(); if (!list.length || !b.p || b.p.length < 3) return false;
  const r = orientedRect(b.p); if (!r) return false;
  const [cx, cz] = centroid(r.corners), tgt = frontTarget(cx, cz, roads, T, A);
  // the rectangle side facing the street becomes the front
  const dirs = [[r.ux, r.uz], [-r.uz, r.ux], [-r.ux, -r.uz], [r.uz, -r.ux]];
  let ax = dirs[0], best = -Infinity;
  for (const [ux, uz] of dirs) { const s = tgt ? (tgt[0] - cx) * -uz + (tgt[1] - cz) * ux : rng(); if (s > best) { best = s; ax = [ux, uz]; } }
  const along = Math.abs(ax[0] * r.ux + ax[1] * r.uz) > 0.5, W = along ? r.len : r.wid, D = along ? r.wid : r.len;
  let a = null, bs = Infinity;
  for (const c of list) { const sc = Math.abs(Math.log(W / c.w)) + Math.abs(Math.log(D / c.d)) + rng() * 0.5; if (sc < bs) { bs = sc; a = c; } }
  const s = Math.max(0.8, Math.min(1.2, Math.sqrt((W * D) / (a.w * a.d))));
  b.p = corners(rect(cx, cz, ax[0], ax[1], a.w * s / 2, a.d * s / 2));
  b.m = a.id; b.h = +(a.h * s).toFixed(2); b.s = 'house'; b.r = 'flat';
  return true;
}
// a random building model for the PROPS tool: kind shop | apartment | office | tower | warehouse | house | any
export const BUILDING_KINDS = {
  house:     { label: 'House',      cls: ['house'] },
  shop:      { label: 'Shop',       cls: ['shop', 'kiosk'] },
  apartment: { label: 'Apartments', cls: ['midrise'] },
  office:    { label: 'Office',     cls: ['highrise'] },
  tower:     { label: 'Skyscraper', cls: ['tower'] },
  warehouse: { label: 'Industrial', cls: ['warehouse', 'industrial'] },
  any:       { label: 'Any',        cls: ['shop', 'kiosk', 'midrise', 'highrise', 'warehouse', 'industrial'] },
};
export function randomBuilding(kind, rng = Math.random) {
  if (kind === 'house') { const l = houseAssets(); return l.length ? l[Math.floor(rng() * l.length)] : null; }
  const K = BUILDING_KINDS[kind] || BUILDING_KINDS.any;
  const l = envAssets({ cat: 'building', cls: K.cls });
  return l.length ? pickW(rng, l.map(a => [a, a.w8 ?? 1])) : null;
}
// footprint corners for a model standing at (x, z), turned rot about +Y (front = local +Z), scaled s
export function modelFootprint(a, x, z, rot, s = 1) {
  return corners(rect(x, z, Math.cos(rot), -Math.sin(rot), a.w * s / 2, a.d * s / 2));
}
export function fitModels(buildings, track, T, A, roads) {
  const st = settingOf(track.env);
  if (!envReady()) return;
  const tags = (SETTINGS[st.kind] && SETTINGS[st.kind].tags) || null;
  const rng = mulberry((st.seed || 1) * 131 + 7);
  const all = envAssets({ cat: 'building' });
  const force = st.kind !== 'none'; // a setting is on: no classic blocks at all, everything becomes a model
  for (const b of buildings) {
    if (force && b.biz && b.from !== 'custom') delete b.biz; // (zone businesses too)
    if (b.m || b.biz || !b.p || b.p.length < 3) continue;
    // houses (zone, map and your own): always a PSX house
    if (b.s === 'house' || (b.r === 'gable' && !b.s)) { if (fitHouse(b, rng, roads, T, A)) continue; }
    if (!st.models) continue;
    const r = orientedRect(b.p); if (!r) continue;
    const area = Math.abs(polyArea(b.p));
    if (!force && area / r.area < 0.72) continue; // L-shapes etc.: keep the exact footprint
    const L = Math.max(r.len, r.wid), Wd = Math.min(r.len, r.wid), h = b.h || 8;
    const cls = b.s === 'warehouse' ? ['warehouse', 'industrial'] : b.s === 'office' ? ['highrise', 'midrise'] : b.s === 'tower' ? ['tower', 'highrise'] : b.s === 'apartment' ? ['midrise', 'highrise']
      : b.s === 'shop' ? ['shop', 'kiosk', 'midrise'] : area > 1500 && h < 15 ? ['warehouse', 'industrial'] : h > 60 ? ['tower', 'highrise'] : h > 22 ? ['highrise', 'midrise'] : h > 9 ? ['midrise', 'shop'] : area < 140 ? ['kiosk', 'house', 'shop'] : ['shop', 'kiosk', 'house'];
    const clsL = cls;
    // small, low unlabelled buildings (most OpenStreetMap homes): a house
    if (clsL.includes('house') && area < 260 && h < 10 && fitHouse(b, rng, roads, T, A)) continue;
    let cands = all.filter(a => clsL.includes(a.cls) && a.cls !== 'house' && (!tags || (a.tags || []).some(t => tags.includes(t))));
    if (!cands.length) cands = all.filter(a => clsL.includes(a.cls) && a.cls !== 'house');
    if (force && cands.length < 3) cands = cands.concat(all.filter(a => ['shop', 'kiosk', 'midrise'].includes(a.cls)));
    let best = null, bs = Infinity;
    const lim = force ? [0.4, 2.5] : [0.65, 1.5];
    for (const a of cands) for (const flip of [false, true]) {
      const aw = flip ? a.d : a.w, ad = flip ? a.w : a.d; // model width along the rect's long side?
      const sx = L / Math.max(aw, ad), sz = Wd / Math.min(aw, ad);
      if (sx < lim[0] || sx > lim[1] || sz < lim[0] || sz > lim[1]) continue;
      const sy = h / a.h;
      const score = Math.abs(Math.log(sx)) + Math.abs(Math.log(sz)) + Math.abs(Math.log(Math.max(0.3, sy))) * 0.6 + rng() * 0.25;
      if (score < bs) { bs = score; best = a; }
    }
    if (!best && force) { let bd2 = Infinity; for (const a of all) { if (a.cls === 'house') continue; const d2 = Math.abs(Math.log(L * Wd / (a.w * a.d))) + Math.abs(Math.log(Math.max(0.3, h / a.h))) * 0.5; if (d2 < bd2) { bd2 = d2; best = a; } } }
    if (!best) continue;
    // which way is the front? towards the nearest road, else the circuit
    const [cx, cz] = centroid(r.corners), tgt = frontTarget(cx, cz, roads, T, A);
    const tx = tgt ? tgt[0] : null, tz = tgt ? tgt[1] : null;
    const dirs = [[r.ux, r.uz], [-r.uz, r.ux], [-r.ux, -r.uz], [r.uz, -r.ux]]; // candidate local +X axes
    let ax = dirs[0], bestDot = -Infinity;
    for (const [ux, uz] of dirs) {
      const fx = -uz, fz = ux, dot = tx === null ? 0 : ((tx - cx) * fx + (tz - cz) * fz);
      // the model's own width should run along the long side
      const alongLong = Math.abs(ux * r.ux + uz * r.uz) > 0.5 ? r.len : r.wid, fits = (best.w >= best.d) === (alongLong >= (alongLong === r.len ? r.wid : r.len));
      const s = dot + (fits ? 1e5 : 0);
      if (s > bestDot) { bestDot = s; ax = [ux, uz]; }
    }
    const hw = (Math.abs(ax[0] * r.ux + ax[1] * r.uz) > 0.5 ? r.len : r.wid) / 2, hd = (Math.abs(ax[0] * r.ux + ax[1] * r.uz) > 0.5 ? r.wid : r.len) / 2;
    b.p = corners(rect(cx, cz, ax[0], ax[1], hw, hd));
    b.m = best.id;
    b.h = Math.max(best.h * 0.75, Math.min(best.h * 1.35, h));
  }
}

// where a model building sits: centre, rotation about +Y, scale per axis (from its footprint and height)
export function modelTransform(b) {
  const a = envAsset(b.m); if (!a) return null;
  const [p0, p1, p2] = b.p;
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const ux = (p1[0] - p0[0]) / (w || 1), uz = (p1[1] - p0[1]) / (w || 1);
  let cx = 0, cz = 0; for (const q of b.p) { cx += q[0]; cz += q[1]; } cx /= b.p.length; cz /= b.p.length;
  return { x: cx, z: cz, rot: Math.atan2(-uz, ux), sx: w / a.w, sy: (b.h || a.h) / a.h, sz: d / a.d, a };
}
