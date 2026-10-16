// People: the low-poly NPCs (models/characters.glb, built by tools/characters/ from the BitSoft "Male Job NPCs"
// pack + Mixamo clips) and the racer. One skeleton, 17 looks, every clip plays on every look.
//
//   await loadCharacters();
//   const guy = makeCharacter({ look: 'coveralls_navy', clip: 'idle' });
//   scene.add(guy.object);                 // stands on y = 0, faces +Z
//   guy.play('wave');                      // cross-fades from whatever was playing
//   guy.play('victory', { once: true, then: 'idle' });
//   guy.move(v);                           // on foot at v m/s: walk blending into jog, feet in step (play() to stop)
//   updateCharacters(dt);                  // once per frame: ticks every live character (or guy.update(dt))
//   guy.dispose();
//   const driver = makeCharacter({ look: 'racer', livery: teamLivery });   // suit + helmet painted from a livery
//   driver.setLivery(newLivery);                                          // repaint (Livery Designer edits)
//   makeCharacter({ look: 'racer', crew: true, livery: team })            // a pit crew member in the team's kit
//                                                                         // (one painted kit per team, shared)
//   makeCharacter({ look: 'racer', livery, face: 3, helmet: false })      // a driver with the helmet off: one of
//                                                                         // FACES, then the women's heads after them
//                                                                         // (faceCount(); js/drivers.js picks per person)
//
// Clips are "in place": walk / walk_2 don't move the character, the caller does (CLIP_INFO.walk.speed m/s keeps
// the feet from sliding). Sitting clips put the backside right above the origin at CLIP_INFO.sit_*.seat metres,
// feet forward: park the character with its origin on the floor under the seat, facing out.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';
import { fillLivery, paintHelmet, paintSuit, paintBoots, decalRaster, VISOR_COL, decalImage } from './livery.js';
import { logoAsset, logoForName } from './sponsorlogos.js';

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
  walk: { loop: true, speed: 1.35 }, walk_2: { loop: true, speed: 0.95 }, jog: { loop: true, speed: 1.9 },
  run: { loop: true, speed: 4.0 }, // (Mixamo "Running", in place: a stride's 0.7 s)
  sit: { loop: true, seat: 0.48 }, sit_idle: { loop: true, seat: 0.48 }, sit_clap: { loop: true, seat: 0.48 },
  sit_clap_2: { loop: true, seat: 0.48 }, sit_yell: { loop: true, seat: 0.48 }, sit_yell_2: { loop: true, seat: 0.48 },
  sit_rub_arm: { loop: true, seat: 0.57 },
  // leaning back on something hip high behind (a car's side): the backside about 0.9 m up. lean_2 has a foot up on it;
  // stand_pose (still) is a lean too, against a wall: feet out, head back, hands behind
  lean: { loop: true }, lean_2: { loop: true }, stand_pose: { loop: true },
  // down on one knee (the right); kneel_down goes from standing to that, once
  kneel: { loop: true }, kneel_down: { loop: false }, kneel_point: { loop: true },
  // standing to sat (Mixamo "Sitting"): sits back 0.46 m and down onto a seat about 0.48 m up, by 0.65 of the way
  sit_down: { loop: false, seat: 0.48 },
  // sat (a seat about 0.62 m up) to standing (Mixamo "Stand Up"), about 0.43 m forward
  stand_up: { loop: false },
  // sat at a desk, idling (Mixamo "Sitting Idle", a different one from sit_idle): hips 0.56 m up
  sit_desk: { loop: true, seat: 0.44 },
  // stood talking, three ways (Mixamo "Talking"): hands going, weight shifting, on the spot
  talk: { loop: true }, talk_2: { loop: true }, talk_3: { loop: true },
  // the pit crew at work (Motion Cast "Racing Team" mocap, tools/characters/motioncast.py; js/pitlife.js plays parts of
  // them, timed to the stop): the gunman on one knee at a wheel, the front and rear jacks, the lollipop man
  pit_gun: { loop: false }, pit_jack_front: { loop: false }, pit_jack_rear: { loop: false }, pit_lollipop: { loop: false },
};
export const CLIPS = Object.keys(CLIP_INFO);

// a copy of clip `name` with its hips moved to where clip `to` leaves them at its end, so one blends into the other
// without sliding (clips carry where the hips are: sit_down ends 0.46 m back of where it started, sit_desk sits right
// over its origin). Named 'name@to'; play() it like any clip
export function alignedClip(name, to) {
  const key = name + '@' + to; if (!TPL || TPL.clips[key]) return key;
  const src = TPL.clips[name], end = TPL.clips[to]; if (!src || !end) return name;
  const hp = (c) => c.tracks.find(t => /Hips\.position$/.test(t.name));
  const a = hp(src), b = hp(end); if (!a || !b) return name;
  const c = src.clone(); c.name = key; const t = hp(c), n = b.values.length;
  const d = [0, 1, 2].map(i => b.values[n - 3 + i] - a.values[i]);
  for (let i = 0; i < t.values.length; i++) t.values[i] += d[i % 3];
  TPL.clips[key] = c; CLIP_INFO[key] = CLIP_INFO[name];
  return key;
}

let TPL = null, loading = null, loadError = null;
const live = new Set();
const modelUrl = () => (typeof window !== 'undefined' && window.__SVGP_CHARACTERS_GLB) || 'models/characters.glb';

export function loadCharacters() {
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(modelUrl())
    .then(g => { TPL = makeTemplate(g); return loadFemaleHeads().then(() => true); })
    .catch(e => { loadError = e; console.warn('characters not loaded:', e && e.message); return false; });
  return loading;
}
export const charactersReady = () => !!TPL;
export const hasClip = (name) => !!(TPL && TPL.clips[name]);
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
  // the parts share one Skeleton when they're bound the same way (the file gives each its own): three.js works out
  // and uploads a skeleton's bone matrices once a frame, so a pit crew of 84 in 10 parts each was 840 of them
  const made = [];
  root.traverse(c => {
    if (!c.isSkinnedMesh) return;
    const s = back.get(c), bones = s.skeleton.bones.map(b => map.get(b));
    const same = made.find(k => k.bones.length === bones.length && k.bones.every((b, i) => b === bones[i]) && k.boneInverses.every((m, i) => m.equals(s.skeleton.boneInverses[i])));
    const sk = same || new THREE.Skeleton(bones, s.skeleton.boneInverses); if (!same) made.push(sk);
    c.bind(sk, s.bindMatrix);
  });
  return root;
}

const rnd = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

export class Character {
  constructor({ look, group, clip = 'idle', seed = Math.random() * 1e9, timeScale = 1, livery = null, crew = false, face = null, helmet = true } = {}) {
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
    if (face != null || !helmet) this.setHead({ face, helmet });
    if (clip) this.play(clip, { fade: 0, offset: r() }); // random phase so crowds don't move in lockstep
    live.add(this);
  }
  // play(name, { fade = 0.3 s, once, then: clip to return to after a once, speed = 1, offset: 0..1 of the clip })
  play(name, { fade = 0.3, once = false, then = null, speed = 1, offset = 0 } = {}) {
    const clip = TPL.clips[name];
    if (!clip) { console.warn('characters: no clip', name); return this; }
    if (this.clip === name && !once) { this.action.timeScale = speed; return this; }
    if (this._pair) { if (fade > 0) this._pair.fadeOut(fade); else this._pair.stop(); this._pair = null; } // (off the move: the jog half fades too)
    const a = this.mixer.clipAction(clip);
    a.reset(); a.timeScale = speed; a.weight = 1;
    a.setLoop(once || CLIP_INFO[name]?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = true;
    if (offset) a.time = offset * clip.duration;
    a.play();
    if (this.action && this.action !== a && fade > 0) this.action.crossFadeTo(a, fade, false);
    else if (this.action && this.action !== a) this.action.stop();
    this.action = a; this.clip = name; this._then = once ? then : null;
    return this;
  }
  // on foot at v m/s: the walk and the jog both playing, weighted by v (all walk at CLIP_INFO.walk.speed and under, all
  // jog from CLIP_INFO.jog.speed), at a pace that keeps the feet from sliding. Both clips put the left foot down at the
  // same point of their cycle, so they run in step (the same fraction of the way through) and the blend never scissors.
  // Called every frame while moving; fades in from whatever was playing, play() fades out of it
  // run: the fast end's a run (js/garagewalk.js: out in the pit lane), not a jog
  move(v, { fade = 0.25, run = false } = {}) {
    const fast = run && TPL.clips.run ? 'run' : 'jog', W = TPL.clips.walk, J = TPL.clips[fast];
    if (!J) return this.play('walk', { speed: Math.max(0.45, v / CLIP_INFO.walk.speed) });
    const sw = CLIP_INFO.walk.speed, sj = CLIP_INFO[fast].speed;
    if (this.clip === 'move' && this._fast !== fast) { this._pair.fadeOut(fade); this.clip = 'move:' + this._fast; } // (jog to run or back: the new one faded in)
    this._fast = fast;
    const w = Math.max(0, Math.min(1, (v - sw) / (sj - sw))), k = w * w * (3 - 2 * w), m = this.mixer; // (eased)
    const aw = m.clipAction(W), aj = m.clipAction(J);
    if (this.clip !== 'move') {
      const from = this.action, t = from === aw ? aw.time / W.duration : from === aj ? aj.time / J.duration : 0;
      for (const [a, c] of [[aw, W], [aj, J]]) if (a !== from) { a.reset(); a.time = t * c.duration; a.setLoop(THREE.LoopRepeat, Infinity); a.play(); if (fade > 0) a.fadeIn(fade); }
      if (from && from !== aw && from !== aj) { if (fade > 0) from.fadeOut(fade); else from.stop(); }
      this.action = aw; this._pair = aj; this.clip = 'move'; this._then = null;
    }
    // cycles a second: the walk's at v (a slow walk slows it, down to 0.45 of its pace), the jog's at v; blended
    const rate = Math.max(0.45 * sw, Math.min(v, sw)) / sw / W.duration * (1 - k) + Math.max(v, 0.6 * sj) / sj / J.duration * k;
    aw.timeScale = rate * W.duration; aj.timeScale = rate * J.duration;
    aw.weight = 1 - k; aj.weight = k;
    return this;
  }
  clipDuration(name) { const c = TPL.clips[name]; return c ? c.duration : 1; }
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
    this.action = null; this.clip = null; this._then = null; this._pair = null;
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
  // the racer's head: which face (an index into FACES, or a skin texture's name) and whether the helmet's on
  setHead({ face = this.face, helmet = this.helmetOn ?? true } = {}) {
    this.face = face; this.helmetOn = helmet;
    if (this.look !== 'racer' && !(face != null && face >= FACES.length)) return this; // (other looks: only a woman's head)
    // a woman's head (it has her hair): on the head bone in place of his, while the helmet's off
    const fem = face != null && face >= FACES.length && FEMALE.length ? FEMALE[(face - FACES.length) % FEMALE.length] : null;
    if (this.fHead && (!fem || this.fHead.userData.src !== fem)) { this.fHead.parent && this.fHead.parent.remove(this.fHead); this.fHead = null; }
    if (fem && !this.fHead) this.fHead = attachFemaleHead(this, fem);
    if (this.fHead) this.fHead.visible = !helmet;
    const tex = face == null || fem ? null : faceTexture(face);
    this.body.traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (lookOf(o.name) === 'racer' && /helmet/i.test(o.name)) o.visible = helmet;
      if (fem && isHead(o)) o.visible = helmet; // (his head stays, under the helmet)
      if (!tex) return;
      const swap = (m) => { if (!/^skin-male/.test(m.name) || m.map === tex) return m; const base = m.userData.faceOf || m; return faceMat(base, tex); };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
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

// the faces a racer can wear (the pack's heads share one UV layout): skin textures, darkest first. After them come
// the women's heads (models/heads-female.glb, tools/characters/female_heads.py), when that file's there
export const FACES = ['skin-male7', 'skin-male9', 'skin-male11', 'skin-male12', 'skin-male10', 'skin-male8'];
export const faceCount = () => FACES.length + FEMALE.length;
export const femaleFace = (k) => FEMALE.length ? FACES.length + ((k % FEMALE.length) + FEMALE.length) % FEMALE.length : null;
const FEMALE = []; // [{ geometry, material, name }]: head_f1 .. head_f6
const isHead = (o) => (Array.isArray(o.material) ? o.material : [o.material]).some(m => /^skin-male/.test((m.userData.faceOf || m).name));
function loadFemaleHeads() {
  const url = (typeof window !== 'undefined' && window.__SVGP_HEADS_F_GLB) || 'models/heads-female.glb';
  return new GLTFLoader().loadAsync(url).then(g => {
    const list = [];
    g.scene.traverse(o => { if (o.isMesh && /^head_f\d/.test(o.name)) { o.updateWorldMatrix(true, false); const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); list.push({ name: o.name, geometry: geo, material: lambert(o.material.map, 0xffffff, o.material.name) }); } });
    list.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    FEMALE.push(...list);
  }, () => {}); // (no file: men's faces only)
}
// where her head goes: his head's box in the skinning's bind space (metres), hers scaled up a little (the women's pack
// is smaller) about her crown and moved to sit in his (crowns level, faces level, centred side to side), then into the
// head bone's own space
const F_SCALE = 1.15;
let FIT = null;
function femaleFit(geo) {
  if (FIT) return FIT;
  const his = TPL.looks.racer.find(isHead), box = new THREE.Box3(), v = new THREE.Vector3(), P = his.geometry.attributes.position;
  for (let i = 0; i < P.count; i++) box.expandByPoint(v.fromBufferAttribute(P, i).applyMatrix4(his.bindMatrix));
  geo.computeBoundingBox(); const hb = geo.boundingBox;
  const from = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y, hb.max.z), to = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.01, box.max.z);
  const m = new THREE.Matrix4().makeTranslation(to.x, to.y, to.z).multiply(new THREE.Matrix4().makeScale(F_SCALE, F_SCALE, F_SCALE)).multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
  return (FIT = { m, head: his });
}
function attachFemaleHead(ch, fem) {
  const fit = femaleFit(fem.geometry);
  let mesh = null; ch.body.traverse(o => { if (!mesh && o.isSkinnedMesh && isHead(o)) mesh = o; });
  if (!mesh) return null;
  const sk = mesh.skeleton, k = sk.bones.findIndex(b => /Head$/.test(b.name) && !/HeadTop/.test(b.name)); if (k < 0) return null;
  const m = new THREE.Mesh(fem.geometry, fem.material);
  m.matrixAutoUpdate = false; m.matrix.copy(sk.boneInverses[k]).multiply(fit.m);
  m.castShadow = true; m.frustumCulled = false; m.userData.src = fem; m.name = 'FemaleHead';
  sk.bones[k].add(m);
  return m;
}
const FACE_TEX = new Map(), FACE_MATS = new Map();
// (one material per head material and face, shared by everyone wearing it)
function faceMat(base, tex) {
  const k = base.uuid + '|' + tex.uuid;
  if (!FACE_MATS.has(k)) { const c = base.clone(); c.map = tex; c.userData = { ...base.userData, faceOf: base }; applyPSXMaterial(c, { snap: true, affine: 0.6 }); FACE_MATS.set(k, c); }
  return FACE_MATS.get(k);
}
function faceTexture(face) {
  const name = typeof face === 'number' ? FACES[((face % FACES.length) + FACES.length) % FACES.length] : face;
  if (!FACE_TEX.size) TPL.scene.traverse(o => { if (!o.isSkinnedMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const k = m.name.replace(/\.\d+$/, ''); if (/^skin-male\d+$/.test(k) && m.map && !FACE_TEX.has(k)) FACE_TEX.set(k, m.map); } });
  return FACE_TEX.get(name) || null;
}

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
// a decal's anchor -> the texel it sits on, the point on the body there and the way the surface faces
const MIRROR_KIT = { torso: 'torso', helmet: 'helmet', armL: 'armR', armR: 'armL', legL: 'legR', legR: 'legL' };
function anchorOf(d) {
  const m = texelMap(PART_MAT[d.part]); if (!m) return null;
  const u = d.part === 'helmet' ? d.u + HELMET_FRONT : d.u;
  const cx = Math.floor((((u % 1) + 1) % 1) * m.W), cy = Math.min(m.H - 1, Math.max(0, Math.floor(d.v * m.H)));
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = (cx + dx + m.W) % m.W, y = cy + dy; if (y < 0 || y >= m.H) continue;
    const k = y * m.W + x;
    if (m.ok[k]) return { k, map: m, p: new THREE.Vector3(m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]), n: new THREE.Vector3(m.nrm[k * 3], m.nrm[k * 3 + 1], m.nrm[k * 3 + 2]).normalize() };
  }
  return null;
}
// distances over the surface, in metres: along each row of texels (a ring round the tube) from its first texel,
// and down each column from the top. (A tube's u is even in angle, not in distance: the torso's flat front
// and the arm holes would stretch a decal; measuring the actual surface doesn't.)
function surfaceOf(m) {
  if (m.cum) return m.cum;
  const { W, H, pos, ok } = m, cu = new Float32Array(W * H), cv = new Float32Array(W * H), C = new Float32Array(H);
  const seg = (a, b) => Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
  for (let y = 0; y < H; y++) {
    let sum = 0, n = 0; for (let x = 0; x < W; x++) { const a = y * W + x, b = y * W + (x + 1) % W; if (ok[a] && ok[b]) { sum += seg(a, b); n++; } }
    const avg = n ? sum / n : 0; let t = 0;
    for (let x = 0; x < W; x++) { const a = y * W + x, b = y * W + (x + 1) % W; cu[a] = t; t += ok[a] && ok[b] ? seg(a, b) : avg; } // (gaps: the row's average step)
    C[y] = t;
  }
  for (let x = 0; x < W; x++) {
    let sum = 0, n = 0; for (let y = 0; y + 1 < H; y++) { const a = y * W + x, b = a + W; if (ok[a] && ok[b]) { sum += seg(a, b); n++; } }
    const avg = n ? sum / n : 0; let t = 0;
    for (let y = 0; y < H; y++) { const a = y * W + x; cv[a] = t; if (y + 1 < H) t += ok[a] && ok[a + W] ? seg(a, a + W) : avg; }
  }
  return (m.cum = { cu, cv, C });
}
// how the tube runs at texel k: unit directions round it (û) and along it (v̂) (one-sided at the edges)
function tangentsAt(m, k) {
  const x = k % m.W, y = (k / m.W) | 0, P = (kk) => new THREE.Vector3(m.pos[kk * 3], m.pos[kk * 3 + 1], m.pos[kk * 3 + 2]);
  const at = (xx, yy) => { if (yy < 0 || yy >= m.H) return -1; const kk = yy * m.W + ((xx % m.W) + m.W) % m.W; return m.ok[kk] ? kk : -1; };
  const diff = (dx, dy) => {
    for (let s = 1; s <= 8; s++) {
      const a = at(x - dx * s, y - dy * s), b = at(x + dx * s, y + dy * s), c0 = at(x, y);
      const v = a >= 0 && b >= 0 ? P(b).sub(P(a)) : b >= 0 && c0 >= 0 ? P(b).sub(P(c0)) : a >= 0 && c0 >= 0 ? P(c0).sub(P(a)) : null;
      if (v && v.lengthSq() > 1e-12) return v.normalize();
    }
    return null;
  };
  const u = diff(1, 0), v = diff(0, 1);
  return u && v ? { u, v } : null;
}
function projectDecals(decals, targets, onReady) {
  if (!decals.length) return;
  for (const t of targets) t.map = texelMap(t.name.replace(/\.\d+$/, ''));
  const all = [];
  for (const d of decals) { all.push(d); if (d.mirror) all.push({ ...d, part: MIRROR_KIT[d.part], u: 1 - d.u, rot: -(d.rot || 0), mirror: false }); } // the other side, reading the right way
  for (const d of all) {
    const r = decalRaster(d, onReady), a = anchorOf(d);
    if (!r || !a) continue;
    const P = a.p, N = a.n;
    const w = d.size * DECAL_REF * r.w, h = d.size * DECAL_REF * r.h, reach = Math.hypot(w, h) / 2 + 0.05, op = d.opacity ?? 1;
    const up = Math.abs(N.y) > 0.95 ? new THREE.Vector3(0, 0, -Math.sign(N.y)) : new THREE.Vector3(0, 1, 0);
    const U = up.sub(N.clone().multiplyScalar(up.dot(N))).normalize(), R = new THREE.Vector3().crossVectors(U, N);
    const c = Math.cos((d.rot || 0) * Math.PI / 180), sn = Math.sin((d.rot || 0) * Math.PI / 180);
    const put = (o, q, x, y, fade) => { // decal plane coords (x right, y up, metres) -> blend its pixel in
      const xr = x * c - y * sn, yr = y * c + x * sn;
      let iu = xr / w + 0.5; const iv = 0.5 - yr / h;
      if (iu < 0 || iu >= 1 || iv < 0 || iv >= 1) return;
      if (d.flip) iu = 1 - iu;
      const s = (Math.floor(iv * r.H) * r.W + Math.floor(iu * r.W)) * 4, al = r.data[s + 3] / 255 * op * fade;
      if (al <= 0) return;
      o[q] += (r.data[s] - o[q]) * al; o[q + 1] += (r.data[s + 1] - o[q + 1]) * al; o[q + 2] += (r.data[s + 2] - o[q + 2]) * al;
    };
    for (const t of targets) {
      const m = t.map; if (!m) continue;
      const o = t.data, n = m.W * m.H;
      if (d.part === 'helmet') { // the helmet: projected flat like a sticker (it's round; fades where it turns away)
        for (let k = 0; k < n; k++) {
          if (!m.ok[k]) continue;
          const dx = m.pos[k * 3] - P.x, dy = m.pos[k * 3 + 1] - P.y, dz = m.pos[k * 3 + 2] - P.z;
          if (dx * dx + dy * dy + dz * dz > reach * reach + DECAL_DEPTH * DECAL_DEPTH) continue;
          const z = dx * N.x + dy * N.y + dz * N.z, face = m.nrm[k * 3] * N.x + m.nrm[k * 3 + 1] * N.y + m.nrm[k * 3 + 2] * N.z;
          if (Math.abs(z) > DECAL_DEPTH || face < 0.05) continue;
          put(o, k * 4, dx * R.x + dy * R.y + dz * R.z, dx * U.x + dy * U.y + dz * U.z, Math.min(1, (face - 0.05) / 0.3) * Math.min(1, (DECAL_DEPTH - Math.abs(z)) / 0.04));
        }
        continue;
      }
      // The suit: projected flat like the helmet, except that distances ROUND each part (a row of texels is a ring
      // round the torso, a leg or a sleeve) are measured over the surface, like vinyl wrapping a curve. Each ring is
      // pinned where the flat projection puts the decal's centre line, so the decal runs on unbroken from part to part;
      // rings its centre doesn't reach (the other leg) are left alone.
      let rep = -1, best = reach * reach;
      if (m === a.map) rep = a.k;
      else for (let k = 0; k < n; k++) {
        if (m.ok[k] !== 1) continue;
        const kx = k % m.W, ky = (k / m.W) | 0; // (a texel with neighbours all round: the surface's direction is known there)
        if (ky < 2 || ky > m.H - 3 || !m.ok[ky * m.W + (kx + 2) % m.W] || !m.ok[ky * m.W + (kx - 2 + m.W) % m.W] || !m.ok[k - 2 * m.W] || !m.ok[k + 2 * m.W]) continue;
        const dx = m.pos[k * 3] - P.x, dy = m.pos[k * 3 + 1] - P.y, dz = m.pos[k * 3 + 2] - P.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best && m.nrm[k * 3] * N.x + m.nrm[k * 3 + 1] * N.y + m.nrm[k * 3 + 2] * N.z > 0.2) { best = d2; rep = k; }
      }
      if (rep < 0) continue;
      const T = tangentsAt(m, rep); if (!T) continue;
      // the rings' direction in the decal's plane, and how far the decal reaches that way
      let rx = T.u.dot(R), ry = T.u.dot(U); const rl = Math.hypot(rx, ry); if (rl < 1e-3) continue; rx /= rl; ry /= rl;
      // onto another part only where its rings cross the decal's length (a stripe down the body carries on down a leg;
      // a band round the chest carries on round a sleeve; a stripe never runs along a sleeve's rings)
      if (m !== a.map) { const lx = h >= w ? -sn : c, ly = h >= w ? c : sn; if (Math.abs(rx * lx + ry * ly) > 0.7) continue; }
      const half = (Math.abs(rx * c + ry * sn) * w + Math.abs(ry * c - rx * sn) * h) / 2; // (the rotated decal's extent along the rings)
      const { cu, C } = surfaceOf(m);
      for (let y = 0; y < m.H; y++) {
        // this ring's crossing: the front-facing texel the flat projection puts nearest the centre line
        let cx = -1, ct = Infinity, cxp = 0, cyp = 0;
        for (let x = 0; x < m.W; x++) {
          const k = y * m.W + x; if (!m.ok[k]) continue;
          if (m.nrm[k * 3] * N.x + m.nrm[k * 3 + 1] * N.y + m.nrm[k * 3 + 2] * N.z < 0.1) continue;
          const dx = m.pos[k * 3] - P.x, dy = m.pos[k * 3 + 1] - P.y, dz = m.pos[k * 3 + 2] - P.z;
          if (Math.abs(dx * N.x + dy * N.y + dz * N.z) > DECAL_DEPTH) continue;
          const xp = dx * R.x + dy * R.y + dz * R.z, yp = dx * U.x + dy * U.y + dz * U.z, t = Math.abs(xp * rx + yp * ry);
          if (t < ct) { ct = t; cx = x; cxp = xp; cyp = yp; }
        }
        if (cx < 0 || ct > half) continue;
        const c0 = cu[y * m.W + cx], Cy = C[y];
        for (let x = 0; x < m.W; x++) {
          const k = y * m.W + x; if (!m.ok[k]) continue;
          let s = cu[k] - c0; if (Cy > 0) s -= Math.round(s / Cy) * Cy; // round the ring, the short way (metres)
          put(o, k * 4, cxp + rx * s, cyp + ry * s, 1);
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
      // (the sponsor's logo when it has one: one color, black or white against the strip)
      const slug = L.sponsorLogo !== 'name' && logoForName(txt), im = slug && decalImage(logoAsset(slug, isLight(sCol) ? 'black' : 'white'), onReady);
      if (slug) {
        if (im) { const lh = Math.min(h * 1.1, (sb.x1 - sb.x0) * 0.62 * im.naturalHeight / im.naturalWidth), lw = lh * im.naturalWidth / im.naturalHeight; g.drawImage(im, (sb.x0 + sb.x1 - lw) / 2, (sb.y0 + sb.y1 - lh) / 2, lw, lh); }
      } else {
        g.font = `bold ${h}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const w = g.measureText(txt).width, maxW = (sb.x1 - sb.x0) * 0.62;
        if (w > maxW) g.font = `bold ${h * maxW / w}px Impact, "Arial Black", sans-serif`;
        g.fillStyle = isLight(sCol) ? '#121214' : '#ffffff';
        g.fillText(txt, (sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2 + h * 0.05);
      }
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
