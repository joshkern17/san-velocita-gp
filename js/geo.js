// Real-world maps: projection, map tiles, place search and OpenStreetMap import.
// Local track coordinates are metres: +x = east, +z = south, origin = track.geo.
import { polyArea, pointInPoly, orientedRect } from './zones.js';

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

export async function importOSM(geo, bboxLocal, opts, onStatus) {
  const [x0, z0, x1, z1] = bboxLocal;
  const [n, w] = toLatLon(geo, x0, z0), [s, e] = toLatLon(geo, x1, z1);
  const bb = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
  const parts = [];
  if (opts.buildings) parts.push(`way["building"](${bb});`);
  if (opts.trees) parts.push(`node["natural"="tree"](${bb});`, `way["natural"="wood"](${bb});`, `way["landuse"="forest"](${bb});`, `way["natural"="tree_row"](${bb});`);
  const q = `[out:json][timeout:90];(${parts.join('')});out geom qt;`;
  let data = null, lastErr = null;
  for (let k = 0; k < ENDPOINTS.length && !data; k++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 35000);
    try {
      onStatus && onStatus(k === 0 ? 'Downloading map data…' : `Server busy — trying backup ${k}/${ENDPOINTS.length - 1}…`);
      const r = await fetch(ENDPOINTS[k], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 429 ? 'Map servers are busy — try again in a minute' : 'Map server error ' + r.status);
      onStatus && onStatus('Reading map data…');
      data = await r.json();
    } catch (err) { lastErr = err.name === 'AbortError' ? new Error('Map servers timed out — try a smaller area or try again') : err; }
    clearTimeout(timer);
  }
  if (!data) throw lastErr || new Error('Could not reach the map server');
  onStatus && onStatus('Building the neighbourhood…');

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
      let h = num(tags.height);
      if (!isFinite(h)) h = lv ? lv * 3.2 + (style === 'house' ? 0 : 1) : DEFAULT_H[style] * (0.8 + Math.random() * 0.4);
      h = Math.max(3, Math.min(400, h));
      // pitched roof for small, rectangular houses
      let roof = 'flat', p = pts;
      if (style === 'house' && pts.length <= 8) {
        const rect = orientedRect(pts);
        if (rect && area / rect.area > 0.82 && rect.len < 30) { roof = 'gable'; p = rect.corners.map(c => [R(c[0]), R(c[1])]); }
      }
      if (p.length > 40) p = p.filter((_, i) => i % Math.ceil(p.length / 40) === 0);
      buildings.push({ p, h: Math.round(h * 10) / 10, s: style, r: roof });
    } else if (tags.natural === 'wood' || tags.landuse === 'forest') woods.push(pts);
  }
  // scatter trees inside woods
  let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const poly of woods) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const q of poly) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    a = Math.max(a, x0); b = Math.min(b, x1); c = Math.max(c, z0); d = Math.min(d, z1);
    for (let x = a; x < b; x += 11) for (let z = c; z < d; z += 11) {
      const px = x + (rnd() - 0.5) * 8, pz = z + (rnd() - 0.5) * 8;
      if (pointInPoly(px, pz, poly)) trees.push([R(px), R(pz)]);
      if (trees.length > 9000) break;
    }
  }
  // keep the ones closest to the middle if the area is huge
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const d2 = (p) => (p[0] - cx) ** 2 + (p[1] - cz) ** 2;
  if (buildings.length > 6000) { buildings.sort((u, v) => d2(u.p[0]) - d2(v.p[0])); buildings.length = 6000; }
  if (trees.length > 8000) { trees.sort((u, v) => d2(u) - d2(v)); trees.length = 8000; }
  return { buildings, trees, bbox: bboxLocal, date: Date.now() };
}
