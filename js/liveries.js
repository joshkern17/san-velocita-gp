// Saved liveries: team liveries, each with its own name, the team on it (name, number, sponsor: the same on every car)
// and a version per car model (its paint, pattern, decals, stickers), newest first, with a small photo of the car
// (carphoto.js). The Garage's Saved Liveries list and the Livery Designer's Saved tab both read and write it.
// Stored as before (svgp.teams); older saves (one whole car each) become team liveries with that one car's version.
import { carPhoto } from './carphoto.js';
import { liveryPanels } from './carmodel.js';

// what's a car's own in a livery (each model has its own version) and what the team carries into every car
export const CAR_LOOK = ['design', 'pattern', 'main', 'accent', 'third', 'wingColor', 'decals', 'stickers', 'showNumber', 'showSponsor', 'sponsorLogo', 'gloss', 'nose', 'fwing', 'pods', 'cover', 'rwing', 'halo', 'rims', 'rimCol'];
export const TEAM_KEYS = ['teamName', 'number', 'sponsor'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const pick = (c, keys) => clone(Object.fromEntries(keys.filter(k => c[k] !== undefined && k !== 'design').map(k => [k, c[k]])));
export const chassisOf = (c) => c.chassis || 'custom';

const KEY = 'svgp.teams', MAX = 60;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
// (full storage: the oldest go, photos first, until it fits; dropped: how many saves that cost, for the save to say so)
export let dropped = 0;
function write(list) {
  dropped = Math.max(0, list.length - MAX); list = list.slice(0, MAX);
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { const k = list.findLastIndex(x => x.thumb); if (k > 0) list[k] = { ...list[k], thumb: null }; else if (list.length > 1) { list.pop(); dropped++; } else return false; }
  }
}
// (an old save, one whole car: a team livery with that car's version; saves from before they had ids get one)
function upgrade(e, i) {
  if (!e.id) e.id = 'lv' + (e.saved || i).toString(36) + i;
  if (e.cars) return false;
  const c = e.car || {};
  e.team = pick(c, TEAM_KEYS); e.cars = { [chassisOf(c)]: { look: pick(c, CAR_LOOK), saved: e.saved || 0 } };
  e.name = e.name || c.teamName || 'Your Team'; delete e.car;
  return true;
}
export function savedLiveries() {
  const list = read(); let fix = false;
  list.forEach((e, i) => { if (upgrade(e, i)) fix = true; });
  if (fix) write(list);
  return list;
}
export const findLivery = (id) => id ? savedLiveries().find(e => e.id === id) || null : null;
// the cars it has a version for, the newest first
export const liveryCars = (e) => Object.entries(e.cars).sort((a, b) => (b[1].saved || 0) - (a[1].saved || 0)).map(([k]) => k);
// the livery on one car: the team, and that car's version (null: it hasn't one)
export function liveryOn(e, chassis) {
  const v = e.cars[chassis]; if (!v) return null;
  return { ...clone(e.team), ...clone(v.look), chassis, design: e.id };
}
// ---- a car it has no version for yet: its newest version's paint, and its decals moved across onto the same kind of
// panel on this car (flank to flank, sidepod to sidepod, the same side), as far along from the nose and as far down;
// added to the livery when it's saved. A kind this car hasn't goes on the nearest one (an F1 sidepod: a road car's
// flank; a road car's nose / tail: an F1 car's top, at that end; the wings: the nose / tail).
const NEAR = { side: ['side', 'pod'], pod: ['pod', 'side'], cover: ['cover', 'side'], top: ['top'], end: ['end', 'top'], wing: ['end', 'top'], plate: ['plate', 'side'] };
const NOSE_ROT = { left: 180, right: 0, top: -90 };
// panel metres -> [along (0 tail .. 1 nose), across] and back, by which edge faces the nose (none: straight across)
function toAC(p, x, y) { const u = x / p.W, v = y / p.H; return p.nose === 'left' ? [1 - u, v] : p.nose === 'right' ? [u, v] : p.nose === 'top' ? [1 - v, u] : [u, v]; }
function fromAC(p, a, c) { a = Math.max(0.02, Math.min(0.98, a)); c = Math.max(0.02, Math.min(0.98, c)); const [u, v] = p.nose === 'left' ? [1 - a, c] : p.nose === 'right' ? [a, c] : p.nose === 'top' ? [c, 1 - a] : [a, c]; return [+(u * p.W).toFixed(3), +(v * p.H).toFixed(3)]; }
// where on the car (along) a panel that only covers part of it sits, as a share of the car's length
const SPAN = { pod: [0.35, 0.65], cover: [0.15, 0.45] };
export function portDecals(decals, from, to) {
  const out = []; let placed = 0;
  for (const d of decals || []) {
    const sp = from[d.panel];
    if (!sp) { if (to[d.panel]) { out.push(clone(d)); placed++; } continue; } // (no idea where it was: only the same panel)
    const names = Object.keys(to);
    let tn = null;
    let [a, c] = toAC(sp, d.x, d.y);
    // (a road car's mid-flank, on a car with sidepods: the sidepod, where the door would be; its tail: the rear wing)
    const roles = sp.role === 'side' && a > SPAN.pod[0] && a < SPAN.pod[1] && names.some(n => to[n].role === 'pod') && !Object.values(from).some(p => p.role === 'pod') ? ['pod', 'side']
      : sp.role === 'end' && !/^(front|fwing)$/.test(d.panel) ? ['end', 'wing', 'top'] : NEAR[sp.role] || [sp.role];
    for (const role of roles) {
      const same = names.filter(n => to[n].role === role); if (!same.length) continue;
      const fore = /^(front|fwing)$/.test(d.panel); // (a nose / tail face or a wing: the same end of the car)
      tn = (d.panel in to && to[d.panel].role === role) ? d.panel
        : role === 'end' || role === 'wing' ? same.find(n => fore ? /f(ront|wing)/.test(n) : /r(ear|wing)/.test(n)) || same[0]
        : same.find(n => to[n].nose === sp.nose) || same[0];
      break;
    }
    if (!tn) continue;
    const tp = to[tn];
    if (tp.role !== sp.role) {
      const S = SPAN[sp.role], T = SPAN[tp.role];
      if (S) a = S[0] + a * (S[1] - S[0]);
      if (T) a = (a - T[0]) / (T[1] - T[0]);
      if ((sp.role === 'end' || sp.role === 'wing') && tp.role === 'top') { c = a; a = /^(front|fwing)$/.test(d.panel) ? 0.9 : 0.1; }
    }
    const [x, y] = fromAC(tp, a, c);
    const k = tp.role === sp.role ? Math.max(0.6, Math.min(1.5, Math.sqrt((tp.W * tp.H) / (sp.W * sp.H)))) : 1;
    const n = { ...clone(d), panel: tn, x, y, size: +Math.min(d.size * k, tp.W * 0.9).toFixed(3) };
    if (sp.nose && tp.nose && sp.nose !== tp.nose) n.rot = (((d.rot || 0) + NOSE_ROT[tp.nose] - NOSE_ROT[sp.nose]) % 360 + 540) % 360 - 180;
    out.push(n); placed++;
  }
  return { decals: out, placed, total: (decals || []).length };
}
// the start of a version for a car without one: from the newest version that has decals to bring (else the newest);
// from: the car it came from, placed / total: its decals that found a place
export function liveryPort(e, chassis) {
  const cars = liveryCars(e), to = liveryPanels(chassis);
  const src = cars.find(k => (e.cars[k].look.decals || []).length && liveryPanels(k)) || cars[0];
  const L = src ? e.cars[src].look : {};
  const look = Object.fromEntries(['pattern', 'main', 'accent', 'third', 'wingColor', 'showNumber', 'showSponsor', 'sponsorLogo', 'gloss'].filter(k => L[k] !== undefined).map(k => [k, L[k]]));
  const from = src && liveryPanels(src), P = from && to ? portDecals(L.decals, from, to) : { decals: [], placed: 0, total: (L.decals || []).length };
  if (P.decals.length && L.stickers === 'decals') look.stickers = 'decals'; // (its standard stickers came across as decals)
  return { look: { ...clone(e.team), ...clone(look), decals: P.decals, chassis, design: e.id }, from: src, placed: P.placed, total: P.total };
}
export const liveryStart = (e, chassis) => liveryPort(e, chassis).look;
// has the car moved on from its saved version? (true: never saved for this car)
export function liveryChanged(e, car) {
  const v = e.cars[chassisOf(car)]; if (!v) return true;
  return JSON.stringify(pick(car, CAR_LOOK)) !== JSON.stringify(v.look) || JSON.stringify(pick(car, TEAM_KEYS)) !== JSON.stringify(e.team);
}
// a small JPEG of the car wearing it
function thumbOf(car) {
  return new Promise((res) => {
    let src; try { src = carPhoto(car, 7); } catch (e) { return res(null); }
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 168; c.height = 109; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); };
    img.onerror = () => res(null); img.src = src;
  });
}
function rethumb(id, car, onThumb) {
  thumbOf(car).then(t => { if (!t) return; const list = savedLiveries(), x = list.find(y => y.id === id); if (x) { x.thumb = t; write(list); if (onThumb) onThumb(); } });
}
// a new team livery from the car as it is (its first version); name: what it's called (the team name unless said)
export function saveLivery(car, onThumb, name) {
  const e = { id: 'lv' + Date.now().toString(36), name: name || car.teamName || 'Your Team', team: pick(car, TEAM_KEYS), cars: { [chassisOf(car)]: { look: pick(car, CAR_LOOK), saved: Date.now() } }, saved: Date.now(), thumb: null };
  if (!write([e, ...savedLiveries()])) return false;
  e.dropped = dropped; // (the oldest saves it cost, when storage was full)
  rethumb(e.id, car, onThumb);
  return e;
}
// this car's version into a saved livery (added, or written over); the other cars' versions stay, the team goes on all
export function updateLivery(id, car, onThumb) {
  const list = savedLiveries(), e = list.find(x => x.id === id); if (!e) return false;
  const ch = chassisOf(car); e.added = !e.cars[ch];
  e.cars[ch] = { look: pick(car, CAR_LOOK), saved: Date.now() }; e.team = pick(car, TEAM_KEYS); e.saved = Date.now();
  if (!write([e, ...list.filter(x => x !== e)])) return false;
  rethumb(id, car, onThumb);
  return e;
}
export function renameLivery(id, name) { const list = savedLiveries(), e = list.find(x => x.id === id); if (!e || !name) return; e.name = name; write(list); }
export function deleteLivery(id) { write(savedLiveries().filter(e => e.id !== id)); }
// one car's version out of it (the last one: the whole livery)
export function deleteVersion(id, chassis) {
  const list = savedLiveries(), e = list.find(x => x.id === id); if (!e) return;
  delete e.cars[chassis];
  write(Object.keys(e.cars).length ? list : list.filter(x => x !== e));
}
// every car version's decals' images (for exports and loading)
export const liveryLooks = (e) => Object.entries(e.cars).map(([ch, v]) => ({ ...e.team, ...v.look, chassis: ch }));
// (the photo for one without: older saves, made when it's first shown)
const making = new Set();
export function ensureThumb(id, onThumb) {
  const e = findLivery(id); if (!e || e.thumb || making.has(id)) return;
  making.add(id);
  const ch = liveryCars(e)[0]; if (ch) rethumb(id, liveryOn(e, ch), onThumb);
}
// (the day, and the time: saves of the same team on the same day tell apart)
export const liveryDate = (e) => { if (!e.saved) return ''; const d = new Date(e.saved); return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
// a team livery from a livery file: kept as it came (a new id if one of yours has its id); false: no room
export function addLivery(e) {
  const list = savedLiveries(), n = clone(e); upgrade(n, 0);
  if (list.some(x => x.id === n.id)) n.id = 'lv' + Date.now().toString(36);
  n.saved = Date.now(); n.thumb = null;
  return write([n, ...list]) ? n : false;
}
