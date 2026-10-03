// People: the low-poly NPCs (models/characters.glb, built by tools/characters/ from the BitSoft "Male Job NPCs"
// pack + Mixamo clips) and the racer. One skeleton, 17 looks, every clip plays on every look.
//
//   await loadCharacters();
//   const guy = makeCharacter({ look: 'coveralls_navy', clip: 'idle' });
//   scene.add(guy.object);                 // stands on y = 0, faces +Z
//   guy.play('wave');                      // cross-fades from whatever was playing
//   guy.play('victory', { once: true, then: 'idle' });
//   updateCharacters(dt);                  // once per frame: ticks every live character (or guy.update(dt))
//   guy.dispose();
//   const driver = makeCharacter({ look: 'racer', livery: teamLivery });   // suit + helmet painted from a livery
//   driver.setLivery(newLivery);                                          // repaint (Livery Designer edits)
//   makeCharacter({ look: 'racer', crew: true, livery: team })            // a pit crew member in the team's kit
//                                                                         // (one painted kit per team, shared)
//
// Clips are "in place": walk / walk_2 don't move the character, the caller does (CLIP_INFO.walk.speed m/s keeps
// the feet from sliding). Sitting clips put the backside right above the origin at CLIP_INFO.sit_*.seat metres,
// feet forward: park the character with its origin on the floor under the seat, facing out.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';
import { fillLivery, paintHelmet, paintSuit, paintBoots, decalRaster, VISOR_COL } from './livery.js';

export const LOOKS = [
  'coveralls_gray', 'coveralls_tan', 'coveralls_navy', 'coveralls_black', // mechanics / pit crew
  'polo_beige', 'polo_maroon', 'polo_navy', 'polo_white',                 // team staff, officials, paddock
  'tee_beige', 'tee_maroon', 'tee_blue', 'tee_white',                     // fans, street
  'scrubs_blue', 'scrubs_green',                                          // medical
  'prisoner_1', 'prisoner_2',
  'racer',                                                                // race suit + helmet, painted from a livery
];
export const LOOK_GROUPS = {
  crew: ['coveralls_gray', 'coveralls_tan', 'coveralls_navy', 'coveralls_black'],
  staff: ['polo_beige', 'polo_maroon', 'polo_navy', 'polo_white'],
  fans: ['tee_beige', 'tee_maroon', 'tee_blue', 'tee_white', 'polo_beige', 'polo_maroon', 'polo_navy', 'polo_white'],
  medical: ['scrubs_blue', 'scrubs_green'],
  prisoner: ['prisoner_1', 'prisoner_2'],
};
// loop: repeat by default. speed: ground speed (m/s) that matches the stride. seat: seat height for sitting clips.
// (measured from the clips: tools/characters/README.md)
export const CLIP_INFO = {
  idle: { loop: true }, idle_look: { loop: true }, idle_stretch: { loop: true },
  wave: { loop: true }, victory: { loop: true }, point: { loop: true }, point_angry: { loop: true }, handshake: { loop: true },
  walk: { loop: true, speed: 1.35 }, walk_2: { loop: true, speed: 0.95 },
  sit: { loop: true, seat: 0.48 }, sit_idle: { loop: true, seat: 0.48 }, sit_clap: { loop: true, seat: 0.48 },
  sit_clap_2: { loop: true, seat: 0.48 }, sit_yell: { loop: true, seat: 0.48 }, sit_yell_2: { loop: true, seat: 0.48 },
  sit_rub_arm: { loop: true, seat: 0.57 },
};
export const CLIPS = Object.keys(CLIP_INFO);

let TPL = null, loading = null, loadError = null;
const live = new Set();
const modelUrl = () => (typeof window !== 'undefined' && window.__SVGP_CHARACTERS_GLB) || 'models/characters.glb';

export function loadCharacters() {
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(modelUrl())
    .then(g => { TPL = makeTemplate(g); return true; })
    .catch(e => { loadError = e; console.warn('characters not loaded:', e && e.message); return false; });
  return loading;
}
export const charactersReady = () => !!TPL;
export const charactersStatus = () => (TPL ? 'ready' : loadError ? 'missing' : 'loading');

// PS1 look, same as the scenery (js/envlib.js): Lambert, crisp texels, vertex snapping
function lambert(map, color, name) {
  const out = new THREE.MeshLambertMaterial({ map: map || null, color: color ?? 0xffffff });
  if (out.map) { out.map.magFilter = THREE.NearestFilter; out.map.anisotropy = 4; }
  out.name = name || '';
  applyPSXMaterial(out, { snap: true, affine: 0.6 }); out.userData.psx = true;
  return out;
}
const convertMaterial = (m) => lambert(m.map, m.color ? m.color.clone() : 0xffffff, m.name);
// which look a node belongs to: 'racer_helmet_2' -> 'racer' (the longest look name it starts with)
function lookOf(name) {
  let best = null;
  if (name) for (const l of LOOKS) if ((name === l || name.startsWith(l + '_')) && (!best || l.length > best.length)) best = l;
  return best;
}

function makeTemplate(g) {
  const mats = new Map();
  const conv = m => { if (!mats.has(m)) mats.set(m, convertMaterial(m)); return mats.get(m); };
  const looks = {};
  g.scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.castShadow = true; o.frustumCulled = false; // bones move the verts outside the rest-pose bounds
    // a look is one node per Blender mesh (clothes / head / arms as primitives); the racer is two (body + helmet)
    const look = lookOf(o.name) || lookOf(o.parent && o.parent.name);
    if (look) (looks[look] = looks[look] || []).push(o);
  });
  // Mixamo animates every bone's scale (constant) and position (only the hips really move): keep what matters
  const clips = {};
  for (const c of g.animations) {
    c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || (t.name.endsWith('.position') && /Hips\.position$/.test(t.name)));
    clips[c.name] = c;
  }
  return { scene: g.scene, looks, clips };
}

// clone the template keeping only one look, with its own skeleton
function cloneLook(look) {
  const src = TPL.scene, keep = new Set(TPL.looks[look]);
  const map = new Map(), back = new Map();
  const copy = (o) => {
    if ((o.isSkinnedMesh && !keep.has(o)) || (o !== src && !o.isBone && lookOf(o.name) && lookOf(o.name) !== look)) return null;
    const c = o.clone(false);
    map.set(o, c); back.set(c, o);
    for (const ch of o.children) { const cc = copy(ch); if (cc) c.add(cc); }
    return c;
  };
  const root = copy(src);
  root.traverse(c => {
    if (!c.isSkinnedMesh) return;
    const s = back.get(c);
    c.bind(new THREE.Skeleton(s.skeleton.bones.map(b => map.get(b)), s.skeleton.boneInverses), s.bindMatrix);
  });
  return root;
}

const rnd = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

export class Character {
  constructor({ look, group, clip = 'idle', seed = Math.random() * 1e9, timeScale = 1, livery = null, crew = false } = {}) {
    if (!TPL) throw new Error('characters: call loadCharacters() first');
    const r = rnd(seed);
    const pool = group ? LOOK_GROUPS[group] : LOOKS;
    this.look = look && TPL.looks[look] ? look : pool[Math.floor(r() * pool.length)];
    this.object = new THREE.Group();
    this.object.name = 'Character:' + this.look;
    this.body = cloneLook(this.look);
    this.object.add(this.body);
    this.timeScale = timeScale; this.crew = crew;
    this._mixer();
    if (this.look === 'racer') this.setLivery(livery || {});
    if (clip) this.play(clip, { fade: 0, offset: r() }); // random phase so crowds don't move in lockstep
    live.add(this);
  }
  // play(name, { fade = 0.3 s, once, then: clip to return to after a once, speed = 1, offset: 0..1 of the clip })
  play(name, { fade = 0.3, once = false, then = null, speed = 1, offset = 0 } = {}) {
    const clip = TPL.clips[name];
    if (!clip) { console.warn('characters: no clip', name); return this; }
    if (this.clip === name && !once) { this.action.timeScale = speed; return this; }
    const a = this.mixer.clipAction(clip);
    a.reset(); a.timeScale = speed;
    a.setLoop(once || CLIP_INFO[name]?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = true;
    if (offset) a.time = offset * clip.duration;
    a.play();
    if (this.action && this.action !== a && fade > 0) this.action.crossFadeTo(a, fade, false);
    else if (this.action && this.action !== a) this.action.stop();
    this.action = a; this.clip = name; this._then = once ? then : null;
    return this;
  }
  setLook(look) {
    if (!TPL.looks[look] || look === this.look) return this;
    const clip = this.clip, t = this.action ? this.action.time : 0;
    this.object.remove(this.body); this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.body);
    this._disposeKit();
    this.look = look; this.object.name = 'Character:' + look;
    this.body = cloneLook(look); this.object.add(this.body);
    this._mixer();
    if (look === 'racer') this.setLivery(this.livery || {});
    if (clip) { this.play(clip, { fade: 0 }); this.action.time = t; }
    return this;
  }
  _mixer() {
    this.mixer = new THREE.AnimationMixer(this.body);
    this.mixer.timeScale = this.timeScale;
    this.action = null; this.clip = null; this._then = null;
    this.mixer.addEventListener('finished', () => { if (this._then) { const n = this._then; this._then = null; this.play(n); } });
  }
  // post(character): runs after the clip each frame, to bend bones on top of it (a crouch, a lean). bone(name) finds one
  update(dt) { this.mixer.update(dt); if (this.post) this.post(this); }
  bone(name) { const n = 'mixamorig:' + name; let b = null; this.body.traverse(o => { if (!b && o.isBone && (o.name === n || o.name === n.replace(':', ''))) b = o; }); return b; }
  // the racer's suit, helmet, gloves and boots from a livery (js/livery.js data; a TEAMS entry works too)
  // crew members wear the team's crew kit (CREW_STYLES in js/livery.js), one set of canvases per team
  setLivery(cfg) {
    this.livery = cfg;
    if (this.look !== 'racer') return this;
    if (this.crew) {
      const kit = sharedCrewKit(cfg);
      if (this.kit !== kit) { this._disposeKit(); this.kit = kit; kit.refs++; }
    } else {
      if (!this.kit || this.kit.shared) { this._disposeKit(); this.kit = makeKit(); }
      paintKit(this.kit, cfg, () => { if (this.livery === cfg) paintKit(this.kit, cfg); }); // again once a logo image loads
    }
    applyKit(this.body, this.kit);
    return this;
  }
  _disposeKit() {
    const kit = this.kit; this.kit = null;
    if (!kit || (kit.shared && --kit.refs > 0)) return;
    if (kit.shared) CREW_KITS.delete(kit.key);
    for (const m of kit.mats) { if (m.map && m.map.isCanvasTexture && !m.map.userData.shared) m.map.dispose(); m.dispose(); }
  }
  dispose() {
    live.delete(this);
    this._disposeKit();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.body);
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

export const makeCharacter = (opts) => new Character(opts);

// stock coveralls in a colour near the team's (a crew that wears CREW_STYLES 'classic')
export function classicCrewLook(team) {
  const c = new THREE.Color(team.main ?? 0x888888), hsl = {}; c.getHSL(hsl);
  if (hsl.l < 0.16) return 'coveralls_black';
  if (hsl.s > 0.35 && hsl.h > 0.5 && hsl.h < 0.75) return 'coveralls_navy';
  if (hsl.l > 0.62 || hsl.s < 0.2) return 'coveralls_gray';
  return hsl.h < 0.2 || hsl.h > 0.9 ? 'coveralls_tan' : 'coveralls_navy';
}
// a ray hit on a racer -> where on his kit: { part: torso | armL | armR | legL | legR | helmet, u, v } in the
// part's canvas (u from the visor on the helmet), or null (skin, gloves, boots)
export function kitHit(h) {
  const n = (h.object.material && h.object.material.name || '').replace(/\.\d+$/, '');
  const wrap = (x) => ((x % 1) + 1) % 1;
  if (n === 'HelmetShell' && h.uv) return { part: 'helmet', u: wrap(h.uv.x - HELMET_FRONT), v: h.uv.y };
  const part = SUIT_PARTS[n];
  if (part && h.uv1) return { part, u: wrap(h.uv1.x), v: h.uv1.y };
  return null;
}

// ---------------- the racer's kit ----------------
// The model carries greyscale detail (models/racer/helmet_detail.png; the suit's creases, baked by
// tools/characters/racer.py) in each material's map. Each racer gets its own canvases: the livery's helmet / suit
// design multiplied by that detail. On the helmet detail, pure black marks the visor (painted in the livery's visor
// colour) and pure red the strip across its top (team colour, the sponsor's name, or visor when off).
const HELMET_FRONT = 0.5; // u of the visor in the helmet's world-map UVs (tools/characters/helmet_paint.py)
function pixelsOf(tex) {
  if (tex.userData.px) return tex.userData.px;
  const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const px = { canvas: c, W: c.width, H: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
  // the strip's box (for the sponsor's name), and the visor's (its sheen runs top to bottom)
  const box = () => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 }), grow = (b, x, y) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
  px.strip = box(); px.visor = box();
  const d = px.data;
  for (let y = 0; y < px.H; y++) for (let x = 0; x < px.W; x++) {
    const i = (y * px.W + x) * 4, k = maskOf(d[i], d[i + 1], d[i + 2]);
    if (k === 1) grow(px.visor, x, y); else if (k === 2) grow(px.strip, x, y);
  }
  return (tex.userData.px = px);
}
const maskOf = (r, g, b) => (r < 50 && g < 50 && b < 50 ? 1 : r > 140 && g < 100 && b < 100 && r - g > 80 ? 2 : 0);
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const isLight = ([r, g, b]) => r * 0.3 + g * 0.59 + b * 0.11 > 150;

// a kit: one material per painted part of the racer, made from the model's own (whose maps hold the detail)
const SUIT_PARTS = { SuitTorso: 'torso', SuitArmL: 'armL', SuitArmR: 'armR', SuitLegL: 'legL', SuitLegR: 'legR' };
function makeKit() {
  const kit = { mats: [], byName: {}, suit: {} };
  const canvasTex = (orig, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping; t.channel = orig.channel; // (the suit's tube UVs are the model's 2nd set)
    return t;
  };
  for (const o of TPL.looks.racer) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    const n = m.name, key = n.replace(/\.\d+$/, '');
    if (kit.byName[n]) continue;
    let out = null;
    if (key === 'HelmetShell' && m.map) {
      const det = pixelsOf(m.map);
      out = lambert(canvasTex(m.map, det.W, det.H), 0xffffff, n);
      kit.helmet = { mat: out, det };
    } else if ((SUIT_PARTS[key] || key === 'Boots') && m.map) {
      out = lambert(canvasTex(m.map, m.map.image.width, m.map.image.height), 0xffffff, n);
      if (key === 'Boots') kit.boots = { mat: out, det: m.map.image };
      else kit.suit[SUIT_PARTS[key]] = { mat: out, det: m.map.image };
    } else if (key === 'Gloves') { out = lambert(null, 0xffffff, n); kit.gloves = out; }
    if (out) { kit.mats.push(out); kit.byName[n] = out; }
  }
  return kit;
}
function applyKit(body, kit) {
  body.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const swap = (m) => kit.byName[m.name] || m;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}
// the crew's version of a livery: the driver's suit (or the crew's own colours), no race numbers, a team helmet
export function crewLivery(cfg) {
  const L = fillLivery(cfg), C = L.crew;
  const suit = { ...L.suit, number: 'none', chest: 'team' };
  if (C.style === 'own') { suit.base = C.base; suit.accent = C.accent; }
  return { ...L, suit, helmetDesign: { ...L.helmetDesign, base: suit.base, accent: suit.accent, number: false, decal: null, strip: 'team' } };
}
const CREW_KITS = new Map(); // livery object -> its crew kit (refs = crew members wearing it)
function sharedCrewKit(cfg) {
  let kit = CREW_KITS.get(cfg);
  if (!kit) {
    kit = makeKit(); kit.shared = true; kit.refs = 0; kit.key = cfg;
    const L = crewLivery(cfg);
    paintKit(kit, L, () => paintKit(kit, L));
    CREW_KITS.set(cfg, kit);
  }
  return kit;
}

// ---------------- decals projected onto the racer ----------------
// Each part's canvas gets a texel map: where every texel sits on the body (the bind pose, metres, +Y up, facing
// +Z) and which way the surface faces there. A decal is anchored at a spot on a part (part, u, v: what clicking
// the driver gives) and projected from the surface's direction there like a sticker, onto every part it reaches.
const DECAL_REF = 0.75;  // a decal's size is a fraction of this many metres (about the torso's height)
const DECAL_DEPTH = 0.2; // how far in front of / behind its plane a decal still lands (m)
const MAPS = new Map();  // material name -> texel map
function texelMap(name) {
  if (MAPS.has(name)) return MAPS.get(name);
  let mesh = null;
  for (const o of TPL.looks.racer) if ((Array.isArray(o.material) ? o.material : [o.material]).some(m => m.name === name)) mesh = o;
  const tex = mesh && mesh.material.map;
  if (!tex) { MAPS.set(name, null); return null; }
  // the skinning's bind space: metres, +Y up (the node's own matrix carries the rig's 1/100 scale, skinning doesn't)
  const W = tex.image.width, H = tex.image.height, geo = mesh.geometry, mw = mesh.bindMatrix, nm = new THREE.Matrix3().getNormalMatrix(mw);
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes[tex.channel ? 'uv' + tex.channel : 'uv'];
  const pos = new Float32Array(W * H * 3), nrm = new Float32Array(W * H * 3), ok = new Uint8Array(W * H);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const vp = [], vn = [], vu = [];
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(mw); vp.push(v.x, v.y, v.z);
    n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); vn.push(n.x, n.y, n.z);
    vu.push(UV.getX(i) * W - 0.5, UV.getY(i) * H - 0.5);
  }
  const idx = geo.index ? geo.index.array : [...Array(P.count).keys()];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = vu[a * 2], ay = vu[a * 2 + 1], bx = vu[b * 2], by = vu[b * 2 + 1], cx = vu[c * 2], cy = vu[c * 2 + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx)), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const k = y * W + (((x % W) + W) % W); // (u past 1: faces across the tube's seam)
      for (let j = 0; j < 3; j++) { pos[k * 3 + j] = vp[a * 3 + j] * l1 + vp[b * 3 + j] * l2 + vp[c * 3 + j] * l3; nrm[k * 3 + j] = vn[a * 3 + j] * l1 + vn[b * 3 + j] * l2 + vn[c * 3 + j] * l3; }
      ok[k] = 1;
    }
  }
  // grow the map a few texels past the triangles' edges (texture filtering reads there)
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (ok[k]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = (x + dx + W) % W, yy = y + dy; if (yy < 0 || yy >= H) continue; const kk = yy * W + xx; if (ok[kk] === 1) { add.push([k, kk]); break; } }
    }
    for (const [k, kk] of add) { for (let j = 0; j < 3; j++) { pos[k * 3 + j] = pos[kk * 3 + j]; nrm[k * 3 + j] = nrm[kk * 3 + j]; } ok[k] = 2; }
    for (const [k] of add) ok[k] = 1;
  }
  const map = { W, H, pos, nrm, ok };
  MAPS.set(name, map);
  return map;
}
const PART_MAT = { torso: 'SuitTorso', armL: 'SuitArmL', armR: 'SuitArmR', legL: 'SuitLegL', legR: 'SuitLegR', helmet: 'HelmetShell' };
// a decal's anchor -> the point on the body and the way the surface faces there
function anchorOf(d) {
  const m = texelMap(PART_MAT[d.part]); if (!m) return null;
  const u = d.part === 'helmet' ? d.u + HELMET_FRONT : d.u;
  const cx = Math.floor((((u % 1) + 1) % 1) * m.W), cy = Math.min(m.H - 1, Math.max(0, Math.floor(d.v * m.H)));
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = (cx + dx + m.W) % m.W, y = cy + dy; if (y < 0 || y >= m.H) continue;
    const k = y * m.W + x;
    if (m.ok[k]) return { p: new THREE.Vector3(m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]), n: new THREE.Vector3(m.nrm[k * 3], m.nrm[k * 3 + 1], m.nrm[k * 3 + 2]).normalize() };
  }
  return null;
}
function projectDecals(decals, targets, onReady) {
  if (!decals.length) return;
  for (const t of targets) t.map = texelMap(t.name.replace(/\.\d+$/, ''));
  for (const d of decals) {
    const r = decalRaster(d, onReady), a = anchorOf(d);
    if (!r || !a) continue;
    const frames = [[a.p, a.n, d.rot || 0]];
    if (d.mirror) frames.push([new THREE.Vector3(-a.p.x, a.p.y, a.p.z), new THREE.Vector3(-a.n.x, a.n.y, a.n.z), -(d.rot || 0)]); // the other side, reading the right way
    const w = d.size * DECAL_REF * r.w, h = d.size * DECAL_REF * r.h, rad2 = (w * w + h * h) / 4 + DECAL_DEPTH * DECAL_DEPTH, op = d.opacity ?? 1;
    for (const [P, N, rot] of frames) {
      const up = Math.abs(N.y) > 0.95 ? new THREE.Vector3(0, 0, -Math.sign(N.y)) : new THREE.Vector3(0, 1, 0);
      let U = up.sub(N.clone().multiplyScalar(up.dot(N))).normalize(), R = new THREE.Vector3().crossVectors(U, N);
      const c = Math.cos(rot * Math.PI / 180), sn = Math.sin(rot * Math.PI / 180);
      [R, U] = [R.clone().multiplyScalar(c).addScaledVector(U, -sn), U.clone().multiplyScalar(c).addScaledVector(R, sn)];
      for (const t of targets) {
        const m = t.map; if (!m) continue;
        const o = t.data;
        for (let k = 0, n = m.W * m.H; k < n; k++) {
          if (!m.ok[k]) continue;
          const dx = m.pos[k * 3] - P.x, dy = m.pos[k * 3 + 1] - P.y, dz = m.pos[k * 3 + 2] - P.z;
          if (dx * dx + dy * dy + dz * dz > rad2) continue;
          const z = dx * N.x + dy * N.y + dz * N.z, face = m.nrm[k * 3] * N.x + m.nrm[k * 3 + 1] * N.y + m.nrm[k * 3 + 2] * N.z;
          if (Math.abs(z) > DECAL_DEPTH || face < 0.05) continue;
          // fade out where the surface turns away from the decal (no jagged cut along the facets)
          const fade = Math.min(1, (face - 0.05) / 0.3) * Math.min(1, (DECAL_DEPTH - Math.abs(z)) / 0.04);
          let iu = (dx * R.x + dy * R.y + dz * R.z) / w + 0.5;
          const iv = 0.5 - (dx * U.x + dy * U.y + dz * U.z) / h;
          if (iu < 0 || iu >= 1 || iv < 0 || iv >= 1) continue;
          if (d.flip) iu = 1 - iu;
          const s = (Math.floor(iv * r.H) * r.W + Math.floor(iu * r.W)) * 4, al = r.data[s + 3] / 255 * op * fade;
          if (al <= 0) continue;
          const q = k * 4;
          o[q] += (r.data[s] - o[q]) * al; o[q + 1] += (r.data[s + 1] - o[q + 1]) * al; o[q + 2] += (r.data[s + 2] - o[q + 2]) * al;
        }
      }
    }
  }
}

function paintKit(kit, cfg, onReady) {
  const L = fillLivery(cfg), D = L.helmetDesign, SD = L.suit;
  if (kit.helmet) {
    const { mat, det } = kit.helmet, cv = mat.map.image, g = cv.getContext('2d', { willReadFrequently: true });
    paintHelmet(cv, L, HELMET_FRONT, onReady, { decals: false });
    const img = g.getImageData(0, 0, det.W, det.H), o = img.data, d = det.data;
    projectDecals(SD.decals.filter(x => x.part === 'helmet'), [{ name: mat.name, data: o }], onReady); // (under the visor + detail)
    const [vBase, vSheen] = (VISOR_COL[D.visor] || VISOR_COL.dark).map(rgbOf);
    const mode = D.strip || 'team', sCol = rgbOf(D.accent ?? L.main ?? 0xffffff);
    const vb = det.visor, vh = Math.max(1, vb.y1 - vb.y0);
    for (let y = 0; y < det.H; y++) {
      // visor: sheen colour at the top fading to the base colour (an iridium visor catching the sky)
      const t = Math.min(1, Math.max(0, (y - vb.y0) / vh)), s = Math.max(0, 1 - t * 2) * 0.3;
      const vc = [0, 1, 2].map(k => vBase[k] * (1 - s) + vSheen[k] * s);
      for (let x = 0; x < det.W; x++) {
        const i = (y * det.W + x) * 4, k = maskOf(d[i], d[i + 1], d[i + 2]);
        const c = k === 1 || (k === 2 && mode === 'off') ? vc : k === 2 ? sCol : null;
        if (c) { o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; continue; }
        const f = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; // the detail darkens the design
        o[i] *= f; o[i + 1] *= f; o[i + 2] *= f;
      }
    }
    g.putImageData(img, 0, 0);
    const sb = det.strip;
    if (mode === 'sponsor' && L.sponsor && sb.x1 > sb.x0) {
      const h = (sb.y1 - sb.y0 + 1) * 0.86, txt = String(L.sponsor).toUpperCase();
      g.save(); g.beginPath(); g.rect(sb.x0, sb.y0, sb.x1 - sb.x0 + 1, sb.y1 - sb.y0 + 1); g.clip();
      g.font = `bold ${h}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(txt).width, maxW = (sb.x1 - sb.x0) * 0.62;
      if (w > maxW) g.font = `bold ${h * maxW / w}px Impact, "Arial Black", sans-serif`;
      g.fillStyle = isLight(sCol) ? '#121214' : '#ffffff';
      g.fillText(txt, (sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2 + h * 0.05);
      g.restore();
    }
    mat.map.needsUpdate = true;
  }
  // the suit: one design for the arms and one for the legs (paintSuit), copied onto each limb, then each part's
  // decals, then the creases
  const S = kit.suit;
  if (S.torso) {
    const scratch = (p) => { const c = kit[p] || (kit[p] = document.createElement('canvas')); const src = S[p === 'armsCv' ? 'armL' : 'legL'].mat.map.image; c.width = src.width; c.height = src.height; return c; };
    const arms = scratch('armsCv'), legs = scratch('legsCv');
    paintSuit(S.torso.mat.map.image, legs, arms, L, onReady, { belt: false, decals: false });
    for (const [part, p] of Object.entries(S)) if (part !== 'torso') p.mat.map.image.getContext('2d').drawImage(part.startsWith('arm') ? arms : legs, 0, 0);
    // decals: projected onto the body, so one can run from the chest onto a sleeve or down a leg
    const targets = Object.values(S).map(p => { const cv = p.mat.map.image, g = cv.getContext('2d', { willReadFrequently: true }); const img = g.getImageData(0, 0, cv.width, cv.height); return { name: p.mat.name, g, img, data: img.data }; });
    projectDecals(SD.decals.filter(x => x.part !== 'helmet'), targets, onReady);
    for (const t of targets) t.g.putImageData(t.img, 0, 0);
    for (const p of Object.values(S)) {
      const cv = p.mat.map.image, g = cv.getContext('2d');
      g.globalCompositeOperation = 'multiply'; g.drawImage(p.det, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';
      p.mat.map.needsUpdate = true;
    }
  }
  if (kit.boots) {
    const cv = kit.boots.mat.map.image, g = cv.getContext('2d');
    paintBoots(cv, L);
    g.globalCompositeOperation = 'multiply'; g.drawImage(kit.boots.det, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';
    kit.boots.mat.map.needsUpdate = true;
  }
  if (kit.gloves) kit.gloves.color.setHex(SD.gloves ?? L.third ?? 0x121214);
}
// ticks every live character; skips ones that are hidden (or whose parents are)
export function updateCharacters(dt) {
  for (const c of live) {
    let o = c.object, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (vis && c.object.parent) c.update(dt);
  }
}
