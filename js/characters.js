// People: the low-poly NPCs (models/characters.glb, built by tools/characters/ from the BitSoft "Male Job NPCs"
// pack + Mixamo clips). One skeleton, 16 looks, every clip plays on every look.
//
//   await loadCharacters();
//   const guy = makeCharacter({ look: 'coveralls_navy', clip: 'idle' });
//   scene.add(guy.object);                 // stands on y = 0, faces +Z
//   guy.play('wave');                      // cross-fades from whatever was playing
//   guy.play('victory', { once: true, then: 'idle' });
//   updateCharacters(dt);                  // once per frame: ticks every live character (or guy.update(dt))
//   guy.dispose();
//
// Clips are "in place": walk / walk_2 don't move the character, the caller does (CLIP_INFO.walk.speed m/s keeps
// the feet from sliding). Sitting clips put the backside right above the origin at CLIP_INFO.sit_*.seat metres,
// feet forward: park the character with its origin on the floor under the seat, facing out.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';

export const LOOKS = [
  'coveralls_gray', 'coveralls_tan', 'coveralls_navy', 'coveralls_black', // mechanics / pit crew
  'polo_beige', 'polo_maroon', 'polo_navy', 'polo_white',                 // team staff, officials, paddock
  'tee_beige', 'tee_maroon', 'tee_blue', 'tee_white',                     // fans, street
  'scrubs_blue', 'scrubs_green',                                          // medical
  'prisoner_1', 'prisoner_2',
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
function convertMaterial(m) {
  const out = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff });
  if (out.map) { out.map.magFilter = THREE.NearestFilter; out.map.anisotropy = 4; }
  out.name = m.name || '';
  applyPSXMaterial(out, { snap: true, affine: 0.6 }); out.userData.psx = true;
  return out;
}

function makeTemplate(g) {
  const mats = new Map();
  const conv = m => { if (!mats.has(m)) mats.set(m, convertMaterial(m)); return mats.get(m); };
  const looks = {};
  g.scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    o.castShadow = true; o.frustumCulled = false; // bones move the verts outside the rest-pose bounds
    // a look is one node holding up to 3 primitives (clothes / head / arms); glTF names it after the Blender mesh
    const look = (o.parent && o.parent.isSkinnedMesh === undefined && LOOKS.includes(o.parent.name)) ? o.parent.name : o.name.replace(/_\d+$/, '');
    (looks[look] = looks[look] || []).push(o);
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
    if ((o.isSkinnedMesh && !keep.has(o)) || (o !== src && LOOKS.includes(o.name) && o.name !== look)) return null;
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
  constructor({ look, group, clip = 'idle', seed = Math.random() * 1e9, timeScale = 1 } = {}) {
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
    this.look = look; this.object.name = 'Character:' + look;
    this.body = cloneLook(look); this.object.add(this.body);
    this._mixer();
    if (clip) { this.play(clip, { fade: 0 }); this.action.time = t; }
    return this;
  }
  _mixer() {
    this.mixer = new THREE.AnimationMixer(this.body);
    this.mixer.timeScale = this.timeScale;
    this.action = null; this.clip = null; this._then = null;
    this.mixer.addEventListener('finished', () => { if (this._then) { const n = this._then; this._then = null; this.play(n); } });
  }
  update(dt) { this.mixer.update(dt); }
  dispose() {
    live.delete(this);
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.body);
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}

export const makeCharacter = (opts) => new Character(opts);
// ticks every live character; skips ones that are hidden (or whose parents are)
export function updateCharacters(dt) {
  for (const c of live) {
    let o = c.object, vis = true;
    while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
    if (vis && c.object.parent) c.update(dt);
  }
}
