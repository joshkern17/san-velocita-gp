// Real-circuit importer.  node tools/tracks/build.mjs [id ...]   (no ids = every circuit in catalog.mjs)
// OSM roads -> the exact layout (routed along the outline / waypoints) -> baked in headless Chrome with the game's
// own track + terrain code -> tracks/real/<id>.json, and the list the game reads: tracks/real/index.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { overpass, buildGraph, route, dist } from './osm.mjs';
import { CATALOG } from './catalog.mjs';
import { groundHeights, DEM_CREDITS } from './dem.mjs';
import { surfaceMap, ORTHO_CREDITS } from './surface.mjs';
import { applyLandmarks, landmarksFile } from './landmarks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'tracks/real');
const TILES = path.join(HERE, 'cache/tiles');
const require = createRequire(path.join(ROOT, 'tools/package.json'));
const { chromium } = require('playwright-core');
const F1 = JSON.parse(fs.readFileSync(path.join(HERE, 'f1-circuits.json'), 'utf8'));

// --ref <file>: (dev, reference only) the road from a reference model instead of OSM + LiDAR (its centre line, widths,
// heights and camber, measured off the model in the track's own frame: .devtest refline), written as <id>_ref.json
// to tools/tracks/cache/ref, never into the game's list
const argv = process.argv.slice(2), refAt = argv.indexOf('--ref'), REF = refAt >= 0 ? JSON.parse(fs.readFileSync(argv[refAt + 1], 'utf8')) : null;
if (refAt >= 0) argv.splice(refAt, 2);
const want = argv;
const list = want.length ? CATALOG.filter(c => want.includes(c.id)) : CATALOG;
if (!list.length) { console.error('no such circuit: ' + want.join(' ')); process.exit(1); }

// ---------- 1. the layout from OSM ----------
function guideOf(c) {
  if (c.guide.f1) {
    const f = F1.features.find(f => f.properties.Name === c.guide.f1);
    if (!f) throw new Error('not in f1-circuits.json: ' + c.guide.f1);
    const co = f.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
    // a waypoint every ~120 m keeps the route on this layout
    const wp = [co[0]]; let acc = 0;
    for (let i = 1; i < co.length; i++) { acc += dist(co[i - 1], co[i]); if (acc > 120) { wp.push(co[i]); acc = 0; } }
    return { points: wp.map(p => [p.lat, p.lon]), all: co, start: co[0], props: f.properties };
  }
  const co = c.guide.points.map(([lat, lon]) => ({ lat, lon }));
  return { points: c.guide.points, all: co, start: null };
}
function bboxOf(pts, padM) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const p of pts) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
  const dLat = padM / 110574, dLon = padM / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
  return [s - dLat, w - dLon, n + dLat, e + dLon].map(v => +v.toFixed(5));
}

async function layout(c) {
  // (a measured lap: the layout as it is)
  if (c.lap) {
    const pts = JSON.parse(fs.readFileSync(path.join(HERE, 'ref', c.lap + '.lap.json'), 'utf8')).pts.map(p => ({ lat: p.lat, lon: p.lon, f: { n: null, layer: 0, tun: 0, w: p.w, y: p.y, b: p.b } }));
    let L = 0; for (let i = 0; i < pts.length; i++) L += dist(pts[i], pts[(i + 1) % pts.length]);
    console.log(`  layout: the measured lap (${pts.length} points), ${(L / 1000).toFixed(2)} km`);
    return pts;
  }
  const G = guideOf(c);
  // (outline: the guide's own line is the layout, where the map's roads don't trace it: a circuit newer than the
  // map, or an old layout since rebuilt)
  if (c.outline) {
    const pts = []; const co = G.all;
    for (let i = 0; i < co.length; i++) {
      const a = co[i], b = co[(i + 1) % co.length], k = Math.max(1, Math.round(dist(a, b) / 10));
      if (i === co.length - 1 && dist(a, b) < 1) break;
      for (let j = 0; j < k; j++) pts.push({ lat: a.lat + (b.lat - a.lat) * j / k, lon: a.lon + (b.lon - a.lon) * j / k, f: { n: null, layer: 0, tun: 0, w: 0 } });
    }
    let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    console.log(`  layout: the outline (${co.length} points), ${(L / 1000).toFixed(2)} km`);
    return pts;
  }
  const bb = bboxOf(G.all, 400);
  const data = await overpass(`[out:json][timeout:180];way${c.roads}(${bb.join(',')});out body geom;`, { label: c.id + ' roads' });
  const skip = (t, w) => (c.skip && t.name && c.skip.test(t.name)) || t.area === 'yes' || (c.skip && t.service && c.skip.test(t.service)) || (c.skipIds && w && c.skipIds.includes(w.id));
  const nodes = buildGraph(data.elements, skip);
  let line = route(nodes, G.points, { loop: !c.open, maxSnap: c.maxSnap || 60 });
  const ways = data.elements;
  // the start line: the outline's first point, else beside the middle of the pit lane
  let start = G.start;
  if (!start) {
    const pits = ways.filter(w => w.tags && /pit lane|boxengasse|pit road/i.test(w.tags.name || '')).sort((a, b) => b.geometry.length - a.geometry.length);
    if (pits.length) { const g = pits[0].geometry; start = g[Math.floor(g.length / 2)]; }
  }
  if (start && !c.open) {
    let bi = 0, bd = Infinity;
    line.forEach((p, i) => { const d = dist(p, start); if (d < bd) { bd = d; bi = i; } });
    line = [...line.slice(bi), ...line.slice(0, bi)];
  }
  if (c.reverse) line.reverse();
  // start line a set distance before a named corner (e.g. Monaco: on Boulevard Albert 1er, before Sainte-Devote)
  if (c.startBefore && !c.open) {
    const k = line.findIndex(p => p.way && p.way.tags && p.way.tags.name === c.startBefore.name);
    if (k < 0) throw new Error('startBefore: no section named ' + c.startBefore.name);
    let i = k, acc = 0;
    while (acc < c.startBefore.m) { const j = (i - 1 + line.length) % line.length; acc += dist(line[j], line[i]); i = j; }
    line = [...line.slice(i), ...line.slice(0, i)];
  }
  let L = 0; for (let i = 1; i < line.length; i++) L += dist(line[i - 1], line[i]);
  console.log(`  layout: ${line.length} OSM points, ${(L / 1000).toFixed(2)} km`);
  return line.map(p => {
    const t = (p.way && p.way.tags) || {};
    const layer = parseInt(t.layer) || (t.bridge && t.bridge !== 'no' ? 1 : 0);
    const w = parseFloat(t.width);
    return { lat: p.lat, lon: p.lon, f: { n: t['name:en'] || t.name || null, layer, tun: t.tunnel && t.tunnel !== 'no' ? 1 : 0, w: isFinite(w) && w > 5 && w < 25 ? w : 0 } };
  });
}

// ---------- 1b. the real ground under the road (national LiDAR models: see dem.mjs) ----------
async function roadProfile(c, line) {
  if (!c.dem) return null;
  // a point every ~8 m along the road, each remembering whether it's on a bridge / in a tunnel
  const pts = [], n = line.length, segs = c.open ? n - 1 : n;
  for (let i = 0; i < segs; i++) {
    const a = line[i], b = line[(i + 1) % n], k = Math.max(1, Math.round(dist(a, b) / 8));
    for (let j = 0; j < k; j++) pts.push({ lat: +(a.lat + (b.lat - a.lat) * j / k).toFixed(7), lon: +(a.lon + (b.lon - a.lon) * j / k).toFixed(7), air: !!(b.f.tun || b.f.layer), f: b.f });
  }
  if (c.open) pts.push({ ...line[n - 1], air: false, f: line[n - 1].f });
  const h = await groundHeights(c.dem, pts, console.log);
  const bank = await roadCamber(c, pts, h);
  // the ground model is the ground: over a tunnel it's the hill above, under a bridge it's the road below. Across those
  // (and any gaps in the data) the road runs straight from one end to the other.
  // (a bridge's ends: the ground model is still in the cutting below for a few metres past where OSM ends the bridge,
  // so the road takes its heights from ~24 m clear of it either side)
  const air = pts.map(p => p.air), N0 = pts.length, M = 3;
  const near = air.map((_, i) => { for (let k = -M; k <= M; k++) { const j = c.open ? i + k : (i + k + N0) % N0; if (j >= 0 && j < N0 && air[j]) return true; } return false; });
  const bad = pts.map((p, i) => near[i] || h[i] == null);
  const good = bad.map(b => !b), N = pts.length;
  if (!good.some(Boolean)) throw new Error('no ground data for ' + c.id);
  for (let i = 0; i < N; i++) if (bad[i]) {
    let a = i, b = i;
    while (!good[(a - 1 + N) % N]) a--; while (!good[(b + 1) % N]) b++;
    const ha = h[(a - 1 + N) % N], hb = h[(b + 1) % N];
    for (let k = a; k <= b; k++) { const f = (k - a + 1) / (b - a + 2); h[(k + N) % N] = ha + (hb - ha) * f; bad[(k + N) % N] = false; }
  }
  // Where a road or a tunnel passes under the track, the ground model has the trench it runs in, not the road over it:
  // a dip metres deep and a few tens of metres long (Suzuka's main straight, Dunlop, the crossover, the chicane). No
  // racing road climbs or falls more than ~20%, so a stretch that does both within 80 m is one of those: the road runs
  // straight across it, from the last good point before to the first after.
  despike(h, c.open);
  const lo = Math.min(...h), hi = Math.max(...h);
  console.log(`  ground (${c.dem}): ${N} points, ${(hi - lo).toFixed(1)} m from lowest to highest`);
  return pts.map((p, i) => bank ? [p.lat, p.lon, +h[i].toFixed(2), bank[i]] : [p.lat, p.lon, +h[i].toFixed(2)]);
}

// (above) steep down then steep up (or up then down) within 80 m: bridged straight across. Points every ~8 m.
const SPIKE_GRADE = 0.2, SPIKE_SPAN = 10;
function despike(h, open) {
  const N = h.length, at = (i) => (open ? Math.max(0, Math.min(N - 1, i)) : ((i % N) + N) % N);
  let fixed = 0, len = 0;
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (let i = 0; i < (open ? N - 1 : N); i++) {
      const g = h[at(i + 1)] - h[i]; // (per ~8 m)
      if (Math.abs(g) < SPIKE_GRADE * 8) continue;
      // the matching steep step the other way, within the span
      let j = -1;
      for (let k = 1; k <= SPIKE_SPAN && (!open || i + k + 1 < N); k++) { const g2 = h[at(i + k + 1)] - h[at(i + k)]; if (Math.sign(g2) === -Math.sign(g) && Math.abs(g2) >= SPIKE_GRADE * 8 * 0.5) j = i + k + 1; }
      if (j < 0) continue;
      // the stretch between the last good point before and the first after: a straight line
      const a = i, b = j, ha = h[at(a)], hb = h[at(b)];
      for (let k = a + 1; k < b; k++) h[at(k)] = ha + (hb - ha) * (k - a) / (b - a);
      fixed++; len += (b - a) * 8; any = true;
    }
    if (!any) break;
  }
  if (fixed) console.log(`  ground: ${fixed} dip${fixed > 1 ? 's' : ''} / bump${fixed > 1 ? 's' : ''} where something passes under the road bridged (${len} m)`);
}

// The road's camber, from the same laser-scanned ground model: a line fitted through heights at 7 points across the
// road (out to 1 m in from each edge) at every profile point, as a tilt in degrees (positive = right edge higher, in
// the direction of travel: track.js banking). The scan can't see where the road ends, so a point that sits off the
// line by more than 15 cm (a wall, a kerb drop, a bank beside the road) is dropped, worst first, and a cross-section
// only counts with 5 of its 7 points left. Banked corners are steep (Zandvoort's Hugenholtz and Arie Luyendyk ~18°):
// up to 25° counts. Runs of good ones are median-filtered then averaged over ~40 m; where nothing counts (bridges,
// tunnels, walls both sides) it's level. GSI's 5 m model is coarser than a road is wide, so it gives no camber
// (catalog camber: true forces it).
const CAMBER_K = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1];
async function roadCamber(c, pts, h) {
  if (c.camber === false || (c.dem === 'gsi' && c.camber !== true)) { console.log(`  camber: not measured (${c.dem === 'gsi' ? 'the 5 m model is coarser than the road' : 'off'})`); return null; }
  const N = pts.length, M_LAT = 110574, mLon = 111320 * Math.cos(pts[0].lat * Math.PI / 180);
  const width = (f) => (f && f.w) || (c.widths && f && f.n && c.widths[f.n]) || c.width || 13;
  const side = [], half = [], K = CAMBER_K.length;
  for (let i = 0; i < N; i++) {
    const a = pts[c.open ? Math.max(0, i - 1) : (i - 1 + N) % N], b = pts[c.open ? Math.min(N - 1, i + 1) : (i + 1) % N];
    let fx = (b.lon - a.lon) * mLon, fz = -(b.lat - a.lat) * M_LAT; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    const s = Math.max(2, width(pts[i].f) / 2 - 1), rx = -fz, rz = fx; half.push(s);
    for (const k of CAMBER_K) side.push({ lat: +(pts[i].lat - k * s * rz / M_LAT).toFixed(7), lon: +(pts[i].lon + k * s * rx / mLon).toFixed(7) });
  }
  const e = await groundHeights(c.dem, side, console.log);
  const raw = new Array(N).fill(null);
  let good = 0;
  for (let i = 0; i < N; i++) {
    if (pts[i].air) continue;
    let P = CAMBER_K.map((k, j) => [k * half[i], e[i * K + j]]).filter(p => p[1] != null), slope = 0;
    while (P.length >= 5) {
      const mx = P.reduce((s, p) => s + p[0], 0) / P.length, my = P.reduce((s, p) => s + p[1], 0) / P.length;
      let sxy = 0, sxx = 0; for (const [x, y] of P) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
      slope = sxy / (sxx || 1);
      let wj = -1, wr = 0.15; P.forEach(([x, y], j) => { const r = Math.abs(y - (my + slope * (x - mx))); if (r > wr) { wr = r; wj = j; } });
      if (wj < 0) break;
      P.splice(wj, 1);
    }
    if (P.length < 5) continue;
    const b = Math.atan(slope) * 180 / Math.PI;
    if (Math.abs(b) > 25) continue;
    raw[i] = b; good++;
  }
  const at = (i) => c.open ? (i < 0 || i >= N ? null : i) : (i + N) % N;
  const med = raw.map((v, i) => { const w = []; for (let k = -2; k <= 2; k++) { const j = at(i + k); if (j != null && raw[j] != null) w.push(raw[j]); } w.sort((x, y) => x - y); return w.length >= 3 ? w[w.length >> 1] : null; });
  const out = med.map((v, i) => { let sm = 0, n = 0; for (let k = -2; k <= 2; k++) { const j = at(i + k); if (j != null && med[j] != null) { sm += med[j]; n++; } } return n >= 3 ? +(sm / n).toFixed(1) : 0; });
  let lo = 0, hi = 0; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  console.log(`  camber (${c.dem}): ${good} of ${N} cross-sections on the road, ${lo.toFixed(1)}° to +${hi.toFixed(1)}°`);
  return out;
}

// ---------- 2. the surroundings from OSM ----------
async function surroundings(c, line) {
  const bb = bboxOf(line, c.margin || 450).join(',');
  const q = `[out:json][timeout:180];(way["building"](${bb});node["natural"="tree"](${bb});way["natural"="wood"](${bb});way["landuse"="forest"](${bb});way["natural"="tree_row"](${bb}););out geom qt;`;
  const d = await overpass(q, { label: c.id + ' scenery' });
  // landmarks: water (lakes, harbours, rivers), Ferris wheels, stadium stands
  const q2 = `[out:json][timeout:180];(way["natural"="water"](${bb});relation["natural"="water"](${bb});way["waterway"="riverbank"](${bb});way["landuse"="reservoir"](${bb});way["leisure"="marina"](${bb});way["water"](${bb});nwr["attraction"="big_wheel"](${bb});way["natural"="coastline"](${bb});way["leisure"="stadium"](${bb});way["building"~"^(grandstand|stadium)$"](${bb}););out geom;`;
  const d2 = await overpass(q2, { label: c.id + ' landmarks' });
  const seen = new Set(d.elements.map(e => e.type + e.id));
  return [...d.elements, ...d2.elements.filter(e => !seen.has(e.type + e.id))];
}

// ---------- 1c. (dev) the road from a reference model ----------
// R: { x, z, w, y, b } every 2 m in the track's frame (geo = the OSM layout's centre); line / profile: from OSM + LiDAR.
// Each reference point takes the section flags (names, bridges, tunnels) of the nearest OSM point; its heights are the
// model's, moved to sea level by how far they sit from the LiDAR's on average.
function refRoad(R, line, profile) {
  const geo = centre(line), mLon = 111320 * Math.cos(geo.lat * Math.PI / 180), M_LAT = 110574;
  const loc = (p) => [(p.lon - geo.lon) * mLon, -(p.lat - geo.lat) * M_LAT];
  const L = line.map(loc), Pp = profile ? profile.map(r => loc({ lat: r[0], lon: r[1] })) : [];
  const nearest = (pts, x, z) => { let bi = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
  const n = R.x.length, out = [], prof = [], diffs = [];
  for (let i = 0; i < n; i++) {
    const x = R.x[i], z = R.z[i], lat = geo.lat - z / M_LAT, lon = geo.lon + x / mLon;
    const f = { ...line[nearest(L, x, z)].f, w: Math.max(7, Math.min(22, R.w[i])) };
    out.push({ lat, lon, f });
    if (profile && i % 4 === 0) diffs.push(profile[nearest(Pp, x, z)][2] - R.y[i]);
  }
  diffs.sort((a, b) => a - b);
  const off = diffs.length ? diffs[diffs.length >> 1] : 0; // (no laser scan: 0, and the bake lifts them to the elevation tiles)
  for (let i = 0; i < n; i += 4) prof.push([+out[i].lat.toFixed(7), +out[i].lon.toFixed(7), +(R.y[i] + off).toFixed(2), R.b[i]]);
  R.off = off;
  if (diffs.length) console.log(`  reference road: ${n} points, heights moved ${off.toFixed(1)} m to sea level (LiDAR vs model: p10 ${(diffs[Math.floor(diffs.length * 0.1)] - off).toFixed(2)} m, p90 ${(diffs[Math.floor(diffs.length * 0.9)] - off).toFixed(2)} m)`);
  else console.log(`  reference road: ${n} points (no laser scan here: its heights go to the elevation tiles)`);
  return { line: out, profile: prof, rel: !diffs.length };
}

// ---------- 2b. what the runoff is made of: aerial photos + OSM's gravel traps (surface.mjs) ----------
// (every circuit: its mapped barriers and pit lane; with a photo source, its runoff's surfaces too)
async function realSurface(c, line, geo) {
  const bb = bboxOf(line, 120).join(',');
  const q = `[out:json][timeout:180];(way["surface"~"^(gravel|fine_gravel|sand)$"]["highway"!~"."](${bb});way["natural"~"^(sand|shingle)$"](${bb});way["landuse"="gravel"](${bb});way["barrier"](${bb});way["highway"="raceway"](${bb});way["building"](${bb}););out geom;`;
  const osm = (await overpass(q, { label: c.id + ' runoff' })).elements;
  const surface = c.photo ? await surfaceMap(c.photo, geo, line, osm, { log: console.log }) : null;
  // the barriers: walls, fences and guard rails within reach of the road (js/runoff.js realWallOffsets puts the
  // track's barrier where they are)
  const KIND = { wall: 'wall', retaining_wall: 'wall', jersey_barrier: 'wall', guard_rail: 'rail', fence: 'fence', tyres: 'tires' };
  const mLon = 111320 * Math.cos(geo.lat * Math.PI / 180), loc = (g) => [+((g.lon - geo.lon) * mLon).toFixed(1), +(-(g.lat - geo.lat) * 110574).toFixed(1)];
  const L = line.map(loc), near = (p) => L.some(q => Math.abs(q[0] - p[0]) < 110 && Math.abs(q[1] - p[1]) < 110 && Math.hypot(q[0] - p[0], q[1] - p[1]) < 110);
  const walls = [];
  for (const el of osm) {
    const k = el.tags && KIND[el.tags.barrier]; if (!k || !el.geometry || el.geometry.length < 2) continue;
    const p = el.geometry.map(loc); if (!p.some(near)) continue;
    walls.push({ k, p });
  }
  // the pit lane (the longest raceway named as one: not a support paddock's), for js/track.js buildPitLane
  // (by name, in any of the usual languages, as part of a longer one too: "IMS Pit Lane", "Madring pit lane", and its
  // entry / exit pieces, joined up; not a support paddock's, a kart track's, or an oval's own warm-up lane)
  const PITN = /\b(pit ?lane|pit-lane|pit road|pit (entry|exit))\b|pitstraat|voie des stands|sortie des stands|boxengasse|corsia box|v[ií]a de boxes|calle de boxes|ピットロード|ピットレーン/i;
  const pits = osm.filter(el => el.tags && el.tags.highway === 'raceway' && el.geometry && (PITN.test(el.tags.name || '') || el.tags.raceway === 'pitlane' || el.tags.service === 'pit_lane') && !/support|kart|moto|oval|warm ?up|alternate/i.test(el.tags.name || ''));
  const pitLane = pits.length ? joinWays(pits.map(el => el.geometry.map(loc))) : null;
  if (pitLane) console.log(`  pit lane: ${pits.length} OSM ways, ${pitLane.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - pitLane[i - 1][0], p[1] - pitLane[i - 1][1]) : 0), 0).toFixed(0)} m`);
  console.log(`  barriers: ${walls.length} mapped (${['wall', 'rail', 'fence', 'tires'].map(k => walls.filter(w => w.k === k).length + ' ' + k).join(', ')})`);
  // every raceway mapped here (all its layouts, pit lanes, access roads), for placing a reference model on: mapped to a
  // metre or so, where the outline is a sketch
  const raceways = osm.filter(el => el.tags && el.tags.highway === 'raceway' && el.geometry && el.geometry.length > 1).map(el => el.geometry.map(loc)).filter(p => p.some(near));
  return { surface, walls, pitLane, raceways };
}
// pieces of one line (OSM ways meeting end to end, in any direction) as one polyline: the longest chain
function joinWays(ws) {
  const eq = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
  let best = [];
  for (let s0 = 0; s0 < ws.length; s0++) {
    let line = ws[s0].slice(); const used = new Set([s0]);
    for (let grew = true; grew;) {
      grew = false;
      for (let k = 0; k < ws.length; k++) {
        if (used.has(k)) continue; const w = ws[k];
        if (eq(line[line.length - 1], w[0])) line = [...line, ...w.slice(1)];
        else if (eq(line[line.length - 1], w[w.length - 1])) line = [...line, ...w.slice(0, -1).reverse()];
        else if (eq(line[0], w[w.length - 1])) line = [...w.slice(0, -1), ...line];
        else if (eq(line[0], w[0])) line = [...w.slice(1).reverse(), ...line];
        else continue;
        used.add(k); grew = true;
      }
    }
    if (line.length > best.length) best = line;
  }
  return best;
}

// ---------- 3. bake in the browser ----------
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.css': 'text/css' };
async function browser() {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await b.newPage();
  await page.route('http://svgp.local/**', (r) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, body: fs.readFileSync(p), headers: { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' } });
  });
  // elevation tiles, cached on disk
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', async (r) => {
    const u = new URL(r.request().url()), key = u.pathname.split('/').slice(-3).join('_');
    const f = path.join(TILES, key);
    let body;
    if (fs.existsSync(f)) body = fs.readFileSync(f);
    else {
      const res = await fetch(u); if (!res.ok) return r.fulfill({ status: res.status, body: '' });
      body = Buffer.from(await res.arrayBuffer()); fs.mkdirSync(TILES, { recursive: true }); fs.writeFileSync(f, body);
    }
    r.fulfill({ status: 200, body, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } });
  });
  // open aerial photos (photofit.js), cached on disk
  await page.route(/^https:\/\/(service\.pdok\.nl|cyberjapandata\.gsi\.go\.jp)\//, async (r) => {
    const u = new URL(r.request().url()), f = path.join(HERE, 'cache/photo', u.hostname, u.pathname.replace(/[^A-Za-z0-9._-]/g, '_'));
    let body;
    if (fs.existsSync(f)) body = fs.readFileSync(f);
    else {
      const res = await fetch(u, { signal: AbortSignal.timeout(20000) }).catch(() => null); if (!res || !res.ok) return r.fulfill({ status: res ? res.status : 502, body: '' });
      body = await res.arrayBuffer().then(Buffer.from).catch(() => null); if (!body) return r.fulfill({ status: 502, body: '' });
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body);
    }
    r.fulfill({ status: 200, body, headers: { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*' } });
  });
  page.on('console', (m) => console.log('  ' + m.text()));
  page.on('pageerror', (e) => console.log('  PAGE ERROR ' + e.message));
  await page.goto('http://svgp.local/tools/tracks/bake.html');
  await page.waitForFunction(() => window.bakeReady, null, { timeout: 30000 });
  return { b, page };
}

const centre = (line) => { let a = 0, b = 0; for (const p of line) { a += p.lat; b += p.lon; } return { lat: +(a / line.length).toFixed(6), lon: +(b / line.length).toFixed(6) }; };

fs.mkdirSync(OUT, { recursive: true });
const { b, page } = await browser();
try {
  for (const c of list) {
    console.log(`\n${c.name}`);
    let line = await layout(c);
    // (the road where the aerial photo has it: its centre line and widths, photofit.js)
    let fitCredit = null;
    if (!REF && c.photoFit !== false) {
      const r = await page.evaluate(async (inp) => { const r = await window.photoFit(inp, (s) => console.log(s)); return { line: r.line, note: r.note, credit: r.credit }; },
        { line, geo: centre(line), country: c.country, open: !!c.open, width: c.width, widths: c.widths });
      console.log('  photo fit: ' + r.note); line = r.line; fitCredit = r.credit || null;
    }
    const osm = await surroundings(c, line);
    let profile = await roadProfile(c, line);
    // (a measured lap with its own heights and camber: those, moved to the laser scan's level. The scan's line can
    // catch what's beside the road, an oval's banking, a wall, as bumps)
    if (c.lap && profile && line.every(p => p.f.y !== undefined)) {
      const diffs = [];
      for (let i = 0; i < line.length; i++) { const r = profile[Math.min(profile.length - 1, Math.round(i * profile.length / line.length))]; diffs.push(r[2] - line[i].f.y); }
      diffs.sort((a, b) => a - b); const off = diffs[diffs.length >> 1];
      console.log(`  heights: the measured lap's, moved ${off.toFixed(1)} m to the scan's level (scan vs lap: p10 ${(diffs[Math.floor(diffs.length * 0.1)] - off).toFixed(2)} m, p90 ${(diffs[Math.floor(diffs.length * 0.9)] - off).toFixed(2)} m)`);
      profile = line.map(p => [p.lat, p.lon, +(p.f.y + off).toFixed(2), p.f.b]);
    }
    if (process.env.DUMP_PROFILE) fs.writeFileSync(process.env.DUMP_PROFILE, JSON.stringify({ profile, line: line.map(p => [p.lat, p.lon, p.f]) }));
    const geo = c.geo ? { lat: c.geo[0], lon: c.geo[1] } : centre(line); // (a reference road is measured in the OSM layout's frame: it keeps that origin; geo: a frame pinned)
    let profileRel = false;
    if (REF) ({ line, profile, rel: profileRel } = refRoad(REF, line, profile));
    const real = await realSurface(c, line, geo);
    const inp = { id: c.id, name: c.name, desc: c.desc, maxGrade: c.maxGrade, country: c.country, category: c.category, open: !!c.open, width: c.width, widths: c.widths,
      env: c.env, scatter: c.scatter, sea: !!c.sea, groundR: c.groundR, profile, profileRel, dem: c.dem, exag: c.exag, elevSmooth: c.elevSmooth, margin: c.margin, label: `${c.name}, ${c.country}`,
      geo, line, osm, pitLane: real && real.pitLane, autoStart: !c.guide.f1 && !c.startBefore && !c.open, source: '© OpenStreetMap contributors' + (c.guide.f1 && !c.lap ? ' · outline: bacinger/f1-circuits' : '') + (c.dem ? ' · ' + DEM_CREDITS[c.dem] : '') + (c.photo ? ' · ' + ORTHO_CREDITS[c.photo] : '') + (fitCredit ? ' · ' + fitCredit : '') };
    const t0 = Date.now();
    const track = await page.evaluate(async (inp) => window.bake(inp, (s) => console.log(s)), inp);
    const shift = track._profileShift || 0; delete track._profileShift;
    if (real) {
      track.osm.walls = real.walls; if (real.pitLane) track.osm.pitLane = real.pitLane; if (real.raceways.length) track.osm.raceways = real.raceways;
      if (real.surface) { track.osm.surface = real.surface; track.env.runoffStyle = 'real'; }
    }
    const file = REF ? path.join(HERE, 'cache', 'ref', c.id + '_ref.json') : path.join(OUT, c.id + '.json');
    // (its dressing, laid out in the Track Studio: tools/tracks/studio.mjs)
    const df = path.join(OUT, 'dress', c.id + '.json');
    if (!REF && fs.existsSync(df)) track.dress = JSON.parse(fs.readFileSync(df, 'utf8'));
    // (and what was changed in the editor and made official: tools/tracks/official.mjs)
    const ef = path.join(OUT, 'edits', c.id + '.json');
    if (!REF && fs.existsSync(ef)) Object.assign(track, JSON.parse(fs.readFileSync(ef, 'utf8')));
    // (its landmarks, made in the game's style: tools/tracks/landmarks.mjs)
    if (!REF && fs.existsSync(landmarksFile(c.id))) applyLandmarks(track, JSON.parse(fs.readFileSync(landmarksFile(c.id), 'utf8')));
    if (REF) {
      track.name += ' (reference)'; track.real.id = c.id + '_ref'; fs.mkdirSync(path.dirname(file), { recursive: true });
      // the model itself, placed: game x, z = R (model x, z) + t; game y = (model y + off - lo - base) * exag
      // (the model's own barriers are the walls you hit, wherever they stand; its scenery covers the runoff)
      if (REF.walls) track.osm.walls = REF.walls;
      // (and its ground: what it's made of and how high, for the physics off the road)
      if (REF.surface) { track.osm.surface = REF.surface; track.env.runoffStyle = 'real'; } else { delete track.osm.surface; track.env.runoffStyle = 'mixed'; }
      if (REF.ground) track.osm.refGround = REF.ground;
      if (REF.model) { const T = track.terrain; track.refModel = { ...REF.model, dy: +(REF.off + shift - T.lo - (T.base || 0)).toFixed(2), exag: T.exag || 1 }; }
    }
    fs.writeFileSync(file, JSON.stringify(track));
    if (REF) { // (the dev list js/realtracks.js adds to the picker when it's there)
      const lf = path.join(path.dirname(file), 'list.json'), list = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')).filter(e => e.real.id !== track.real.id) : [];
      const { osm, terrain, ...light } = track;
      list.push({ ...light, file: path.basename(file), path: path.relative(ROOT, file) });
      fs.writeFileSync(lf, JSON.stringify(list));
    }
    console.log(`  baked in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(fs.statSync(file).size / 1024).toFixed(0)} KB${REF ? ' -> ' + path.relative(ROOT, file) : ''}`);
  }
} finally { await b.close(); }

// ---------- 4. the index the game reads (light: no terrain / scenery, those load when you pick the circuit) ----------
const index = [];
for (const c of CATALOG) {
  const f = path.join(OUT, c.id + '.json'); if (!fs.existsSync(f)) continue;
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  const { osm, terrain, dress, ...light } = t;
  index.push({ ...light, file: c.id + '.json' });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`\nindex: ${index.length} circuits`);
