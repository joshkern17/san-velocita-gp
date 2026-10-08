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
export const PATTERNS = { solid: 'Solid', stripe: 'Centre Stripe', split: 'Two-Tone', arrow: 'Arrow Nose', fade: 'Fade', sash: 'Side Sash' };
export const HELMET_PATTERNS = { solid: 'Solid', stripe: 'Centre Stripe', crown: 'Crown', bands: 'Eye Bands', halves: 'Halves', flames: 'Flames', stars: 'Stars' };
export const SUIT_PATTERNS = { solid: 'Solid', sides: 'Side Stripes', twotone: 'Two-Tone', shoulders: 'Shoulders', sash: 'Sash', panels: 'Side Panels', fade: 'Fade', chevron: 'Chevron' };
export const SUIT_NUMBERS = { back: 'Back', chest: 'Chest', sleeves: 'Sleeves', none: 'None' };
// the pit crew's kit: the driver's suit, their own colours, or the stock mechanic's coveralls
export const CREW_STYLES = { suit: 'Team suits', own: 'Own colours', classic: 'Coveralls' };
export const VISORS = { dark: 'Dark', gold: 'Gold Iridium', blue: 'Blue Iridium', red: 'Red Iridium', clear: 'Light Tint' };
// the strip across the top of the visor (on helmets that have one: the racer in js/characters.js)
export const VISOR_STRIPS = { team: 'Team colour', sponsor: 'Sponsor', off: 'Off' };
export const FONTS = { impact: 'Impact', anton: 'Anton', gothic: 'Gothic', arimo: 'Clean', pixel: 'Pixel' };
const FONT_CSS = { impact: 'Impact, "Arial Black", sans-serif', anton: 'Anton, Impact, sans-serif', gothic: '"Pirata One", serif', arimo: 'Arimo, Arial, sans-serif', pixel: 'VT323, monospace' };
const FONT_W = { impact: 'bold ', anton: '', gothic: '', arimo: 'bold ', pixel: '' };

export function fillLivery(cfg) {
  const c = { ...cfg };
  c.teamName ??= 'Your Team';
  c.showNumber ??= true; c.showSponsor ??= true; c.decals ??= [];
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

export function drawDecal(g, d, x, y, onReady) {
  g.save();
  g.translate(x, y); g.rotate(((d.rot || 0) * Math.PI) / 180); if (d.flip) g.scale(-1, 1);
  g.globalAlpha = d.opacity ?? 1;
  const w = d.size || 0.4;
  if (d.text != null) {
    const h = w; // text decals: size = letter height
    g.font = `${FONT_W[d.font] || ''}${h}px ${FONT_CSS[d.font] || FONT_CSS.impact}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (d.bar != null) { const tw = g.measureText(d.text).width; g.fillStyle = hex(d.bar); g.fillRect(-tw / 2 - h * 0.4, -h * 0.7, tw + h * 0.8, h * 1.4); }
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
export function panelArt(g, name, p, cfg, model, onReady, decals = true) {
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
    // nose tip in the third colour (not on cars with a nose panel of their own: on a road car the top's last 2.5%
    // is the bumper's top edge, a sliver under the grille, and the band came out as a jagged bar)
    if ((p.role === 'top' || p.role === 'side') && !model.panels?.front) { g.fillStyle = third; poly(g, P, [[0.975, 0], [1, 0], [1, 1], [0.975, 1]]); }
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
  // (once the stickers are decals, L.stickers === 'decals', they're drawn with the rest below, wherever they've been moved)
  if (L.showSponsor && sp && L.stickers !== 'decals') {
    if (name === 'podL' || name === 'podR') label(0.5, 0.42, sp, Math.min(0.13, PH * 0.3), Math.min(1.2, PW * 0.6), acc, true);
    // (cars without sidepods, e.g. GT cars: on the flanks instead)
    if (lab.sideSponsor && (name === 'sideL' || name === 'sideR')) label(...lab.sideSponsor, sp, 0.12, 1.1, acc, true);
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
      if (d.mirror && !(src.pair && model.panels[src.pair])) drawDecal(g, d, PW - d.x, d.y, onReady);
    } else if (d.mirror && src.pair === name) drawDecal(g, d, (1 - d.x / src.W) * PW, (d.y / src.H) * PH, onReady);
  }
}

// Models that project decals across their panels (projectDecals: the F1 and the photo-textured road cars) take them as
// layers instead: each one (and its mirror copy) drawn on its own canvas (w x h px) round it, k px per metre, its
// top-left at x0, y0 in its panel's metres and rx / ry its half-sizes, in the livery's order
export function decalLayers(cfg, model, ppm, onReady) {
  const L = cfg.decals && cfg.helmetDesign ? cfg : fillLivery(cfg), out = [], g0 = document.createElement('canvas').getContext('2d');
  const add = (d, panel, x, y) => {
    const w = d.size || 0.4; let hw = w / 2, hh = w / 2;
    if (d.text != null) { // (measured at 100x: canvas fonts this small in px don't measure reliably)
      g0.font = `${FONT_W[d.font] || ''}${w * 100}px ${FONT_CSS[d.font] || FONT_CSS.impact}`;
      hw = g0.measureText(d.text).width / 200 + w * (d.bar != null ? 0.4 : 0.1); hh = w * 0.7;
    } else {
      const im = decalImage(d.asset, onReady); if (!im) return;
      hh = hw * im.naturalHeight / im.naturalWidth;
    }
    // (its rotated rectangle's bounds, half-widths across / down)
    const t = ((d.rot || 0) * Math.PI) / 180, cs = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
    const rx = cs * hw + sn * hh + 0.01, ry = sn * hw + cs * hh + 0.01, k = Math.min(ppm, 2048 / (2 * Math.max(rx, ry)));
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
    if (pr) add(d, src.pair, (1 - d.x / src.W) * pr.W, (d.y / src.H) * pr.H);
    else add(d, d.panel, src.W - d.x, d.y);
  }
  return out;
}

// Lays decal layers over a projected model's texels, like a projector aimed at the car. Each decal sits on the outer
// surface under its centre (found along its panel's view: p.dir, from above, the left, the nose...) and shoots along
// the way that surface faces on average under it (area-weighted, within its smaller half-size), so on a flat door it
// goes straight in, and one slid over a bonnet's edge leans over to cover both the side and the bonnet, each a little
// stretched (about 1.4x at most, across a right angle), as in Forza. It carries on over seams, fades where the surface
// turns away, and lands only on the outermost surface at each spot (a stripe from above: bonnet, roof, then boot).
// m: per texel pos (x, y, z), nrm (smooth normal, x127), ar (3D area); col: their paint colours (r, g, b), changed in
// place.
const FACE0 = 0.2, FACE1 = 0.45, DEPTH = 0.12; // facing (cos) where a decal starts / is full; how far under the outer surface (m)
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
      const q = (Math.min(lh - 1, (f[1] + ry) * kp | 0) * lw + Math.min(lw - 1, (f[0] + rx) * kp | 0)) * 4;
      const a = data[q + 3] / 255 * Math.min(1, (f[3] - FACE0) / (FACE1 - FACE0)); if (!a) return;
      col[n * 3] += (data[q] - col[n * 3]) * a; col[n * 3 + 1] += (data[q + 1] - col[n * 3 + 1]) * a; col[n * 3 + 2] += (data[q + 2] - col[n * 3 + 2]) * a;
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

// Text decals tied to the livery (d.bind): the title sponsor's name or the team name, kept up to date
export const BOUND = { sponsor: 'Title sponsor', team: 'Team name' };
export function boundText(L, bind) {
  return bind === 'sponsor' ? String(L.sponsor || '').toUpperCase().slice(0, 14) : bind === 'team' ? String(L.teamName || '').toUpperCase().slice(0, 18) : '';
}
// The built-in sponsor + team name stickers on this model, as decals in the same places (so they can be moved).
// One decal per mirrored pair (the left one, 'Both sides' on).
export function stickerDecals(cfg, model) {
  const L = fillLivery(cfg), out = [], lab = model.labels || {}, g = document.createElement('canvas').getContext('2d');
  const add = (bind, name, a, c, h, maxW, color, bar) => {
    const p = model.panels[name], text = boundText(L, bind); if (!p || !text) return;
    const [x, y] = alongCross(p)(a, c), size = textFit(g, text, 'impact', maxW, h);
    out.push({ id: 'd' + Math.random().toString(36).slice(2, 8), bind, panel: name, x: +x.toFixed(3), y: +y.toFixed(3), size: +size.toFixed(3), rot: 0, opacity: 1,
      mirror: !!(p.pair && model.panels[p.pair]), flip: false, text: '', font: 'impact', color, outline: bar ? null : L.third, ...(bar ? { bar: L.third } : {}), name: null });
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
  if (model.paintProjected) return model.paintProjected(canvas, L, (pg, name, p) => { pg.fillStyle = hex(L.main); pg.fillRect(0, 0, p.W, p.H); panelArt(pg, name, p, L, model, onReady, !model.projectDecals); },
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
      if (txt) { g.fillStyle = fillOn; textFit(g, txt.toUpperCase(), 'impact', W * 0.3, H * 0.1); g.fillText(txt.toUpperCase(), 0, H * 0.42); g.fillText(txt.toUpperCase(), W, H * 0.42); }
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
