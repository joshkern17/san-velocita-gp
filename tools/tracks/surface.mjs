// What the ground beside a real circuit is made of: paved runoff, gravel traps, grass. From open aerial photos
// (classified per 1 m cell: grey = paved, green = grass) with OSM's gravel traps on top, in a band either side of
// the road. The game lays its runoff out from this map instead of guessing it from the corners (js/runoff.js).
//   wallonia: Service public de Wallonie, 2024 summer flight, colour + colour infrared (~0.25 m), open licence
// The photos are only read here; nothing of them ends up in the game but the surface classes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache', 'ortho');
export const ORTHO_CREDITS = {
  wallonia: 'Runoff: orthophotos 2024 © Service public de Wallonie',
};
export const S_NONE = 0, S_PAVED = 1, S_GRAVEL = 2, S_GRASS = 3;

const M_LAT = 110574, mLon = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
const TILE_M = 500, TILE_PX = 1024; // ~0.49 m per pixel

// rgb: the colour photo; ir: the same flight in colour infrared (R = near infrared, G = red, B = green), so plants
// (bright in near infrared) separate from paving whatever their colour. Summer flights: leaves on, grass green.
const wms = (base, layer) => (s, w, n, e) => `${base}/${layer}/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:4326&BBOX=${s},${w},${n},${e}&WIDTH=${TILE_PX}&HEIGHT=${TILE_PX}&FORMAT=image/png`;
const WAL = 'https://geoservices.wallonie.be/arcgis/services/IMAGERIE';
const SOURCES = {
  wallonia: { tag: 'wal2024', rgb: wms(WAL, 'ORTHO_2024'), ir: wms(WAL, 'ORTHO_2024_IR') },
};

// tiles on a fixed lat/lon grid (so the cache is shared between builds): ~500 m square at this latitude
function tileGrid(lat) { const la = Math.round(lat); return { dLat: TILE_M / M_LAT, dLon: TILE_M / mLon(la) }; }

async function fetchTile(src, kind, G, ty, tx) {
  const f = path.join(CACHE, `${SOURCES[src].tag}_${kind}_${ty}_${tx}.png`);
  let buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
  if (!buf) {
    const s = ty * G.dLat, w = tx * G.dLon, url = SOURCES[src][kind](s.toFixed(7), w.toFixed(7), (s + G.dLat).toFixed(7), (w + G.dLon).toFixed(7));
    for (let k = 0; ; k++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'SanVelocitaGP-track-importer/1.0' } });
        if (!r.ok || !/png/.test(r.headers.get('content-type') || '')) throw new Error('HTTP ' + r.status);
        buf = Buffer.from(await r.arrayBuffer()); break;
      } catch (e) { if (k >= 3) throw e; await new Promise(res => setTimeout(res, 1500 * (k + 1))); }
    }
    fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, buf);
  }
  return decodePNG(buf);
}

// one spot -> a class (or none: trees, shadow, roofs, anything else). rgb: the photo's colour; nir, red: its
// infrared twin's near infrared and red. Plants: NDVI over 0.2 (paving, gravel and roofs sit below 0); trees are the
// dark plants (grass in sun is twice as bright as a canopy seen from above).
function classify(r, g, b, nir, red) {
  const ndvi = (nir - red) / Math.max(1, nir + red), v = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (v - mn) / Math.max(1, v);
  if (ndvi > 0.2) return v >= 78 ? S_GRASS : S_NONE;
  if (ndvi > 0.08 || v < 85) return S_NONE;                     // scrub, mixed, shadow (filled in from around it)
  if (sat > 0.42) return S_PAVED;                               // painted runoff (Spa's red / yellow / teal stripes)
  if (v > 150 && r - b > 22 && sat > 0.16) return S_GRAVEL;     // light, warm and unpaved: a gravel trap
  if (sat < 0.2 || v > 200) return S_PAVED;                     // asphalt, concrete, the lines painted on them
  return S_NONE;
}

// line: [{ lat, lon }] the circuit's centreline; geo: the track's origin (game metres = toLocal(geo, ...));
// osm: Overpass elements around it (gravel traps + buildings); band: m either side of the centre line.
export async function surfaceMap(src, geo, line, osm, { band = 90, res = 1, log = () => {}, debug = false } = {}) {
  if (!SOURCES[src]) throw new Error('unknown photo source ' + src);
  const mx = mLon(geo.lat);
  const toL = (lat, lon) => [(lon - geo.lon) * mx, -(lat - geo.lat) * M_LAT];
  const P = line.map(p => toL(p.lat, p.lon));
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 = Math.floor(x0 - band - 2); z0 = Math.floor(z0 - band - 2); x1 = Math.ceil(x1 + band + 2); z1 = Math.ceil(z1 + band + 2);
  const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res);
  // the band: discs stamped along the line every 2 m
  const inBand = new Uint8Array(W * H), rc = Math.ceil(band / res);
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 2));
    for (let j = 0; j < k; j++) {
      const cx = Math.round((a[0] + (b[0] - a[0]) * j / k - x0) / res), cz = Math.round((a[1] + (b[1] - a[1]) * j / k - z0) / res);
      for (let dz = -rc; dz <= rc; dz++) {
        const z = cz + dz; if (z < 0 || z >= H) continue;
        const w = Math.floor(Math.sqrt(rc * rc - dz * dz));
        inBand.fill(1, z * W + Math.max(0, cx - w), z * W + Math.min(W - 1, cx + w) + 1);
      }
    }
  }
  // the photo tiles the band touches
  const G = tileGrid(geo.lat), need = new Map();
  for (let z = 0; z < H; z += 20) for (let x = 0; x < W; x += 20) {
    if (!inBand[z * W + x]) continue;
    const lat = geo.lat - (z0 + z * res) / M_LAT, lon = geo.lon + (x0 + x * res) / mx;
    for (const [dy, dx] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
      const ty = Math.floor((lat + dy * 20 * res / M_LAT) / G.dLat), tx = Math.floor((lon + dx * 20 * res / mx) / G.dLon);
      need.set(ty + ',' + tx, [ty, tx]);
    }
  }
  log(`  surface: ${need.size} photo tiles (${src})…`);
  const tiles = new Map();
  for (const [k, [ty, tx]] of need) tiles.set(k, { rgb: await fetchTile(src, 'rgb', G, ty, tx), ir: await fetchTile(src, 'ir', G, ty, tx) });
  // classify: each 1 m cell from the pixels it covers (a vote, so a white line or a car doesn't decide it)
  const cls = new Uint8Array(W * H), photo = debug ? new Uint8Array(W * H * 3) : null;
  const sub = 3, votes = new Uint8Array(4);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const o = z * W + x; if (!inBand[o]) continue;
    votes.fill(0);
    for (let sz = 0; sz < sub; sz++) for (let sx = 0; sx < sub; sx++) {
      const lat = geo.lat - (z0 + (z + (sz + 0.5) / sub) * res) / M_LAT, lon = geo.lon + (x0 + (x + (sx + 0.5) / sub) * res) / mx;
      const ty = Math.floor(lat / G.dLat), tx = Math.floor(lon / G.dLon), t = tiles.get(ty + ',' + tx); if (!t) continue;
      const img = t.rgb, ir = t.ir;
      const px = Math.min(img.w - 1, Math.floor((lon / G.dLon - tx) * img.w)), py = Math.min(img.h - 1, Math.floor((1 - (lat / G.dLat - ty)) * img.h));
      const q = (py * img.w + px) * img.ch, qi = (py * ir.w + px) * ir.ch;
      votes[classify(img.px[q], img.px[q + 1], img.px[q + 2], ir.px[qi], ir.px[qi + 1])]++;
      if (photo && sz === 1 && sx === 1) { photo[o * 3] = img.px[q]; photo[o * 3 + 1] = img.px[q + 1]; photo[o * 3 + 2] = img.px[q + 2]; }
    }
    let best = 0; for (let c = 1; c < 4; c++) if (votes[c] > votes[best]) best = c;
    cls[o] = votes[best] * 2 >= sub * sub - votes[0] && votes[best] >= 3 ? best : S_NONE;
  }
  // OSM: gravel traps are gravel whatever the photo says; buildings are nothing (a grey roof isn't runoff)
  const polys = (pred) => osm.filter(el => el.type === 'way' && el.geometry && el.geometry.length > 3 && pred(el.tags || {})).map(el => el.geometry.map(g => toL(g.lat, g.lon)));
  const isGravel = (t) => t.surface === 'gravel' || t.surface === 'sand' || t.surface === 'fine_gravel' || t.natural === 'sand' || t.natural === 'shingle' || t.landuse === 'gravel';
  const gravel = polys(isGravel), blds = polys(t => !!t.building);
  fillPolys(cls, inBand, W, H, x0, z0, res, gravel, S_GRAVEL);
  fillPolys(cls, inBand, W, H, x0, z0, res, blds, S_NONE);
  // clean-up: a 3x3 majority twice (single cells: a car, a line, a shadow edge); patches under 40 m² dropped (a
  // shadow across gravel, a car park's cars); what's left grows into the unknown cells next to it (shadows, cars) for
  // up to 6 m; then a 5x5 majority so the edges run smooth
  let a = cls, b = new Uint8Array(W * H);
  const majority = (r, need) => {
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const o = z * W + x; if (!inBand[o]) continue;
      votes.fill(0);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const zz = z + dz, xx = x + dx; if (zz >= 0 && zz < H && xx >= 0 && xx < W) votes[a[zz * W + xx]]++; }
      let best = a[o]; for (let c = 0; c < 4; c++) if (votes[c] >= need && votes[c] > votes[best]) best = c;
      b[o] = best;
    }
    [a, b] = [b, a];
  };
  majority(1, 5); majority(1, 5);
  dropSmall(a, inBand, W, H, Math.round(40 / (res * res)));
  for (let pass = 0; pass < Math.round(6 / res); pass++) {
    b.set(a);
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      const o = z * W + x; if (!inBand[o] || a[o]) continue;
      votes.fill(0); votes[a[o - 1]]++; votes[a[o + 1]]++; votes[a[o - W]]++; votes[a[o + W]]++;
      let best = 0; for (let c = 1; c < 4; c++) if (votes[c] > votes[best] || (best === 0 && votes[c])) best = c;
      b[o] = best;
    }
    [a, b] = [b, a];
  }
  majority(2, 13);
  // (OSM's gravel traps stay exactly as mapped)
  fillPolys(a, inBand, W, H, x0, z0, res, gravel, S_GRAVEL);
  for (let o = 0; o < W * H; o++) if (!inBand[o]) a[o] = S_NONE;
  const count = [0, 0, 0, 0]; for (let o = 0; o < W * H; o++) if (inBand[o]) count[a[o]]++;
  const tot = count.reduce((s, v) => s + v, 0) || 1;
  log(`  surface: ${W}x${H} m · paved ${(100 * count[1] / tot).toFixed(0)}% · gravel ${(100 * count[2] / tot).toFixed(0)}% (${gravel.length} OSM traps) · grass ${(100 * count[3] / tot).toFixed(0)}% · other ${(100 * count[0] / tot).toFixed(0)}%`);
  const out = { res, x0, z0, w: W, h: H, rle: encodeRLE(a) };
  if (debug) Object.defineProperty(out, 'photo', { value: photo });
  return out;
}

// patches of one class smaller than min cells (4-connected) become unknown
function dropSmall(a, inBand, W, H, min) {
  const seen = new Uint8Array(W * H), stack = [], comp = [];
  for (let o0 = 0; o0 < W * H; o0++) {
    if (seen[o0] || !inBand[o0] || !a[o0]) continue;
    const v = a[o0]; stack.length = 0; comp.length = 0; stack.push(o0); seen[o0] = 1;
    while (stack.length) {
      const o = stack.pop(); comp.push(o);
      const x = o % W;
      for (const n of [x > 0 ? o - 1 : -1, x < W - 1 ? o + 1 : -1, o - W, o + W]) if (n >= 0 && n < W * H && !seen[n] && a[n] === v) { seen[n] = 1; stack.push(n); }
    }
    if (comp.length < min) for (const o of comp) a[o] = 0;
  }
}

function fillPolys(cls, inBand, W, H, x0, z0, res, polys, v) {
  for (const p of polys) {
    let pz0 = Infinity, pz1 = -Infinity; for (const [, z] of p) { pz0 = Math.min(pz0, z); pz1 = Math.max(pz1, z); }
    for (let zi = Math.max(0, Math.floor((pz0 - z0) / res)); zi <= Math.min(H - 1, Math.ceil((pz1 - z0) / res)); zi++) {
      const zc = z0 + (zi + 0.5) * res, xs = [];
      for (let k = 0; k < p.length; k++) {
        const [ax, az] = p[k], [bx, bz] = p[(k + 1) % p.length];
        if ((az <= zc) !== (bz <= zc)) xs.push(ax + (zc - az) / (bz - az) * (bx - ax));
      }
      xs.sort((u, w) => u - w);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let xi = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5)); xi <= Math.min(W - 1, Math.floor((xs[k + 1] - x0) / res - 0.5)); xi++) {
          const o = zi * W + xi; if (inBand[o]) cls[o] = v;
        }
      }
    }
  }
}

// row-major classes as runs: [class, run length (varint)]..., base64 (js/runoff.js surfaceGrid reads it)
function encodeRLE(a) {
  const out = [];
  for (let o = 0; o < a.length;) {
    const v = a[o]; let n = 1; while (o + n < a.length && a[o + n] === v) n++;
    out.push(v); let m = n; while (m >= 128) { out.push((m & 127) | 128); m >>>= 7; } out.push(m);
    o += n;
  }
  return Buffer.from(out).toString('base64');
}

// minimal PNG decoder (8-bit RGB / RGBA / palette, non-interlaced)
function decodePNG(buf) {
  let o = 8, w = 0, h = 0, ct = 0, plte = null; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 3 ? 1 : 0; if (!bpp) throw new Error('unsupported PNG colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  if (ct !== 3) return { w, h, ch: bpp, px };
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { const p = px[i] * 3; rgb[i * 3] = plte[p]; rgb[i * 3 + 1] = plte[p + 1]; rgb[i * 3 + 2] = plte[p + 2]; }
  return { w, h, ch: 3, px: rgb };
}
