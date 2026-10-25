// Real-world maps: projection, map tiles, place search and OpenStreetMap import.
// Local track coordinates are metres: +x = east, +z = south, origin = track.geo.
import { polyArea, pointInPoly, orientedRect } from './zones.js';
import { OSM_ROAD_QUERY, osmWays } from './osmroads.js';
import { WATER_QUERY, waterPolys } from './water.js';
import { STREET_QUERY, streetFeatures } from './streetdata.js';

const M_LAT = 110574;
const mLon = (lat) => 111320 * Math.cos(lat * Math.PI / 180);

export function toLocal(geo, lat, lon) { return [(lon - geo.lon) * mLon(geo.lat), -(lat - geo.lat) * M_LAT]; }
export function toLatLon(geo, x, z) { return [geo.lat - z / M_LAT, geo.lon + x / mLon(geo.lat)]; }

// ---------- tiles ----------
export const MAP_STYLES = {
  streets: { label: 'Streets', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: '© OpenStreetMap contributors' },
  satellite: { label: 'Satellite', url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max: 19, attr: 'Imagery © Esri, Maxar, Earthstar Geographics' },
};
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

export class TileLayer {
  constructor(onLoad) { this.cache = new Map(); this.onLoad = onLoad; }
  get(style, z, x, y) {
    const key = style + '/' + z + '/' + x + '/' + y;
    let t = this.cache.get(key);
    if (!t) {
      const img = new Image();
      t = { img, ok: false, err: false };
      img.onload = () => { t.ok = true; this.onLoad(); };
      img.onerror = () => { t.err = true; };
      img.src = MAP_STYLES[style].url(z, x, y);
      this.cache.set(key, t);
      if (this.cache.size > 900) { const first = this.cache.keys().next().value; this.cache.delete(first); }
    }
    return t;
  }
  // draw tiles covering the view. w2s maps local metres -> screen px
  draw(ctx, geo, style, view, W, H, w2s, s2w, dpr, alpha) {
    const S = MAP_STYLES[style]; if (!S || !geo) return;
    const mpp = 1 / (view.scale * dpr);
    let z = Math.round(Math.log2((156543.03 * Math.cos(geo.lat * Math.PI / 180)) / mpp));
    z = Math.max(3, Math.min(S.max, z));
    const [ax, az] = s2w(0, 0), [bx, bz] = s2w(W, H);
    const [latN, lonW] = toLatLon(geo, ax, az), [latS, lonE] = toLatLon(geo, bx, bz);
    let x0 = Math.floor(lon2x(lonW, z)), x1 = Math.floor(lon2x(lonE, z));
    let y0 = Math.floor(lat2y(latN, z)), y1 = Math.floor(lat2y(latS, z));
    while ((x1 - x0 + 1) * (y1 - y0 + 1) > 120 && z > 3) { z--; x0 = Math.floor(lon2x(lonW, z)); x1 = Math.floor(lon2x(lonE, z)); y0 = Math.floor(lat2y(latN, z)); y1 = Math.floor(lat2y(latS, z)); }
    const n = 2 ** z;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      const t = this.get(style, z, wx, ty);
      const [lx0, lz0] = toLocal(geo, y2lat(ty, z), x2lon(tx, z));
      const [lx1, lz1] = toLocal(geo, y2lat(ty + 1, z), x2lon(tx + 1, z));
      const [sx0, sy0] = w2s(lx0, lz0), [sx1, sy1] = w2s(lx1, lz1);
      if (t.ok) ctx.drawImage(t.img, sx0, sy0, sx1 - sx0 + 0.6, sy1 - sy0 + 0.6);
      else {
        // fall back to a loaded parent tile while this one streams in
        for (let up = 1; up <= 4 && z - up >= 3; up++) {
          const pz = z - up, px = wx >> up, py = ty >> up;
          const pt = this.cache.get(style + '/' + pz + '/' + px + '/' + py);
          if (pt && pt.ok) {
            const f = 256 / 2 ** up, ox = (wx - (px << up)) * f, oy = (ty - (py << up)) * f;
            ctx.drawImage(pt.img, ox, oy, f, f, sx0, sy0, sx1 - sx0 + 0.6, sy1 - sy0 + 0.6);
            break;
          }
        }
      }
    }
    ctx.restore();
  }
}

// ---------- search ----------
export async function searchPlace(q) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('Search failed (' + r.status + ')');
  const j = await r.json();
  return j.map(p => ({ label: p.display_name, lat: +p.lat, lon: +p.lon }));
}

export function myLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location not available in this browser'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'My location' }), e => rej(new Error(e.message || 'Location permission denied')), { timeout: 12000 });
  });
}

// ---------- OpenStreetMap import ----------
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function classify(tags, area, levels) {
  const b = tags.building || 'yes';
  if (['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'residential', 'hut', 'cabin', 'farm', 'garage', 'shed'].includes(b)) return area > 600 ? 'apartment' : 'house';
  if (['apartments', 'dormitory', 'hotel'].includes(b)) return 'apartment';
  if (['commercial', 'retail', 'supermarket', 'kiosk', 'shop'].includes(b)) return 'shop';
  if (['industrial', 'warehouse', 'factory', 'manufacture', 'hangar', 'barn', 'storage_tank'].includes(b)) return 'warehouse';
  if (['office', 'civic', 'government', 'hospital', 'university', 'school', 'college', 'public'].includes(b)) return levels > 12 ? 'tower' : 'office';
  // untagged "yes": guess from size / levels
  if (levels >= 15) return 'tower';
  if (levels >= 5) return 'office';
  if (levels >= 3) return 'apartment';
  if (area < 420) return 'house';
  if (area > 2500) return 'warehouse';
  if (tags.shop || tags.amenity) return 'shop';
  return area > 900 ? 'apartment' : 'shop';
}
const DEFAULT_H = { house: 6, shop: 7, apartment: 15, office: 24, tower: 70, warehouse: 9 };

function num(v) { if (v == null) return NaN; const m = String(v).match(/[\d.]+/); return m ? parseFloat(m[0]) : NaN; }

// opts: { buildings, trees, roads, water, driveways, line: [[x, z], ...] + margin (only the ground that close to the line: a long
// point-to-point track's bounding box is mostly empty hills), rank (see parseOSM) }
// Along a line the area is a row of squares (CELL m) that reach the strip, all in one request (one bbox query per square
// is fast for the server; an "around" the whole line wasn't). The public servers are slow at busy times (a minute in the
// queue for a tiny query), so a request gets WAIT seconds, and one that fails is split in two and tried again.
// Streets come back whole (out geom), however far they run past the square that found them.
const CELL = 900, WAIT = 150;
async function fetchOverpass(q, label, onStatus) {
  let lastErr = null;
  for (let k = 0; k < ENDPOINTS.length; k++) {
    const ctl = new AbortController(), t0 = Date.now();
    const timer = setTimeout(() => ctl.abort(), (k ? 60 : WAIT) * 1000); // (the main server gets the long wait, backups a minute)
    const tick = setInterval(() => onStatus && onStatus(`${label} ${Math.round((Date.now() - t0) / 1000)} s${k ? ` (backup server ${k})` : ''}`), 1000);
    try {
      onStatus && onStatus(label + (k ? ` (backup server ${k})` : ''));
      const r = await fetch(ENDPOINTS[k], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 429 ? 'Map servers are busy — try again in a minute' : 'Map server error ' + r.status);
      const data = await r.json();
      if (data.remark && /timed out|out of memory/i.test(data.remark)) throw new Error('Map server ran out of time');
      clearTimeout(timer); clearInterval(tick); return data;
    } catch (err) { lastErr = err.name === 'AbortError' ? new Error('Map servers timed out — they are busy, try again in a minute') : err; }
    clearTimeout(timer); clearInterval(tick);
  }
  throw lastErr || new Error('Could not reach the map server');
}
export async function importOSM(geo, bboxLocal, opts, onStatus) {
  const [x0, z0, x1, z1] = bboxLocal, m = opts.margin || 250;
  const llb = (a, b, c, d) => { const [n, w] = toLatLon(geo, a, b), [s, e] = toLatLon(geo, c, d); return `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`; };
  const clauses = (bb) => {
    const parts = [];
    if (opts.roads) parts.push(OSM_ROAD_QUERY(bb));
    if (opts.buildings) parts.push(`way["building"](${bb});`);
    if (opts.water) parts.push(WATER_QUERY(bb));
    if (opts.street) parts.push(STREET_QUERY(bb));
    if (opts.trees) parts.push(`node["natural"="tree"](${bb});`, `way["natural"="wood"](${bb});`, `way["landuse"="forest"](${bb});`, `way["natural"="tree_row"](${bb});`);
    return parts.join('');
  };
  // the squares: those whose nearest point to the line is within the margin
  const cells = [];
  if (opts.line) {
    const near = (a, b, c, d) => opts.line.some(([x, z]) => Math.hypot(Math.max(a - x, 0, x - c), Math.max(b - z, 0, z - d)) < m + 30);
    for (let a = x0; a < x1; a += CELL) for (let b = z0; b < z1; b += CELL) { const c = Math.min(x1, a + CELL), d = Math.min(z1, b + CELL); if (near(a, b, c, d)) cells.push([a, b, c, d]); }
  } else cells.push([x0, z0, x1, z1]);
  const seen = new Set(), data = { elements: [] };
  const todo = [cells]; let done = 0;
  while (todo.length) {
    const batch = todo.shift();
    const q = `[out:json][timeout:${WAIT - 10}];(${batch.map(c => clauses(llb(...c))).join('')});out geom qt;`;
    const label = cells.length > batch.length ? `Downloading map data (${done + batch.length} / ${cells.length} squares)…` : 'Downloading map data…';
    let part;
    try { part = await fetchOverpass(q, label, onStatus); }
    catch (err) { // (too much for the server in one go: in two halves; anything else (no answer, busy) is final)
      if (batch.length < 2 || !/ran out of time|error 50[34]/.test(err.message)) throw err;
      const h = Math.ceil(batch.length / 2); todo.unshift(batch.slice(0, h), batch.slice(h)); continue;
    }
    done += batch.length;
    for (const el of part.elements || []) { const id = el.type + el.id; if (!seen.has(id)) { seen.add(id); data.elements.push(el); } }
  }
  onStatus && onStatus('Building the neighbourhood…');
  const res = parseOSM(geo, data, bboxLocal, opts.rank ? { rank: opts.rank } : {});
  if (opts.line && opts.rank) { // (the squares' corners reach past the strip: buildings and trees only inside it)
    const r2 = (m + 15) ** 2, cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
    res.buildings = res.buildings.filter(b => opts.rank(...cen(b.p)) < r2);
    res.trees = res.trees.filter(t => opts.rank(t[0], t[1]) < r2);
  }
  if (opts.roads) res.ways = osmWays(data, geo, { driveways: !!opts.driveways });
  if (opts.water) res.water = waterPolys(data.elements, geo, bboxLocal); // (lakes come whole: their full shoreline, however far it runs)
  if (opts.street) { // (signs, poles, lines... streetdata.js: the points within the strip, the lines whole)
    const st = streetFeatures(data.elements, geo), r2 = opts.rank ? (m + 15) ** 2 : Infinity, near = (p) => !opts.rank || opts.rank(p[0], p[1]) < r2;
    for (const k of Object.keys(st)) st[k] = st[k].filter(f => f.pts ? f.pts.some(near) : near(f));
    res.street = st;
  }
  return res;
}

// Overpass JSON (out geom) -> the track's imported scenery { buildings, trees, bbox }
// (also used by the real-circuit importer in tools/tracks, which passes rank(x, z) = distance to the track
//  so a big area keeps the buildings / trees nearest the road rather than nearest the middle, and its own tree budget)
export function parseOSM(geo, data, bboxLocal, { rank = null, maxTrees = 8000, step = 11 } = {}) {
  const [x0, z0, x1, z1] = bboxLocal;
  const buildings = [], trees = [], woods = [];
  const R = (v) => Math.round(v * 10) / 10;
  for (const el of data.elements || []) {
    if (el.type === 'node' && el.tags && el.tags.natural === 'tree') { const [x, z] = toLocal(geo, el.lat, el.lon); trees.push([R(x), R(z)]); continue; }
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.map(g => { const [x, z] = toLocal(geo, g.lat, g.lon); return [R(x), R(z)]; });
    const tags = el.tags || {};
    if (tags.natural === 'tree_row') {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < L; d += 8) trees.push([R(a[0] + (b[0] - a[0]) * d / L), R(a[1] + (b[1] - a[1]) * d / L)]);
      }
      continue;
    }
    if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    if (tags.building) {
      const area = Math.abs(polyArea(pts));
      if (area < 12) continue;
      const levels = num(tags['building:levels']);
      const lv = isFinite(levels) ? levels : 0;
      const style = classify(tags, area, lv);
      let h = num(tags.height); const hk = isFinite(h) || lv > 0 ? 1 : 0; // (hk: the map says how tall it is)
      if (!isFinite(h)) h = lv ? lv * 3.2 + (style === 'house' ? 0 : 1) : DEFAULT_H[style] * (0.8 + Math.random() * 0.4);
      h = Math.max(3, Math.min(400, h));
      // pitched roof for small, rectangular houses
      let roof = 'flat', p = pts;
      if (style === 'house' && pts.length <= 8) {
        const rect = orientedRect(pts);
        if (rect && area / rect.area > 0.82 && rect.len < 30) { roof = 'gable'; p = rect.corners.map(c => [R(c[0]), R(c[1])]); }
      }
      if (p.length > 40) p = p.filter((_, i) => i % Math.ceil(p.length / 40) === 0);
      // (u: what it's for, from the map: a supermarket, a fuel station, a church... for the models of common places)
      const u = tags.shop || tags.amenity || tags.leisure || (tags.building !== 'yes' && tags.building) || undefined;
      buildings.push({ p, h: Math.round(h * 10) / 10, s: style, r: roof, ...(hk ? { hk } : {}), ...(u ? { u } : {}) });
    } else if (tags.natural === 'wood' || tags.landuse === 'forest') woods.push(pts);
  }
  // scatter trees inside woods
  let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const poly of woods) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const q of poly) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    a = Math.max(a, x0); b = Math.min(b, x1); c = Math.max(c, z0); d = Math.min(d, z1);
    for (let x = a; x < b; x += step) for (let z = c; z < d; z += step) {
      const px = x + (rnd() - 0.5) * step * 0.73, pz = z + (rnd() - 0.5) * step * 0.73;
      if (pointInPoly(px, pz, poly)) trees.push([R(px), R(pz)]);
      if (trees.length > (rank ? 120000 : 9000)) break;
    }
  }
  // keep the ones closest to the middle if the area is huge
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const d2 = rank ? (p) => rank(p[0], p[1]) : (p) => (p[0] - cx) ** 2 + (p[1] - cz) ** 2;
  if (buildings.length > 6000) { buildings.sort((u, v) => d2(u.p[0]) - d2(v.p[0])); buildings.length = 6000; }
  if (trees.length > maxTrees) { const k = trees.map(t => [d2(t), t]).sort((u, v) => u[0] - v[0]); trees.length = 0; for (let i = 0; i < maxTrees; i++) trees.push(k[i][1]); }
  return { buildings, trees, bbox: bboxLocal, date: Date.now() };
}
