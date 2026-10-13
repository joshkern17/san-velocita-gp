// The home garage kit (World Career): the shell for your premises, with the stations you've bought set down at its
// slots. Pieces are models/garage/shell_<premises>.glb and station_<facility>.glb, built in Blender from
// models/garage/kit-start.blend (tools/garage-kit.py; see docs/GARAGE-KIT.md). A piece that isn't there is left out: no
// shell for your premises, the next smaller one; no shell at all, null (the garage falls back to models/garage.glb).
//
//   const kit = await loadKit('unit', ['tools', 'sim']);
//   kit.group      the room, BAY_1 at its origin (the car's spot), the car's nose and the door down +Z
//   kit.bays       [BAY_1, BAY_2, ...] (Object3D: where each car sits and the way it faces)
//   kit.spawn      SPAWN: where you walk in (null without one)
//   kit.nav        NAV_floor meshes (the floor you can walk on; hidden)
//   kit.stands     STAND_<role> (userData.clip: what they're doing there, userData.role)
//   kit.interacts  INTERACT_<what> (userData.label)
//   kit.stations   { tools: Object3D, ... } the stations set down, by facility
//   kit.shell      the premises whose shell it is (a smaller one than asked for, when yours isn't made yet)
//
// The single-file build carries the pieces in window.__SVGP_KIT ({ shell_lockup: 'data:...', ... }).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

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

// a copy of a piece, its spot lights still aimed (a copied spot keeps pointing at the original's target, which isn't in
// the scene: it'd light the world's origin)
function cloneLit(src) {
  const c = src.clone(true);
  c.traverse(o => { if (o.isSpotLight) { const t = o.children.find(k => !k.isLight && k.position.z === -1 && !k.children.length); if (t) o.target = t; } });
  return c;
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
  room.updateMatrixWorld(true);
  const bays = named('BAY_').sort((a, b) => a.name.localeCompare(b.name));
  // BAY_1 at the origin, turned straight: the rest of the game puts the car there
  if (bays[0]) {
    const p = bays[0].getWorldPosition(new THREE.Vector3()), q = bays[0].getWorldQuaternion(new THREE.Quaternion()).invert();
    room.quaternion.premultiply(q); room.position.copy(p.applyQuaternion(q).negate().setY(0));
  }
  const nav = named('NAV_'); for (const n of nav) n.visible = false;
  for (const c of named('COL_')) c.visible = false;
  group.updateMatrixWorld(true);
  return { group, shell: used, bays, spawn: named('SPAWN')[0] || null, nav, stands: named('STAND_'), interacts: named('INTERACT_'), stations: set };
}
