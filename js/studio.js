// Track Studio (dev): dress a real circuit as the real one is, over its aerial photo. The layout, heights and camber
// come from the importer (tools/tracks/build.mjs); here you set what makes it recognizable, stretch by stretch: its
// curbs (colors) and barriers (type, where they stand), saved as track.dress (js/track.js) through
// tools/tracks/studio.mjs. A 3D view shows the game's own world for it.
import * as THREE from 'three';
import { sampleTrack, analyzeTrack, KERB_STYLES, WALL_TYPES, kerbStyleAt, wallTypeAt } from './track.js';
import { realTracksReady, realTracks, hydrateReal } from './realtracks.js';
import { TileLayer, MAP_STYLES, toLatLon } from './geo.js';
import { buildScenery } from './race.js';
import { loadEnvCatalog, loadEnvModels } from './envlib.js';

const $ = (id) => document.getElementById(id);
const cv = $('map'), ctx = cv.getContext('2d');

// aerial photos: each country's open national ones where there are (sharper and newer), else Esri's
MAP_STYLES.pdok = { label: 'PDOK', url: (z, x, y) => `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/${z}/${x}/${y}.jpeg`, max: 21, attr: 'Luchtfoto: Beeldmateriaal.nl (PDOK)' };
const photoStyle = (t) => (t.real && t.real.country === 'Netherlands' ? 'pdok' : 'satellite');

const S = {
  track: null, T: null, A: null, dress: null, undo: [],
  view: { cx: 0, cz: 0, scale: 1 }, W: 0, H: 0, dpr: 1,
  tool: 'kerbs', kerbStyle: 'rw', wallType: 'armco', trace: true,
  photo: true, dim: false, drag: null, hover: null, dirty: true, saved: true,
};
const tiles = new TileLayer(() => { S.dirty = true; });
const w2s = (x, z) => [(x - S.view.cx) * S.view.scale + S.W / 2, (z - S.view.cz) * S.view.scale + S.H / 2];
const s2w = (x, y) => [(x - S.W / 2) / S.view.scale + S.view.cx, (y - S.H / 2) / S.view.scale + S.view.cz];
const status = (msg, err = false) => { const e = $('status'); e.textContent = msg; e.className = err ? 'err' : ''; };

// ---------- load ----------
async function boot() {
  await realTracksReady();
  const list = realTracks();
  $('trk').innerHTML = list.map(t => `<option value="${t.real.id}">${t.name}</option>`).join('');
  const want = new URLSearchParams(location.search).get('id') || 'zandvoort';
  $('trk').value = list.some(t => t.real.id === want) ? want : list[0].real.id;
  $('trk').onchange = () => { if (!S.saved && !confirm('Leave without saving?')) { $('trk').value = S.track.real.id; return; } open($('trk').value); };
  await open($('trk').value);
  loadEnvCatalog(); loadEnvModels();
}
async function open(id) {
  status('Loading…');
  const light = realTracks().find(t => t.real.id === id);
  const t = await hydrateReal(JSON.parse(JSON.stringify(light)));
  S.track = t; S.dress = t.dress ? JSON.parse(JSON.stringify(t.dress)) : { v: 1, kerbs: [], walls: [] };
  S.undo = []; S.saved = true;
  history.replaceState(null, '', '?id=' + id);
  S.T = sampleTrack(t);
  analyze();
  fit();
  status(`${t.name}: ${(S.T.L / 1000).toFixed(2)} km · ${S.dress.kerbs.length} curb and ${S.dress.walls.length} barrier stretches`);
  close3d();
}
function analyze() {
  const t = S.track, d = S.dress;
  S.A = analyzeTrack(S.T, t.env, t.paint, t.osm, d.kerbs.length || d.walls.length ? d : null);
  S.dirty = true;
  if (V.on) V.rebuild();
}
function fit() {
  const T = S.T; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.X[i]); x1 = Math.max(x1, T.X[i]); z0 = Math.min(z0, T.Z[i]); z1 = Math.max(z1, T.Z[i]); }
  S.view.cx = (x0 + x1) / 2; S.view.cz = (z0 + z1) / 2;
  S.view.scale = Math.min(S.W / (x1 - x0 + 120), S.H / (z1 - z0 + 120));
  S.dirty = true;
}

// ---------- the dressing's stretches ----------
const norm = (d) => ((d % S.T.L) + S.T.L) % S.T.L;
// [a, b] split at the line into plain intervals
const parts = (a, b) => (a <= b ? [[a, b]] : [[a, S.T.L], [0, b]]);
// take [a, b] on this side out of a list of stretches (cutting the ones it overlaps)
function cut(list, a, b, side) {
  const out = [];
  for (const s of list) {
    if (s.side !== side) { out.push(s); continue; }
    let pieces = parts(s.a, s.b);
    for (const [ca, cb] of parts(a, b)) pieces = pieces.flatMap(([pa, pb]) => {
      if (cb <= pa || ca >= pb) return [[pa, pb]];
      const r = []; if (ca > pa) r.push([pa, ca]); if (cb < pb) r.push([cb, pb]); return r;
    });
    // (a stretch across the line comes back as two: join them again)
    const L = S.T.L, e = pieces.findIndex(p => p[1] >= L - 1e-6), z = pieces.findIndex(p => p[0] <= 1e-6);
    if (e >= 0 && z >= 0 && e !== z) { pieces[e] = [pieces[e][0], pieces[z][1]]; pieces.splice(z, 1); }
    for (const [pa, pb] of pieces) if (norm(pb - pa) > 1 || pb < pa) out.push({ ...s, a: +pa.toFixed(1), b: +pb.toFixed(1) });
  }
  return out;
}
function push() { S.undo.push(JSON.stringify(S.dress)); if (S.undo.length > 100) S.undo.shift(); S.saved = false; }
function apply(kind, a, b, side, val, off) {
  push();
  const list = cut(S.dress[kind], a, b, side);
  if (val !== null) list.push(kind === 'kerbs' ? { a: +a.toFixed(1), b: +b.toFixed(1), side, style: val } : { a: +a.toFixed(1), b: +b.toFixed(1), side, type: val, ...(off != null ? { off: +off.toFixed(1) } : {}) });
  list.sort((p, q) => p.side - q.side || p.a - q.a);
  S.dress[kind] = list;
  analyze();
}

// ---------- picking ----------
// the nearest track sample to a world point: { i, d (m along the lap), side, lat (m out from the centre line) }
function nearest(x, z) {
  const T = S.T; let bi = 0, bd = Infinity;
  for (let i = 0; i < T.N; i++) { const d = (x - T.X[i]) ** 2 + (z - T.Z[i]) ** 2; if (d < bd) { bd = d; bi = i; } }
  const lat = (x - T.X[bi]) * T.RX[bi] + (z - T.Z[bi]) * T.RZ[bi], fw = (x - T.X[bi]) * T.FX[bi] + (z - T.Z[bi]) * T.FZ[bi];
  return { i: bi, d: norm(T.D[bi] + fw), side: lat < 0 ? -1 : 1, lat, dist: Math.sqrt(bd) };
}

// ---------- drawing ----------
function resize() {
  S.dpr = window.devicePixelRatio || 1; S.W = cv.clientWidth; S.H = cv.clientHeight;
  cv.width = S.W * S.dpr; cv.height = S.H * S.dpr; S.dirty = true;
}
function path(idx, off) {
  const T = S.T; ctx.beginPath(); let first = true, last = -2;
  for (const i of idx) {
    const s = typeof off === 'function' ? off(i) : off;
    const [x, y] = w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s);
    if (first || i !== last + 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    first = false; last = i;
  }
}
// runs of consecutive samples where f(i) holds (wrapping at the line), each a list of samples
function runs(f) {
  const N = S.T.N, out = []; let cur = null;
  for (let i = 0; i < N; i++) { if (f(i)) { if (!cur) out.push(cur = []); cur.push(i); } else cur = null; }
  if (out.length > 1 && out[0][0] === 0 && out[out.length - 1].at(-1) === N - 1) { const l = out.pop(); out[0] = [...l, ...out[0]]; }
  return out;
}
const WALL_COL = { concrete: '#e8e4da', armco: '#7fc6ff', tires: '#202020', fence: '#f2d24a' };
function draw() {
  S.dirty = false;
  const T = S.T, A = S.A, t = S.track;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, S.W, S.H);
  if (!T) return;
  if (S.photo) tiles.draw(ctx, t.geo, photoStyle(t), S.view, S.W, S.H, w2s, s2w, S.dpr, 1);
  if (S.dim) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, S.W, S.H); }
  const sc = S.view.scale, all = [...Array(T.N).keys()];
  // the road's edges (where the game's road is: line them up with the photo's)
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  for (const s of [-1, 1]) { path(all, (i) => s * T.W[i] / 2); ctx.stroke(); }
  // the pit lane (OSM)
  const pl = t.osm && t.osm.pitLane;
  if (pl && pl.length) { ctx.strokeStyle = 'rgba(80,200,255,0.7)'; ctx.setLineDash([6, 4]); ctx.beginPath(); pl.forEach(([x, z], k) => { const [a, b] = w2s(x, z); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.setLineDash([]); }
  // curbs: their two colors, dashed along the edge
  for (const side of [-1, 1]) {
    const styles = new Set(); for (let i = 0; i < T.N; i++) { const st = kerbStyleAt(A, i, side); if (st) styles.add(st); }
    for (const st of styles) for (const r of runs((i) => kerbStyleAt(A, i, side) === st)) {
      const [c1, c2] = KERB_STYLES[st].c;
      ctx.lineWidth = Math.max(2, 1.3 * sc); ctx.strokeStyle = c1; path(r, (i) => side * (T.W[i] / 2 + 0.65)); ctx.stroke();
      ctx.setLineDash([Math.max(2, 1 * sc), Math.max(2, 1 * sc)]); ctx.strokeStyle = c2; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // barriers: by type, where they stand
  for (const side of [-1, 1]) {
    const has = side < 0 ? A.HAS_L : A.HAS_R, off = side < 0 ? A.BL : A.BR;
    for (const ty of Object.keys(WALL_COL)) for (const r of runs((i) => has[i] && wallTypeAt(A, i, side, t.env) === ty)) {
      ctx.lineWidth = ty === 'fence' ? 1.5 : 3; ctx.strokeStyle = '#000'; path(r, (i) => side * off[i]); ctx.stroke();
      ctx.lineWidth = ty === 'fence' ? 1 : 2; ctx.strokeStyle = WALL_COL[ty]; if (ty === 'tires') ctx.strokeStyle = '#e03030'; ctx.stroke();
    }
  }
  // the stretch being drawn
  const d = S.drag;
  if (d && d.kind) {
    const idx = stretchSamples(d.a, d.b), off = d.kind === 'kerbs' ? (i) => d.side * (T.W[i] / 2 + 0.65) : d.off != null ? (i) => d.side * (T.W[i] / 2 + d.off) : (i) => d.side * (d.side < 0 ? A.BL[i] : A.BR[i]);
    ctx.lineWidth = Math.max(4, 1.6 * sc); ctx.strokeStyle = d.val === null ? 'rgba(255,60,60,0.8)' : 'rgba(255,43,0,0.9)'; path(idx, off); ctx.stroke();
  }
  // distance marks every 100 m, the start line, corner names
  ctx.font = '11px -apple-system, Arial'; ctx.textAlign = 'center';
  for (let m = 0; m < T.L; m += 100) {
    const i = Math.round(m / T.ds) % T.N, s = (m === 0 ? 1 : 0.6) * (T.W[i] / 2 + 3);
    const [x0, y0] = w2s(T.X[i] - T.RX[i] * s, T.Z[i] - T.RZ[i] * s), [x1, y1] = w2s(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s);
    ctx.strokeStyle = m === 0 ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = m === 0 ? 3 : 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (sc > 0.6 && m % (sc > 2 ? 100 : 500) === 0) { ctx.fillStyle = '#fff'; ctx.fillText(m + ' m', x1 + 14 * T.RX[i], y1 + 14 * T.RZ[i]); }
  }
  for (const n of (t.real && t.real.names) || []) {
    const i = Math.round(((n.from + n.to) / 2) / T.ds) % T.N, [x, y] = w2s(T.X[i], T.Z[i]);
    ctx.font = 'bold 12px -apple-system, Arial'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(n.name, x, y - 12); ctx.fillStyle = '#ffd34a'; ctx.fillText(n.name, x, y - 12);
  }
  // what's under the mouse
  const h = S.hover;
  if (h && S.tool !== 'pan') {
    const [x, y] = w2s(T.X[h.i] + T.RX[h.i] * h.lat, T.Z[h.i] + T.RZ[h.i] * h.lat);
    ctx.fillStyle = '#ff2b00'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '12px -apple-system, Arial';
    const st = kerbStyleAt(A, h.i, h.side), wt = (h.side < 0 ? A.HAS_L : A.HAS_R)[h.i] ? wallTypeAt(A, h.i, h.side, t.env) : 'none';
    const txt = `${h.d.toFixed(0)} m · ${h.side < 0 ? 'left' : 'right'} · ${(Math.abs(h.lat) - T.W[h.i] / 2).toFixed(1)} m out · curb ${st ? KERB_STYLES[st].label : 'none'} · barrier ${WALL_TYPES[wt] ? WALL_TYPES[wt].label : wt}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(txt, x + 10, y - 8); ctx.fillText(txt, x + 10, y - 8);
  }
}
function stretchSamples(a, b) {
  const T = S.T, out = [];
  for (let i = 0; i < T.N; i++) { const d = T.D[i]; if (a <= b ? d >= a && d <= b : d >= a || d <= b) out.push(i); }
  if (a > b) { const k = out.findIndex(i => T.D[i] >= a); return [...out.slice(k), ...out.slice(0, k)]; }
  return out;
}

// ---------- the side panel ----------
function renderOpts() {
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.t === S.tool));
  const o = $('opts');
  if (S.tool === 'kerbs') {
    o.innerHTML = `<h2>Curb</h2><div class="row">${Object.entries(KERB_STYLES).map(([k, v]) => `<button data-v="${k}" class="${S.kerbStyle === k ? 'on' : ''}"><span class="sw" style="background:linear-gradient(90deg,${v.c[0]} 50%,${v.c[1]} 50%)"></span>${v.label}</button>`).join('')}<button data-v="" class="${S.kerbStyle === '' ? 'on' : ''}">No Curb</button></div>
      <p class="muted">Drag along the edge where the curb is. The side is whichever side of the center line you start on.</p>`;
    o.querySelectorAll('button').forEach(b => b.onclick = () => { S.kerbStyle = b.dataset.v; renderOpts(); });
  } else if (S.tool === 'walls') {
    o.innerHTML = `<h2>Barrier</h2><div class="row">${Object.entries(WALL_TYPES).map(([k, v]) => `<button data-v="${k}" class="${S.wallType === k ? 'on' : ''}">${k !== 'none' ? `<span class="sw" style="background:${k === 'tires' ? '#e03030' : WALL_COL[k]}"></span>` : ''}${v.label}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="trace" ${S.trace ? 'checked' : ''}> Stand where I draw it</label>
      <p class="muted">Drag along where the barrier is in the photo. With "Stand where I draw it" off, only its type changes.</p>`;
    o.querySelectorAll('button').forEach(b => b.onclick = () => { S.wallType = b.dataset.v; renderOpts(); });
    $('trace').onchange = (e) => { S.trace = e.target.checked; };
  } else o.innerHTML = '';
  $('legend').innerHTML = `<div><span class="sw" style="background:rgba(255,255,255,.6)"></span>The game's road edges</div><div><span class="sw" style="background:repeating-linear-gradient(90deg,#50c8ff 0 6px,transparent 6px 10px)"></span>Pit lane (map)</div>` +
    Object.entries(WALL_COL).map(([k, c]) => `<div><span class="sw" style="background:${k === 'tires' ? '#e03030' : c}"></span>${WALL_TYPES[k].label}</div>`).join('');
}
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => { S.tool = b.dataset.t; renderOpts(); S.dirty = true; });
$('photo').onclick = () => { S.photo = !S.photo; $('photo').classList.toggle('on', S.photo); S.dirty = true; };
$('fade').onclick = () => { S.dim = !S.dim; $('fade').classList.toggle('on', S.dim); S.dirty = true; };
$('undo').onclick = undo;
$('save').onclick = save;
$('auto').onclick = () => findKerbs().catch(e => status('Curb search failed: ' + e.message, true));
function undo() { if (!S.undo.length) return; S.dress = JSON.parse(S.undo.pop()); S.saved = false; analyze(); status('Undone'); }
async function save() {
  status('Saving…');
  const r = await fetch('/__studio/save/' + S.track.real.id, { method: 'POST', body: JSON.stringify(S.dress) }).catch(e => ({ ok: false, statusText: e.message }));
  if (!r.ok) { status('Not saved: is this open from tools/tracks/studio.mjs? ' + (r.statusText || ''), true); return; }
  S.saved = true; S.track.dress = JSON.parse(JSON.stringify(S.dress));
  status(`Saved: ${S.dress.kerbs.length} curb and ${S.dress.walls.length} barrier stretches. The game has them next time it loads the circuit.`);
}
window.addEventListener('beforeunload', (e) => { if (!S.saved) { e.preventDefault(); e.returnValue = ''; } });

// ---------- mouse ----------
let space = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { space = true; e.preventDefault(); }
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') { e.preventDefault(); save(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') space = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  if (e.button === 2 || e.button === 1 || space || S.tool === 'pan') { S.drag = { pan: true, x: e.offsetX, y: e.offsetY }; return; }
  const [x, z] = s2w(e.offsetX, e.offsetY), n = nearest(x, z);
  if (n.dist > S.T.W[n.i] / 2 + 40) return;
  const kind = S.tool, val = kind === 'kerbs' ? (S.kerbStyle || null) : S.wallType;
  S.drag = { kind, side: n.side, a: n.d, b: n.d, d0: n.d, val, offs: [Math.abs(n.lat) - S.T.W[n.i] / 2], off: null };
});
cv.addEventListener('pointermove', (e) => {
  const d = S.drag;
  if (d && d.pan) { S.view.cx -= (e.offsetX - d.x) / S.view.scale; S.view.cz -= (e.offsetY - d.y) / S.view.scale; d.x = e.offsetX; d.y = e.offsetY; S.dirty = true; return; }
  const [x, z] = s2w(e.offsetX, e.offsetY), n = nearest(x, z);
  S.hover = n.dist < S.T.W[n.i] / 2 + 60 ? n : null; S.dirty = true;
  if (d && d.kind) {
    // (forwards or backwards from where it started, whichever is shorter)
    const fw = norm(n.d - d.d0);
    if (fw <= S.T.L / 2) { d.a = d.d0; d.b = n.d; } else { d.a = n.d; d.b = d.d0; }
    if (n.side === d.side) d.offs.push(Math.abs(n.lat) - S.T.W[n.i] / 2);
    if (d.kind === 'walls' && S.trace && d.val !== 'none') { const o = [...d.offs].sort((p, q) => p - q); d.off = Math.max(0.5, o[o.length >> 1]); }
  }
});
cv.addEventListener('pointerup', () => {
  const d = S.drag; S.drag = null;
  if (!d || d.pan || !d.kind) return;
  if (norm(d.b - d.a) < 2) { S.dirty = true; return; }
  apply(d.kind, d.a, d.b, d.side, d.val, d.kind === 'walls' && S.trace ? d.off : null);
  status(`${d.kind === 'kerbs' ? 'Curb' : 'Barrier'} ${d.val === null ? 'removed' : 'set'}: ${d.a.toFixed(0)}-${d.b.toFixed(0)} m, ${d.side < 0 ? 'left' : 'right'}${d.off != null && d.kind === 'walls' ? `, ${d.off.toFixed(1)} m out` : ''}`);
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [x, z] = s2w(e.offsetX, e.offsetY), k = Math.exp(-e.deltaY * 0.0015);
  S.view.scale = Math.max(0.05, Math.min(40, S.view.scale * k));
  const [x2, z2] = s2w(e.offsetX, e.offsetY); S.view.cx += x - x2; S.view.cz += z - z2; S.dirty = true;
}, { passive: false });
cv.addEventListener('dblclick', (e) => { const [x, z] = s2w(e.offsetX, e.offsetY); open3d(nearest(x, z)); });

// ---------- curbs from the photo ----------
// Reads the aerial photo along both edges of the game's road: a stretch where the band just outside it (and a little
// inside, the layouts are a metre or two off the photo) is striped in a curb's paint is a curb, its colors the
// stripes'. Gaps under 6 m are joined; runs under 8 m, or with no bend near, dropped.
const PHOTO_Z = 19;
async function findKerbs() {
  const T = S.T, t = S.track, style = photoStyle(t), Z = Math.min(PHOTO_Z, MAP_STYLES[style].max), n = 2 ** Z;
  status('Reading the photo along the track…');
  const tileOf = (x, z) => { const [lat, lon] = toLatLon(t.geo, x, z); const fx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; return [fx, fy]; };
  const cache = new Map();
  const load = (tx, ty) => {
    const k = tx + '/' + ty;
    if (!cache.has(k)) cache.set(k, new Promise((res) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 256, 256); res(g.getImageData(0, 0, 256, 256).data); };
      img.onerror = () => res(null);
      img.src = MAP_STYLES[style].url(Z, tx, ty);
    }));
    return cache.get(k);
  };
  // the points to read: per sample and side, across -1.5..+2.5 m from the edge every 0.25 m
  const across = []; for (let o = -1.5; o <= 2.5001; o += 0.25) across.push(o);
  const need = new Set();
  for (let i = 0; i < T.N; i++) for (const side of [-1, 1]) for (const o of [-1.5, 2.5]) { const s = side * (T.W[i] / 2 + o); const [fx, fy] = tileOf(T.X[i] + T.RX[i] * s, T.Z[i] + T.RZ[i] * s); need.add(Math.floor(fx) + '/' + Math.floor(fy)); }
  let done = 0; const keys = [...need];
  await Promise.all(keys.map(async (k) => { const [a, b] = k.split('/').map(Number); await load(a, b); done++; if (done % 20 === 0) status(`Reading the photo… ${done} / ${keys.length} tiles`); }));
  const px = {}; for (const k of keys) px[k] = await cache.get(k);
  const rgb = (x, z) => {
    const [fx, fy] = tileOf(x, z), tx = Math.floor(fx), ty = Math.floor(fy), d = px[tx + '/' + ty];
    if (!d) return null; const u = Math.floor((fx - tx) * 256), v = Math.floor((fy - ty) * 256), o = (v * 256 + u) * 4;
    return [d[o], d[o + 1], d[o + 2]];
  };
  // Per sample and side, lines along the edge (±5 m) at offsets from 1.5 m inside it to 3 m out: a curb's line is
  // tinted against the asphalt just inside (redder, or bluer) and striped (light and dark blocks along it). Sand and
  // dry grass are tinted too but even, white lines are striped but not tinted. Faded paint barely tints (Zandvoort's
  // Tarzan: +13 over the asphalt), so a faint tint counts when it's striped; a strong one (+25: sand is ~+15) alone.
  const tint = (c) => [c[0] - (c[1] + c[2]) / 2, c[2] - (c[0] + c[1]) / 2], lum = (c) => (c[0] + c[1] + c[2]) / 3;
  // the line's tint, and how regularly striped it is: blocks of light and dark repeating every 1-6 m (along it, the
  // brightness anti-correlates with itself half a period on and correlates a whole period on). Grass, dirt and gravel
  // are patchy but not regular.
  const line = (i, side, q) => {
    let r = 0, b = 0; const v = [];
    for (let f = -8; f <= 8.001; f += 0.25) {
      const s = side * (T.W[i] / 2 + q), c = rgb(T.X[i] + T.RX[i] * s + T.FX[i] * f, T.Z[i] + T.RZ[i] * s + T.FZ[i] * f);
      if (!c) return null; const [tr, tb] = tint(c); r += tr; b += tb; v.push(lum(c));
    }
    const n = v.length, m = v.reduce((a, x) => a + x, 0) / n, d = v.map(x => x - m), e = d.reduce((a, x) => a + x * x, 0);
    const ac = (k) => { let t = 0; for (let x = 0; x + k < n; x++) t += d[x] * d[x + k]; return t / e * n / (n - k); };
    let stripe = 0;
    if (e / n > 25) for (let k = 2; k <= 12; k++) stripe = Math.max(stripe, Math.min(-ac(k), ac(2 * k)));
    return { r: r / n, b: b / n, stripe };
  };
  const styleAt = (i, side) => {
    const base = line(i, side, -2.5); if (!base) return null;
    let best = null, bs = 0;
    for (let q = -1.5; q <= 3.01; q += 0.5) {
      const L = line(i, side, q); if (!L) continue;
      for (const [k, dt] of [['rw', L.r - base.r], ['bw', L.b - base.b]]) {
        const sc = dt >= 25 ? dt : dt >= 6 && L.stripe >= 0.25 ? dt * (1 + L.stripe) : 0;
        if (sc > bs) { bs = sc; best = k; }
      }
    }
    return best;
  };
  S._rgb = rgb; // (dev: what the photo showed)
  const kerbs = [];
  for (const side of [-1, 1]) {
    const lab = Array.from({ length: T.N }, (_, i) => styleAt(i, side)), N = T.N, gap = Math.round(6 / T.ds), min = Math.round(8 / T.ds);
    // close short gaps between the same style
    for (let i = 0; i < N; i++) if (lab[i] && !lab[(i + 1) % N]) {
      for (let k = 2; k <= gap + 1; k++) if (lab[(i + k) % N] === lab[i]) { for (let q = 1; q < k; q++) lab[(i + q) % N] = lab[i]; break; }
    }
    // a run per style (majority wins inside), wrapping at the line
    const start = lab.findIndex((v, i) => !v || v !== lab[(i - 1 + N) % N]) ;
    let k = 0; const o = Math.max(0, start);
    while (k < N) {
      const i = (o + k) % N, st = lab[i]; let len = 1;
      while (len < N && lab[(i + len) % N] === st) len++;
      // (curbs are at corners: a run with no bend within 30 m is a white line or a shadow)
      let bend = 0; for (let q = -15; q < len + 15; q++) bend = Math.max(bend, Math.abs(T.K[(i + q + N) % N]));
      if (st && len >= min && bend > 1 / 300) kerbs.push({ a: +T.D[i].toFixed(1), b: +T.D[(i + len - 1) % N].toFixed(1), side, style: st });
      k += len;
    }
  }
  push();
  S.dress.kerbs = kerbs.sort((p, q) => p.side - q.side || p.a - q.a);
  analyze();
  const tot = kerbs.reduce((s, k) => s + norm(k.b - k.a), 0);
  status(`Found ${kerbs.length} curbs (${tot.toFixed(0)} m). Check them against the photo, then Save.`);
}

// ---------- the 3D view: the game's own world for this dressing ----------
const V = { on: false, R: null, S: null, cam: null, yaw: 0, pitch: -0.12, pos: new THREE.Vector3(), keys: {}, raf: 0, timer: 0 };
V.rebuild = () => { clearTimeout(V.timer); V.timer = setTimeout(build3d, 250); };
function build3d() {
  if (!V.on) return;
  const tt = JSON.parse(JSON.stringify(S.track)); tt.dress = S.dress;
  if (V.S) V.S.dispose();
  try { V.S = buildScenery(tt); } catch (e) { console.error(e); status('3D view failed: ' + e.message, true); V.S = null; }
}
function open3d(n) {
  const T = S.T, el = $('view3d'); el.style.display = 'block';
  if (!V.R) {
    V.R = new THREE.WebGLRenderer({ canvas: $('c3d'), antialias: false });
    V.R.outputColorSpace = THREE.SRGBColorSpace;
    V.cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 6000);
    const c = $('c3d');
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); V.look = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointermove', (e) => { if (!V.look) return; V.yaw -= (e.clientX - V.look.x) * 0.005; V.pitch = Math.max(-1.4, Math.min(1.2, V.pitch - (e.clientY - V.look.y) * 0.005)); V.look = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointerup', () => { V.look = null; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); move(-e.deltaY * 0.05); }, { passive: false });
    window.addEventListener('keydown', (e) => { if (V.on) V.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { V.keys[e.code] = false; });
    $('v-close').onclick = close3d;
    $('v-big').onclick = () => { el.classList.toggle('big'); $('v-big').textContent = el.classList.contains('big') ? 'Smaller' : 'Bigger'; };
  }
  // from just behind and above where you clicked, looking up the track
  const i = n.i, back = 12;
  V.pos.set(T.X[i] - T.FX[i] * back + T.RX[i] * n.lat * 0.5, T.Y[i] + 4, T.Z[i] - T.FZ[i] * back + T.RZ[i] * n.lat * 0.5);
  V.yaw = Math.atan2(-T.FX[i], -T.FZ[i]); V.pitch = -0.12;
  V.on = true; build3d();
  cancelAnimationFrame(V.raf); let last = performance.now();
  const loop = (now) => {
    if (!V.on) return;
    V.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (V.keys.KeyW) move(30 * dt); if (V.keys.KeyS) move(-30 * dt);
    if (V.keys.KeyA || V.keys.KeyD) along((V.keys.KeyD ? 1 : -1) * 25 * dt);
    if (V.keys.KeyQ) V.pos.y -= 8 * dt; if (V.keys.KeyE) V.pos.y += 8 * dt;
    const c = $('c3d'), w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * devicePixelRatio || c.height !== h * devicePixelRatio) { V.R.setPixelRatio(devicePixelRatio); V.R.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix(); }
    V.cam.position.copy(V.pos);
    V.cam.rotation.set(V.pitch, V.yaw, 0, 'YXZ');
    if (V.S) { V.S.world.update(dt, V.cam, [], []); V.R.render(V.S.scene, V.cam); }
  };
  V.raf = requestAnimationFrame(loop);
}
function move(m) { const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(V.pitch, V.yaw, 0, 'YXZ')); V.pos.addScaledVector(f, m); }
// slide along the track (keeps the same height over the road)
function along(m) {
  const n = nearest(V.pos.x, V.pos.z), T = S.T, i = n.i, h = V.pos.y - T.Y[i];
  const j = Math.round(norm(T.D[i] + m) / T.ds) % T.N, lat = n.lat;
  V.pos.set(T.X[j] + T.RX[j] * lat, T.Y[j] + h, T.Z[j] + T.RZ[j] * lat);
  const turn = Math.atan2(T.FX[j], T.FZ[j]) - Math.atan2(T.FX[i], T.FZ[i]); V.yaw += turn;
}
function close3d() { V.on = false; $('view3d').style.display = 'none'; cancelAnimationFrame(V.raf); if (V.S) { V.S.dispose(); V.S = null; } }

// ---------- go ----------
window.addEventListener('resize', resize);
resize(); renderOpts();
(function frame() { if (S.dirty) draw(); requestAnimationFrame(frame); })();
boot().catch(e => { console.error(e); status('Failed to load: ' + e.message, true); });
window.__studio = { S, V, findKerbs, open3d, apply, save }; // (dev hooks for tests)
