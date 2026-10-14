// Racing drivers' looks. Every driver (a World Career person, or a name in the stock field) has a face and a helmet
// of their own, kept for life (picked from their id), and wears their team's suit. The same kit dresses their
// character (js/characters.js: the pit garage, the grid, the podium, your garage), their helmet in the car, and
// their portrait: them with the helmet off, rendered from the racer model, for the UI.
//
//   driverLivery(id, team)            // a livery (js/livery.js) for their character / car: the team's suit, their helmet
//   driverFace(id)                    // which of FACES (js/characters.js)
//   portrait(id, team, done, own)     // their picture (a data URL) if it's made, else null: it's queued, done() when ready
//                                     // (own: { livery, face, key } for someone dressed their own way: you)
//   portraitNow(id, team)             // made on the spot (null until the characters have loaded)
//   setPhotoContext({ teamOf, ownOf, changed })  // the UI's side: a person's team, how you're dressed ({ id: 'P' }),
//                                     // and what to do when a portrait lands
//   photoOf(person) / faceHTML(person, cls)  // a World Career person's picture (or a silhouette that's swapped
//                                     // for it in place once it's made: [data-face] elements)
import * as THREE from 'three';
import { loadCharacters, charactersReady, makeCharacter, FACES, femaleFace } from './characters.js';
import { HELMET_PATTERNS, VISOR_COL } from './livery.js';
import { teamColors, teamLivery } from './teamliveries.js';

// a stable number from an id
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (s) => { let x = hash(s) || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909), (x >>>= 0) / 4294967296)); };
// helmet colours: bright and saturated, the way people paint their own
const HELMET_COLS = [0xffffff, 0xf2c21a, 0xff6a1c, 0xe02020, 0x1d4fd8, 0x18a058, 0x1fb5c8, 0x7a2cc8, 0xe0569a, 0x121214, 0xd8d8d8, 0x2ad46a, 0xffe05a, 0x0a2a6a];
const H_PATTERNS = Object.keys(HELMET_PATTERNS).filter(k => k !== 'solid');
const VISORS = Object.keys(VISOR_COL);
const SUITS = ['sides', 'twotone', 'shoulders', 'sash', 'panels', 'fade', 'chevron'];

// who's a woman: from their first name (World Career people: setPeopleSource), the names that go either way by a coin
// that's theirs; a name we don't know (the stock field's initials) about one in three; you, by your name, or a man
const WOMEN = new Set(['Giulia', 'Sofia', 'Elena', 'Amelia', 'Isla', 'Freya', 'Aoi', 'Mei', 'Ana', 'Beatriz', 'Lena', 'Mia', 'Camille', 'Chloe', 'Manon',
  'Lucia', 'Marta', 'Ines', 'Elsa', 'Astrid', 'Linnea', 'Zofia', 'Maja', 'Ola', 'Ada', 'Ngozi', 'Kemi', 'Madison', 'Ruby', 'Zoe', 'Tahlia', 'Valeria',
  'Ximena', 'Paola', 'Seoyeon', 'Yuna', 'Jisoo']);
const EITHER = new Set(['Avery', 'Riley', 'Yuki', 'Sora', 'Andrea', 'Sam', 'Alex', 'Jo', 'Charlie', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Jamie']);
let peopleOf = () => null; // () -> World Career people by id
export function setPeopleSource(fn) { peopleOf = fn; }
export function isWoman(id) {
  const self = String(id).startsWith('P:'), first = self ? String(id).slice(2).split(' ')[0] : peopleOf()?.[id]?.first;
  if (first) return WOMEN.has(first) || (!self && EITHER.has(first) && hash('sex:' + id) % 2 === 0);
  return !self && hash('sex:' + id) % 3 === 0;
}
// their face: one of the men's (FACES) or, if there are any, the women's after them
export const driverFace = (id) => { const f = isWoman(id) ? femaleFace(hash('face:' + id)) : null; return f ?? hash('face:' + id) % FACES.length; };
// their own helmet design (for life)
export function driverHelmet(id) {
  const r = rng('helmet:' + id), pick = (a) => a[Math.floor(r() * a.length)];
  const base = pick(HELMET_COLS); let accent = pick(HELMET_COLS); while (accent === base) accent = pick(HELMET_COLS);
  let third = pick(HELMET_COLS); while (third === base || third === accent) third = pick(HELMET_COLS);
  return { base, accent, third, pattern: pick(H_PATTERNS), visor: r() < 0.5 ? 'dark' : pick(VISORS), strip: 'team', number: false, decal: null };
}
// the team's suit: one pattern per team (from its name), so teammates match
export function teamSuit(team) {
  team = teamColors(team);
  return { base: team.main, accent: team.accent, pattern: SUITS[hash('suit:' + team.name) % SUITS.length], chest: 'team', number: 'none', gloves: team.third ?? 0x121214, boots: team.third ?? 0x121214 };
}
export function driverLivery(id, team, extra = {}) {
  team = teamColors(team);
  return { main: team.main, accent: team.accent, third: team.third ?? (team.main === 0x121214 ? 0x2a2a30 : 0x121214), helmet: driverHelmet(id).base,
    teamName: team.name, sponsor: (team.name || '').split(' ')[0], helmetDesign: driverHelmet(id), suit: teamSuit(team), ...teamLivery(team.name), ...extra };
}

// ---------------- portraits ----------------
// Head and shoulders, close and nearly face on, lit like a team photo: a warm key, a cool fill and a rim in the team's
// colour, on a dark ground (the UI frames them). One small renderer of its own, made on first use.
const PS = 192;
let R = null;
function setup() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(PS, PS, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2018, 0.85));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(2.4, 1.8, 1.6); scene.add(key); // (from the side, so faces have some shape)
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(-2, 1.6, -1.8); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  R = { renderer, scene, camera, rim };
}
const cache = new Map();   // key -> data URL
const waiting = new Map(); // key -> [done callbacks]
const queue = [];
const keyOf = (id, team, own) => `${id}|${team ? team.name + team.main + '|' + team.accent : '-'}|${own ? own.key || '' : ''}`;
export function portrait(id, team, done, own = null) {
  const k = keyOf(id, team, own);
  if (cache.has(k)) return cache.get(k);
  if (!waiting.has(k)) { waiting.set(k, []); queue.push([k, id, team, own]); pump(); }
  if (done) waiting.get(k).push(done);
  return null;
}
let pumping = false;
function pump() {
  if (pumping) return; pumping = true;
  loadCharacters().then(ok => {
    if (!ok) { pumping = false; return; }
    // a few at a time, between frames
    const step = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const [k, id, team, own] = queue.shift();
        try { cache.set(k, render(id, team, own)); } catch (e) { console.warn('portrait', e); cache.set(k, null); }
        const cbs = waiting.get(k) || []; waiting.delete(k); cbs.forEach(f => f(cache.get(k)));
      }
      if (queue.length) setTimeout(step, 16); else pumping = false;
    };
    step();
  });
}
export function portraitNow(id, team, own = null) {
  if (!charactersReady()) return null;
  const k = keyOf(id, team, own);
  if (!cache.has(k)) cache.set(k, render(id, team, own));
  return cache.get(k);
}
function render(id, team, own) {
  if (!R) setup();
  const t = team || { name: 'Independent', main: 0x3a3a40, accent: 0xd8d8d8 };
  const guy = makeCharacter({ look: 'racer', clip: 'idle', livery: own?.livery || driverLivery(id, t), face: own?.face ?? driverFace(id), helmet: false, seed: hash(id) });
  guy.play('idle', { fade: 0 }); guy.action.time = 0.4 + (hash('pose:' + id) % 100) / 100 * 1.2; guy.mixer.update(0);
  guy.object.rotation.y = 0.15; // (nearly face on, a touch to one side)
  R.scene.add(guy.object); guy.object.updateMatrixWorld(true);
  const head = guy.bone('Head'), at = new THREE.Vector3();
  if (head) head.getWorldPosition(at); else at.set(0, 1.62, 0);
  // (the head bone sits at the base of the skull: frame from just over the crown down to the chest)
  R.camera.position.set(at.x + 0.02, at.y + 0.1, at.z + 0.95); R.camera.lookAt(at.x, at.y + 0.06, at.z);
  R.rim.color.setHex(t.main === 0x121214 ? 0x8a8a96 : t.main);
  R.renderer.render(R.scene, R.camera);
  const url = R.renderer.domElement.toDataURL('image/png');
  R.scene.remove(guy.object); guy.dispose();
  return url;
}

// ---------------- people's photos, for the UI ----------------
let photoCtx = null;
export function setPhotoContext(ctx) { photoCtx = ctx; }
const SIL = '<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="#cbcbcb"/><circle cx="20" cy="15.5" r="7.5" fill="#a6a6a6"/><path d="M5 41c0-9 6.7-14 15-14s15 5 15 14z" fill="#a6a6a6"/></svg>';
export function photoOf(p) {
  if (!p) return null;
  if (p.photo) return p.photo;
  const team = photoCtx ? photoCtx.teamOf(p) : null, own = photoCtx && photoCtx.ownOf ? photoCtx.ownOf(p) : null;
  return portrait(own ? own.id || p.id : p.id, team, (url) => {
    if (!url || typeof document === 'undefined') return;
    for (const el of document.querySelectorAll(`[data-face="${p.id}"]`)) { const img = document.createElement('img'); img.className = el.getAttribute('class') || ''; img.src = url; img.dataset.faceDone = p.id; el.replaceWith(img); }
    if (photoCtx && photoCtx.changed) photoCtx.changed(p);
  }, own);
}
// an <img> of them, or a silhouette standing in (the same class, so it's the same size)
export function faceHTML(p, cls = '', svg = SIL) {
  const src = photoOf(p);
  return src ? `<img class="${cls}" src="${src}">` : `<span class="${cls} sil" data-face="${p ? p.id : ''}">${svg}</span>`;
}
