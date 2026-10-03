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
//
// Clips are "in place": walk / walk_2 don't move the character, the caller does (CLIP_INFO.walk.speed m/s keeps
// the feet from sliding). Sitting clips put the backside right above the origin at CLIP_INFO.sit_*.seat metres,
// feet forward: park the character with its origin on the floor under the seat, facing out.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';
import { fillLivery, paintHelmet, paintSuit, VISOR_COL } from './livery.js';

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
  constructor({ look, group, clip = 'idle', seed = Math.random() * 1e9, timeScale = 1, livery = null } = {}) {
    if (!TPL) throw new Error('characters: call loadCharacters() first');
    const r = rnd(seed);
    const pool = group ? LOOK_GROUPS[group] : LOOKS;
    this.look = look && TPL.looks[look] ? look : pool[Math.floor(r() * pool.length)];
    this.object = new THREE.Group();
    this.object.name = 'Character:' + this.look;
    this.body = cloneLook(this.look);
    this.object.add(this.body);
    this.timeScale = timeScale;
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
  setLivery(cfg) {
    this.livery = cfg;
    if (this.look !== 'racer') return this;
    if (!this.kit) this.kit = makeKit(this.body);
    paintKit(this.kit, cfg, () => { if (this.livery === cfg) paintKit(this.kit, cfg); }); // again once a logo image loads
    return this;
  }
  _disposeKit() {
    if (!this.kit) return;
    for (const m of this.kit.mats) { if (m.map && m.map.isCanvasTexture && !m.map.userData.shared) m.map.dispose(); m.dispose(); }
    this.kit = null;
  }
  dispose() {
    live.delete(this);
    this._disposeKit();
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.body);
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

export const makeCharacter = (opts) => new Character(opts);

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
function greyOf(tex) {
  if (tex.userData.grey) return tex.userData.grey;
  const px = pixelsOf(tex), c = document.createElement('canvas'); c.width = px.W; c.height = px.H;
  const g = c.getContext('2d'), img = g.createImageData(px.W, px.H);
  for (let i = 0; i < px.data.length; i += 4) { const l = Math.min(255, (px.data[i] * 0.3 + px.data[i + 1] * 0.59 + px.data[i + 2] * 0.11) * 1.5); img.data[i] = img.data[i + 1] = img.data[i + 2] = l; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = tex.channel;
  t.userData.shared = true;
  return (tex.userData.grey = t);
}
const maskOf = (r, g, b) => (r < 50 && g < 50 && b < 50 ? 1 : r > 140 && g < 100 && b < 100 && r - g > 80 ? 2 : 0);
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const isLight = ([r, g, b]) => r * 0.3 + g * 0.59 + b * 0.11 > 150;

function makeKit(body) {
  const kit = { mats: [], suit: {} };
  const canvasTex = (orig, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping; t.channel = orig.channel; // (the suit's tube UVs are the model's 2nd set)
    return t;
  };
  body.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const swap = (m) => {
      const n = m.name;
      let out = null;
      if (n.startsWith('HelmetShell') && m.map) {
        const det = pixelsOf(m.map);
        out = lambert(canvasTex(m.map, det.W, det.H), 0xffffff, n);
        kit.helmet = { mat: out, det };
      } else if (/^Suit(Torso|Legs|Arms)/.test(n) && m.map) {
        const part = n.slice(4).replace(/\..*$/, '').toLowerCase();
        out = lambert(canvasTex(m.map, m.map.image.width, m.map.image.height), 0xffffff, n);
        kit.suit[part] = { mat: out, det: m.map.image };
      } else if (n.startsWith('Gloves') || n.startsWith('Boots')) {
        out = lambert(m.map && greyOf(m.map), 0xffffff, n); // (the boots' leather, greyed so the trim colour shows)
        kit[n.startsWith('Gloves') ? 'gloves' : 'boots'] = out;
      }
      if (out) kit.mats.push(out);
      return out || m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return kit;
}

function paintKit(kit, cfg, onReady) {
  const L = fillLivery(cfg), D = L.helmetDesign, third = L.third ?? D.third ?? 0x121214;
  if (kit.helmet) {
    const { mat, det } = kit.helmet, cv = mat.map.image, g = cv.getContext('2d', { willReadFrequently: true });
    paintHelmet(cv, L, HELMET_FRONT, onReady);
    const img = g.getImageData(0, 0, det.W, det.H), o = img.data, d = det.data;
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
  const S = kit.suit;
  if (S.torso || S.legs || S.arms) {
    paintSuit(S.torso?.mat.map.image, S.legs?.mat.map.image, S.arms?.mat.map.image, L, onReady, { belt: false });
    for (const p of Object.values(S)) {
      const cv = p.mat.map.image, g = cv.getContext('2d');
      g.globalCompositeOperation = 'multiply'; g.drawImage(p.det, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';
      p.mat.map.needsUpdate = true;
    }
  }
  if (kit.gloves) kit.gloves.color.setHex(third);
  if (kit.boots) kit.boots.color.setHex(third);
}
// ticks every live character; skips ones that are hidden (or whose parents are)
export function updateCharacters(dt) {
  for (const c of live) {
    let o = c.object, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (vis && c.object.parent) c.update(dt);
  }
}
