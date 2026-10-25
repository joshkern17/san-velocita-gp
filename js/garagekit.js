// The home garage kit (World Career): the shell for your premises, with the stations you've bought set down at its
// slots. Pieces are models/garage/shell_<premises>.glb and station_<facility>.glb, built in Blender from
// models/garage/kit-start.blend (tools/garage-kit.py; see docs/GARAGE-KIT.md). A piece that isn't there is left out: no
// shell for your premises, the next smaller one; no shell at all, null (the garage falls back to models/garage.glb).
//
//   const kit = await loadKit('unit', ['tools', 'sim']);
//   kit.group      the room, BAY_1 at its origin (the car's spot), the car's nose and the door down +Z
//   kit.bays       [BAY_1, BAY_2, ...] (Object3D: where each car sits and the way it faces)
//   kit.spawn      SPAWN: where you walk in (null without one)
//   kit.nav        NAV_ meshes (the floor you can walk on at every level: NAV_floor, a mezzanine's stairs and deck; hidden)
//   kit.stands     STAND_<role> (userData.clip: what they're doing there, userData.role)
//   kit.interacts  INTERACT_<what> (userData.label)
//   kit.tires      TIRES: where your tire stacks start (null without one)
//   kit.stations   { tools: Object3D, ... } the stations set down, by facility
//   kit.shell      the premises whose shell it is (a smaller one than asked for, when yours isn't made yet)
//   kit.setBusy(['dyno', ...])   the stations in use: their BUSY_<key>... shown, IDLE_<key>... hidden (and the other way)
//
// The single-file build carries the pieces in window.__SVGP_KIT ({ shell_lockup: 'data:...', ... }).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export const PREMISES = ['lockup', 'unit', 'workshop', 'factory']; // (wcareer.js FACILITIES.base levels, in order)

const packed = () => (typeof window !== 'undefined' && window.__SVGP_KIT) || null;
const urlOf = (name) => (packed() && packed()[name]) || `models/garage/${name}.glb`;
const loads = new Map(); // name -> Promise<gltf scene | null> (each piece fetched once)
function piece(name) {
  if (loads.has(name)) return loads.get(name);
  const P = packed(), url = urlOf(name);
  const local = typeof location !== 'undefined' && location.protocol === 'file:';
  // (serve.py answers /__exists quietly; anywhere else a missing file is just a 404 once)
  const exists = P ? Promise.resolve(!!P[name]) : local ? Promise.resolve(false)
    : fetch('__exists?p=' + encodeURIComponent(url)).then(r => r.ok ? r.json().then(j => j.ok) : fetch(url, { method: 'HEAD' }).then(h => h.ok), () => false);
  const p = exists.then(ok => ok ? new GLTFLoader().loadAsync(url).then(g => g.scene, () => null) : null);
  loads.set(name, p); return p;
}

// an event's set (models/garage/event_<key>.glb: the season launch's stage and press, tools/garage-launch.py), and where
// each premises has room for it, in the shell's Blender frame ([x, y, turn]: the set's back, its front down -Y). A
// premises not listed has no room for it (the launch happens without the set)
export const EVENT_AT = { launch: { unit: [3.1, 3.1, 0] } };   // (unit: clear of the stairs up the right wall, x 6.7 on)
export const loadPiece = (name) => piece(name).then(s => s && cloneLit(s));
// a copy of a piece, its spot lights still aimed (a copied spot keeps pointing at the original's target, which isn't in
// the scene: it'd light the world's origin)
function cloneLit(src) {
  const c = src.clone(true);
  c.traverse(o => { if (o.isSpotLight) { const t = o.children.find(k => !k.isLight && k.position.z === -1 && !k.children.length); if (t) o.target = t; } });
  return c;
}

// the shell's plain pieces (walls, shelves, the cafe's tables: thousands of them in the factory, one draw call each and
// three again for the spot lights' shadows) merged into one mesh per material per 8 m of floor, so it still culls and
// a ray still tests only what's near. What the game finds by name (KEEP) stays its own mesh; what's shown, hidden or
// set down on its own (OWN: a station on its slot, its BUSY_/IDLE_ parts, a WITHOUT_ pile) is merged inside itself,
// never into what's round it (a set's loose pieces merge together, named for the set). Each merged mesh keeps its pieces' boxes in userData.solids (its own frame): what you walk
// into is still each piece (solidBoxes), not the merged mesh's box. A door's pieces merge apart, still named a door
// (the crew's way through it, pitgarage's walls without it)
const KEEP = /^(NAV|COL|SPAWN|STAND|INTERACT|TIRES|TROPHY|PHOTO|SCALE|PLINTH|POSTER|PC_|TV_|Team|ListNote|Crt|GUIDE)|chair|screen|picture/i;
const OWN = /^(SLOT|BUSY|IDLE|WITHOUT|station)_/i;
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), inner = [], rel = new THREE.Matrix4(), c = new THREE.Vector3();
  const take = (o, tag) => {
    const M = o.material;
    if (Array.isArray(M) || (M.transparent && M.depthWrite) || /^(Tyre|Team)/.test(M.name || '')) return; // (glass that writes depth: a pane drawn before the one behind it would hide it)
    if (!o.visible || o.isSkinnedMesh || o.isInstancedMesh || o.renderOrder || Object.keys(o.geometry.morphAttributes).length) return;
    rel.multiplyMatrices(inv, o.matrixWorld); if (rel.determinant() < 0) return; // (a mirrored piece: baked, it'd turn inside out)
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox.clone().applyMatrix4(rel); box.getCenter(c);
    const sig = Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize + g.attributes[k].normalized + g.attributes[k].array.constructor.name).join();
    const key = `${M.uuid}|${sig}|${!!g.index}|${tag}|${Math.floor(c.x / 8)},${Math.floor(c.z / 8)}`;
    if (!groups.has(key)) groups.set(key, { mat: M, tag, list: [] });
    groups.get(key).list.push({ o, m: rel.clone(), box });
  };
  const visit = (o, tag) => {
    for (const k of o.children) {
      const n = k.name || '';
      const set = /^(BUSY|IDLE|WITHOUT)_[a-z0-9]+/i.exec(n); // (a piece shown or hidden with the rest of its set: merged with them, by the set's name)
      if (OWN.test(n) && !(set && k.isMesh && !k.children.length)) { inner.push(k); continue; }
      if (KEEP.test(n) || k.isLight) continue;
      const t = set ? set[0] : tag || (/^WALK_/.test(n) ? 'WALK' : /door/i.test(n) ? 'Door' : '');
      if (k.isMesh) take(k, t);
      visit(k, t);
    }
  };
  visit(root, '');
  for (const { mat, tag, list } of groups.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map(p => p.o.geometry.clone().applyMatrix4(p.m)));
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.name = (tag ? tag + '_' : '') + 'merged';
    m.castShadow = list.some(p => p.o.castShadow); m.receiveShadow = list.some(p => p.o.receiveShadow);
    if (tag !== 'WALK') m.userData.solids = list.map(p => p.box);
    for (const p of list) p.o.removeFromParent();
    root.add(m);
  }
  for (const k of inner) mergeStatic(k);
  root.updateMatrixWorld(true);
}
// what you can walk into of a mesh, in the world: a merged mesh's pieces, one box each; anything else, its own box
export function solidBoxes(o) {
  if (o.userData.solids) return o.userData.solids.map(b => b.clone().applyMatrix4(o.matrixWorld));
  const b = new THREE.Box3().setFromObject(o); return b.isEmpty() ? [] : [b];
}

export async function loadKit(premises, stations = []) {
  // the shell: yours, or the next one down that exists
  let shell = null, used = null;
  for (let i = Math.max(0, PREMISES.indexOf(premises)); i >= 0 && !shell; i--) { shell = await piece('shell_' + PREMISES[i]); used = PREMISES[i]; }
  if (!shell) return null;
  const group = new THREE.Group(), room = cloneLit(shell); group.add(room);
  room.updateMatrixWorld(true);
  const named = (pre) => { const out = []; room.traverse(o => { if ((o.name || '').startsWith(pre)) out.push(o); }); return out; };
  // the stations, each on its slot (the slot's position and turn); a slot with nothing bought for it stays empty
  const slots = named('SLOT_'), set = {};
  await Promise.all(slots.map(async (s) => {
    const k = s.name.slice(5).replace(/[._]\d+$/, '');
    if (!stations.includes(k) || set[k]) return;
    const st = await piece('station_' + k); if (!st) return;
    const c = cloneLit(st); c.name = 'station_' + k; s.add(c); set[k] = c;
  }));
  // the junk where a facility will go (WITHOUT_<facility>...): cleared out once you have it
  room.traverse(o => { const m = /^WITHOUT_([a-z0-9]+)/i.exec(o.name || ''); if (m && stations.includes(m[1])) o.visible = false; });
  room.updateMatrixWorld(true);
  if (!(typeof window !== 'undefined' && window.__SVGP_NOMERGE)) mergeStatic(room); // (dev: __SVGP_NOMERGE, the pieces as built)
  const bays = named('BAY_').sort((a, b) => a.name.localeCompare(b.name));
  // BAY_1 at the origin, turned straight: the rest of the game puts the car there
  if (bays[0]) {
    const p = bays[0].getWorldPosition(new THREE.Vector3()), q = bays[0].getWorldQuaternion(new THREE.Quaternion()).invert();
    room.quaternion.premultiply(q); room.position.copy(p.applyQuaternion(q).negate().setY(0));
  }
  const nav = named('NAV_'); for (const n of nav) n.visible = false;
  for (const c of named('COL_')) c.visible = false;
  group.updateMatrixWorld(true);
  // in use or not (an engine on the dyno, a frame on the welding table): BUSY_<key>... / IDLE_<key>...
  const tagged = []; room.traverse(o => { const m = /^(BUSY|IDLE)_([a-z0-9]+)/i.exec(o.name || ''); if (m) tagged.push([o, m[1].toUpperCase() === 'BUSY', m[2]]); });
  const setBusy = (keys = []) => { for (const [o, busy, k] of tagged) o.visible = busy === keys.includes(k); };
  setBusy([]);
  // the trophy cabinet (TROPHY_nn: its places, TROPHY_NOTE... the note on an empty one), past seasons' photos (PHOTO_nn the
  // picture, PHOTO_nn_... its frame), the setup pad's scales (SCALEPAD_<corner>: moved under the car's wheels) and the
  // readout they're wired to (SCALE_READOUT)
  const byName = (a, b) => a.name.localeCompare(b.name);
  const trophies = named('TROPHY_').filter(o => /^TROPHY_\d+$/.test(o.name)).sort(byName);
  const photos = named('PHOTO_').filter(o => /^PHOTO_\d+$/.test(o.name)).sort(byName).map(o => ({ pic: o, parts: named(o.name) }));
  return { group, setBusy, shell: used, bays, spawn: named('SPAWN')[0] || null, nav, stands: named('STAND_'), interacts: named('INTERACT_'), tires: named('TIRES')[0] || null, stations: set,
    trophies, trophyNote: named('TROPHY_NOTE'), photos, scalePads: named('SCALEPAD_'), scaleReadout: named('SCALE_READOUT')[0] || null,
    // the factory's Boulevard: PLINTH_nn where a car of your career stands, PLINTH_nn_Plaque its printed plaque
    plinths: named('PLINTH_').filter(o => /^PLINTH_\d+$/.test(o.name)).sort(byName).map(o => ({ at: o, plaque: named(o.name + '_Plaque')[0] || null })) };
}
