// Runs in a browser page (bake.html) so it can use the game's own track / terrain / OSM code.
// Input: a routed centreline (lat/lon + the OSM way each point lies on) and the raw OSM data around it.
// Output: a ready-to-race track object (nodes, real elevation, bridges, imported scenery, corner names).
import { sampleTrack, defaultEnv, THEMES } from '../../js/track.js';
import { fetchElevation, packTerrain, projectOntoTrack } from '../../js/terrain.js';
import { parseOSM, toLocal } from '../../js/geo.js';
import { orientedRect, polyArea } from '../../js/zones.js';

const BRIDGE_CLEAR = 8.5;   // deck over the road below (m)
const RAMP_GRADE = 0.07;    // how steeply a lifted bridge ramps back to the ground

export async function bake(inp, log = () => {}) {
  const geo = inp.geo;
  const open = !!inp.open;
  // ---- dense centreline (2 m), lightly smoothed (OSM is a polyline with corners at every node) ----
  const src = inp.line.map(p => { const [x, z] = toLocal(geo, p.lat, p.lon); return { x, z, f: p.f || {} }; });
  const D = densify(src, open, 2);
  smooth(D, open, 3);
  log(`centreline ${D.length * 2} m`);

  // ---- nodes: as few as fit the real line to ~1 m ----
  const width = (f) => f.w || (inp.widths && f.n && inp.widths[f.n]) || inp.width || 13;
  let idx = rdp(D, open, 0.7);
  idx = spacing(D, idx, open, 7, 55);
  const make = () => ({ version: 1, name: inp.name, open, start: 0, points: idx.map(i => ({ x: r1(D[i].x), z: r1(D[i].z), w: width(D[i].f), e: 0, b: 0 })), props: [], env: env(inp) });
  let track = make(), err = 0;
  for (let pass = 0; pass < 8; pass++) {
    const T = sampleTrack(track), H = hashT(T);
    const add = []; err = 0;
    const segs = open ? idx.length - 1 : idx.length;
    for (let k = 0; k < segs; k++) {
      const a = idx[k], b = k + 1 < idx.length ? idx[k + 1] : idx[0] + D.length;
      let worst = 0, wi = -1;
      for (let q = a + 1; q < b; q++) { const d = nearT(T, H, D[q % D.length]); if (d > worst) { worst = d; wi = q % D.length; } }
      err = Math.max(err, worst);
      if (worst > 1.0) add.push(wi);
    }
    if (!add.length) break;
    idx = [...new Set([...idx, ...add])].sort((u, v) => u - v);
    track = make();
  }
  log(`${idx.length} nodes, worst fit ${err.toFixed(2)} m`);

  // ---- real elevation ----
  let T = sampleTrack(track);
  const ext = extents(T);
  const m = 1650, box = [ext[0] - m, ext[1] - m, ext[2] + m, ext[3] + m];
  const step = Math.max(16, Math.ceil(Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / 30000)));
  const g = await fetchElevation(geo, box, step, (s) => log(s));
  // The elevation data is a surface model: it measures roofs and treetops, not the ground. A road between buildings
  // or past a belt of trees reads metres too high (Monaco's start straight 'climbed', Spa's last chicane 'dipped').
  // A morphological opening (min filter, then max filter) removes bumps narrower than ~2r cells and leaves real
  // slopes and valleys (Eau Rouge, the Corkscrew) as they are.
  const r = Math.max(1, Math.round((inp.groundR || 30) / g.step));
  g.h = opening(g.h, g.nx, g.nz, r);
  log(`ground: removed buildings / trees narrower than ~${2 * r * g.step} m from the elevation data`);
  if (inp.profile) {
    // the road from the laser-scanned ground model (build.mjs roadProfile), and the land beside it pulled into line
    const P = inp.profile.map(([lat, lon, h, b]) => { const [x, z] = toLocal(geo, lat, lon); return { x, z, h, b: b ?? 0 }; });
    // (a reference model's road heights with no laser scan to set them: lifted to sea level by how far the elevation
    // tiles sit above them along the road, the median; the shift goes back to the importer to place the model by)
    if (inp.profileRel) {
      const a0 = matchProfile(T, P), d = [];
      for (let i = 0; i < T.N; i += 4) d.push(gridAt(g, T.X[i], T.Z[i]) - a0[i]);
      d.sort((u, v) => u - v); const shift = d[d.length >> 1];
      for (const p of P) p.h += shift;
      track._profileShift = shift; log(`ground: reference road heights lifted ${shift.toFixed(1)} m to the elevation tiles`);
    }
    const F = sampleFlags(T, D), asl = matchProfile(T, P);
    const fixed = fitGround(g, T, asl, F);
    log(`ground: road from the ${inp.dem || 'LiDAR'} model; land within 90 m moved by up to ${fixed.toFixed(1)} m to meet it`);
    track.terrain = packTerrain(g);
    if (inp.exag) track.terrain.exag = inp.exag;
    projectProfile(track, P, inp.profile.some(r => r.length > 3));
  } else {
    track.terrain = packTerrain(g);
    if (inp.exag) track.terrain.exag = inp.exag;
    projectOntoTrack(track, sampleTrack);
  }
  // coastal circuits: everything on the sea side of the coastline goes below sea level (the elevation data
  // often has harbours and quays at a few metres; the sea plane is drawn at sea level). Only after the road
  // heights are set, so the quayside road isn't dragged down towards the water.
  if (inp.sea) {
    const coast = (inp.osm || []).filter(el => el.type === 'way' && el.tags && el.tags.natural === 'coastline' && el.geometry)
      .map(el => el.geometry.map(q => toLocal(geo, q.lat, q.lon)));
    const n = carveSea(g, coast), old = track.terrain;
    const t2 = packTerrain(g); // (a new lowest point: keep the road's reference height where it was)
    track.terrain = { ...t2, exag: old.exag, ground: old.ground, base: old.base + (old.lo - t2.lo) };
    log(`sea: ${coast.length} coastline pieces, ${n} ground points under water`);
  }
  if (inp.elevSmooth) smoothNodeHeights(track, inp.elevSmooth);

  // ---- bridges: the upper road (higher OSM layer / bridge=yes) lifted clear of the one below ----
  const lifted = liftBridges(track, D);
  if (lifted) log(`bridge: upper road lifted ${lifted.toFixed(1)} m`);
  smoothAcross(track, log);
  T = sampleTrack(track);

  // ---- corner / section names along the lap (from the OSM way names) ----
  track.real = {
    id: inp.id, country: inp.country, category: inp.category,
    names: sectionNames(T, D, inp.name),
    sea: !!inp.sea,
    tunnels: flagRuns(T, D, 'tun'),
    source: inp.source,
  };

  // ---- scenery: real buildings + trees; grandstands become the game's grandstands ----
  const sx = extents(T), sm = inp.margin || 450;
  const sbox = [sx[0] - sm, sx[1] - sm, sx[2] + sm, sx[3] + sm];
  const elements = inp.osm || [];
  const stands = [], rest = [], water = [], wheels = [];
  const isStand = (t) => t.building === 'grandstand' || t.building === 'stadium' || t.leisure === 'stadium' || (t.building && /grandstand|tribune|tribüne|stand\b|スタンド/i.test(t.name || ''));
  const isWater = (t) => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.leisure === 'marina' || (t.water && t.natural !== 'wetland');
  for (const el of elements) {
    const t = el.tags || {};
    if (t.attraction === 'big_wheel') wheels.push(el);
    else if (isStand(t)) stands.push(el);
    else if (isWater(t) && !t.building) water.push(el);
    else rest.push(el);
  }
  const HT = hashT(T, 40);
  const rank = (x, z) => { const { d } = nearIdx(T, HT, x, z); return d < 0 || !isFinite(d) ? 1e9 : d; };
  track.osm = parseOSM(geo, { elements: rest }, sbox, { rank, maxTrees: inp.maxTrees || 14000, step: 9 });
  track.props = standsToProps(stands, geo, T);
  track.osm.water = waterPolys(water, geo, sbox);
  track.osm.wheels = wheels.map(el => wheelOf(el, geo, T)).filter(Boolean);
  log(`landmarks: ${track.osm.water.length} water areas, ${track.osm.wheels.length} Ferris wheels`);
  if (inp.scatter) { // Nature brush along the lap (trees stop at the barriers)
    const s = inp.scatter, P = track.points;
    track.paint = [{ kind: 'flora', mix: s.mix, r: s.r, d: s.d, seed: 7, pts: [...P, ...(open ? [] : [P[0]])].map(p => [p.x, p.z]) }];
  }
  log(`scenery: ${track.osm.buildings.length} buildings, ${track.osm.trees.length} trees, ${track.props.length} grandstands`);

  track.geo = { lat: geo.lat, lon: geo.lon, label: inp.label || inp.name };
  track.map = { style: 'satellite', opacity: 0.8 };
  track.desc = inp.desc;
  return track;
}

// ---------------- helpers ----------------
const r1 = (v) => Math.round(v * 10) / 10;

function env(inp) {
  const theme = (inp.env && inp.env.theme) || 'grass';
  const e = { ...defaultEnv(theme), ...(inp.env || {}) };
  e.runoff = inp.env && inp.env.runoff != null ? inp.env.runoff : THEMES[theme].runoff;
  e.barrier = inp.env && inp.env.barrier || THEMES[theme].barrier;
  e.autoStands = false; // the real grandstands come from the map
  if (inp.open) e.pits = false;
  return e;
}

function densify(src, open, step) {
  const out = [], n = src.length, segs = open ? n - 1 : n;
  for (let i = 0; i < segs; i++) {
    const a = src[i], b = src[(i + 1) % n], L = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, z: a.z + (b.z - a.z) * j / k, f: b.f });
  }
  if (open) out.push({ ...src[n - 1] });
  return out;
}
function smooth(D, open, r) {
  const n = D.length, xs = D.map(p => p.x), zs = D.map(p => p.z);
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0, c = 0;
    for (let k = -r; k <= r; k++) {
      let j = i + k; if (open) { if (j < 0 || j >= n) continue; } else j = (j + n) % n;
      const w = r + 1 - Math.abs(k); x += xs[j] * w; z += zs[j] * w; c += w;
    }
    if (open && (i === 0 || i === n - 1)) continue;
    D[i].x = x / c; D[i].z = z / c;
  }
}
// Ramer-Douglas-Peucker on indices (a loop is split at the point furthest from the start)
function rdp(D, open, eps) {
  const n = D.length, keep = new Set([0]);
  const run = (a, b) => {
    const A = D[a], B = D[b % n], L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const P = D[i % n]; const d = Math.abs((B.x - A.x) * (A.z - P.z) - (A.x - P.x) * (B.z - A.z)) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep.add(mi % n); run(a, mi); run(mi, b); }
  };
  if (open) { keep.add(n - 1); run(0, n - 1); }
  else { let far = 0, fd = 0; for (let i = 0; i < n; i++) { const d = Math.hypot(D[i].x - D[0].x, D[i].z - D[0].z); if (d > fd) { fd = d; far = i; } } keep.add(far); run(0, far); run(far, n); }
  return [...keep].sort((a, b) => a - b);
}
function spacing(D, idx, open, minD, maxD) {
  const n = D.length, out = [idx[0]];
  const dd = (a, b) => ((b - a + n) % n) * 2; // 2 m per dense step
  for (let k = 1; k < idx.length; k++) {
    const l = out[out.length - 1];
    if (dd(l, idx[k]) < minD && !(open && k === idx.length - 1)) continue;
    out.push(idx[k]);
  }
  const res = [];
  const segs = open ? out.length - 1 : out.length;
  for (let k = 0; k < segs; k++) {
    const a = out[k], b = k + 1 < out.length ? out[k + 1] : out[0] + n;
    res.push(a);
    const L = (b - a) * 2, c = Math.ceil(L / maxD);
    for (let j = 1; j < c; j++) res.push(Math.round(a + (b - a) * j / c) % n);
  }
  if (open) res.push(out[out.length - 1]);
  return [...new Set(res)].sort((a, b) => a - b);
}

function hashT(T, cell = 20) {
  const m = new Map();
  for (let i = 0; i < T.N; i++) { const k = Math.floor(T.X[i] / cell) + ',' + Math.floor(T.Z[i] / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); }
  return { m, cell };
}
function nearIdx(T, H, x, z) {
  const { m, cell } = H; let best = -1, bd = Infinity;
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  for (let r = 1; r <= 3 && best < 0; r++) for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
    const l = m.get(a + ',' + b); if (!l) continue;
    for (const i of l) { const d = (T.X[i] - x) ** 2 + (T.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  }
  return { i: best, d: Math.sqrt(bd) };
}
function nearT(T, H, p) {
  const { i } = nearIdx(T, H, p.x, p.z); if (i < 0) return 99;
  // distance to the polyline through the nearest sample and its neighbours
  let best = Infinity;
  for (const j of [i - 1, i]) {
    const a = (j + T.N) % T.N, b = (j + 1) % T.N, ax = T.X[a], az = T.Z[a], bx = T.X[b] - ax, bz = T.Z[b] - az;
    const L2 = bx * bx + bz * bz || 1, u = Math.max(0, Math.min(1, ((p.x - ax) * bx + (p.z - az) * bz) / L2));
    best = Math.min(best, Math.hypot(p.x - ax - bx * u, p.z - az - bz * u));
  }
  return best;
}
function extents(T) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.min(b, T.Z[i]); c = Math.max(c, T.X[i]); d = Math.max(d, T.Z[i]); }
  return [a, b, c, d];
}

// which dense centreline point (and so which OSM way) each sample lies on
function sampleFlags(T, D) {
  const cell = 20, m = new Map();
  D.forEach((p, i) => { const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); });
  const F = new Array(T.N);
  let last = 0;
  for (let i = 0; i < T.N; i++) {
    // prefer points close along the lap to the last match (so a crossover picks the right road)
    const cx = Math.floor(T.X[i] / cell), cz = Math.floor(T.Z[i] / cell);
    let best = -1, bd = Infinity;
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      const l = m.get(a + ',' + b); if (!l) continue;
      for (const j of l) { const gap = Math.min(Math.abs(j - last), D.length - Math.abs(j - last)); const d = (D[j].x - T.X[i]) ** 2 + (D[j].z - T.Z[i]) ** 2 + (gap > 60 ? 400 : 0); if (d < bd) { bd = d; best = j; } }
    }
    if (best >= 0) last = best;
    F[i] = best >= 0 ? D[best].f : {};
  }
  return F;
}

function sectionNames(T, D, circuit) {
  const F = sampleFlags(T, D), out = [];
  const main = T.open ? T.finish : T.N;
  const generic = (n) => !n || n === circuit || /circuit|raceway|speedway|racing course|ring$|autodromo|course$/i.test(n);
  let cur = null;
  for (let i = 0; i < main; i++) {
    const n = generic(F[i].n) ? null : F[i].n;
    if (cur && cur.name === n) { cur.b = i; continue; }
    if (cur) out.push(cur);
    cur = n ? { name: n, a: i, b: i } : null;
  }
  if (cur) out.push(cur);
  return out.filter(s => (s.b - s.a) * T.ds > 25).map(s => ({ name: s.name, from: Math.round(s.a * T.ds), to: Math.round(s.b * T.ds) }));
}
function flagRuns(T, D, key) {
  const F = sampleFlags(T, D), out = [];
  let a = -1;
  for (let i = 0; i <= T.N; i++) {
    const on = i < T.N && F[i][key];
    if (on && a < 0) a = i;
    if (!on && a >= 0) { if ((i - a) * T.ds > 20) out.push({ from: Math.round(a * T.ds), to: Math.round(i * T.ds) }); a = -1; }
  }
  return out;
}

function smoothNodeHeights(track, passes) {
  const P = track.points, n = P.length;
  for (let p = 0; p < passes; p++) {
    const e = P.map(q => q.e);
    for (let k = 0; k < n; k++) {
      if (track.open && (k === 0 || k === n - 1)) continue;
      P[k].e = r1((e[(k - 1 + n) % n] + 2 * e[k] + e[(k + 1) % n]) / 4);
    }
  }
}

// Where the lap crosses itself, lift the section on the higher OSM layer so it clears the one below.
// Banking and width, smoothed along the lap: measured node by node they jitter (Zandvoort's Hugenholtz went 6° 10° 6°
// and 18 m 14 m 15 m every 8 m), and with the road tilted about its middle that throws the edges up and down by most
// of a metre in a few metres: bumps you feel on the kerbs and see on the edges. A road's camber and width change
// over tens of metres, so each node takes a weighted average of its neighbours (banking ±15 m, width ±25 m).
const SMOOTH_B = 15, SMOOTH_W = 25;
function smoothAcross(track, log) {
  const P = track.points, n = P.length, open = !!track.open;
  if (n < 4) return;
  const s = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) { const a = P[k - 1], b = P[k % n]; s[k] = s[k - 1] + Math.hypot(b.x - a.x, b.z - a.z); }
  const L = s[n];
  const avg = (key, sig) => P.map((p, k) => {
    let sw = 0, sv = 0;
    for (let j = 0; j < n; j++) {
      let d = Math.abs(s[j] - s[k]); if (!open) d = Math.min(d, L - d);
      if (d > sig * 2.5) continue;
      const w = Math.exp(-0.5 * (d / sig) ** 2); sw += w; sv += w * P[j][key];
    }
    return sv / sw;
  });
  const b = avg('b', SMOOTH_B), w = avg('w', SMOOTH_W);
  let db = 0, dw = 0;
  P.forEach((p, k) => { db = Math.max(db, Math.abs(p.b - b[k])); dw = Math.max(dw, Math.abs(p.w - w[k])); p.b = r1(b[k]); p.w = r1(w[k]); });
  log(`road: banking and width smoothed along the lap (changed by up to ${db.toFixed(1)}° and ${dw.toFixed(1)} m)`);
}

function liftBridges(track, D) {
  let T = sampleTrack(track);
  const F = sampleFlags(T, D), N = T.N, H = hashT(T, 25);
  const sep = Math.ceil(80 / T.ds);
  const cross = [];
  for (let i = 0; i < N; i++) {
    const cx = Math.floor(T.X[i] / 25), cz = Math.floor(T.Z[i] / 25);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) for (const j of H.m.get(a + ',' + b) || []) {
      const gap = Math.min(Math.abs(i - j), N - Math.abs(i - j));
      if (gap < sep || Math.hypot(T.X[i] - T.X[j], T.Z[i] - T.Z[j]) > 4) continue;
      const li = F[i].layer || 0, lj = F[j].layer || 0;
      if (li > lj) cross.push({ up: i, down: j });
    }
  }
  if (!cross.length) return 0;
  // one lift per crossing (cluster the matches)
  cross.sort((a, b) => a.up - b.up);
  const groups = [];
  for (const c of cross) { const g = groups[groups.length - 1]; if (g && c.up - g[g.length - 1].up < 30 / T.ds) g.push(c); else groups.push([c]); }
  let maxLift = 0;
  const P = track.points, n = P.length;
  // distance along the lap of each node
  const nodeAt = new Float64Array(n).fill(-1);
  for (let i = 0; i < N; i++) { const k = Math.round(T.NODE[i]) % n; if (nodeAt[k] < 0 || Math.abs(T.NODE[i] - Math.round(T.NODE[i])) < 0.02) nodeAt[k] = i * T.ds; }
  const L = N * T.ds;
  for (const g of groups) {
    const c = g[Math.floor(g.length / 2)];
    const need = BRIDGE_CLEAR - (T.Y[c.up] - T.Y[c.down]);
    if (need <= 0) continue;
    maxLift = Math.max(maxLift, need);
    const s0 = c.up * T.ds, flat = T.W[c.down] / 2 + 14, ramp = need / RAMP_GRADE;
    for (let k = 0; k < n; k++) {
      if (nodeAt[k] < 0) continue;
      let d = Math.abs(nodeAt[k] - s0); if (!T.open) d = Math.min(d, L - d);
      const f = d <= flat ? 1 : d >= flat + ramp ? 0 : 1 - (d - flat) / ramp;
      const s = f * f * (3 - 2 * f);
      if (s > 0) P[k].e = r1(P[k].e + need * s);
    }
  }
  return maxLift;
}

// OSM grandstand footprints -> the game's grandstand props, facing the track
function standsToProps(stands, geo, T) {
  const H = hashT(T), out = [];
  for (const el of stands) {
    if (!el.geometry || el.geometry.length < 4) continue;
    const pts = el.geometry.map(g => toLocal(geo, g.lat, g.lon));
    if (Math.abs(polyArea(pts)) < 120) continue;
    const rect = orientedRect(pts); if (!rect) continue;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const { i, d } = nearIdx(T, H, cx, cz);
    if (i < 0 || d > 220) continue;
    out.push({ type: 'grandstand', x: r1(cx), z: r1(cz), rot: Math.round(Math.atan2(T.X[i] - cx, T.Z[i] - cz) * 1000) / 1000, len: Math.round(Math.max(20, Math.min(220, rect.len))) });
  }
  return out;
}

// water ways + multipolygon relations -> [{ p: outer ring, h: [holes] }] in local metres (big areas clipped to the box)
function waterPolys(els, geo, box) {
  const out = [], L = (g) => g.map(q => { const [x, z] = toLocal(geo, q.lat, q.lon); return [r1(x), r1(z)]; });
  const inBox = (p) => p.some(q => q[0] > box[0] - 2000 && q[0] < box[2] + 2000 && q[1] > box[1] - 2000 && q[1] < box[3] + 2000);
  const thin = (p) => { const o = [p[0]]; for (const q of p) { const l = o[o.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 3) o.push(q); } return o; };
  for (const el of els) {
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
function wheelOf(el, geo, T) {
  let lat, lon, D = parseFloat(el.tags.height) || 0;
  if (el.type === 'node') { lat = el.lat; lon = el.lon; }
  else if (el.geometry) { lat = el.geometry.reduce((s, g) => s + g.lat, 0) / el.geometry.length; lon = el.geometry.reduce((s, g) => s + g.lon, 0) / el.geometry.length; }
  else if (el.bounds) { lat = (el.bounds.minlat + el.bounds.maxlat) / 2; lon = (el.bounds.minlon + el.bounds.maxlon) / 2; }
  else return null;
  const [x, z] = toLocal(geo, lat, lon);
  const { i } = nearIdx(T, hashT(T, 60), x, z);
  // face the track (the wheel's flat side towards the nearest bit of road)
  const rot = i >= 0 ? Math.atan2(T.X[i] - x, T.Z[i] - z) : 0;
  return { x: r1(x), z: r1(z), d: Math.max(30, Math.min(120, D ? D * 0.92 : 50)), rot: Math.round(rot * 1000) / 1000 };
}

// OSM coastlines run with the land on the left and the sea on the right
function carveSea(g, lines) {
  const segs = [], cell = 100, H = new Map();
  for (const L of lines) for (let i = 1; i < L.length; i++) {
    const s = [L[i - 1][0], L[i - 1][1], L[i][0], L[i][1]]; const k = segs.push(s) - 1;
    const x0 = Math.floor(Math.min(s[0], s[2]) / cell), x1 = Math.floor(Math.max(s[0], s[2]) / cell), z0 = Math.floor(Math.min(s[1], s[3]) / cell), z1 = Math.floor(Math.max(s[1], s[3]) / cell);
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const key = a + ',' + b; let l = H.get(key); if (!l) H.set(key, l = []); l.push(k); }
  }
  if (!segs.length) return 0;
  let n = 0;
  for (let j = 0; j < g.nz; j++) for (let k = 0; k < g.nx; k++) {
    const px = g.x0 + k * g.step, pz = g.z0 + j * g.step, cx = Math.floor(px / cell), cz = Math.floor(pz / cell);
    let best = -1, bd = Infinity, bu = 0;
    for (let r = 0; r <= 12 && best < 0; r++) for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
      if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) !== r) continue;
      for (const si of H.get(a + ',' + b) || []) {
        const s = segs[si], dx = s[2] - s[0], dz = s[3] - s[1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((px - s[0]) * dx + (pz - s[1]) * dz) / L2));
        const d = Math.hypot(px - s[0] - dx * u, pz - s[1] - dz * u);
        if (d < bd) { bd = d; best = si; bu = u; }
      }
    }
    if (best < 0) continue;
    const s = segs[best];
    // side in (east, north): z is south, so north = -z. Sea (right of travel) <=> cross < 0
    const cross = (s[2] - s[0]) * (-(pz - s[1])) - (-(s[3] - s[1])) * (px - s[0]);
    if (cross < 0 && bd > 1) { const i = j * g.nx + k; g.h[i] = Math.min(g.h[i], -6 - Math.min(20, bd * 0.05)); n++; }
  }
  return n;
}

// min filter then max filter over a (2r+1)^2 window: removes narrow raised things (roofs, canopy), keeps the ground
function opening(h, nx, nz, r) {
  const pass = (src, op) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) { let v = src[j * nx + k]; for (let d = -r; d <= r; d++) { const kk = k + d; if (kk >= 0 && kk < nx) v = op(v, src[j * nx + kk]); } tmp[j * nx + k] = v; }
    for (let j = 0; j < nz; j++) for (let k = 0; k < nx; k++) { let v = tmp[j * nx + k]; for (let d = -r; d <= r; d++) { const jj = j + d; if (jj >= 0 && jj < nz) v = op(v, tmp[jj * nx + k]); } out[j * nx + k] = v; }
    return out;
  };
  return pass(pass(h, Math.min), Math.max);
}

// each track sample -> the height of the matching profile point (walking round the lap, so a crossover picks the
// right road), lightly smoothed
function matchProfile(T, P, key = 'h') {
  const cell = 20, m = new Map();
  P.forEach((p, i) => { const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell); let a = m.get(k); if (!a) m.set(k, a = []); a.push(i); });
  const raw = new Float32Array(T.N);
  let last = -1;
  for (let i = 0; i < T.N; i++) {
    const cx = Math.floor(T.X[i] / cell), cz = Math.floor(T.Z[i] / cell);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 4 && best < 0; r++) for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) for (const j of m.get(a + ',' + b) || []) {
      const gap = last < 0 ? 0 : Math.min(Math.abs(j - last), P.length - Math.abs(j - last));
      const d = (P[j].x - T.X[i]) ** 2 + (P[j].z - T.Z[i]) ** 2 + (gap > 40 ? 900 : 0);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) last = best;
    raw[i] = best >= 0 ? P[best][key] : (i ? raw[i - 1] : P[0][key]);
  }
  // point-to-point: the run-off past the finish stays at the finish's height, the grid lead-in behind the start
  // (stored after the run-off) at the start's; both level across
  if (T.open) for (let i = T.finish + 1; i < T.N; i++) raw[i] = key !== 'h' ? 0 : i <= T.cut ? P[P.length - 1].h : P[0].h;
  const r = Math.max(1, Math.round(6 / T.ds)), out = new Float32Array(T.N);
  for (let i = 0; i < T.N; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { let j = i + k; if (T.open) { if (j < 0 || j >= T.N) continue; } else j = (j + T.N) % T.N; s += raw[j]; c++; } out[i] = s / c; }
  return out;
}

// move the coarse ground grid near the road so it meets the road's true height (not over tunnels or under bridges)
// the elevation grid's height at a spot (bilinear, clamped to the grid)
function gridAt(g, x, z) {
  const fx = Math.max(0, Math.min(g.nx - 1.001, (x - g.x0) / g.step)), fz = Math.max(0, Math.min(g.nz - 1.001, (z - g.z0) / g.step));
  const k = Math.floor(fx), j = Math.floor(fz), u = fx - k, v = fz - j, h = g.h, nx = g.nx;
  return (h[j * nx + k] * (1 - u) + h[j * nx + k + 1] * u) * (1 - v) + (h[(j + 1) * nx + k] * (1 - u) + h[(j + 1) * nx + k + 1] * u) * v;
}
function fitGround(g, T, asl, F) {
  const at = (x, z) => gridAt(g, x, z);
  const delta = new Float32Array(T.N), ok = new Uint8Array(T.N);
  for (let i = 0; i < T.N; i++) { ok[i] = !(F[i].tun || F[i].layer) && !(T.open && i > T.finish); delta[i] = asl[i] - at(T.X[i], T.Z[i]); }
  const R = 90, H = hashT(T, 30), add = new Float32Array(g.h.length);
  let most = 0;
  for (let j = 0; j < g.nz; j++) for (let k = 0; k < g.nx; k++) {
    const x = g.x0 + k * g.step, z = g.z0 + j * g.step, { i, d } = nearIdx(T, H, x, z);
    if (i < 0 || d > R || !ok[i]) continue;
    const edge = T.W[i] / 2 + 12, f = d <= edge ? 1 : 1 - (d - edge) / (R - edge), w = f * f * (3 - 2 * f);
    add[j * g.nx + k] = delta[i] * w;
  }
  for (let q = 0; q < g.h.length; q++) { g.h[q] += add[q]; most = Math.max(most, Math.abs(add[q])); }
  return most;
}

// like terrain.js projectOntoTrack, but the heights come from the road's own profile (and fit tighter: it's real);
// with the measured camber (build.mjs roadCamber) each node's banking too, nodes added where either is off
function projectProfile(track, P, camber = false) {
  const terr = track.terrain;
  for (let pass = 0; pass < 5; pass++) {
    const T = sampleTrack(track), N = T.N, Pn = track.points, n = Pn.length;
    const asl = matchProfile(T, P);
    let lo = Infinity; for (let i = 0; i < N; i++) lo = Math.min(lo, asl[i] - terr.lo);
    terr.base = lo;
    const at = new Int32Array(n).fill(-1);
    for (let i = 0; i < N; i++) { const nd = Math.round(T.NODE[i]) % n; if (at[nd] < 0 || Math.abs(T.NODE[i] - Math.round(T.NODE[i])) < Math.abs(T.NODE[at[nd]] - Math.round(T.NODE[at[nd]]))) at[nd] = i; }
    const bk = camber ? matchProfile(T, P, 'b') : null;
    for (let k = 0; k < n; k++) if (at[k] >= 0) { Pn[k].e = r1((asl[at[k]] - terr.lo - lo) * terr.exag); if (bk) Pn[k].b = r1(bk[at[k]]); }
    if (pass === 4) break;
    const T2 = sampleTrack(track), asl2 = matchProfile(T2, P), bk2 = camber ? matchProfile(T2, P, 'b') : null, ins = [];
    for (let k = 0; k < (T2.open ? n - 1 : n); k++) {
      let worst = 0, wi = -1, len = 0;
      for (let i = 0; i < T2.N; i++) if (Math.floor(T2.NODE[i]) === k && (!T2.open || i < T2.finish)) {
        len += T2.ds;
        // (a degree of camber counts as a quarter metre of height: 2° off is worth a node, 1° of noise isn't)
        const dev = Math.max(Math.abs(T2.Y[i] - (asl2[i] - terr.lo - lo) * terr.exag), bk2 ? Math.abs(T2.B[i] * 180 / Math.PI - bk2[i]) * 0.25 : 0);
        if (dev > worst) { worst = dev; wi = i; }
      }
      if (worst > 0.5 && len > 14 && wi >= 0) ins.push({ k, i: wi, T: T2 });
    }
    if (!ins.length) break;
    ins.sort((a, b) => b.k - a.k);
    for (const { k, i, T: Ts } of ins) {
      const a = Pn[k], b = Pn[(k + 1) % n], f = Ts.NODE[i] - k;
      Pn.splice(k + 1, 0, { x: r1(Ts.X[i]), z: r1(Ts.Z[i]), w: a.w + (b.w - a.w) * f, e: 0, b: a.b + (b.b - a.b) * f });
      if ((track.start || 0) > k) track.start++;
    }
  }
}
