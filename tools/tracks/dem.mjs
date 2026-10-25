// Bare-earth ground heights for the road itself, from national laser-scan (LiDAR) terrain models.
// The global elevation tiles the game uses for the hills are surface models at ~30 m: they measure roofs and
// treetops, and blur a quay into the cliff behind it (Monaco's start straight came out climbing 20 m; Spa's last
// chicane had a dip that isn't there). These services give the ground under the road to 0.5-5 m.
//   wallonia: Service public de Wallonie, MNT 2021-2022 LiDAR, 0.5 m (Belgium: Spa)
//   ign:      IGN RGE ALTI, 1 m (France + Monaco)
//   gsi:      Geospatial Information Authority of Japan, 5 m laser DEM (dem5a), 10 m fallback
//   usgs:     USGS 3DEP via its image service in ~440 m tiles, 1-10 m (USA)
//   ahn:      Actueel Hoogtebestand Nederland, AHN4 0.5 m ground model (DTM), via the AHN viewer's image service (Netherlands)
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
  ahn: 'Relief: AHN (Actueel Hoogtebestand Nederland)',
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

export const SOURCES = { // (exported for checks)
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
  async ahn(pts) {
    const out = new Array(pts.length).fill(null);
    await pool(pts, 6, async (p, k) => {
      const g = encodeURIComponent(JSON.stringify({ x: p.lon, y: p.lat, spatialReference: { wkid: 4326 } }));
      let j; try { j = await getJSON(`https://ahn.arcgisonline.nl/arcgis/rest/services/AHNviewer/AHN4_DTM_50cm/ImageServer/identify?geometry=${g}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`); } catch (e) { out[k] = undefined; return; }
      const v = parseFloat(j.value); out[k] = isFinite(v) && v > -100 ? v : null; // ('NoData' under buildings / water)
    });
    return out;
  },
  async usgs(pts) {
    // The 3DEP image service in tiles (the point service answers one point a request, 5-20 s each under load: an
    // hour for a circuit's few thousand): 0.004 deg square (~440 m), 256 px (~1.7 m), as the game's LiDAR tiles get
    // it (js/lidar.js), each point read off its tile bilinearly. (A tile that keeps failing: its points come back
    // undefined, not cached, and a rerun fetches them again)
    const D = 0.004, PX = 256, out = new Array(pts.length).fill(null), tiles = new Map();
    pts.forEach((p, k) => { const t = Math.floor(p.lat / D) + ',' + Math.floor(p.lon / D); if (!tiles.has(t)) tiles.set(t, []); tiles.get(t).push(k); });
    await pool([...tiles.entries()], 6, async ([t, ks]) => {
      const [a, b] = t.split(',').map(Number), S = a * D, W = b * D, N = S + D, E = W + D, px = D / PX;
      const url = `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=${W},${S},${E},${N}&bboxSR=4326&imageSR=4326&size=${PX},${PX}&format=bsq&pixelType=F32&noData=-9999&interpolation=RSP_BilinearInterpolation&f=image`;
      let f = null;
      for (let k = 0; k < 5 && !f; k++) {
        try { const r = await fetch(url, { headers: { 'User-Agent': 'SanVelocitaGP-track-importer/1.0' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < PX * PX * 4) throw new Error('short tile');
          f = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + PX * PX * 4)); }
        catch (e) { await new Promise(res => setTimeout(res, 1000 * 2 ** k)); }
      }
      for (const k of ks) {
        if (!f) { out[k] = undefined; continue; }
        const p = pts[k], c = Math.max(0, Math.min(PX - 1.001, (p.lon - W) / px - 0.5)), r = Math.max(0, Math.min(PX - 1.001, (N - p.lat) / px - 0.5));
        const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, v = (i, j) => f[(r0 + j) * PX + c0 + i];
        const q = [v(0, 0), v(1, 0), v(0, 1), v(1, 1)];
        out[k] = q.some(x => !(x > -1000)) ? (q.find(x => x > -1000) ?? null) : (q[0] * (1 - fc) + q[1] * fc) * (1 - fr) + (q[2] * (1 - fc) + q[3] * fc) * fr;
      }
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
    let miss = 0;
    need.forEach((p, k) => { if (got[k] === undefined) miss++; else cache[key(p)] = got[k]; });
    saveCache(src, cache);
    if (miss) log(`  ground heights: ${miss} points failed to load (rerun to fetch them)`);
  }
  return pts.map(p => cache[key(p)] ?? null);
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
