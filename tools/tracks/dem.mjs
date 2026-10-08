// Bare-earth ground heights for the road itself, from national laser-scan (LiDAR) terrain models.
// The global elevation tiles the game uses for the hills are surface models at ~30 m: they measure roofs and
// treetops, and blur a quay into the cliff behind it (Monaco's start straight came out climbing 20 m; Spa's last
// chicane had a dip that isn't there). These services give the ground under the road to 0.5-5 m.
//   wallonia: Service public de Wallonie, MNT 2021-2022 LiDAR, 0.5 m (Belgium: Spa)
//   ign:      IGN RGE ALTI, 1 m (France + Monaco)
//   gsi:      Geospatial Information Authority of Japan, 5 m laser DEM (dem5a), 10 m fallback
//   usgs:     USGS 3DEP via the Elevation Point Query Service, 1-10 m (USA)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
export const DEM_CREDITS = {
  wallonia: 'Relief: Service public de Wallonie (MNT LiDAR 2021-2022)',
  ign: 'Relief: IGN RGE ALTI',
  gsi: 'Relief: 国土地理院 (GSI Japan)',
  usgs: 'Relief: USGS 3D Elevation Program',
};

const key = (p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
function loadCache(src) { try { return JSON.parse(fs.readFileSync(path.join(CACHE, `dem-${src}.json`), 'utf8')); } catch (e) { return {}; } }
function saveCache(src, c) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(path.join(CACHE, `dem-${src}.json`), JSON.stringify(c)); }

async function getJSON(url, tries = 4) {
  for (let k = 0; ; k++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'SanVelocitaGP-track-importer/1.0' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (k >= tries) throw e; await new Promise(res => setTimeout(res, 800 * (k + 1))); }
  }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

const SOURCES = {
  async ign(pts) {
    const out = [];
    for (let a = 0; a < pts.length; a += 40) {
      const part = pts.slice(a, a + 40);
      const j = await getJSON(`https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${part.map(p => p.lon.toFixed(7)).join('|')}&lat=${part.map(p => p.lat.toFixed(7)).join('|')}&resource=ign_rge_alti_wld&zonly=true`);
      out.push(...j.elevations.map(v => (v > -1000 ? v : null)));
    }
    return out;
  },
  async wallonia(pts) {
    const out = new Array(pts.length).fill(null);
    await pool(pts, 6, async (p, k) => {
      const u = `https://geoservices.wallonie.be/arcgis/rest/services/RELIEF/WALLONIE_MNT_2021_2022/MapServer/identify?geometry=${p.lon},${p.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1&mapExtent=${p.lon - 0.01},${p.lat - 0.01},${p.lon + 0.01},${p.lat + 0.01}&imageDisplay=800,800,96&returnGeometry=false&f=json`;
      const j = await getJSON(u); const v = j.results && j.results[0] && parseFloat(j.results[0].attributes['Stretch.Pixel Value']);
      out[k] = isFinite(v) ? v : null;
    });
    return out;
  },
  async usgs(pts) {
    const out = new Array(pts.length).fill(null);
    await pool(pts, 6, async (p, k) => {
      const j = await getJSON(`https://epqs.nationalmap.gov/v1/json?x=${p.lon}&y=${p.lat}&units=Meters&wkid=4326`);
      const v = parseFloat(j.value); out[k] = isFinite(v) && v > -1000 ? v : null;
    });
    return out;
  },
  async gsi(pts) {
    const tiles = new Map(), out = [];
    const tile = async (name, z, x, y) => {
      const k = `${name}/${z}/${x}/${y}`;
      if (!tiles.has(k)) tiles.set(k, (async () => {
        const f = path.join(CACHE, 'gsi', `${name}_${z}_${x}_${y}.png`);
        let buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
        if (!buf) {
          const r = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/${name}/${z}/${x}/${y}.png`);
          if (!r.ok) return null;
          buf = Buffer.from(await r.arrayBuffer()); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
        }
        return decodePNG(buf);
      })());
      return tiles.get(k);
    };
    // the 5 m laser model where there is one, else the 10 m one
    for (const p of pts) {
      let v = null;
      for (const [name, z] of [['dem5a_png', 15], ['dem10b_png', 14]]) {
        const n = 2 ** z, fx = ((p.lon + 180) / 360) * n * 256, r = (p.lat * Math.PI) / 180;
        const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * 256;
        const img = await tile(name, z, Math.floor(fx / 256), Math.floor(fy / 256)); if (!img) continue;
        const px = Math.floor(fx) % 256, py = Math.floor(fy) % 256, o = (py * img.w + px) * img.ch;
        const x = img.px[o] * 65536 + img.px[o + 1] * 256 + img.px[o + 2];
        if (x === 8388608) continue; // no data
        v = (x < 8388608 ? x : x - 16777216) * 0.01; break;
      }
      out.push(v);
    }
    return out;
  },
};

// heights (m above sea level, null where the service has none) for [{ lat, lon }]
export async function groundHeights(src, pts, log = () => {}) {
  if (!SOURCES[src]) throw new Error('unknown ground source ' + src);
  const cache = loadCache(src), need = pts.filter(p => !(key(p) in cache));
  if (need.length) {
    log(`  ground heights: ${need.length} points from ${src}…`);
    const got = await SOURCES[src](need);
    need.forEach((p, k) => { cache[key(p)] = got[k]; });
    saveCache(src, cache);
  }
  return pts.map(p => cache[key(p)]);
}

// minimal PNG decoder (8-bit RGB / RGBA, non-interlaced: what tile servers send)
function decodePNG(buf) {
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!ch) throw new Error('unsupported PNG colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, ch, px };
}
