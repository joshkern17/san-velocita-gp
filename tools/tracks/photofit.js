// Runs in the bake page (bake.html): the road where the aerial photo has it. OSM's centre line can be a few metres
// off and its widths are guesses (Zandvoort's Tarzan came out 10 m wide and 3-4 m outside the real 15 m road), and the
// curbs, runoff and barriers are all measured from the road's edges. Across the road every 2 m, the photo is read from
// the middle outwards to each edge: where the asphalt meets something else (grass, sand, gravel, a curb's paint), or
// the painted white edge line when asphalt (paved runoff) carries on past it. The edges are median-filtered along the
// lap; the centre line moves to the middle of them and each point takes the width between them. Where the photo can't
// tell (trees over the road, a bridge, a tunnel, a shadow) the line is left as it was, easing in and out over ~30 m.
import { toLocal, toLatLon } from '../../js/geo.js';

// open national aerial photos (XYZ tiles, Web Mercator)
export const FIT_PHOTOS = {
  Netherlands: { z: 20, url: (z, x, y) => `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/${z}/${x}/${y}.jpeg`, credit: 'Luchtfoto: Beeldmateriaal Nederland (PDOK)' },
  Japan: { z: 18, url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`, credit: 'Aerial photo: GSI (Geospatial Information Authority of Japan)' },
};

const STEP = 2, SCAN = 0.2;

export async function photoFit(inp, log = () => {}) {
  const P = FIT_PHOTOS[inp.country];
  if (!P) return { line: inp.line, note: 'no open aerial photos for ' + inp.country };
  const geo = inp.geo, open = !!inp.open, Z = P.z, n = 2 ** Z;
  const widthOf = (f) => (f && f.w) || (inp.widths && f && f.n && inp.widths[f.n]) || inp.width || 13;
  // a point every 2 m along the line (with the OSM way it's on)
  const src = inp.line.map(p => { const [x, z] = toLocal(geo, p.lat, p.lon); return { x, z, f: p.f || {} }; });
  const D = [];
  const segs = open ? src.length - 1 : src.length;
  for (let i = 0; i < segs; i++) {
    const a = src[i], b = src[(i + 1) % src.length], l = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.round(l / STEP));
    for (let j = 0; j < k; j++) D.push({ x: a.x + (b.x - a.x) * j / k, z: a.z + (b.z - a.z) * j / k, f: b.f });
  }
  if (open) D.push({ ...src[src.length - 1] });
  const N = D.length, at = (i) => (open ? Math.max(0, Math.min(N - 1, i)) : ((i % N) + N) % N);
  // directions, from ±6 m
  for (let i = 0; i < N; i++) {
    const a = D[at(i - 3)], b = D[at(i + 3)]; let fx = b.x - a.x, fz = b.z - a.z; const l = Math.hypot(fx, fz) || 1;
    D[i].fx = fx / l; D[i].fz = fz / l; D[i].rx = -D[i].fz; D[i].rz = D[i].fx;
  }
  // ---- the photo's pixels ----
  const tiles = new Map();
  const tileXY = (x, z) => { const [lat, lon] = toLatLon(geo, x, z); const r = lat * Math.PI / 180; return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n]; };
  const load = (tx, ty) => new Promise((res) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const t = setTimeout(() => { img.src = ''; res(null); }, 30000); // (a tile that never comes is a gap, not a hang)
    img.onload = () => { clearTimeout(t); const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); res(g.getImageData(0, 0, 256, 256).data); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = P.url(Z, tx, ty);
  });
  const need = new Set();
  for (const d of D) { const w = widthOf(d.f) / 2 + 9; for (const s of [-w, 0, w]) { const [fx, fy] = tileXY(d.x + d.rx * s, d.z + d.rz * s); need.add(Math.floor(fx) + '/' + Math.floor(fy)); } }
  // (and the tiles between: the scan crosses them)
  for (const k of [...need]) { const [a, b] = k.split('/').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) need.add((a + dx) + '/' + (b + dy)); }
  const keys = [...need]; let done = 0;
  for (let k = 0; k < keys.length; k += 24) {
    await Promise.all(keys.slice(k, k + 24).map(async (key) => { const [a, b] = key.split('/').map(Number); tiles.set(key, await load(a, b)); done++; }));
    if (k % 480 === 0) log(`  photo fit: ${done} / ${keys.length} photo tiles`);
  }
  const rgb = (x, z) => {
    const [fx, fy] = tileXY(x, z), tx = Math.floor(fx), ty = Math.floor(fy), d = tiles.get(tx + '/' + ty);
    if (!d) return null; const o = ((Math.floor((fy - ty) * 256) * 256) + Math.floor((fx - tx) * 256)) * 4;
    return [d[o], d[o + 1], d[o + 2]];
  };
  // A asphalt (grey), W white paint, K curb paint, O anything else (grass, sand, gravel, dirt, a dark shadow)
  const cls = (c) => {
    if (!c) return 'O';
    const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    if (mn > 185 && sat < 0.16) return 'W';
    if ((r > 120 && r - g > 22 && r - b > 18 && g - b < 12) || (b > 110 && b - r > 30)) return 'K';
    if (sat < 0.13 && mx > 70 && mx < 200 && Math.abs(r - g) < 14) return 'A';
    // (asphalt tilted to the sky or in shade reads dark and blue-grey: Zandvoort's banked Hugenholtz)
    if (b >= g && g >= r && b - r < 45 && g - r < 25 && mx > 50 && mx < 200) return 'A';
    return 'O';
  };
  // ---- the edges, per point ----
  const EL = new Float32Array(N).fill(NaN), ER = new Float32Array(N).fill(NaN);
  const edge = (d, side, w0) => {
    const lim = w0 / 2 + 8, prof = [];
    for (let t = 0; t <= lim; t += SCAN) { const s = side * t; prof.push(cls(rgb(d.x + d.rx * s, d.z + d.rz * s))); }
    // the middle must be road: the first 2 m from the centre line mostly asphalt / lines
    let road = 0; for (let k = 0; k < 10; k++) if (prof[k] === 'A' || prof[k] === 'W') road++;
    if (road < 7) return NaN;
    // out to where non-road runs 0.8 m (4 px) or a curb starts
    let end = -1, lastW = -1, run = 0;
    for (let k = 0; k < prof.length; k++) {
      const c = prof[k];
      if (c === 'K') { end = k; break; }
      if (c === 'O') { if (++run >= 4) { end = k - run + 1; break; } } else run = 0;
      if (c === 'W' && k * SCAN > w0 * 0.25) lastW = k;
    }
    if (end < 0) end = prof.length; // (asphalt all the way: paved runoff, a pit lane beside: the white line, if any)
    // asphalt past the last white line for more than 1.5 m: that line is the edge (paved runoff beyond)
    if (lastW >= 0 && (end - lastW) * SCAN > 1.5) return (lastW + 1) * SCAN;
    if (end === prof.length) return NaN;
    return end * SCAN;
  };
  for (let i = 0; i < N; i++) {
    const d = D[i], w0 = widthOf(d.f);
    if (d.f.tun || d.f.layer) continue; // (a tunnel or a bridge: the photo shows what's over / under it)
    EL[i] = edge(d, -1, w0); ER[i] = edge(d, 1, w0);
  }
  // ---- median along the lap (±10 m), then keep only believable ones ----
  const med = (A, i, r) => { const w = []; for (let k = -r; k <= r; k++) { const v = A[at(i + k)]; if (v === v) w.push(v); } if (w.length < r) return NaN; w.sort((a, b) => a - b); return w[w.length >> 1]; };
  const R = Math.round(10 / STEP);
  const mL = Float32Array.from(EL, (_, i) => med(EL, i, R)), mR = Float32Array.from(ER, (_, i) => med(ER, i, R));
  const shift = new Float32Array(N).fill(NaN), W = new Float32Array(N).fill(NaN);
  let good = 0;
  for (let i = 0; i < N; i++) {
    const l = mL[i], r = mR[i], w0 = widthOf(D[i].f);
    if (!(l === l) || !(r === r)) continue;
    const w = l + r, s = (r - l) / 2;
    if (w < 7 || w > 24 || Math.abs(w - w0) > 12 || Math.abs(s) > 7) continue;
    shift[i] = s; W[i] = w; good++;
  }
  // gaps: eased from the old line / width at their ends back to the fitted ones (never a step)
  const fill = (A, base) => {
    const out = Float32Array.from(A);
    for (let i = 0; i < N; i++) if (!(out[i] === out[i])) out[i] = base(i);
    // where measured meets unmeasured, a 30 m ease
    const ease = Math.round(30 / STEP), M = Float32Array.from(A, v => (v === v ? 1 : 0)), wgt = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0, c = 0; for (let k = -ease; k <= ease; k++) { m += M[at(i + k)]; c++; } wgt[i] = m / c; }
    return out.map((v, i) => base(i) + (v - base(i)) * Math.min(1, wgt[i] * 1.6));
  };
  // (where the photo can't tell, the road is as wide as it measured elsewhere, typically: the median, not OSM's guess,
  // so a third of the lap isn't left 10 m wide beside 13 m measured: Zandvoort)
  const meas = Array.from(W).filter(v => v === v).sort((a, b) => a - b), typ = meas.length > N * 0.3 ? meas[meas.length >> 1] : 0;
  const S2 = fill(shift, () => 0), W2 = fill(W, (i) => typ || widthOf(D[i].f));
  // smooth (±12 m) so the line keeps its own curves, not the photo's pixels
  const avg = (A, r) => Float32Array.from(A, (_, i) => { let s = 0, c = 0; for (let k = -r; k <= r; k++) { s += A[at(i + k)]; c++; } return s / c; });
  const Sm = avg(S2, 6), Wm = avg(W2, 6);
  // ---- the new line ----
  const out = D.map((d, i) => { const x = d.x + d.rx * Sm[i], z = d.z + d.rz * Sm[i]; const [lat, lon] = toLatLon(geo, x, z); return { lat: +lat.toFixed(7), lon: +lon.toFixed(7), f: { ...d.f, w: +Wm[i].toFixed(1) } }; });
  const wsOld = D.map(d => widthOf(d.f)).sort((a, b) => a - b), wsNew = Array.from(Wm).sort((a, b) => a - b);
  const sh = Array.from(Sm, Math.abs).sort((a, b) => a - b);
  const note = `${(100 * good / N).toFixed(0)}% of the lap measured; width ${wsOld[N >> 1].toFixed(1)} -> ${wsNew[N >> 1].toFixed(1)} m (median), ${wsNew[Math.floor(N * 0.05)].toFixed(1)}-${wsNew[Math.floor(N * 0.95)].toFixed(1)} m; moved ${sh[N >> 1].toFixed(1)} m (median), up to ${sh[N - 1].toFixed(1)} m`;
  return { line: out, note, credit: P.credit, debug: inp.debug ? { D: D.map(d => [d.x, d.z, d.rx, d.rz]), EL: Array.from(EL), ER: Array.from(ER), Sm: Array.from(Sm), Wm: Array.from(Wm) } : null };
}
