// A real place's ground, coloured like it is: open aerial photos -> a 2 m colour map in track metres, in the game's
// own ground colours (js/world.js groundMaterial picks grass, dry grass, sand, earth or grey textures from them), so
// the dune grass, sand, car parks and woods round a circuit sit where they really are. Nothing of the photo's detail
// ends up in the game: cars, lines and shadows are smoothed out and the colours cut down to a small palette.
// The editor's MAP tab runs it (Ground From Photo), and tools/tracks/ground.mjs for the importer.
//   track.ground = { x0, z0, res, w, h, img: PNG data URL, credit }

const M_LAT = 110574, mLon = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
const R = 6378137; // (Web Mercator: zoom 17 is ~0.7 m a pixel at 50°, plenty for a 2 m map; 16 will do)
export const GROUND_RES = 2, GROUND_MARGIN = 560; // m a texel; m round the track (the game lays its ground 520 m out)
const COLOURS = 20;

// a tile's corners in Web Mercator metres (n x n tiles from x, y at zoom z)
function tileBox(x, y, n, z) {
  const s = 2 * Math.PI * R / 2 ** z, x0 = -Math.PI * R + x * s, y1 = Math.PI * R - y * s;
  return [x0, y1 - n * s, x0 + n * s, y1];
}
const arcgis = (base, rule) => (x, y, n, z) => `${base}/exportImage?bbox=${tileBox(x, y, n, z).join(',')}&bboxSR=3857&imageSR=3857&size=${256 * n},${256 * n}&format=png&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: rule }))}&f=image`;
const wms = (base, layer) => (x, y, n, z) => `${base}/${layer}/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0&STYLES=&CRS=EPSG:3857&BBOX=${tileBox(x, y, n, z).join(',')}&WIDTH=${256 * n}&HEIGHT=${256 * n}&FORMAT=image/png`;
const xyz = (tpl) => (x, y, n, z) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer';
const WAL = 'https://geoservices.wallonie.be/arcgis/services/IMAGERIE';

// open aerial photos, each with its colour-infrared twin where there is one (R = near infrared, G = red, B = green:
// plants are bright in near infrared, so they separate from paving whatever their colour). block: tiles a request
// (the map services draw any box: fewer, bigger requests); z: the zoom its tiles go to; irMaybe: its infrared server
// is unreliable, so without it (it times out) the colours alone have to tell plants from paving
export const GROUND_PHOTOS = [
  { id: 'wallonia', name: 'Wallonia (Belgium)', box: [49.45, 2.8, 50.82, 6.45], block: 4, z: 17,
    rgb: wms(WAL, 'ORTHO_2024'), ir: wms(WAL, 'ORTHO_2024_IR'), credit: 'Ground: orthophotos 2024 © Service public de Wallonie' },
  { id: 'pdok', name: 'Netherlands', box: [50.74, 3.2, 53.7, 7.3], block: 1, z: 17,
    rgb: xyz('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg'),
    ir: xyz('https://service.pdok.nl/hwh/luchtfotocir/wmts/v1_0/Actueel_ortho25IR/EPSG:3857/{z}/{x}/{y}.jpeg'), credit: 'Ground: Luchtfoto Beeldmateriaal Nederland (PDOK)' },
  { id: 'usgs', name: 'USA', box: [24.4, -125, 49.5, -66.8], block: 1, z: 16, irMaybe: true,
    rgb: xyz('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'),
    ir: arcgis(NAIP, 'FalseColorComposite'), irBlock: 4, credit: 'Ground: USGS The National Map imagery, NAIP (USDA)' },
  { id: 'gsi', name: 'Japan', box: [24, 122.9, 46, 146], block: 1, z: 17, approx: true,
    rgb: xyz('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'), ir: null, credit: 'Ground: aerial photo GSI (Geospatial Information Authority of Japan)' },
];
export function groundSource(geo) {
  return geo ? GROUND_PHOTOS.find(s => geo.lat >= s.box[0] && geo.lat <= s.box[2] && geo.lon >= s.box[1] && geo.lon <= s.box[3]) || null : null;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tick = () => new Promise(r => setTimeout(r, 0));

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    const to = setTimeout(() => { im.src = ''; rej(new Error('photo server not answering')); }, 30000);
    im.onload = () => { clearTimeout(to); res(im); }; im.onerror = () => { clearTimeout(to); rej(new Error('photo tile failed')); };
    im.src = url;
  });
}
async function loadRetry(url) {
  for (let k = 0; ; k++) {
    try { return await loadImage(url); } catch (e) { if (k >= 2) throw e; await new Promise(r => setTimeout(r, 1200 * (k + 1))); }
  }
}

// geo: the track's origin; box: [x0, z0, x1, z1] in track metres. progress(msg). Returns track.ground.
export async function groundMap(geo, box, progress = () => {}) {
  const src = groundSource(geo);
  if (!src) throw new Error('No open aerial photos for this place yet (the Netherlands, Wallonia, the USA and Japan so far).');
  const res = GROUND_RES, mx = mLon(geo.lat), Z = src.z, n = 2 ** Z;
  const x0 = Math.floor(box[0]), z0 = Math.floor(box[1]);
  const W = Math.ceil((box[2] - x0) / res), H = Math.ceil((box[3] - z0) / res);
  // each texel centre -> global Mercator pixel
  const PX = new Float64Array(W), PY = new Float64Array(H);
  for (let i = 0; i < W; i++) PX[i] = ((geo.lon + (x0 + (i + 0.5) * res) / mx) + 180) / 360 * n * 256;
  for (let j = 0; j < H; j++) { const la = (geo.lat - (z0 + (j + 0.5) * res) / M_LAT) * Math.PI / 180; PY[j] = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n * 256; }
  const tx0 = Math.floor(Math.min(PX[0], PX[W - 1]) / 256) - 1, tx1 = Math.floor(Math.max(PX[0], PX[W - 1]) / 256) + 1;
  const ty0 = Math.floor(Math.min(PY[0], PY[H - 1]) / 256) - 1, ty1 = Math.floor(Math.max(PY[0], PY[H - 1]) / 256) + 1;
  const CW = (tx1 - tx0 + 1) * 256, CH = (ty1 - ty0 + 1) * 256;
  const mpp = 2 * Math.PI * R * Math.cos(geo.lat * Math.PI / 180) / (n * 256), rad = Math.max(1, Math.round(res / mpp / 2));
  const blocks = (B) => { const j = []; for (let ty = ty0; ty <= ty1; ty += B) for (let tx = tx0; tx <= tx1; tx += B) j.push([tx, ty]); return j; };
  const B = { rgb: src.block, ir: src.irBlock || src.block }, jobs = { rgb: blocks(B.rgb), ir: blocks(B.ir) };
  const total = jobs.rgb.length + (src.ir ? jobs.ir.length : 0); let done = 0;
  // each photo: the tiles drawn into one canvas, then each texel the average of the pixels it covers, then a median
  // over 5 texels (10 m): drops cars, lines and specks, keeps edges (a car park's, a wood's)
  const sample = async (kind) => {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d', { willReadFrequently: true });
    let next = 0;
    const worker = async () => {
      while (next < jobs[kind].length) {
        const [tx, ty] = jobs[kind][next++], b = B[kind];
        const im = await loadRetry(src[kind](tx, ty, b, Z));
        g.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256, 256 * b, 256 * b);
        progress(`Downloading aerial photos… ${Math.round(100 * ++done / total)}%`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const M = g.getImageData(0, 0, CW, CH).data, out = new Float32Array(W * H * 3);
    for (let j = 0; j < H; j++) {
      const cy = Math.floor(PY[j] - ty0 * 256);
      for (let i = 0; i < W; i++) {
        const cx = Math.floor(PX[i] - tx0 * 256); let r = 0, gg = 0, b = 0, k = 0;
        for (let dy = -rad; dy <= rad; dy++) { const y = cy + dy; if (y < 0 || y >= CH) continue;
          for (let dx = -rad; dx <= rad; dx++) { const x = cx + dx; if (x < 0 || x >= CW) continue; const q = (y * CW + x) * 4; r += M[q]; gg += M[q + 1]; b += M[q + 2]; k++; } }
        const o = (j * W + i) * 3; k = Math.max(1, k) * 255; out[o] = r / k; out[o + 1] = gg / k; out[o + 2] = b / k;
      }
    }
    progress('Smoothing out cars and lines…'); await tick();
    return median5(out, W, H);
  };
  const rgb = await sample('rgb');
  let ir = null;
  if (src.ir) {
    try {
      if (src.irMaybe) { progress('Asking for infrared photos…'); const [tx, ty] = jobs.ir[0]; await loadImage(src.ir(tx, ty, B.ir, Z)); } // (one try: is it up?)
      ir = await sample('ir');
    } catch (e) { if (!src.irMaybe) throw e; progress('No infrared photos today: going by color only…'); await tick(); }
  }
  progress('Painting the ground…'); await tick();
  const col = paint(rgb, ir, W * H);
  const pal = medianCut(col, W * H, COLOURS), idx = nearest(col, W * H, pal);
  const idx2 = mode5(idx, W, H, pal.length);
  const img = await palettePNG(idx2, W, H, pal);
  return { x0, z0, res, w: W, h: H, img, credit: src.credit, source: src.id, ir: !!ir };
}

// per channel, the median of the 5x5 texels round each one
function median5(a, W, H) {
  const out = new Float32Array(a.length), v = new Float32Array(25);
  for (let c = 0; c < 3; c++) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let k = 0;
    for (let dy = -2; dy <= 2; dy++) { const y = Math.min(H - 1, Math.max(0, j + dy));
      for (let dx = -2; dx <= 2; dx++) { const x = Math.min(W - 1, Math.max(0, i + dx)); const val = a[(y * W + x) * 3 + c];
        let p = k++; while (p > 0 && v[p - 1] > val) { v[p] = v[p - 1]; p--; } v[p] = val; } }
    out[(j * W + i) * 3 + c] = v[12];
  }
  return out;
}

// The game's own ground colours (the vertex colours js/world.js gives the 'grass' theme), picked per texel from what
// the photo shows there, each shaded by how bright the photo is against the usual for that kind of ground. (Measured
// on Zandvoort's summer flight: dune grass ndvi ~0.2, playing fields and woods ~0.32, paving and roofs ~0, water below
// -0.1; beach and blown sand near white, asphalt and concrete mid grey.)
const GRASS = [0.36, 0.51, 0.2], DRY = [0.46, 0.48, 0.26], SAND = [0.82, 0.64, 0.42], WOOD = [0.22, 0.36, 0.14];
function paint(rgb, ir, N) {
  const lum = new Float32Array(N), veg = new Float32Array(N), lush = new Float32Array(N), sandy = new Float32Array(N);
  for (let o = 0; o < N; o++) {
    const r = rgb[o * 3], g = rgb[o * 3 + 1], b = rgb[o * 3 + 2];
    lum[o] = 0.3 * r + 0.55 * g + 0.15 * b;
    const ndvi = ir ? (ir[o * 3] - ir[o * 3 + 1]) / Math.max(1e-3, ir[o * 3] + ir[o * 3 + 1]) : (2 * g - r - b) / Math.max(1e-3, 2 * g + r + b) * 3; // (no infrared: green over red and blue)
    veg[o] = smooth(0.02, 0.1, ndvi); lush[o] = smooth(0.2, 0.32, ndvi);
    rgb[o * 3] = ndvi; // (kept for wet below)
  }
  const med = (mask) => { // median brightness where mask > 0.5 (a 256-bin histogram)
    const h = new Uint32Array(256); let k = 0;
    for (let o = 0; o < N; o++) if (mask[o] > 0.5) { h[Math.min(255, lum[o] * 255 | 0)]++; k++; }
    if (k < 50) { for (let o = 0; o < N; o++) h[Math.min(255, lum[o] * 255 | 0)]++; k = N; }
    let s = 0; for (let i = 0; i < 256; i++) { s += h[i]; if (s * 2 >= k) return (i + 0.5) / 255; } return 0.5;
  };
  // (brightness against the photo's own usual, so a brighter or darker flight sets itself: woods against its plants,
  // sand against its bare ground. Zandvoort: plants ~0.46, woods ~0.31; bare ground ~0.65, sand from ~0.72)
  const mV = med(veg), bareM = new Float32Array(N);
  for (let o = 0; o < N; o++) bareM[o] = 1 - veg[o];
  const mB = med(bareM);
  for (let o = 0; o < N; o++) sandy[o] = smooth(1.08 * mB, 1.23 * mB, lum[o]) * (1 - veg[o]); // bare and near white: sand
  const mS = med(sandy), out = new Float32Array(N * 3);
  for (let o = 0; o < N; o++) {
    const L = lum[o], ndvi = rgb[o * 3];
    const sv = Math.pow(Math.min(1.3, Math.max(0.6, L / mV)), 0.7), ss = Math.pow(Math.min(1.1, Math.max(0.85, L / mS)), 0.7);
    const dark = smooth(0.84 * mV, 0.67 * mV, L) * lush[o];              // a wood seen from above: dark and green
    const wet = smooth(-0.08, -0.15, ndvi) * (1 - sandy[o]);             // water (OSM's is drawn over it): its banks' green
    for (let c = 0; c < 3; c++) {
      let plant = (DRY[c] + (GRASS[c] - DRY[c]) * lush[o]) * sv;
      plant += (WOOD[c] - plant) * dark;
      let bare = (0.12 + 0.5 * L) * (c === 2 ? 1.04 : 1);
      bare += (WOOD[c] * 1.3 - bare) * wet;
      bare += (SAND[c] * ss - bare) * sandy[o];
      out[o * 3 + c] = Math.min(1, Math.max(0, bare + (plant - bare) * veg[o]));
    }
  }
  return out;
}

// a palette of k colours (median cut over a sample), 0..255
function medianCut(col, N, k) {
  const step = Math.max(1, Math.floor(N / 60000)), pts = [];
  for (let o = 0; o < N; o += step) pts.push([col[o * 3] * 255, col[o * 3 + 1] * 255, col[o * 3 + 2] * 255]);
  let boxes = [pts];
  while (boxes.length < k) {
    let bi = -1, bc = 0, br = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 1e9, hi = -1e9; for (const p of b) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); } if (hi - lo > br) { br = hi - lo; bi = i; bc = c; } } });
    if (bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[bc] - q[bc]), m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.map(b => { const s = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c]; return s.map(v => Math.round(v / b.length)); });
}
function nearest(col, N, pal) {
  const idx = new Uint8Array(N);
  for (let o = 0; o < N; o++) {
    const r = col[o * 3] * 255, g = col[o * 3 + 1] * 255, b = col[o * 3 + 2] * 255; let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) { const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2; if (d < bd) { bd = d; best = i; } }
    idx[o] = best;
  }
  return idx;
}
// the commonest colour of the 5x5 round each texel (a lone stray one goes with its neighbours)
function mode5(idx, W, H, K) {
  const out = new Uint8Array(idx.length), cnt = new Uint8Array(K);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    cnt.fill(0); let best = idx[j * W + i], bc = 1;
    for (let dy = -2; dy <= 2; dy++) { const y = j + dy; if (y < 0 || y >= H) continue;
      for (let dx = -2; dx <= 2; dx++) { const x = i + dx; if (x < 0 || x >= W) continue; const v = idx[y * W + x]; if (++cnt[v] > bc) { bc = cnt[v]; best = v; } } }
    out[j * W + i] = best;
  }
  return out;
}

// an 8-bit palette PNG as a data URL (a third the size of the canvas's own full-colour one)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  let c = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0); return out;
}
async function palettePNG(idx, W, H, pal) {
  const raw = new Uint8Array((W + 1) * H);
  for (let j = 0; j < H; j++) raw.set(idx.subarray(j * W, (j + 1) * W), j * (W + 1) + 1); // (filter 0 each row)
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const hd = new Uint8Array(13), dv = new DataView(hd.buffer); dv.setUint32(0, W); dv.setUint32(4, H); hd[8] = 8; hd[9] = 3;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('PLTE', new Uint8Array(pal.flat())), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(bin);
}
