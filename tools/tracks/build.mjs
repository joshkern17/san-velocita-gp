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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'tracks/real');
const TILES = path.join(HERE, 'cache/tiles');
const require = createRequire(path.join(ROOT, 'tools/package.json'));
const { chromium } = require('playwright-core');
const F1 = JSON.parse(fs.readFileSync(path.join(HERE, 'f1-circuits.json'), 'utf8'));

const want = process.argv.slice(2);
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
  const G = guideOf(c);
  const bb = bboxOf(G.all, 400);
  const data = await overpass(`[out:json][timeout:180];way${c.roads}(${bb.join(',')});out body geom;`, { label: c.id + ' roads' });
  const skip = (t) => (c.skip && t.name && c.skip.test(t.name)) || t.area === 'yes' || (c.skip && t.service && c.skip.test(t.service));
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
    for (let j = 0; j < k; j++) pts.push({ lat: +(a.lat + (b.lat - a.lat) * j / k).toFixed(7), lon: +(a.lon + (b.lon - a.lon) * j / k).toFixed(7), air: !!(b.f.tun || b.f.layer) });
  }
  if (c.open) pts.push({ ...line[n - 1], air: false });
  const h = await groundHeights(c.dem, pts, console.log);
  // the ground model is the ground: over a tunnel it's the hill above, under a bridge it's the road below. Across those
  // (and any gaps in the data) the road runs straight from one end to the other.
  const bad = pts.map((p, i) => p.air || h[i] == null);
  const good = bad.map(b => !b), N = pts.length;
  if (!good.some(Boolean)) throw new Error('no ground data for ' + c.id);
  for (let i = 0; i < N; i++) if (bad[i]) {
    let a = i, b = i;
    while (!good[(a - 1 + N) % N]) a--; while (!good[(b + 1) % N]) b++;
    const ha = h[(a - 1 + N) % N], hb = h[(b + 1) % N];
    for (let k = a; k <= b; k++) { const f = (k - a + 1) / (b - a + 2); h[(k + N) % N] = ha + (hb - ha) * f; bad[(k + N) % N] = false; }
  }
  const lo = Math.min(...h), hi = Math.max(...h);
  console.log(`  ground (${c.dem}): ${N} points, ${(hi - lo).toFixed(1)} m from lowest to highest`);
  return pts.map((p, i) => [p.lat, p.lon, +h[i].toFixed(2)]);
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
    const line = await layout(c);
    const osm = await surroundings(c, line);
    const profile = await roadProfile(c, line);
    const inp = { id: c.id, name: c.name, desc: c.desc, maxGrade: c.maxGrade, country: c.country, category: c.category, open: !!c.open, width: c.width, widths: c.widths,
      env: c.env, scatter: c.scatter, sea: !!c.sea, groundR: c.groundR, profile, dem: c.dem, exag: c.exag, elevSmooth: c.elevSmooth, margin: c.margin, label: `${c.name}, ${c.country}`,
      geo: centre(line), line, osm, source: '© OpenStreetMap contributors' + (c.guide.f1 ? ' · outline: bacinger/f1-circuits' : '') + (c.dem ? ' · ' + DEM_CREDITS[c.dem] : '') };
    const t0 = Date.now();
    const track = await page.evaluate(async (inp) => window.bake(inp, (s) => console.log(s)), inp);
    fs.writeFileSync(path.join(OUT, c.id + '.json'), JSON.stringify(track));
    console.log(`  baked in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(fs.statSync(path.join(OUT, c.id + '.json')).size / 1024).toFixed(0)} KB`);
  }
} finally { await b.close(); }

// ---------- 4. the index the game reads (light: no terrain / scenery, those load when you pick the circuit) ----------
const index = [];
for (const c of CATALOG) {
  const f = path.join(OUT, c.id + '.json'); if (!fs.existsSync(f)) continue;
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  const { osm, terrain, ...light } = t;
  index.push({ ...light, file: c.id + '.json' });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`\nindex: ${index.length} circuits`);
