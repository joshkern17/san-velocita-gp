// Liveries, helmets and race suits: MODEL-INDEPENDENT.
//
// A livery is plain data (colours, pattern, team name, number, sponsor, decals, helmet, suit). Decals are
// placed on named PANELS ("sideL", "top", "podR", "rwing"...) in metres, never in texture pixels. Each car
// model supplies a panel map (see carmodel.js MODEL and docs/CAR-MODELS.md) telling the painter where each
// panel lives in that model's texture atlas. A new car model only has to provide its own panel map, and
// every saved livery paints onto it.
//
// Panel map entry: { rect: [u0, v0, u1, v1],   // atlas rect (UV, v up)
//                    o: [u, v], ds: [du, dv], dt: [du, dv], // rect-local UV of the panel's top-left corner and
//                                                // its right (s) / down (t) directions as seen from outside
//                    W, H,                      // physical size in metres (keeps decals in proportion)
//                    role, nose, pair, label }  // pattern hints, which edge points to the nose, mirror panel

// ---------------- image assets (imported PNG / SVG) ----------------
// Stored in IndexedDB (they can be big); kept in memory once loaded. Liveries reference them by id.
const mem = new Map();      // id -> dataURL
const imgs = new Map();     // id -> HTMLImageElement
const waiting = new Map();  // id -> [callbacks]
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no indexedDB'));
    const r = indexedDB.open('svgp-assets', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('assets');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
async function idbGet(id) { const d = await db(); if (!d) return null; return new Promise(res => { const q = d.transaction('assets').objectStore('assets').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function idbPut(id, v) { const d = await db(); if (!d) return; return new Promise(res => { const tx = d.transaction('assets', 'readwrite'); tx.objectStore('assets').put(v, id); tx.oncomplete = res; tx.onerror = res; }); }

export const assets = {
  has: (id) => mem.has(id),
  get: (id) => mem.get(id) || null,
  // add without persisting (e.g. received from another player online)
  put(id, url) { if (!id || !url || mem.has(id)) return; mem.set(id, url); flush(id); },
  async save(id, url) { mem.set(id, url); await idbPut(id, url); flush(id); },
  async load(ids) { for (const id of ids) if (id && !mem.has(id)) { const v = await idbGet(id); if (v) { mem.set(id, v); flush(id); } } },
  pick(ids) { const o = {}; for (const id of ids) if (mem.has(id)) o[id] = mem.get(id); return o; },
};
function flush(id) {
  const cbs = waiting.get(id); if (!cbs) return;
  waiting.delete(id);
  decalImage(id, () => cbs.forEach(f => f()));
}
// the loaded image for an asset id, or null (then onReady fires once it is available)
export function decalImage(id, onReady) {
  const im = imgs.get(id);
  if (im && im.complete && im.naturalWidth) return im;
  if (im) { if (onReady) im.addEventListener('load', onReady, { once: true }); return null; }
  const url = mem.get(id);
  if (!url) { if (onReady) { if (!waiting.has(id)) waiting.set(id, []); waiting.get(id).push(onReady); } return null; }
  const img = new Image();
  imgs.set(id, img);
  if (onReady) img.addEventListener('load', onReady, { once: true });
  img.src = url;
  return null;
}
export const liveryAssetIds = (cfg) => [...new Set([...(cfg.decals || []).map(d => d.asset), cfg.helmetDesign?.decal, cfg.suit?.decal].filter(Boolean))];

// PNG / JPG / WEBP -> downscaled PNG (max 768 px); SVG kept as vector (sized so it rasterises crisply)
export async function importImageFile(file) {
  const isSvg = /svg/.test(file.type) || /\.svg$/i.test(file.name);
  let url;
  if (isSvg) {
    let text = await file.text();
    // give the SVG an explicit size if it only has a viewBox (browsers need one to draw it)
    const m = text.match(/<svg[^>]*>/i);
    if (m && !/\swidth=/.test(m[0])) {
      const vb = m[0].match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      const w = vb ? +vb[1] : 512, h = vb ? +vb[2] : 512, k = 1024 / Math.max(w, h);
      text = text.replace(/<svg/i, `<svg width="${Math.round(w * k)}" height="${Math.round(h * k)}"`);
    }
    url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
  } else {
    const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = await loadImg(src);
    const k = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    url = c.toDataURL('image/png');
  }
  await loadImg(url); // make sure it decodes
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await assets.save(id, url);
  return { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), vector: isSvg };
}
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not an image the browser can read.')); i.src = src; });

// ---------------- defaults ----------------
export const PATTERNS = { solid: 'Solid', stripe: 'Centre Stripe', split: 'Two-Tone', arrow: 'Arrow Nose', fade: 'Fade', sash: 'Side Sash' };
export const HELMET_PATTERNS = { solid: 'Solid', stripe: 'Centre Stripe', crown: 'Crown', bands: 'Eye Bands', halves: 'Halves', flames: 'Flames', stars: 'Stars' };
export const SUIT_PATTERNS = { solid: 'Solid', sides: 'Side Stripes', twotone: 'Two-Tone', shoulders: 'Shoulders', sash: 'Sash' };
export const VISORS = { dark: 'Dark', gold: 'Gold Iridium', blue: 'Blue Iridium', red: 'Red Iridium', clear: 'Light Tint' };
export const FONTS = { impact: 'Impact', anton: 'Anton', gothic: 'Gothic', arimo: 'Clean', pixel: 'Pixel' };
const FONT_CSS = { impact: 'Impact, "Arial Black", sans-serif', anton: 'Anton, Impact, sans-serif', gothic: '"Pirata One", serif', arimo: 'Arimo, Arial, sans-serif', pixel: 'VT323, monospace' };
const FONT_W = { impact: 'bold ', anton: '', gothic: '', arimo: 'bold ', pixel: '' };

export function fillLivery(cfg) {
  const c = { ...cfg };
  c.teamName ??= 'Your Team';
  c.showNumber ??= true; c.showSponsor ??= true; c.decals ??= [];
  c.helmetDesign = { base: c.helmet ?? c.accent, accent: c.main, third: c.third ?? 0x121214, pattern: 'stripe', visor: 'dark', number: true, decal: null, ...(c.helmetDesign || {}) };
  c.suit = { base: c.main, accent: c.accent, pattern: 'sides', chest: 'team', ...(c.suit || {}) };
  return c;
}

// ---------------- painting ----------------
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);

// canvas transform so drawing happens in the panel's metres: x right (s), y down (t)
export function panelTransform(p, W, H) {
  const [r0, r1, r2, r3] = p.rect, rw = (r2 - r0) * W, rh = (r3 - r1) * H;
  return [p.ds[0] * rw / p.W, -p.ds[1] * rh / p.W, p.dt[0] * rw / p.H, -p.dt[1] * rh / p.H,
    (r0 + p.o[0] * (r2 - r0)) * W, (1 - r1 - p.o[1] * (r3 - r1)) * H];
}
// atlas uv (e.g. from a raycast) -> { panel, x, y } in metres, or null
export function uvToPanel(panels, u, v) {
  let best = null;
  for (const [name, p] of Object.entries(panels)) {
    const [r0, r1, r2, r3] = p.rect;
    if (u < r0 || u > r2 || v < r1 || v > r3) continue;
    const lu = (u - r0) / (r2 - r0) - p.o[0], lv = (v - r1) / (r3 - r1) - p.o[1];
    const det = p.ds[0] * p.dt[1] - p.ds[1] * p.dt[0]; if (Math.abs(det) < 1e-9) continue;
    const s = (lu * p.dt[1] - lv * p.dt[0]) / det, t = (p.ds[0] * lv - p.ds[1] * lu) / det;
    if (s < -0.01 || s > 1.01 || t < -0.01 || t > 1.01) continue;
    best = { panel: name, x: Math.max(0, Math.min(1, s)) * p.W, y: Math.max(0, Math.min(1, t)) * p.H };
    break;
  }
  return best;
}

function onPanel(g, p, W, H, fn) {
  g.save();
  g.setTransform(...panelTransform(p, W, H));
  g.beginPath(); g.rect(0, 0, p.W, p.H); g.clip();
  fn(p.W, p.H);
  g.restore();
}
// panel-space helpers: a = along the car (0 rear .. 1 nose), c = across (0 top/left .. 1 bottom/right)
function alongCross(p) {
  if (p.nose === 'top') return (a, c) => [c * p.W, (1 - a) * p.H];
  if (p.nose === 'left') return (a, c) => [(1 - a) * p.W, c * p.H];
  return (a, c) => [a * p.W, c * p.H]; // nose on the right
}
function poly(g, P, pts) { g.beginPath(); pts.forEach(([a, c], k) => { const [x, y] = P(a, c); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); }

function textFit(g, text, font, maxW, h) {
  g.font = `${FONT_W[font] || ''}${h}px ${FONT_CSS[font] || FONT_CSS.impact}`;
  const w = g.measureText(text).width;
  if (w > maxW) { const k = maxW / w; g.font = `${FONT_W[font] || ''}${h * k}px ${FONT_CSS[font] || FONT_CSS.impact}`; return h * k; }
  return h;
}

function drawDecal(g, d, x, y, onReady) {
  g.save();
  g.translate(x, y); g.rotate(((d.rot || 0) * Math.PI) / 180); if (d.flip) g.scale(-1, 1);
  g.globalAlpha = d.opacity ?? 1;
  const w = d.size || 0.4;
  if (d.text != null) {
    const h = w; // text decals: size = letter height
    g.font = `${FONT_W[d.font] || ''}${h}px ${FONT_CSS[d.font] || FONT_CSS.impact}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (d.outline) { g.lineJoin = 'round'; g.lineWidth = h * 0.16; g.strokeStyle = hex(d.outline); g.strokeText(d.text, 0, 0); }
    g.fillStyle = hex(d.color ?? 0xffffff); g.fillText(d.text, 0, 0);
  } else {
    const im = decalImage(d.asset, onReady);
    if (im) { const h = w * (im.naturalHeight / im.naturalWidth); g.drawImage(im, -w / 2, -h / 2, w, h); }
  }
  g.restore();
}

// Everything drawn on ONE panel, in the panel's own metres (x right, y down, as seen from outside).
// The caller has already set the transform + clip. Shared by atlas-mapped and projected models.
export function panelArt(g, name, p, cfg, model, onReady) {
  const L = cfg.decals && cfg.helmetDesign ? cfg : fillLivery(cfg);
  const main = hex(L.main), acc = hex(L.accent), third = hex(L.third), pat = L.pattern;
  const PW = p.W, PH = p.H, P = alongCross(p);
  if (p.role === 'wing') { g.fillStyle = acc; g.fillRect(0, 0, PW, PH); g.fillStyle = third; g.fillRect(0, PH * 0.9, PW, PH * 0.1); }
  else if (p.role === 'plate') { g.fillStyle = acc; g.fillRect(0, 0, PW, PH * 0.22); g.fillStyle = third; g.fillRect(0, PH * 0.22, PW, PH * 0.04); }
  else {
    g.fillStyle = acc;
    if (p.role === 'top') {
      if (pat === 'stripe') { poly(g, P, [[0, 0.38], [1, 0.38], [1, 0.62], [0, 0.62]]); g.fillStyle = third; poly(g, P, [[0, 0.34], [1, 0.34], [1, 0.38], [0, 0.38]]); poly(g, P, [[0, 0.62], [1, 0.62], [1, 0.66], [0, 0.66]]); }
      else if (pat === 'arrow') poly(g, P, [[1, 0.5], [0.55, 0], [0.55, 0.2], [0.85, 0.5], [0.55, 0.8], [0.55, 1]]);
      else if (pat === 'sash') poly(g, P, [[0.6, 0.35], [1, 0.35], [1, 0.65], [0.6, 0.65]]);
    } else if (p.role === 'end' && pat === 'stripe') {
      // (a GT car's nose / tail face, seen head-on: the bonnet stripe carries on down it)
      g.fillRect(PW * 0.38, 0, PW * 0.24, PH); g.fillStyle = third; g.fillRect(PW * 0.34, 0, PW * 0.04, PH); g.fillRect(PW * 0.62, 0, PW * 0.04, PH);
    } else {
      if (pat === 'split') poly(g, P, [[0, 0.5], [1, 0.5], [1, 1], [0, 1]]);
      else if (pat === 'sash' && p.role === 'side') poly(g, P, [[0.25, 1], [0.45, 1], [0.7, 0], [0.5, 0]]);
      else if (pat === 'stripe' && p.role !== 'pod') poly(g, P, [[0, 0.02], [1, 0.02], [1, 0.12], [0, 0.12]]);
    }
    if (pat === 'fade') {
      const [x0, y0] = P(0, 0.5), [x1, y1] = P(0.6, 0.5);
      const grd = g.createLinearGradient(x0, y0, x1, y1); grd.addColorStop(0, acc); grd.addColorStop(1, main);
      g.fillStyle = grd; g.fillRect(0, 0, PW, PH);
    }
    // nose tip in the third colour
    if (p.role === 'top' || p.role === 'side') { g.fillStyle = third; poly(g, P, [[0.975, 0], [1, 0], [1, 1], [0.975, 1]]); }
  }
  // race number + sponsor (optional, part of the base livery)
  const num = String(L.number ?? 7), sp = String(L.sponsor || '').toUpperCase().slice(0, 14);
  const label = (a, c, text, h, maxW, fill, bar) => {
    if (!text) return;
    const [x, y] = P(a, c);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const hh = textFit(g, text, 'impact', maxW, h);
    const tw = Math.min(maxW, g.measureText(text).width);
    if (bar) { g.fillStyle = third; g.fillRect(x - tw / 2 - hh * 0.4, y - hh * 0.7, tw + hh * 0.8, hh * 1.4); }
    g.lineJoin = 'round'; g.lineWidth = hh * 0.16; g.strokeStyle = third; if (!bar) g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  };
  const numCol = pat === 'split' ? main : acc, lab = model.labels || {};
  if (L.showNumber) {
    if (name === 'top') label(...(lab.topNumber || [0.83, 0.5]), num, 0.24, Math.min(0.4, PW * 0.8), numCol);
    if (name === 'sideL' || name === 'sideR') label(...(lab.sideNumber || [0.68, 0.5]), num, 0.22, 0.6, numCol);
  }
  if (L.showSponsor && sp) {
    if (name === 'podL' || name === 'podR') label(0.5, 0.42, sp, Math.min(0.13, PH * 0.3), Math.min(1.2, PW * 0.6), acc, true);
    // (cars without sidepods, e.g. GT cars: on the flanks instead)
    if (lab.sideSponsor && (name === 'sideL' || name === 'sideR')) label(...lab.sideSponsor, sp, 0.12, 1.1, acc, true);
    if (name === 'rwing') label(0.5, 0.5, sp, Math.min(0.13, PH * 0.4), PW * 0.88, main);
    if (name === 'plateL' || name === 'plateR') label(0.5, 0.6, sp, Math.min(0.1, PH * 0.3), PW * 0.85, acc);
    if (name === 'coverL' || name === 'coverR') label(0.55, 0.45, String(L.teamName || '').toUpperCase().slice(0, 18), Math.min(0.08, PH * 0.25), Math.min(1.1, PW * 0.6), acc);
  }
  // user decals on this panel, plus mirror copies of decals from its pair (or from itself)
  for (const d of L.decals) {
    const src = model.panels[d.panel]; if (!src) continue;
    if (d.panel === name) {
      drawDecal(g, d, d.x, d.y, onReady);
      if (d.mirror && !(src.pair && model.panels[src.pair])) drawDecal(g, d, PW - d.x, d.y, onReady);
    } else if (d.mirror && src.pair === name) drawDecal(g, d, (1 - d.x / src.W) * PW, (d.y / src.H) * PH, onReady);
  }
}

// Paint a livery onto a model's livery canvas. onReady(): called if a decal image arrives later (repaint then).
// Atlas models (panels are rects in the texture) are drawn directly; projected models (e.g. an imported .glb)
// get each panel drawn on its own canvas and then mapped onto the surface by model.paintProjected().
export function paintCar(canvas, cfg, model, onReady) {
  const L = fillLivery(cfg), W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  if (model.paintProjected) return model.paintProjected(canvas, L, (pg, name, p) => { pg.fillStyle = hex(L.main); pg.fillRect(0, 0, p.W, p.H); panelArt(pg, name, p, L, model, onReady); });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = hex(L.main); g.fillRect(0, 0, W, H);
  // model-specific dark areas (floor edges etc.)
  g.fillStyle = hex(L.third);
  for (const r of model.dark || []) g.fillRect(r[0] * W, (1 - r[3]) * H, (r[2] - r[0]) * W, (r[3] - r[1]) * H);
  for (const [name, p] of Object.entries(model.panels)) onPanel(g, p, W, H, () => panelArt(g, name, p, L, model, onReady));
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// Helmet: equirectangular canvas for a sphere. model.helmetUV tells where the visor (front) sits in u.
export function paintHelmet(canvas, cfg, front = 0.25, onReady) {
  const D = fillLivery(cfg).helmetDesign, W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  const base = hex(D.base), acc = hex(D.accent), third = hex(D.third);
  const X = (u) => (((front + u) % 1) + 1) % 1 * W; // u relative to the visor (0 = front, .25 = left...)
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.fillStyle = acc;
  const band = (u0, u1, y0, y1) => { let a = X(u0), b = X(u1); if (b < a) { g.fillRect(a, y0 * H, W - a, (y1 - y0) * H); g.fillRect(0, y0 * H, b, (y1 - y0) * H); } else g.fillRect(a, y0 * H, b - a, (y1 - y0) * H); };
  const p = D.pattern;
  if (p === 'stripe') { band(-0.04, 0.04, 0, 0.55); band(0.46, 0.54, 0, 0.62); g.fillRect(0, 0, W, H * 0.07); g.fillStyle = third; band(-0.055, -0.04, 0, 0.55); band(0.04, 0.055, 0, 0.55); }
  else if (p === 'crown') { g.fillRect(0, 0, W, H * 0.28); g.fillStyle = third; g.fillRect(0, H * 0.28, W, H * 0.03); }
  else if (p === 'bands') { g.fillRect(0, H * 0.42, W, H * 0.07); g.fillStyle = third; g.fillRect(0, H * 0.5, W, H * 0.06); }
  else if (p === 'halves') { band(0, 0.5, 0, 1); }
  else if (p === 'flames') {
    g.beginPath(); g.moveTo(0, H);
    for (let k = 0; k <= 16; k++) { const x = (k / 16) * W; g.lineTo(x - W / 64, H * (0.62 - (k % 2 ? 0.02 : 0.2))); g.lineTo(x, H * 0.66); }
    g.lineTo(W, H); g.closePath(); g.fill();
  } else if (p === 'stars') {
    const star = (cx, cy, r) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    for (const [u, y, r] of [[0.25, 0.32, 0.09], [0.75, 0.32, 0.09], [0.5, 0.2, 0.06], [0, 0.2, 0.06], [0.37, 0.45, 0.05], [0.87, 0.45, 0.05], [0.12, 0.45, 0.05], [0.62, 0.45, 0.05]]) star(X(u), y * H, r * H);
  }
  // chin bar in the third colour, number on both sides
  g.fillStyle = third; g.fillRect(0, H * 0.8, W, H * 0.2);
  if (D.number) {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${H * 0.16}px Impact, Arial Black, sans-serif`;
    g.lineWidth = H * 0.025; g.strokeStyle = third;
    for (const u of [0.25, 0.75]) { g.strokeText(String(cfg.number ?? 7), X(u), H * 0.6); g.fillStyle = acc === base ? third : acc; g.fillText(String(cfg.number ?? 7), X(u), H * 0.6); }
  }
  if (D.decal) {
    const im = decalImage(D.decal, onReady);
    if (im) for (const u of [0.25, 0.75]) { const w = W * 0.13, h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, X(u) - w / 2, H * 0.34 - h / 2, w, h); }
  }
}
export const VISOR_COL = { dark: [0x121820, 0x88aacc], gold: [0x6a4a10, 0xffd070], blue: [0x10305a, 0x80c8ff], red: [0x5a1010, 0xff8060], clear: [0x3a4a58, 0xffffff] };

// Suit: canvases for torso, legs and arms (cylinders: u = 0 front, .25 left side, .5 back, .75 right side)
export function paintSuit(torso, legs, arms, cfg, onReady) {
  const L = fillLivery(cfg), S = L.suit, base = hex(S.base), acc = hex(S.accent), third = hex(L.third);
  for (const [cv, part] of [[torso, 'torso'], [legs, 'legs'], [arms, 'arms']]) {
    if (!cv) continue;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = acc;
    if (S.pattern === 'sides') { g.fillRect(W * 0.21, 0, W * 0.08, H); g.fillRect(W * 0.71, 0, W * 0.08, H); }
    else if (S.pattern === 'twotone') { if (part !== 'legs') g.fillRect(0, 0, W, H); }
    else if (S.pattern === 'shoulders') { if (part === 'torso') g.fillRect(0, 0, W, H * 0.3); else if (part === 'arms') g.fillRect(0, 0, W, H); }
    else if (S.pattern === 'sash' && part === 'torso') { g.beginPath(); g.moveTo(-W * 0.05, H * 0.1); g.lineTo(W * 0.1, H * 0.1); g.lineTo(W * 0.3, H); g.lineTo(W * 0.15, H); g.closePath(); g.fill(); g.beginPath(); g.moveTo(W * 0.9, H * 0.1); g.lineTo(W * 1.05, H * 0.1); g.lineTo(W * 1.05, H * 0.6); g.closePath(); g.fill(); }
    if (part === 'torso') {
      // belt + chest text + back number
      g.fillStyle = third; g.fillRect(0, H * 0.88, W, H * 0.06);
      const txt = S.chest === 'sponsor' ? String(L.sponsor || '') : S.chest === 'team' ? String(L.teamName || '') : '';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fillOn = S.pattern === 'twotone' ? base : acc;
      // chest text straddles u = 0 (the front), so draw it at both edges of the canvas
      if (txt) { g.fillStyle = fillOn; textFit(g, txt.toUpperCase(), 'impact', W * 0.3, H * 0.1); g.fillText(txt.toUpperCase(), 0, H * 0.42); g.fillText(txt.toUpperCase(), W, H * 0.42); }
      g.fillStyle = fillOn; g.font = `bold ${H * 0.2}px Impact, Arial Black, sans-serif`; g.fillText(String(L.number ?? 7), W * 0.5, H * 0.4);
      if (S.decal) { const im = decalImage(S.decal, onReady); if (im) { const w = W * 0.12, h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, W * 0.94 - w / 2, H * 0.55 - h / 2, w, h); g.drawImage(im, -w / 2 + W * 0.06, H * 0.55 - h / 2, w, h); } }
    } else {
      g.fillStyle = third; g.fillRect(0, H * 0.92, W, H * 0.08); // cuffs / boots edge
    }
  }
}

// ---------------- UV template for modellers ----------------
// A labelled picture of a model's panel layout: unwrap a new car's UVs so the same panels land in the same
// rects (and the same direction), and every existing livery works on it.
export function uvTemplate(model, size = 2048) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / (model.aspect || 2);
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#20242c'; g.fillRect(0, 0, W, H);
  const cols = ['#e05050', '#50a0e0', '#e0b040', '#60c070', '#b070e0', '#e08040', '#40c0c0', '#c0c040', '#e070b0', '#8090ff', '#70e0a0', '#ffa0a0'];
  // panel metres -> atlas pixels (for placing upright labels)
  const toPx = (p, x, y) => { const [a, b, cc, d, e, f] = panelTransform(p, W, H); return [a * x + cc * y + e, b * x + d * y + f]; };
  Object.entries(model.panels).forEach(([name, p], k) => {
    // fill + arrows in the panel's own orientation (exactly how it lands on the car)
    onPanel(g, p, W, H, (PW, PH) => {
      g.fillStyle = cols[k % cols.length] + '88'; g.fillRect(0, 0, PW, PH);
      g.strokeStyle = '#fff'; g.lineWidth = Math.min(PW, PH) * 0.02; g.strokeRect(0, 0, PW, PH);
      const L = Math.min(PW, PH);
      g.lineWidth = L * 0.035; g.lineCap = 'round';
      const arrow = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); const a = Math.atan2(y1 - y0, x1 - x0), h = L * 0.12; g.lineTo(x1 - Math.cos(a - 0.5) * h, y1 - Math.sin(a - 0.5) * h); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a + 0.5) * h, y1 - Math.sin(a + 0.5) * h); g.stroke(); };
      g.strokeStyle = '#fff'; arrow(PW * 0.12, PH * 0.82, PW * 0.12 + L * 0.7, PH * 0.82);          // right
      g.strokeStyle = '#ffd66b'; arrow(PW * 0.12, PH * 0.82, PW * 0.12, PH * 0.82 - L * 0.55);     // up
    });
    // upright text in atlas space so the template is readable
    const [cx, cy] = toPx(p, p.W / 2, p.H / 2);
    const [rx0, ry0] = [p.rect[0] * W, (1 - p.rect[3]) * H], rw = (p.rect[2] - p.rect[0]) * W, rh = (p.rect[3] - p.rect[1]) * H;
    const fs = Math.max(11, Math.min(rw / 7, rh / 6, 34));
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${fs}px Arial`; g.fillText(name, cx, cy - fs * 0.6);
    g.font = `${fs * 0.5}px Arial`; g.fillText(`${p.label || ''} · ${p.W}×${p.H} m`, cx, cy + fs * 0.35);
    // tag the arrow tips
    const L = Math.min(p.W, p.H);
    g.font = `bold ${Math.max(10, fs * 0.45)}px Arial`;
    const [ax, ay] = toPx(p, p.W * 0.12 + L * 0.8, p.H * 0.82); g.fillStyle = '#fff'; g.fillText('RIGHT', ax, ay);
    const [ux, uy] = toPx(p, p.W * 0.12, p.H * 0.82 - L * 0.66); g.fillStyle = '#ffd66b'; g.fillText('UP', ux, uy);
    if (p.nose) { g.fillStyle = '#9aa6ba'; g.font = `${Math.max(10, fs * 0.42)}px Arial`; g.fillText(`nose: ${p.nose} as seen from outside`, cx, Math.min(ry0 + rh - fs * 0.4, cy + fs * 1.1)); }
    void rx0;
  });
  g.fillStyle = '#9aa6ba'; g.font = `${H * 0.018}px Arial`; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(`San Velocita GP livery atlas · model "${model.id}" · UV (0,0) = bottom-left · arrows = right / up as seen from outside the car`, 8, H - 6);
  return c;
}
