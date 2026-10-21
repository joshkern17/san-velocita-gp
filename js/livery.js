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
import { backupAsset } from './backup.js'; // (your images are kept in saves/ too)
import { SPONSOR_LOGOS, LOGO_VERSIONS, LOGO_COLORS, logoUrl, logoAsset, logoForName } from './sponsorlogos.js';
import { SCHEMES } from './teamliveries.js';

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
async function idbPut(id, v) { backupAsset(id, v); const d = await db(); if (!d) return; return new Promise(res => { const tx = d.transaction('assets', 'readwrite'); tx.objectStore('assets').put(v, id); tx.oncomplete = res; tx.onerror = res; }); }

export const assets = {
  has: (id) => mem.has(id),
  get: (id) => mem.get(id) || null,
  // add without persisting (e.g. received from another player online)
  put(id, url) { if (!id || !url || mem.has(id)) return; mem.set(id, url); flush(id); },
  async save(id, url) { mem.set(id, url); await idbPut(id, url); flush(id); },
  async load(ids) { for (const id of ids) if (id && !mem.has(id)) { const v = await idbGet(id); if (v) { mem.set(id, v); flush(id); } } },
  pick(ids) { const o = {}; for (const id of ids) if (mem.has(id)) o[id] = mem.get(id); return o; },
  // one that ships with the game (a file, never saved): it wins over anything stored under the same id
  builtin(id, url) { mem.set(id, url); imgs.delete(id); flush(id); },
};
// the sponsors' logos, every version (js/sponsorlogos.js)
for (const slug of Object.keys(SPONSOR_LOGOS)) for (const v of Object.keys(LOGO_VERSIONS)) assets.builtin(logoAsset(slug, v), logoUrl(slug, v));
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
export const liveryAssetIds = (cfg) => [...new Set([...(cfg.decals || []).map(d => d.asset), ...(cfg.suit?.decals || []).map(d => d.asset), cfg.helmetDesign?.decal, cfg.suit?.decal].filter(Boolean))];

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
export const PATTERNS = { solid: 'Solid', stripe: 'Center Stripe', split: 'Two-Tone', arrow: 'Arrow Nose', fade: 'Fade', sash: 'Side Sash' };
export const HELMET_PATTERNS = { solid: 'Solid', stripe: 'Center Stripe', crown: 'Crown', bands: 'Eye Bands', halves: 'Halves', flames: 'Flames', stars: 'Stars' };
export const SUIT_PATTERNS = { solid: 'Solid', sides: 'Side Stripes', twotone: 'Two-Tone', shoulders: 'Shoulders', sash: 'Sash', panels: 'Side Panels', fade: 'Fade', chevron: 'Chevron' };
export const SUIT_NUMBERS = { back: 'Back', chest: 'Chest', sleeves: 'Sleeves', none: 'None' };
// the pit crew's kit: the driver's suit, their own colours, or the stock mechanic's coveralls
export const CREW_STYLES = { suit: 'Team suits', own: 'Own colors', classic: 'Coveralls' };
export const VISORS = { dark: 'Dark', gold: 'Gold Iridium', blue: 'Blue Iridium', red: 'Red Iridium', clear: 'Light Tint' };
// the strip across the top of the visor (on helmets that have one: the racer in js/characters.js)
export const VISOR_STRIPS = { team: 'Team color', sponsor: 'Sponsor', off: 'Off' };
export const FONTS = { impact: 'Impact', anton: 'Anton', gothic: 'Gothic', arimo: 'Clean', pixel: 'Pixel' };
const FONT_CSS = { impact: 'Impact, "Arial Black", sans-serif', anton: 'Anton, Impact, sans-serif', gothic: '"Pirata One", serif', arimo: 'Arimo, Arial, sans-serif', pixel: 'VT323, monospace' };
const FONT_W = { impact: 'bold ', anton: '', gothic: '', arimo: 'bold ', pixel: '' };

export function fillLivery(cfg) {
  const c = { ...cfg };
  c.teamName ??= 'Your Team';
  c.showNumber ??= true; c.showSponsor ??= true; c.decals ??= [];
  c.sponsorLogo ??= 'color'; // (the sponsor sticker: its logo in this version when the sponsor has one, 'name': just the name)
  c.helmetDesign = { base: c.helmet ?? c.accent, accent: c.main, third: c.third ?? 0x121214, pattern: 'stripe', visor: 'dark', strip: 'team', number: true, decal: null, ...(c.helmetDesign || {}) };
  c.suit = { base: c.main, accent: c.accent, pattern: 'sides', chest: 'team', number: 'back', gloves: c.third ?? 0x121214, boots: c.third ?? 0x121214, decals: [], ...(c.suit || {}) };
  c.crew = { style: 'suit', base: c.suit.base, accent: c.suit.accent, ...(c.crew || {}) };
  return c;
}

// ---------------- painting ----------------
const hex = (c) => '#' + ((c ?? 0) >>> 0).toString(16).padStart(6, '0').slice(-6);
const mix = (a, b, t) => hex([16, 8, 0].reduce((o, k) => o | Math.round((((a ?? 0) >> k) & 255) * (1 - t) + (((b ?? 0) >> k) & 255) * t) << k, 0));

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

// A sponsor's logo in place of its name sticker: about twice the name's letter height h, no wider than maxW, on a
// plate of the bar colour when the sticker has one
const STICKER_PAD = 0.3;
// a team livery on a road car: the side number moves this far forward and the big logo this far back (of the length)
const BIG_SHIFT = [0.12, 0.08];
function logoBox(im, h, maxW) {
  let lh = h * 1.9, lw = lh * (im.naturalWidth || im.width) / (im.naturalHeight || im.height);
  if (lw > maxW) { lh *= maxW / lw; lw = maxW; }
  return [lw, lh];
}
function drawLogo(g, im, x, y, h, maxW, bar) {
  const [lw, lh] = logoBox(im, h, maxW);
  if (bar) { const pd = h * STICKER_PAD; g.fillStyle = bar; g.fillRect(x - lw / 2 - pd, y - lh / 2 - pd, lw + 2 * pd, lh + 2 * pd); }
  g.drawImage(im, x - lw / 2, y - lh / 2, lw, lh);
}
// the logos the built-in sponsor sticker may show (none: the sponsor's name in letters). 'tint': the white one, drawn in
// L.sponsorTint; 'auto': whichever of its brand colour, white or black stands out on the paint under it
function stickerLogos(L) {
  const slug = L.showSponsor && L.stickers !== 'decals' && L.sponsorLogo !== 'name' && logoForName(String(L.sponsor || '').slice(0, 14));
  if (!slug) return [];
  return L.sponsorLogo === 'auto' ? ['main', 'white', 'black'].map(v => logoAsset(slug, v)) : [logoAsset(slug, L.sponsorLogo === 'tint' ? 'white' : L.sponsorLogo || 'color')];
}
// the paint round a spot (x, y in the panel's metres, w x h the area it covers): the colours at a few points on it
function paintUnder(g, x, y, w, h) {
  const m = g.getTransform(), out = [];
  for (const [dx, dy] of [[0, 0], [-0.35, 0], [0.35, 0], [0, -0.35], [0, 0.35], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2], [0.2, 0.2]]) {
    const p = m.transformPoint({ x: x + dx * w, y: y + dy * h }), d = g.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
    if (d[3]) out.push([d[0], d[1], d[2]]);
  }
  return out;
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (c) => [c >> 16 & 255, c >> 8 & 255, c & 255];
// 'auto': the brand colour when it stands out clearly everywhere on that paint, else white or black, whichever stands
// out more where it stands out least (a logo across two colours has to read on both)
function autoVersion(slug, bgs) {
  if (!bgs.length) return 'white';
  const worst = (c) => Math.min(...bgs.map(b => contrast(c, b)));
  if (worst(rgb(LOGO_COLORS[slug] ?? 0)) >= 3) return 'main';
  return worst([255, 255, 255]) >= worst([17, 17, 20]) ? 'white' : 'black';
}
// a one-colour logo in another colour (kept: the same few are asked for on every repaint)
const tints = new Map();
function tinted(im, col) {
  const k = im.src + col; let c = tints.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = hex(col); g.fillRect(0, 0, c.width, c.height);
    tints.set(k, c);
  }
  return c;
}
// the logo asset a title sponsor sticker shows (its text filled in), or null: its own name in letters
export function boundLogo(d) {
  if (d.bind !== 'sponsor' || d.logo === 'name') return null;
  const slug = logoForName(d.text);
  return slug ? logoAsset(slug, LOGO_VERSIONS[d.logo] ? d.logo : 'color') : null; // (a team livery's 'auto' / 'tint': full colour)
}

export function drawDecal(g, d, x, y, onReady) {
  g.save();
  g.translate(x, y); g.rotate(((d.rot || 0) * Math.PI) / 180); if (d.flip) g.scale(-1, 1);
  g.globalAlpha = d.opacity ?? 1;
  const w = d.size || 0.4;
  const lid = d.text != null && boundLogo(d);
  if (lid) { // (the title sponsor's sticker, as its logo)
    const im = decalImage(lid, onReady);
    if (im) drawLogo(g, im, 0, 0, w, w * 9, d.bar != null ? hex(d.bar) : null);
  } else if (d.text != null) {
    const h = w; // text decals: size = letter height
    g.font = `${FONT_W[d.font] || ''}${h}px ${FONT_CSS[d.font] || FONT_CSS.impact}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (d.bar != null) { const tw = g.measureText(d.text).width; g.fillStyle = hex(d.bar); g.fillRect(-tw / 2 - h * 0.4, -h * 0.7, tw + h * 0.8, h * 1.4); }
    if (d.outline) { g.lineJoin = 'round'; g.lineWidth = h * 0.16; g.strokeStyle = hex(d.outline); g.strokeText(d.text, 0, 0); }
    g.fillStyle = hex(d.color ?? 0xffffff); g.fillText(d.text, 0, 0);
  } else if (d.path) {
    // a vector shape (the designer's shape editor, js/vectoredit.js): size = its width; strokes keep their width
    const k = w / (d.path.w || w), p2 = shapePath(d.path);
    g.scale(k, k);
    if (d.fill != null) { g.fillStyle = hex(d.fill); g.fill(p2); }
    if (d.stroke != null && d.sw > 0) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = d.sw / k; g.strokeStyle = hex(d.stroke); g.stroke(p2); }
  } else {
    const im = decalImage(d.asset, onReady);
    if (im) { const h = w * (im.naturalHeight / im.naturalWidth); g.drawImage(im, -w / 2, -h / 2, w, h); }
  }
  g.restore();
}

// Vector shapes: d.path = { w, closed, n: [[x, y, ix, iy, ox, oy, smooth], ...] }, in metres round the decal's point
// at size = w; ix/iy and ox/oy are each node's in / out Bézier handles relative to it (0, 0: a straight line).
// Fill and stroke are colours or null, sw the stroke width (m). A mirror copy of a shape is mirrored, not just moved.
export function shapePath(P, close = P.closed) {
  const p = new Path2D(), n = P.n;
  if (!n || !n.length) return p;
  const seg = (a, b) => (a[4] || a[5] || b[2] || b[3]) ? p.bezierCurveTo(a[0] + a[4], a[1] + a[5], b[0] + b[2], b[1] + b[3], b[0], b[1]) : p.lineTo(b[0], b[1]);
  p.moveTo(n[0][0], n[0][1]);
  for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
  if (close && n.length > 1) { seg(n[n.length - 1], n[0]); p.closePath(); }
  return p;
}
// its bounds [x0, y0, x1, y1] (curves sampled)
export function shapeBounds(P) {
  const n = P.n, b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  const seg = (a, c) => {
    if (!(a[4] || a[5] || c[2] || c[3])) return add(c[0], c[1]);
    for (let s = 1; s <= 16; s++) { const t = s / 16, u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t;
      add(A * a[0] + B * (a[0] + a[4]) + C * (c[0] + c[2]) + D * c[0], A * a[1] + B * (a[1] + a[5]) + C * (c[1] + c[3]) + D * c[1]); }
  };
  if (!n || !n.length) return [0, 0, 0, 0];
  add(n[0][0], n[0][1]);
  for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
  if (P.closed && n.length > 1) seg(n[n.length - 1], n[0]);
  return b;
}
// the SVG path data (thumbnails, export)
export function pathD(P) {
  const n = P.n, f = (v) => +v.toFixed(4);
  if (!n || !n.length) return '';
  let s = `M${f(n[0][0])} ${f(n[0][1])}`;
  const seg = (a, b) => { s += (a[4] || a[5] || b[2] || b[3]) ? `C${f(a[0] + a[4])} ${f(a[1] + a[5])} ${f(b[0] + b[2])} ${f(b[1] + b[3])} ${f(b[0])} ${f(b[1])}` : `L${f(b[0])} ${f(b[1])}`; };
  for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
  if (P.closed && n.length > 1) { seg(n[n.length - 1], n[0]); s += 'Z'; }
  return s;
}
// a shape's mirror copy: flipped and turned the other way (so a swoosh points at the nose on both sides)
const mirrored = (d) => d.path ? { ...d, flip: !d.flip, rot: -(d.rot || 0) } : d;

// Everything drawn on ONE panel, in the panel's own metres (x right, y down, as seen from outside).
// The caller has already set the transform + clip. Shared by atlas-mapped and projected models.
export function panelArt(g, name, p, cfg, model, onReady, decals = true) {
  const L = cfg.decals && cfg.helmetDesign ? cfg : fillLivery(cfg);
  const main = hex(L.main), acc = hex(L.accent), third = hex(L.third), pat = L.pattern;
  const PW = p.W, PH = p.H, P = alongCross(p), S = SCHEMES[L.scheme];
  if (S) {
    // a team's livery (teamliveries.js) in place of the pattern
    if (p.role === 'wing') { g.fillStyle = hex(S.wing ?? L.accent); g.fillRect(0, 0, PW, PH); }
    else if (p.role === 'plate') { g.fillStyle = hex(S.plate ?? L.accent); g.fillRect(0, 0, PW, PH * 0.22); }
    else for (const sh of S.shapes) if (sh.on.includes(p.role)) { g.fillStyle = hex(sh.col); poly(g, P, sh.pts); }
  }
  else if (p.role === 'wing') { g.fillStyle = L.wingColor != null ? hex(L.wingColor) : acc; g.fillRect(0, 0, PW, PH); g.fillStyle = third; g.fillRect(0, PH * 0.9, PW, PH * 0.1); }
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
    // nose tip in the third colour (not on cars with a nose panel of their own: on a road car the top's last 2.5%
    // is the bumper's top edge, a sliver under the grille, and the band came out as a jagged bar)
    if ((p.role === 'top' || p.role === 'side') && !model.panels?.front) { g.fillStyle = third; poly(g, P, [[0.975, 0], [1, 0], [1, 1], [0.975, 1]]); }
  }
  // race number + sponsor (optional, part of the base livery)
  const num = String(L.number ?? 7), sp = String(L.sponsor || '').toUpperCase().slice(0, 14);
  const spIds = stickerLogos(L);
  const label = (a, c, text, h, maxW, fill, bar) => {
    if (!text) return;
    const [x, y] = P(a, c);
    // (the sponsor's logo, when it has one)
    // (on its plate in full color; a one-color version goes straight on the paint)
    // (a team livery's is bigger, as big as the panel lets it be: 1.9 x hh tall at most 80% of it)
    if (text === sp && spIds.length) {
      const hh = Math.min(h * spK, PH * 0.42), mw = Math.min(maxW * spK, PW * 0.92);
      let id = spIds[0];
      if (L.sponsorLogo === 'auto') { const v = autoVersion(logoForName(sp), paintUnder(g, x, y, mw, hh * 1.9)); id = spIds.find(k => k.endsWith(':' + v)); }
      const im = decalImage(id, onReady);
      if (im) drawLogo(g, L.sponsorLogo === 'tint' ? tinted(im, L.sponsorTint ?? 0xffffff) : im, x, y, hh, mw, bar && (L.sponsorLogo || 'color') === 'color' && !S ? third : null);
      return;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const hh = textFit(g, text, 'impact', maxW, h);
    const tw = Math.min(maxW, g.measureText(text).width);
    if (bar) { g.fillStyle = third; g.fillRect(x - tw / 2 - hh * 0.4, y - hh * 0.7, tw + hh * 0.8, hh * 1.4); }
    g.lineJoin = 'round'; g.lineWidth = hh * 0.16; g.strokeStyle = third; if (!bar) g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  };
  const numCol = S?.num != null ? hex(S.num) : pat === 'split' ? main : acc, lab = model.labels || {}, spK = S ? S.logoScale || 2 : 1;
  if (L.showNumber) {
    if (name === 'top') label(...(lab.topNumber || [0.83, 0.5]), num, 0.24, Math.min(0.4, PW * 0.8), numCol);
    // (a team livery's on a car with a big flank logo: a little forward, the logo a little back, side by side)
    if (name === 'sideL' || name === 'sideR') { const [a, c] = lab.sideNumber || [0.68, 0.5]; label(S && lab.sideSponsor && spIds.length ? a + BIG_SHIFT[0] : a, c, num, 0.22, 0.6, numCol); }
  }
  // (once the stickers are decals, L.stickers === 'decals', they're drawn with the rest below, wherever they've been moved)
  if (L.showSponsor && sp && L.stickers !== 'decals') {
    if (name === 'podL' || name === 'podR') label(0.5, 0.42, sp, Math.min(0.13, PH * 0.3), Math.min(1.2, PW * 0.6), acc, true);
    // (cars without sidepods, e.g. GT cars: on the flanks instead)
    if (lab.sideSponsor && (name === 'sideL' || name === 'sideR')) {
      // (a team livery's big logo: behind the number, from its top down to the usual sticker's bottom edge, kept clear of it)
      if (S && spIds.length) {
        const top = (lab.sideNumber || [0.68, 0.5])[1] * PH - 0.04, bot = lab.sideSponsor[1] * PH + 0.115, gap = (BIG_SHIFT[0] + BIG_SHIFT[1]) * PW - 0.18;
        label(lab.sideSponsor[0] - BIG_SHIFT[1], (top + bot) / 2 / PH, sp, Math.min(0.14 * spK, (bot - top) / 1.9) / spK, Math.max(0.5, 2 * gap) / spK, acc, true);
      }
      else label(...lab.sideSponsor, sp, 0.12, 1.1, acc, true);
    }
    if (name === 'rwing') label(0.5, 0.5, sp, Math.min(0.13, PH * 0.4), PW * 0.88, main);
    if (name === 'plateL' || name === 'plateR') label(0.5, 0.6, sp, Math.min(0.1, PH * 0.3), PW * 0.85, acc);
    if (name === 'coverL' || name === 'coverR') label(0.55, 0.45, String(L.teamName || '').toUpperCase().slice(0, 18), Math.min(0.08, PH * 0.25), Math.min(1.1, PW * 0.6), acc);
  }
  // user decals on this panel, plus mirror copies of decals from its pair (or from itself)
  if (decals) for (const d0 of L.decals) {
    const src = model.panels[d0.panel]; if (!src) continue;
    const d = d0.bind ? { ...d0, text: boundText(L, d0.bind) } : d0;
    if (d.bind && !d.text) continue;
    if (d.panel === name) {
      drawDecal(g, d, d.x, d.y, onReady);
      if (d.mirror && !(src.pair && model.panels[src.pair])) drawDecal(g, mirrored(d), PW - d.x, d.y, onReady);
    } else if (d.mirror && src.pair === name) drawDecal(g, mirrored(d), (1 - d.x / src.W) * PW, (d.y / src.H) * PH, onReady);
  }
}

// Models that project decals across their panels (projectDecals: the F1 and the photo-textured road cars) take them as
// layers instead: each one (and its mirror copy) drawn on its own canvas (w x h px) round it, k px per metre, its
// top-left at x0, y0 in its panel's metres and rx / ry its half-sizes, in the livery's order
export function decalLayers(cfg, model, ppm, onReady) {
  const L = cfg.decals && cfg.helmetDesign ? cfg : fillLivery(cfg), out = [], g0 = document.createElement('canvas').getContext('2d');
  const add = (d, panel, x, y) => {
    const w = d.size || 0.4; let hw = w / 2, hh = w / 2;
    const lid = d.text != null && boundLogo(d);
    if (lid) {
      const im = decalImage(lid, onReady); if (!im) return;
      const [lw, lh] = logoBox(im, w, w * 9), pd = d.bar != null ? w * STICKER_PAD : 0;
      hw = lw / 2 + pd; hh = lh / 2 + pd;
    } else if (d.text != null) { // (measured at 100x: canvas fonts this small in px don't measure reliably)
      g0.font = `${FONT_W[d.font] || ''}${w * 100}px ${FONT_CSS[d.font] || FONT_CSS.impact}`;
      hw = g0.measureText(d.text).width / 200 + w * (d.bar != null ? 0.4 : 0.1); hh = w * 0.7;
    } else if (d.path) {
      if (!d.path.n || d.path.n.length < 2) return;
      const b = shapeBounds(d.path), k = w / (d.path.w || w), pad = d.stroke != null ? (d.sw || 0) / 2 : 0;
      hw = Math.max(-b[0], b[2]) * k + pad; hh = Math.max(-b[1], b[3]) * k + pad;
    } else {
      const im = decalImage(d.asset, onReady); if (!im) return;
      hh = hw * im.naturalHeight / im.naturalWidth;
    }
    // (its rotated rectangle's bounds, half-widths across / down)
    const t = ((d.rot || 0) * Math.PI) / 180, cs = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
    const rx = cs * hw + sn * hh + 0.01, ry = sn * hw + cs * hh + 0.01, k = Math.min(ppm, 4096 / (2 * Math.max(rx, ry)));
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(2 * rx * k)); c.height = Math.max(2, Math.ceil(2 * ry * k));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(k, 0, 0, k, (rx - x) * k, (ry - y) * k);
    drawDecal(g, d, x, y, onReady);
    out.push({ panel, x0: x - rx, y0: y - ry, rx, ry, k, w: c.width, h: c.height, rad: Math.max(0.05, Math.min(hw, hh)), data: g.getImageData(0, 0, c.width, c.height).data });
  };
  for (const d0 of L.decals) {
    const src = model.panels[d0.panel]; if (!src) continue;
    const d = d0.bind ? { ...d0, text: boundText(L, d0.bind) } : d0;
    if (d.bind && !d.text) continue;
    add(d, d.panel, d.x, d.y);
    if (!d.mirror) continue;
    const pr = src.pair && model.panels[src.pair];
    if (pr) add(mirrored(d), src.pair, (1 - d.x / src.W) * pr.W, (d.y / src.H) * pr.H);
    else add(mirrored(d), d.panel, src.W - d.x, d.y);
  }
  return out;
}

// ---------------- stickers: decals draped over the body, Forza-style ----------------
// A decal is projected onto the body from its panel's side, as before, but measured along the surface instead of flat
// across it: a sticker 40 cm wide stays 40 cm wide where the bonnet rolls down into the nose or a flank curves under,
// rather than being squeezed into the 40 cm the panel sees there. Its map from the body to sticker metres is one
// smooth function of where you are on the panel (no route over the body to depend on), so it can't tear or twist round
// a grille, a lamp or a wheel arch, and a shape's edges run where you'd expect between its nodes.
// The mesh: the livery triangles in body coordinates (the order the texel map numbers them in) then the other body
// parts (lamps, glass), with each face's outward normal (fn, by the model's own normals; winding isn't consistent).
export function stickerMesh(tp, tn, pieces = false) {
  const nt = tp.length / 9, fn = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const o = t * 9, ax = tp[o + 3] - tp[o], ay = tp[o + 4] - tp[o + 1], az = tp[o + 5] - tp[o + 2], bx = tp[o + 6] - tp[o], by = tp[o + 7] - tp[o + 1], bz = tp[o + 8] - tp[o + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
    if (tn && nx * (tn[o] + tn[o + 3] + tn[o + 6]) + ny * (tn[o + 1] + tn[o + 4] + tn[o + 7]) + nz * (tn[o + 2] + tn[o + 5] + tn[o + 8]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
  }
  if (!pieces) return { nt, tp, fn };
  // (pieces: its connected pieces, corners welded at 1 mm: the body, and parts made apart from it, a wing, louvres.
  // comp[t] per triangle; main = the biggest piece. For floatingParts)
  const par = new Int32Array(nt), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }, at = new Map();
  for (let t = 0; t < nt; t++) par[t] = t;
  for (let v = 0; v < nt * 3; v++) {
    const k = Math.round(tp[v * 3] * 1000) + ',' + Math.round(tp[v * 3 + 1] * 1000) + ',' + Math.round(tp[v * 3 + 2] * 1000), t = v / 3 | 0;
    if (at.has(k)) { const a = find(t), b = find(at.get(k)); if (a !== b) par[a] = b; } else at.set(k, t);
  }
  const comp = new Int32Array(nt), size = new Map();
  for (let t = 0; t < nt; t++) { comp[t] = find(t); size.set(comp[t], (size.get(comp[t]) || 0) + 1); }
  let main = -1; for (const [c, n] of size) if (main < 0 || n > size.get(main)) main = c;
  return { nt, tp, fn, comp, main, floating: {} };
}
// The pieces that float over the body seen from a panel's side, with air under them: a rear wing from above, louvres
// over the rear glass. A sticker drapes over the body under them (so it isn't torn by the wing's edges or hidden under
// it) and lands on them too, where they face its way, at the same place on the sticker as the body under them: a
// stripe runs over the deck and on along the wing above it. A piece floats if, over most of what it covers, the main
// body is there under it 4 cm or more lower.
function floatingParts(M, name, A) {
  if (M.floating[name]) return M.floating[name];
  const { right: R0, down: D0, dir } = A, tp = M.tp, C = 0.03, top = new Map(), main = new Map(); // (cell -> depth: per piece, and the main body's)
  for (let t = 0; t < M.nt; t++) {
    if (M.fn[t * 3] * dir[0] + M.fn[t * 3 + 1] * dir[1] + M.fn[t * 3 + 2] * dir[2] <= 0.05) continue;
    const c = M.comp[t], into = c === M.main ? main : (top.get(c) || top.set(c, new Map()).get(c));
    const U = [0, 0, 0], V = [0, 0, 0], Z = [0, 0, 0];
    for (let k = 0; k < 3; k++) { const q = t * 9 + k * 3; U[k] = (tp[q] * R0[0] + tp[q + 1] * R0[1] + tp[q + 2] * R0[2]) / C; V[k] = (tp[q] * D0[0] + tp[q + 1] * D0[1] + tp[q + 2] * D0[2]) / C; Z[k] = tp[q] * dir[0] + tp[q + 1] * dir[1] + tp[q + 2] * dir[2]; }
    const den = (V[1] - V[2]) * (U[0] - U[2]) + (U[2] - U[1]) * (V[0] - V[2]), e = -0.7 / Math.max(1, Math.abs(den) ** 0.5); if (Math.abs(den) < 1e-9) continue;
    for (let j = Math.floor(Math.min(...V)); j <= Math.ceil(Math.max(...V)); j++) for (let i = Math.floor(Math.min(...U)); i <= Math.ceil(Math.max(...U)); i++) {
      const a = ((V[1] - V[2]) * (i + 0.5 - U[2]) + (U[2] - U[1]) * (j + 0.5 - V[2])) / den, b = ((V[2] - V[0]) * (i + 0.5 - U[2]) + (U[0] - U[2]) * (j + 0.5 - V[2])) / den, cc = 1 - a - b;
      if (a < e || b < e || cc < e) continue; // (a little past its edges, so slivers still count)
      const cell = i * 100003 + j, z = Z[0] * a + Z[1] * b + Z[2] * cc;
      if (!(into.get(cell) >= z)) into.set(cell, z);
    }
  }
  const out = new Set();
  for (const [c, cells] of top) {
    let over = 0, gap = 0;
    for (const [cell, z] of cells) { const b = main.get(cell); if (b == null) continue; over++; if (b < z - 0.04) gap++; }
    if (over >= 3 && gap >= over * 0.7) out.add(c);
  }
  return (M.floating[name] = out);
}
// the nearest triangle a ray (body coordinates) hits: { t, tri, b1, b2 } (Möller–Trumbore) or null. front: only faces
// looking back at the ray (by the model's own normals), so a click doesn't land on the inside of an open part
export function rayMesh(M, o, d, front = false) {
  const tp = M.tp; let best = null;
  for (let t = 0; t < M.nt; t++) {
    if (front && M.fn[t * 3] * d[0] + M.fn[t * 3 + 1] * d[1] + M.fn[t * 3 + 2] * d[2] > 0) continue;
    const q = t * 9, e1x = tp[q + 3] - tp[q], e1y = tp[q + 4] - tp[q + 1], e1z = tp[q + 5] - tp[q + 2], e2x = tp[q + 6] - tp[q], e2y = tp[q + 7] - tp[q + 1], e2z = tp[q + 8] - tp[q + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, sx = o[0] - tp[q], sy = o[1] - tp[q + 1], sz = o[2] - tp[q + 2], u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist > 1e-6 && (!best || dist < best.t)) best = { t: dist, tri: t, b1: u, b2: v };
  }
  return best;
}
// a panel's projector as vectors: panel metres = (right . p + o[0], down . p + o[1]), looking in along -dir
function panelAxes(pn) {
  const o = pn.proj(0, 0, 0), ex = pn.proj(1, 0, 0), ey = pn.proj(0, 1, 0), ez = pn.proj(0, 0, 1);
  return { o, right: [ex[0] - o[0], ey[0] - o[0], ez[0] - o[0]], down: [ex[1] - o[1], ey[1] - o[1], ez[1] - o[1]], dir: pn.dir };
}
// (how far past a sticker's box its sheet is worked out: the same for painting and the designer, so both agree)
export const STICK_MARGIN = 0.3;
const DC = 0.015, STEEP = 4, SKIN = 0.12;
// how much surface one step across the panel covers, for a rise of dz over it: the true length, up to slopes of 4 to 1
// (76°); steeper than that it's a step between parts (a wing above the deck, a bumper's lip) rather than a surface
// the sticker lies on, so it eases back to flat by 8 to 1 and a stripe isn't pushed along by every step it crosses
const along = (dz) => { const s = Math.abs(dz) / DC; return DC * (s <= STEEP ? Math.sqrt(1 + s * s) : s >= 2 * STEEP ? 1 : Math.sqrt(1 + STEEP * STEEP) + (1 - Math.sqrt(1 + STEEP * STEEP)) * (s - STEEP) / STEEP); };
// Drape a sticker centred at (cx, cy) on panel pn, half-sizes rx, ry (+ margin), over mesh M: a 1.5 cm grid over the
// panel round it of the outer surface's depth (openings and the space past the body's edge bridged from round them),
// and from that the sticker metres at each grid point: along the surface from the centre, across each row for x and
// down each column for y. Returns S for stickerPoint / stickerCoords / stickerRay / wrapDecals, or null where there's
// no body facing this way anywhere round it.
export function drapeSticker(M, pn, cx, cy, rx, ry, margin = STICK_MARGIN) {
  const A = panelAxes(pn), { right: R0, down: D0, dir } = A, tp = M.tp;
  const ci = Math.ceil((rx + margin) / DC), cj = Math.ceil((ry + margin) / DC), gw = ci * 2 + 1, gh = cj * 2 + 1, u0 = cx - ci * DC, v0 = cy - cj * DC;
  const H = new Float32Array(gw * gh).fill(-Infinity), tris = [], fl = M.comp && !globalThis.NOFLOAT ? floatingParts(M, pn.label || dir.join(), A) : null;
  for (let t = 0; t < M.nt; t++) {
    if (M.fn[t * 3] * dir[0] + M.fn[t * 3 + 1] * dir[1] + M.fn[t * 3 + 2] * dir[2] <= 0.05) continue; // (edge-on, or facing away)
    if (fl && fl.has(M.comp[t])) { // (a wing: painted, but not part of the sheet; see floatingParts)
      let inside = false;
      for (let k = 0; k < 3 && !inside; k++) { const q = t * 9 + k * 3, u = (tp[q] * R0[0] + tp[q + 1] * R0[1] + tp[q + 2] * R0[2] + A.o[0] - u0) / DC, v = (tp[q] * D0[0] + tp[q + 1] * D0[1] + tp[q + 2] * D0[2] + A.o[1] - v0) / DC; inside = u > -1 && v > -1 && u < gw && v < gh; }
      if (inside) tris.push(t);
      continue;
    }
    const U = [0, 0, 0], V = [0, 0, 0], Z = [0, 0, 0];
    for (let k = 0; k < 3; k++) { const q = t * 9 + k * 3, x = tp[q], y = tp[q + 1], z = tp[q + 2]; U[k] = (x * R0[0] + y * R0[1] + z * R0[2] + A.o[0] - u0) / DC; V[k] = (x * D0[0] + y * D0[1] + z * D0[2] + A.o[1] - v0) / DC; Z[k] = x * dir[0] + y * dir[1] + z * dir[2]; }
    const i0 = Math.max(0, Math.ceil(Math.min(U[0], U[1], U[2]) - 0.5)), i1 = Math.min(gw - 1, Math.floor(Math.max(U[0], U[1], U[2]) + 0.5));
    const j0 = Math.max(0, Math.ceil(Math.min(V[0], V[1], V[2]) - 0.5)), j1 = Math.min(gh - 1, Math.floor(Math.max(V[0], V[1], V[2]) + 0.5));
    if (i0 > i1 || j0 > j1) continue;
    tris.push(t);
    const den = (V[1] - V[2]) * (U[0] - U[2]) + (U[2] - U[1]) * (V[0] - V[2]); if (Math.abs(den) < 1e-9) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // (a little past its edges, so slivers between grid points still leave their mark)
      const a = ((V[1] - V[2]) * (i - U[2]) + (U[2] - U[1]) * (j - V[2])) / den, b = ((V[2] - V[0]) * (i - U[2]) + (U[0] - U[2]) * (j - V[2])) / den, c = 1 - a - b, e = -0.5 / Math.max(1, Math.abs(den) ** 0.5);
      if (a < e || b < e || c < e) continue;
      const z = Z[0] * a + Z[1] * b + Z[2] * c; if (z > H[j * gw + i]) H[j * gw + i] = z;
    }
  }
  if (!tris.length) return null;
  // bridge the gaps (a grille, a lamp, a wheel arch, the air past the body's edge): straight across each row and down
  // each column between the surface either side, the nearer side counting for more; with surface on one side only,
  // carry it on flat. (Only nearby surface matters, so the sheet doesn't change with how far out it's worked out.)
  // the rim: within 4.5 cm of where the body ends as this panel sees it (its silhouette, a wheel arch): steep surface
  // there is the body turning away, where a decal would only smear (wrapDecals cuts it off sooner); steep surface with
  // body all round it is a step or a ledge inside the sticker, which it wraps
  let rim = null;
  if (M.comp) {
    rim = new Float32Array(gw * gh); const r = 3, row = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let e = 0; for (let a = Math.max(0, i - r); a <= Math.min(gw - 1, i + r) && !e; a++) e = H[j * gw + a] === -Infinity ? 1 : 0; row[j * gw + i] = e; }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let e = 0; for (let b = Math.max(0, j - r); b <= Math.min(gh - 1, j + r) && !e; b++) e = row[b * gw + i]; rim[j * gw + i] = e; }
  }
  const F = H.slice(), has = (k) => H[k] > -Infinity;
  const gap = (n, at) => { // per line: for each empty spot, [value, weight] from that line's surface
    const out = new Array(n); let last = -1;
    for (let k = 0; k < n; k++) {
      if (has(at(k))) { last = k; continue; }
      let next = k; while (next < n && !has(at(next))) next++;
      for (let q = k; q < next; q++) {
        const a = last >= 0 ? H[at(last)] : null, b = next < n ? H[at(next)] : null;
        if (a != null && b != null) { const f = (q - last) / (next - last); out[q] = [a + (b - a) * f, 1 / (next - last)]; }
        else if (a != null || b != null) out[q] = [a ?? b, 0.25 / Math.abs(q - (a != null ? last : next))];
      }
      k = next - 1;
    }
    return out;
  };
  const rows = [], cols = [];
  for (let j = 0; j < gh; j++) rows.push(gap(gw, (i) => j * gw + i));
  for (let i = 0; i < gw; i++) cols.push(gap(gh, (j) => j * gw + i));
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i; if (has(k)) continue;
    const r = rows[j][i], c = cols[i][j]; let w = 0, s = 0;
    if (r) { s += r[0] * r[1]; w += r[1]; } if (c) { s += c[0] * c[1]; w += c[1]; }
    F[k] = w ? s / w : -Infinity;
  }
  { let any = 0; for (let k = 0; k < F.length; k++) if (F[k] > -Infinity) { any = F[k]; break; } for (let k = 0; k < F.length; k++) if (F[k] === -Infinity) F[k] = any; }
  // sticker metres at each grid point: along the surface from the centre's column (x) and row (y)
  const X = new Float32Array(gw * gh), Y = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    const o = j * gw;
    for (let i = ci + 1; i < gw; i++) X[o + i] = X[o + i - 1] + along(F[o + i] - F[o + i - 1]);
    for (let i = ci - 1; i >= 0; i--) X[o + i] = X[o + i + 1] - along(F[o + i] - F[o + i + 1]);
  }
  for (let i = 0; i < gw; i++) {
    for (let j = cj + 1; j < gh; j++) Y[j * gw + i] = Y[(j - 1) * gw + i] + along(F[j * gw + i] - F[(j - 1) * gw + i]);
    for (let j = cj - 1; j >= 0; j--) Y[j * gw + i] = Y[(j + 1) * gw + i] - along(F[j * gw + i] - F[(j + 1) * gw + i]);
  }
  // each row is measured on its own, so where a crease or a flare's edge runs across the sticker at a slant, rows either
  // side of it disagree by its extra length and the sticker tore along it in steps (a saw-tooth across a whale tail's
  // flank): x is evened out down the columns and y along the rows (a 6 cm box, twice), so that's a gentle shear
  // instead. (The centre column / row stay at 0, so the sticker stays where it was put.)
  if (M.comp && !globalThis.NOSHEAR) for (const [G, alongRows] of [[X, false], [Y, true]]) for (let pass = 0; pass < 2; pass++) {
    const src = G.slice(), r = 4, n = alongRows ? gw : gh, m = alongRows ? gh : gw;
    for (let a = 0; a < m; a++) {
      const at = (b) => alongRows ? a * gw + b : b * gw + a;
      let s = 0, c = 0; for (let b = 0; b <= Math.min(n - 1, r); b++) { s += src[at(b)]; c++; }
      for (let b = 0; b < n; b++) { G[at(b)] = s / c; if (b + r + 1 < n) { s += src[at(b + r + 1)]; c++; } if (b - r >= 0) { s -= src[at(b - r)]; c--; } }
    }
  }
  // (bilinear between grid points; past the grid's edge, flat: depth held, sticker metres carrying on 1:1)
  const lerp = (G, u, v) => {
    const fx = Math.max(0, Math.min(gw - 1.000001, (u - u0) / DC)), fy = Math.max(0, Math.min(gh - 1.000001, (v - v0) / DC)), i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * gw + i;
    return (G[k] * (1 - tx) + G[k + 1] * tx) * (1 - ty) + (G[k + gw] * (1 - tx) + G[k + gw + 1] * tx) * ty;
  };
  const uMax = u0 + (gw - 1) * DC, vMax = v0 + (gh - 1) * DC;
  const S = {
    M, tris, A, cx, cy, u0, v0, uMax, vMax, gw, gh, F, X, Y, rim,
    depth: (u, v) => lerp(F, u, v),
    // panel metres -> sticker metres
    at: (u, v) => [lerp(X, u, v) + (u < u0 ? u - u0 : u > uMax ? u - uMax : 0), lerp(Y, u, v) + (v < v0 ? v - v0 : v > vMax ? v - vMax : 0)],
    // and back (a few Newton steps: each axis is steady and rising, so it settles fast)
    from: (x, y) => {
      let u = cx + x, v = cy + y;
      for (let n = 0; n < 12; n++) {
        const [px, py] = S.at(u, v), [qx] = S.at(u + DC, v), [, qy] = S.at(u, v + DC);
        const du = (x - px) / Math.max(0.2, (qx - px) / DC), dv = (y - py) / Math.max(0.2, (qy - py) / DC);
        u += du; v += dv; if (Math.abs(du) + Math.abs(dv) < 1e-5) break;
      }
      return [u, v];
    },
    // panel metres (+ depth) -> body coordinates
    body: (u, v, z) => { const a = u - A.o[0], b = v - A.o[1]; return [0, 1, 2].map(i => R0[i] * a + D0[i] * b + dir[i] * z); },
    // body coordinates -> [u, v, depth]
    panel: (p) => [p[0] * R0[0] + p[1] * R0[1] + p[2] * R0[2] + A.o[0], p[0] * D0[0] + p[1] * D0[1] + p[2] * D0[2] + A.o[1], p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]],
  };
  return S;
}
// a point of a sticker (sticker metres) -> body coordinates, on the outer surface (over an opening or past the body's
// edge, on the sheet bridged across it, so outlines and nodes there run on smoothly)
export function stickerPoint(S, x, y) {
  const [u, v] = S.from(x, y); return S.body(u, v, S.depth(u, v));
}
// a ray (body coordinates) -> sticker metres: where it first meets the sheet (the outer surface, bridged across gaps),
// or failing that the flat at the sticker's centre
export function stickerRay(S, o, dir) {
  const [ou, ov, oz] = S.panel(o), du = S.panel([dir[0], dir[1], dir[2]]), d = [du[0] - S.A.o[0], du[1] - S.A.o[1], du[2]];
  const under = (t) => oz + d[2] * t <= S.depth(ou + d[0] * t, ov + d[1] * t);
  if (!under(0)) for (let t = 0.01; t < 40; t += 0.01) if (under(t)) {
    let lo = t - 0.01, hi = t;
    for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (under(mid)) hi = mid; else lo = mid; }
    return S.at(ou + d[0] * hi, ov + d[1] * hi);
  }
  if (Math.abs(d[2]) < 1e-6) return null;
  const t = (S.depth(S.cx, S.cy) - oz) / d[2]; if (t <= 0) return null;
  return S.at(ou + d[0] * t, ov + d[1] * t);
}
// a spot on triangle tri (barycentrics of its 2nd / 3rd corners) -> sticker metres, or null if it's past the sheet
// worked out so far
export function stickerCoords(S, tri, b1, b2) {
  const tp = S.M.tp, q = tri * 9, b0 = 1 - b1 - b2, [u, v] = S.panel([0, 1, 2].map(i => tp[q + i] * b0 + tp[q + 3 + i] * b1 + tp[q + 6 + i] * b2));
  if (u < S.u0 || u > S.uMax || v < S.v0 || v > S.vMax) return null;
  return S.at(u, v);
}
// Lay decal layers (decalLayers) on the texels as draped stickers. m: the texel map (positions, normals, and each
// texel's triangle in tri); col: their paint colours, changed in place. Each lands on the outer surface facing its
// panel's way (fading out as the surface turns edge-on), not on parts hidden under it. A layer with no body round it
// is projected the old way (projectDecals).
// face: the facing cut-off [start, full] at the body's rim (drapeSticker); inside it, FACE0 / FACE1
export function wrapDecals(panels, names, layers, m, col, M, [F0, F1] = [FACE0, FACE1]) {
  if (globalThis.WRAPFACE) [F0, F1] = globalThis.WRAPFACE;
  if (!m.tt) { // (texels by triangle, once per texel map)
    const cnt = new Uint32Array(M.nt + 1); for (let n = 0; n < m.tri.length; n++) if (m.tri[n] >= 0) cnt[m.tri[n] + 1]++;
    for (let t = 0; t < M.nt; t++) cnt[t + 1] += cnt[t];
    const fill = cnt.slice(0, -1), idx = new Uint32Array(cnt[M.nt]); for (let n = 0; n < m.tri.length; n++) if (m.tri[n] >= 0) idx[fill[m.tri[n]]++] = n;
    m.tt = cnt; m.ti = idx;
  }
  const { pos, nrm } = m;
  for (const L of layers) {
    const pn = panels[L.panel]; if (!pn || !pn.proj) { projectDecals(panels, names, [L], m, col); continue; }
    const { x0, y0, rx, ry, k: kp, w: lw, h: lh, data } = L, S = drapeSticker(M, pn, x0 + rx, y0 + ry, rx, ry, 0.1);
    if (!S) { projectDecals(panels, names, [L], m, col); continue; }
    const dir = pn.dir, { right: R0, down: D0, o: O } = S.A, { u0, v0, gw, gh, F, X: GX, Y: GY, rim } = S;
    const tp = M.tp, cx = x0 + rx, cy = y0 + ry;
    for (const t of S.tris) {
      // (a sticker is never shorter on the body than on the panel, so a triangle the panel sees outside its box is too)
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let c = 0; c < 3; c++) { const q = t * 9 + c * 3, u = tp[q] * R0[0] + tp[q + 1] * R0[1] + tp[q + 2] * R0[2] + O[0], v = tp[q] * D0[0] + tp[q + 1] * D0[1] + tp[q + 2] * D0[2] + O[1]; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; }
      if (a1 <= cx - rx || a0 >= cx + rx || b1 <= cy - ry || b0 >= cy + ry) continue;
      for (let j = m.tt[t]; j < m.tt[t + 1]; j++) {
        const n = m.ti[j], fa = (nrm[n * 3] * dir[0] + nrm[n * 3 + 1] * dir[1] + nrm[n * 3 + 2] * dir[2]) / 127; if (fa <= Math.min(F0, FACE0)) continue;
        const px = pos[n * 3], py = pos[n * 3 + 1], pz = pos[n * 3 + 2];
        const fx = (px * R0[0] + py * R0[1] + pz * R0[2] + O[0] - u0) / DC, fy = (px * D0[0] + py * D0[1] + pz * D0[2] + O[1] - v0) / DC;
        if (fx < 0 || fy < 0 || fx >= gw - 1 || fy >= gh - 1) continue;
        // (the sheet there, bilinear: its depth, to leave parts under another alone, and the sticker metres)
        const i = fx | 0, k = (fy | 0) * gw + i, ex = fx - i, ey = fy - (fy | 0), w00 = (1 - ex) * (1 - ey), w10 = ex * (1 - ey), w01 = (1 - ex) * ey, w11 = ex * ey;
        if (px * dir[0] + py * dir[1] + pz * dir[2] < F[k] * w00 + F[k + 1] * w10 + F[k + gw] * w01 + F[k + gw + 1] * w11 - SKIN) continue;
        const e = rim ? rim[k] * w00 + rim[k + 1] * w10 + rim[k + gw] * w01 + rim[k + gw + 1] * w11 : 1, f0 = FACE0 + (F0 - FACE0) * e, f1 = FACE1 + (F1 - FACE1) * e;
        if (fa <= f0) continue;
        const X = GX[k] * w00 + GX[k + 1] * w10 + GX[k + gw] * w01 + GX[k + gw + 1] * w11, Y = GY[k] * w00 + GY[k + 1] * w10 + GY[k + gw] * w01 + GY[k + gw + 1] * w11;
        if (X <= -rx || X >= rx || Y <= -ry || Y >= ry) continue;
        // (bilinear, premultiplied: smooth edges without fringes)
        const sx = Math.max(0, Math.min(lw - 1.001, (X + rx) * kp - 0.5)), sy = Math.max(0, Math.min(lh - 1.001, (Y + ry) * kp - 0.5));
        const ix = sx | 0, iy = sy | 0, tx = sx - ix, ty = sy - iy, xa = Math.min(lw - 1, ix + 1), ya = Math.min(lh - 1, iy + 1);
        const q0 = (iy * lw + ix) * 4, q1 = (iy * lw + xa) * 4, q2 = (ya * lw + ix) * 4, q3 = (ya * lw + xa) * 4;
        const a0_ = (1 - tx) * (1 - ty) * data[q0 + 3], a1_ = tx * (1 - ty) * data[q1 + 3], a2_ = (1 - tx) * ty * data[q2 + 3], a3_ = tx * ty * data[q3 + 3], a = a0_ + a1_ + a2_ + a3_;
        if (!a) continue;
        const R = a0_ * data[q0] + a1_ * data[q1] + a2_ * data[q2] + a3_ * data[q3], G = a0_ * data[q0 + 1] + a1_ * data[q1 + 1] + a2_ * data[q2 + 1] + a3_ * data[q3 + 1], B = a0_ * data[q0 + 2] + a1_ * data[q1 + 2] + a2_ * data[q2 + 2] + a3_ * data[q3 + 2];
        const al = a / 255 * Math.min(1, (fa - f0) / (f1 - f0));
        col[n * 3] += (R / a - col[n * 3]) * al; col[n * 3 + 1] += (G / a - col[n * 3 + 1]) * al; col[n * 3 + 2] += (B / a - col[n * 3 + 2]) * al;
      }
    }
  }
}

// A panel canvas ({ d: RGBA, w, h }, ppm px per metre) read at (x, y) metres, bilinear, into col[o..o+2]. Panels are
// drawn finer than the car's texels (projected models: 4 px per texel row of the livery canvas, R / 4 per metre), so
// stripes and pattern edges come out smooth rather than stepped.
export function samplePanel(D, x, y, ppm, col, o) {
  const sx = Math.max(0, Math.min(D.w - 1.001, x * ppm - 0.5)), sy = Math.max(0, Math.min(D.h - 1.001, y * ppm - 0.5));
  const ix = sx | 0, iy = sy | 0, tx = sx - ix, ty = sy - iy, x1 = Math.min(D.w - 1, ix + 1), y1 = Math.min(D.h - 1, iy + 1), d = D.d;
  const a = (iy * D.w + ix) * 4, b = (iy * D.w + x1) * 4, c = (y1 * D.w + ix) * 4, e = (y1 * D.w + x1) * 4;
  for (let k = 0; k < 3; k++) col[o + k] = (d[a + k] * (1 - tx) + d[b + k] * tx) * (1 - ty) + (d[c + k] * (1 - tx) + d[e + k] * tx) * ty;
}

// Lays decal layers over a projected model's texels, like a projector aimed at the car. Each decal sits on the outer
// surface under its centre (found along its panel's view: p.dir, from above, the left, the nose...) and shoots along
// the way that surface faces on average under it (area-weighted, within its smaller half-size), so on a flat door it
// goes straight in, and one slid over a bonnet's edge leans over to cover both the side and the bonnet, each a little
// stretched (about 1.4x at most, across a right angle), as in Forza. It carries on over seams, fades where the surface
// turns away, and lands only on the outermost surface at each spot (a stripe from above: bonnet, roof, then boot).
// m: per texel pos (x, y, z), nrm (smooth normal, x127), ar (3D area); col: their paint colours (r, g, b), changed in
// place.
// facing (cos) where a decal starts / is full: it stays solid over curves (stretching, like Forza's vinyls) and only
// fades out on surfaces nearly edge-on to it; how far under the outer surface it still lands (m)
const FACE0 = 0.07, FACE1 = 0.17, DEPTH = 0.12;
export function projectDecals(panels, names, layers, m, col) {
  const { pos, nrm, ar } = m, G = texelGrid(m);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const { panel, x0, y0, rx, ry, k: kp, w: lw, h: lh, rad, data } of layers) {
    const pn = panels[panel], dir0 = pn && pn.dir; if (!dir0) continue;
    // the panel's projection is affine: panel metres = (right . p + o0[0], down . p + o0[1]), right / down / dir0 unit axes
    const o0 = pn.proj(0, 0, 0), ex = pn.proj(1, 0, 0), ey = pn.proj(0, 1, 0), ez = pn.proj(0, 0, 1);
    const right0 = [ex[0] - o0[0], ey[0] - o0[0], ez[0] - o0[0]], down0 = [ex[1] - o0[1], ey[1] - o0[1], ez[1] - o0[1]];
    const cx = x0 + rx, cy = y0 + ry; // (the decal's centre)
    // the anchor: the outer surface under the centre
    const H = viewDepth(m, panel, names.indexOf(panel) + 1, pn, dir0, [...right0, o0[0], ...down0, o0[1]]);
    const depth = nearestCell(H, cx, cy); if (depth == null) continue;
    const C = [0, 1, 2].map(i => right0[i] * (cx - o0[0]) + down0[i] * (cy - o0[1]) + dir0[i] * depth);
    // its direction: the surface's average facing near the anchor
    const sum = [0, 0, 0];
    G.each(C.map(v => v - rad), C.map(v => v + rad), (n) => {
      const px = pos[n * 3] - C[0], py = pos[n * 3 + 1] - C[1], pz = pos[n * 3 + 2] - C[2];
      if (px * px + py * py + pz * pz > rad * rad) return;
      const nx = nrm[n * 3], ny = nrm[n * 3 + 1], nz = nrm[n * 3 + 2];
      if (nx * dir0[0] + ny * dir0[1] + nz * dir0[2] < -0.2 * 127) return; // (not the far side of a thin part)
      sum[0] += nx * ar[n]; sum[1] += ny * ar[n]; sum[2] += nz * ar[n];
    });
    const sl = Math.hypot(...sum), dir = sl > 0 && !globalThis.NOTILT ? sum.map(v => v / sl) : dir0;
    // the decal's right / down turned with it (the smallest rotation from the panel's view to dir)
    const kx = dir0[1] * dir[2] - dir0[2] * dir[1], ky = dir0[2] * dir[0] - dir0[0] * dir[2], kz = dir0[0] * dir[1] - dir0[1] * dir[0];
    const sn = Math.hypot(kx, ky, kz), cs = dot(dir0, dir), kk = sn > 1e-6 ? [kx / sn, ky / sn, kz / sn] : null;
    const turn = (v) => {
      if (!kk) return v;
      const kv = dot(kk, v), c = [kk[1] * v[2] - kk[2] * v[1], kk[2] * v[0] - kk[0] * v[2], kk[0] * v[1] - kk[1] * v[0]];
      return [0, 1, 2].map(i => v[i] * cs + c[i] * sn + kk[i] * kv * (1 - cs));
    };
    const right = turn(right0), down = turn(down0);
    // the texels it can reach (a box round its square, 60 cm deep each way: enough for a stripe from the bonnet over
    // the roof), then a depth map along dir so it only lands on the outer surface
    const reach = 0.6, lo = [], hi = [];
    for (let i = 0; i < 3; i++) { const e = Math.abs(right[i]) * rx + Math.abs(down[i]) * ry + Math.abs(dir[i]) * reach; lo.push(C[i] - e); hi.push(C[i] + e); }
    const DC = 0.04, gw = Math.ceil(2 * rx / DC) + 1, gh = Math.ceil(2 * ry / DC) + 1, gd = new Float32Array(gw * gh).fill(-Infinity);
    const at = (n, f) => { // -> [u, v, depth, facing] relative to the anchor, or null if outside / facing away
      const px = pos[n * 3] - C[0], py = pos[n * 3 + 1] - C[1], pz = pos[n * 3 + 2] - C[2];
      const u = px * right[0] + py * right[1] + pz * right[2]; if (u <= -rx || u >= rx) return null;
      const v = px * down[0] + py * down[1] + pz * down[2]; if (v <= -ry || v >= ry) return null;
      const fa = (nrm[n * 3] * dir[0] + nrm[n * 3 + 1] * dir[1] + nrm[n * 3 + 2] * dir[2]) / 127; if (fa <= FACE0) return null;
      f[0] = u; f[1] = v; f[2] = px * dir[0] + py * dir[1] + pz * dir[2]; f[3] = fa; return f;
    };
    const f = [0, 0, 0, 0], cell = () => Math.min(gh - 1, (f[1] + ry) / DC | 0) * gw + Math.min(gw - 1, (f[0] + rx) / DC | 0);
    G.each(lo, hi, (n) => { if (!at(n, f)) return; const c = cell(); if (f[2] > gd[c]) gd[c] = f[2]; });
    // anything thin sticking up (an aerial, a mirror stalk, stray edge texels) mustn't hide the paint round it: an
    // opening (3x3 min, then 3x3 max) keeps only what's wider than about 3 cells
    for (const pick of [Math.min, Math.max]) {
      const src = gd.slice();
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        let v = src[j * gw + i];
        for (let b = Math.max(0, j - 1); b <= Math.min(gh - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(gw - 1, i + 1); a++) v = pick(v, src[b * gw + a]);
        gd[j * gw + i] = v;
      }
    }
    G.each(lo, hi, (n) => {
      if (!at(n, f) || (!globalThis.NOOCC && f[2] < gd[cell()] - DEPTH)) return; // (hidden under the outer surface)
      // (bilinear, premultiplied: the layer is drawn finer than the texels, so edges come out smooth, without fringes)
      const sx = Math.max(0, Math.min(lw - 1.001, (f[0] + rx) * kp - 0.5)), sy = Math.max(0, Math.min(lh - 1.001, (f[1] + ry) * kp - 0.5));
      const ix = sx | 0, iy = sy | 0, tx = sx - ix, ty = sy - iy, x1 = Math.min(lw - 1, ix + 1), y1 = Math.min(lh - 1, iy + 1);
      let A = 0, R = 0, Gc = 0, B = 0;
      for (const [qx, qy, w] of [[ix, iy, (1 - tx) * (1 - ty)], [x1, iy, tx * (1 - ty)], [ix, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
        const q = (qy * lw + qx) * 4, wa = w * data[q + 3]; if (!wa) continue;
        A += wa; R += wa * data[q]; Gc += wa * data[q + 1]; B += wa * data[q + 2];
      }
      if (!A) return;
      const a = A / 255 * Math.min(1, (f[3] - FACE0) / (FACE1 - FACE0));
      col[n * 3] += (R / A - col[n * 3]) * a; col[n * 3 + 1] += (Gc / A - col[n * 3 + 1]) * a; col[n * 3 + 2] += (B / A - col[n * 3 + 2]) * a;
    });
  }
}
// a height map's value at (x, y) in metres, or the nearest filled cell's within 40 cm (null if none)
function nearestCell(H, x, y) {
  const cx = Math.max(0, Math.min(H.gw - 1, x / H.C | 0)), cy = Math.max(0, Math.min(H.gh - 1, y / H.C | 0));
  for (let r = 0; r <= 10; r++) {
    let best = null, be = Infinity;
    for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) {
      if (i < 0 || j < 0 || i >= H.gw || j >= H.gh || (Math.abs(i - cx) !== r && Math.abs(j - cy) !== r)) continue;
      const v = H.g[j * H.gw + i], e = (i - cx) ** 2 + (j - cy) ** 2; if (v !== -Infinity && e < be) { be = e; best = v; }
    }
    if (best != null) return best;
  }
  return null;
}

// the texels bucketed on a 20 cm grid in car space (built once per texel map): each(lo, hi, fn) calls fn(texel) for
// the texels in the cells overlapping that box
function texelGrid(m) {
  if (m.grid) return m.grid;
  const { pos } = m, cnt = pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let n = 0; n < cnt * 3; n++) { const a = n % 3; if (pos[n] < mn[a]) mn[a] = pos[n]; if (pos[n] > mx[a]) mx[a] = pos[n]; }
  if (!cnt) mn.fill(0), mx.fill(0);
  // (cells grow if something is far out, so the grid stays small whatever the model)
  const C = Math.max(0.2, ...mn.map((v, a) => (mx[a] - v) / 64));
  const d = mn.map((v, a) => Math.floor((mx[a] - v) / C) + 1), cell = new Uint32Array(cnt), start = new Uint32Array(d[0] * d[1] * d[2] + 1);
  const at = (n, a) => Math.min(d[a] - 1, (pos[n * 3 + a] - mn[a]) / C | 0);
  for (let n = 0; n < cnt; n++) { cell[n] = (at(n, 0) * d[1] + at(n, 1)) * d[2] + at(n, 2); start[cell[n] + 1]++; }
  for (let i = 1; i < start.length; i++) start[i] += start[i - 1];
  const fill = start.slice(0, -1), idx = new Uint32Array(cnt);
  for (let n = 0; n < cnt; n++) idx[fill[cell[n]]++] = n;
  return (m.grid = {
    each(lo, hi, fn) {
      const r = [0, 1, 2].map(a => [Math.max(0, Math.floor((lo[a] - mn[a]) / C)), Math.min(d[a] - 1, Math.floor((hi[a] - mn[a]) / C))]);
      for (let i = r[0][0]; i <= r[0][1]; i++) for (let j = r[1][0]; j <= r[1][1]; j++) for (let k = r[2][0]; k <= r[2][1]; k++) {
        const c = (i * d[1] + j) * d[2] + k;
        for (let q = start[c]; q < start[c + 1]; q++) fn(idx[q]);
      }
    },
  });
}

// the outermost depth along a panel's view on a 4 cm grid over the panel (built once per texel map): from its own
// texels and every other one facing that way. Cells nothing faces stay -Infinity.
function viewDepth(m, name, own, pn, [dx, dy, dz], [ax, ay, az, ao, bx, by, bz, bo]) {
  const H = (m.depthMaps ||= {})[name]; if (H) return H;
  const C = 0.04, gw = Math.ceil(pn.W / C) + 1, gh = Math.ceil(pn.H / C) + 1, g = new Float32Array(gw * gh).fill(-Infinity);
  const { lp, pos, nrm } = m;
  for (let n = 0; n < lp.length; n++) {
    if (lp[n] !== own && (nrm[n * 3] * dx + nrm[n * 3 + 1] * dy + nrm[n * 3 + 2] * dz) / 127 <= FACE0) continue;
    const x = pos[n * 3], y = pos[n * 3 + 1], z = pos[n * 3 + 2];
    const i = Math.floor((ax * x + ay * y + az * z + ao) / C), j = Math.floor((bx * x + by * y + bz * z + bo) / C);
    if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
    const d = x * dx + y * dy + z * dz; if (d > g[j * gw + i]) g[j * gw + i] = d;
  }
  return (m.depthMaps[name] = { C, gw, gh, g });
}

// Text decals tied to the livery (d.bind): the title sponsor's name, the team name or the race number, kept up to date
// (the number is each car's own: a teammate in your livery shows theirs in the same spot)
export const BOUND = { sponsor: 'Title sponsor', team: 'Team name', number: 'Race number' };
export function boundText(L, bind) {
  return bind === 'sponsor' ? String(L.sponsor || '').toUpperCase().slice(0, 14) : bind === 'team' ? String(L.teamName || '').toUpperCase().slice(0, 18) : bind === 'number' ? (L.number != null ? String(L.number) : '') : '';
}
// The built-in sponsor + team name stickers on this model, as decals in the same places (so they can be moved).
// One decal per mirrored pair (the left one, 'Both sides' on).
export function stickerDecals(cfg, model) {
  const L = fillLivery(cfg), out = [], lab = model.labels || {}, g = document.createElement('canvas').getContext('2d');
  const add = (bind, name, a, c, h, maxW, color, bar) => {
    const p = model.panels[name], text = boundText(L, bind); if (!p || !text) return;
    const [x, y] = alongCross(p)(a, c), size = textFit(g, text, 'impact', maxW, h);
    out.push({ id: 'd' + Math.random().toString(36).slice(2, 8), bind, panel: name, x: +x.toFixed(3), y: +y.toFixed(3), size: +size.toFixed(3), rot: 0, opacity: 1,
      mirror: !!(p.pair && model.panels[p.pair]), flip: false, text: '', font: 'impact', color, outline: bar ? null : L.third, ...(bar && !(bind === 'sponsor' && /^(main|black|white)$/.test(L.sponsorLogo)) ? { bar: L.third } : {}), ...(bind === 'sponsor' ? { logo: L.sponsorLogo } : {}), name: null });
  };
  const pick = (n) => model.panels[n + 'L'] ? n + 'L' : model.panels[n + 'R'] ? n + 'R' : null; // (the left of a pair, else the right)
  const pod = pick('pod'), side = pick('side'), plate = pick('plate'), cover = pick('cover'), rw = model.panels.rwing;
  if (pod) { const p = model.panels[pod]; add('sponsor', pod, 0.5, 0.42, Math.min(0.13, p.H * 0.3), Math.min(1.2, p.W * 0.6), L.accent, true); }
  if (lab.sideSponsor && side) add('sponsor', side, ...lab.sideSponsor, 0.12, 1.1, L.accent, true);
  if (rw) add('sponsor', 'rwing', 0.5, 0.5, Math.min(0.13, rw.H * 0.4), rw.W * 0.88, L.main, false);
  if (plate) { const p = model.panels[plate]; add('sponsor', plate, 0.5, 0.6, Math.min(0.1, p.H * 0.3), p.W * 0.85, L.accent, false); }
  if (cover) { const p = model.panels[cover]; add('team', cover, 0.55, 0.45, Math.min(0.08, p.H * 0.25), Math.min(1.1, p.W * 0.6), L.accent, false); }
  return out;
}

// Paint a livery onto a model's livery canvas. onReady(): called if a decal image arrives later (repaint then).
// Atlas models (panels are rects in the texture) are drawn directly; projected models (e.g. an imported .glb)
// get each panel drawn on its own canvas and then mapped onto the surface by model.paintProjected().
export function paintCar(canvas, cfg, model, onReady) {
  const L = fillLivery(cfg), W = canvas.width, H = canvas.height, g = canvas.getContext('2d');
  // (models that keep their base paint between repaints know it by the livery: the sticker's logo arriving changes it)
  const sl = model.paintProjected ? stickerLogos(L) : [];
  // (each one that arrives repaints: the key only changes once they all have)
  if (model.paintProjected) return model.paintProjected(canvas, sl.length ? { ...L, logoIn: sl.map(id => !!decalImage(id, onReady)).every(Boolean) } : L, (pg, name, p) => { pg.fillStyle = hex(L.main); pg.fillRect(0, 0, p.W, p.H); panelArt(pg, name, p, L, model, onReady, !model.projectDecals); },
    model.projectDecals ? (ppm) => decalLayers(L, model, ppm, onReady) : null);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = hex(L.main); g.fillRect(0, 0, W, H);
  // model-specific dark areas (floor edges etc.)
  g.fillStyle = hex(L.third);
  for (const r of model.dark || []) g.fillRect(r[0] * W, (1 - r[3]) * H, (r[2] - r[0]) * W, (r[3] - r[1]) * H);
  for (const [name, p] of Object.entries(model.panels)) onPanel(g, p, W, H, () => panelArt(g, name, p, L, model, onReady));
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// Helmet: equirectangular canvas for a sphere. model.helmetUV tells where the visor (front) sits in u.
export function paintHelmet(canvas, cfg, front = 0.25, onReady, opts = {}) {
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
  // decals placed on the helmet (the Livery Designer's Uniform tab): u from the visor, like everything here
  // (opts.decals = false: the racer projects them onto the 3D helmet instead, js/characters.js)
  if (opts.decals !== false) drawKitDecals(g, W, H, fillLivery(cfg).suit.decals, 'helmet', onReady, (u) => X(u) / W);
}
export const VISOR_COL = { dark: [0x121820, 0x88aacc], gold: [0x6a4a10, 0xffd070], blue: [0x10305a, 0x80c8ff], red: [0x5a1010, 0xff8060], clear: [0x3a4a58, 0xffffff] };

// Suit: canvases for torso, legs and arms (cylinders: u = 0 front, .25 left side, .5 back, .75 right side)
// opts.belt = false leaves the belt off (the full-size racer in js/characters.js: race suits don't have one);
// opts.decals = false leaves the placed decals off (the racer draws them on each limb itself: drawKitDecals)
export function paintSuit(torso, legs, arms, cfg, onReady, opts = {}) {
  const L = fillLivery(cfg), S = L.suit, base = hex(S.base), acc = hex(S.accent), third = hex(L.third);
  for (const [cv, part] of [[torso, 'torso'], [legs, 'legs'], [arms, 'arms']]) {
    if (!cv) continue;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = acc;
    const both = (f) => { f(0); f(W); }; // shapes across the front (u = 0) are drawn at both edges
    if (S.pattern === 'sides') { g.fillRect(W * 0.21, 0, W * 0.08, H); g.fillRect(W * 0.71, 0, W * 0.08, H); }
    else if (S.pattern === 'twotone') { if (part !== 'legs') g.fillRect(0, 0, W, H); }
    else if (S.pattern === 'shoulders') { if (part === 'torso') g.fillRect(0, 0, W, H * 0.3); else if (part === 'arms') g.fillRect(0, 0, W, H); }
    else if (S.pattern === 'sash' && part === 'torso') { g.beginPath(); g.moveTo(-W * 0.05, H * 0.1); g.lineTo(W * 0.1, H * 0.1); g.lineTo(W * 0.3, H); g.lineTo(W * 0.15, H); g.closePath(); g.fill(); g.beginPath(); g.moveTo(W * 0.9, H * 0.1); g.lineTo(W * 1.05, H * 0.1); g.lineTo(W * 1.05, H * 0.6); g.closePath(); g.fill(); }
    else if (S.pattern === 'panels') { // wide side panels edged in the detail colour
      for (const c of [0.25, 0.75]) { g.fillStyle = third; g.fillRect(W * (c - 0.1), 0, W * 0.2, H); g.fillStyle = acc; g.fillRect(W * (c - 0.085), 0, W * 0.17, H); }
    } else if (S.pattern === 'fade') { // the base colour fading into the accent: torso into the hips, on down the legs
      const mid = mix(S.base, S.accent, 0.5), gr = g.createLinearGradient(0, 0, 0, H);
      if (part === 'legs') { gr.addColorStop(0, mid); gr.addColorStop(1, acc); }
      else if (part === 'torso') { gr.addColorStop(0, base); gr.addColorStop(0.4, base); gr.addColorStop(1, mid); }
      else { gr.addColorStop(0, base); gr.addColorStop(0.35, base); gr.addColorStop(1, acc); }
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else if (S.pattern === 'chevron') {
      if (part === 'torso') for (const [y, t] of [[0.16, 0.09], [0.34, 0.05]]) both(x0 => { g.beginPath(); g.moveTo(x0 - W * 0.22, H * y); g.lineTo(x0, H * (y + 0.16)); g.lineTo(x0 + W * 0.22, H * y); g.lineTo(x0 + W * 0.22, H * (y + t)); g.lineTo(x0, H * (y + t + 0.16)); g.lineTo(x0 - W * 0.22, H * (y + t)); g.closePath(); g.fill(); });
      else g.fillRect(0, H * 0.78, W, H * 0.1);
    }
    const fillOn = S.pattern === 'twotone' && part !== 'legs' ? base : acc;
    const num = String(L.number ?? 7);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (part === 'torso') {
      // belt + chest text + number
      if (opts.belt !== false) { g.fillStyle = third; g.fillRect(0, H * 0.88, W, H * 0.06); }
      const txt = S.chest === 'sponsor' ? String(L.sponsor || '') : S.chest === 'team' ? String(L.teamName || '') : '';
      // chest text straddles u = 0 (the front), so draw it at both edges of the canvas
      // (a sponsor with a logo: the logo, white or black against the suit)
      const slug = S.chest === 'sponsor' && L.sponsorLogo !== 'name' && logoForName(txt);
      if (slug) {
        const b = S.pattern === 'twotone' ? S.accent : S.base, light = ((b >> 16 & 255) * 0.3 + (b >> 8 & 255) * 0.59 + (b & 255) * 0.11) > 150;
        const im = decalImage(logoAsset(slug, light ? 'black' : 'white'), onReady);
        if (im) { let lh = H * 0.13, lw = lh * im.naturalWidth / im.naturalHeight; if (lw > W * 0.3) { lh *= W * 0.3 / lw; lw = W * 0.3; } for (const x of [0, W]) g.drawImage(im, x - lw / 2, H * 0.42 - lh / 2, lw, lh); }
      } else if (txt) { g.fillStyle = fillOn; textFit(g, txt.toUpperCase(), 'impact', W * 0.3, H * 0.1); g.fillText(txt.toUpperCase(), 0, H * 0.42); g.fillText(txt.toUpperCase(), W, H * 0.42); }
      g.fillStyle = fillOn;
      if (S.number === 'back') { g.font = `bold ${H * 0.2}px Impact, Arial Black, sans-serif`; g.fillText(num, W * 0.5, H * 0.4); }
      else if (S.number === 'chest') { g.font = `bold ${H * 0.09}px Impact, Arial Black, sans-serif`; g.fillText(num, W * 0.075, H * 0.26); } // his left breast
      if (S.decal) { const im = decalImage(S.decal, onReady); if (im) { const w = W * 0.12, h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, W * 0.94 - w / 2, H * 0.55 - h / 2, w, h); g.drawImage(im, -w / 2 + W * 0.06, H * 0.55 - h / 2, w, h); } }
    } else {
      if (part === 'arms' && S.number === 'sleeves') { g.fillStyle = fillOn; g.font = `bold ${H * 0.13}px Impact, Arial Black, sans-serif`; for (const u of [0.25, 0.75]) g.fillText(num, W * u, H * 0.2); }
      g.fillStyle = third; g.fillRect(0, H * 0.92, W, H * 0.08); // cuffs / boots edge
    }
    if (opts.decals !== false) drawKitDecals(g, W, H, S.decals, part === 'torso' ? 'torso' : part === 'legs' ? 'legL' : 'armL', onReady);
  }
}

// Decals placed on the uniform: { part: torso | armL | armR | legL | legR | helmet, u, v (0..1 across / down the
// part's canvas; u 0 = the front, .25 = his left side, like the canvases), size (fraction of its height), rot, ...
// the same text / image fields as the car's decals }. mirror: also on the other side (u -> 1 - u; a sleeve's
// mirror is on the other sleeve). place(u) -> canvas u (the helmet's visor isn't at u = 0).
const MIRROR_PART = { torso: 'torso', helmet: 'helmet', armL: 'armR', armR: 'armL', legL: 'legR', legR: 'legL' };
export function drawKitDecals(g, W, H, decals, part, onReady, place = (u) => u) {
  if (!decals || !decals.length) return;
  g.save();
  for (const d of decals) {
    const spots = [];
    if (d.part === part) spots.push(d.u);
    if (d.mirror && MIRROR_PART[d.part] === part) spots.push(1 - d.u);
    for (const u of spots) {
      const x = (((place(u) % 1) + 1) % 1) * W / H;
      for (const dx of [-W / H, 0, W / H]) { // wrap round the back seam
        if (Math.abs(x + dx - W / H / 2) > W / H / 2 + d.size * 1.5) continue;
        g.setTransform(H, 0, 0, H, 0, 0); drawDecal(g, d, x + dx, d.v, onReady);
      }
    }
  }
  g.restore();
}

// A decal as pixels, for projecting it onto a 3D surface (the racer's kit): { data, W, H, w, h } with w / h its
// size in the decal's units (an image's width = size; text: letter height = size), centred on the decal's point.
// null until an image has loaded (onReady fires then).
const rasters = new Map();
export function decalRaster(d, onReady) {
  const key = d.text != null ? ['t', d.text, d.font, d.color, d.outline].join('|') : 'i|' + d.asset;
  if (rasters.has(key)) return rasters.get(key);
  let c, g, w, h;
  if (d.text != null) {
    if (!String(d.text).trim()) return null;
    const P = 64, cw = Math.ceil(P * (String(d.text).length * 0.9 + 1.5)), ch = P * 2;
    c = document.createElement('canvas'); c.width = cw; c.height = ch; g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(P, 0, 0, P, 0, 0);
    drawDecal(g, { ...d, size: 1, rot: 0, flip: false, opacity: 1 }, cw / 2 / P, ch / 2 / P);
    // crop to the ink, keeping it centred on the text's middle
    const px = g.getImageData(0, 0, cw, ch).data;
    let x0 = cw, x1 = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (px[(y * cw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 < x0) return null;
    const half = Math.max(cw / 2 - x0, x1 - cw / 2) + 2, sx = Math.max(0, Math.floor(cw / 2 - half));
    const out = document.createElement('canvas'); out.width = Math.min(cw, Math.ceil(half * 2)); out.height = ch;
    out.getContext('2d').drawImage(c, sx, 0, out.width, ch, 0, 0, out.width, ch);
    c = out; w = out.width / P; h = ch / P;
  } else {
    const im = decalImage(d.asset, onReady); if (!im) return null;
    const W = 256, H = Math.max(1, Math.round(W * im.naturalHeight / im.naturalWidth));
    c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(im, 0, 0, W, H);
    w = 1; h = H / W;
  }
  const r = { data: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height, w, h };
  rasters.set(key, r);
  return r;
}

// Racing boots (the racer's boot tubes: u 0 = the toe, .25 / .75 the outsides, .5 the heel; canvas top = the
// top of the boot): the boot colour, a swoosh in the suit's accent, a heel tab, and a black sole with a white welt
export function paintBoots(canvas, cfg) {
  const L = fillLivery(cfg), S = L.suit, g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const body = hex(S.boots), acc = hex(S.accent === S.boots ? S.base : S.accent);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = body; g.fillRect(0, 0, W, H);
  g.fillStyle = acc;
  for (const side of [1, -1]) { // a stripe sweeping up from the toe to the ankle on each side
    const X = (u) => ((side > 0 ? u : 1 - u)) * W;
    g.beginPath(); g.moveTo(X(0.08), H * 0.78); g.lineTo(X(0.44), H * 0.18); g.lineTo(X(0.47), H * 0.36); g.lineTo(X(0.16), H * 0.8); g.closePath(); g.fill();
  }
  g.fillRect(W * 0.45, 0, W * 0.1, H * 0.34);                         // heel tab
  g.fillStyle = '#121214'; g.fillRect(0, H * 0.86, W, H * 0.14);      // sole
  g.fillStyle = '#e8e8e8'; g.fillRect(0, H * 0.83, W, H * 0.035);     // welt
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
