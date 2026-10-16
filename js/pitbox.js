// The teams' pit boxes from your model: models/pitbox.glb, exported from models/pitbox.blend (tools/props/pitbox.py
// made it from the game's own box; docs/PIT-BOX-MODEL.md has the names). With no model the boxes are the game's own
// (js/pitboxes.js dressBox, js/pitprops.js furnish). The room itself (floor, walls, ceiling, lights) is always the
// game's: it's built to each box's width, so the model's REF_ objects are left out.
//
// In the model: X across the box (to your right stood in the door looking in), Y in from the door, Z up (the floor's
// top at 0.06), drawn for a box WX0 wide either side; things more than SNAP off the middle stay that far off their
// wall in a wider or narrower box. On lanes that run the other way a box is the model's mirror image, as the game's
// own are, except your desk (PLAYER_*): that's only in your box, never mirrored (the menu's shots are set from it),
// and anything else of the model's it would stand in is left out of your box.
//
//   loadPitBox()                 // Promise: the model, read (or null: none)
//   fitBoxes(tpl, root, boxes)   // boxes: [{ F, team, mine }]: every box's things, the light baked in
//   tpl.footprints(F, mine)      // what's in the way on foot, in a box's frame: [x0, x1, z0, z1]
//   tpl.desk()                   // your desk: { group, screen, computer } (in your box's anchor: js/pitgarage.js)
//   tpl.tvFrame(F)               // where your box's live timing goes: { c, n, w, h } in the anchor's frame
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { BOX, lightAt, teamNameTexture } from './pitboxes.js';

const WX0 = 15 / 2 - BOX.wallIn, SNAP = 3.4;
const url = () => (typeof window !== 'undefined' && window.__SVGP_PITBOX_GLB) || 'models/pitbox.glb';
let load = null;
export function loadPitBox() {
  if (load) return load;
  const u = url();
  // (serve.py answers /__exists quietly; anywhere else a missing file is just a 404 once)
  const exists = () => fetch('__exists?p=' + encodeURIComponent(u)).then(r => r.ok ? r.json().then(j => j.ok) : fetch(u, { method: 'HEAD' }).then(h => h.ok), () => false);
  const local = typeof location !== 'undefined' && location.protocol === 'file:';
  load = (u.startsWith('data:') ? Promise.resolve(true) : local ? Promise.resolve(false) : exists())
    .then(ok => ok ? new GLTFLoader().loadAsync(u).then(g => template(g.scene), (e) => { console.warn('models/pitbox.glb', e); return null; }) : null);
  return load;
}

// (the model's frame is three's here: x across, y up, z OUT of the door; a box's own frame (F.P) has z in)
const fp = (v) => ({ x: v.x, z: -v.z, y: v.y });
const binOf = (bb) => { const c = (bb.min.x + bb.max.x) / 2; return c < -SNAP ? -1 : c > SNAP ? 1 : 0; };

function template(scene) {
  scene.updateMatrixWorld(true);
  const pieces = [], things = [], player = [];
  let teamName = null, tv = null;
  const MATS = new Map();
  const matFor = (m) => {
    if (MATS.has(m)) return MATS.get(m);
    const glow = /^GLOW_/.test(m.name || ''), team = m.name === 'TEAM_MAIN' ? 'main' : m.name === 'TEAM_ACCENT' ? 'accent' : null;
    const map = m.map || null; if (map) map.magFilter = THREE.NearestFilter;
    const col = glow ? (m.emissive && m.emissive.getHex() ? m.emissive : m.color) : team ? new THREE.Color(1, 1, 1) : m.color;
    const out = { key: m.uuid, glow, team, mat: new THREE.MeshBasicMaterial({ map, color: col.clone(), vertexColors: !glow, side: THREE.DoubleSide, toneMapped: !glow, transparent: !!m.transparent, alphaTest: m.alphaTest || 0 }) };
    MATS.set(m, out); return out;
  };
  for (const top of scene.children) {
    const name = top.name || '';
    if (/^REF_/.test(name)) continue;
    if (/^PLAYER_/.test(name)) { player.push(top); continue; }
    const bb = new THREE.Box3().setFromObject(top), bin = binOf(bb);
    if (name === 'TEAM_NAME') { top.traverse(o => { if (o.isMesh && !teamName) teamName = { geo: o.geometry.clone().applyMatrix4(o.matrixWorld), bin }; }); continue; }
    const thing = { name, bb, bin }; things.push(thing);
    top.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geo = geo.index ? geo.toNonIndexed() : geo;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
      for (const gr of groups) {
        const M = matFor(mats[gr.materialIndex] || mats[0]);
        const g = sub(geo, gr.start, gr.count);
        // the room's light, baked in (as the room's own is)
        const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const L = M.glow ? 1 : Math.max(0.5, lightAt(p.getX(i), -p.getZ(i), p.getY(i), [n.getX(i), -n.getZ(i), n.getY(i)]));
          c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = L;
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        pieces.push({ thing, bin, M, geo: g });
      }
    });
    if (name === 'TIMING_SCREEN') tv = thing;
  }
  // every box but yours: one merged mesh per side and material, the same for all of them
  const shared = merge(pieces);
  const deskBox = new THREE.Box3(); for (const o of player) deskBox.expandByObject(o);
  return {
    pieces, things, shared, teamName, player, deskBox, tv,
    footprints: (F, mine) => footprints(F, mine, things, deskBox),
    desk: () => desk(player),
    tvFrame: (F) => tvFrame(tv, F),
  };
}

// triangles start..start+count of a non-indexed geometry, with just what the merge wants (position, normal, uv)
function sub(geo, start, count) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k], size = k === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size);
    if (a) for (let i = 0; i < count; i++) for (let j = 0; j < size; j++) arr[i * size + j] = a.array[(start + i) * a.itemSize + j];
    g.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return g;
}
function merge(pieces, shift = null) {
  const by = new Map();
  for (const p of pieces) { const k = (shift ? '' : p.bin) + '|' + p.M.key; (by.get(k) || by.set(k, { bin: p.bin, M: p.M, geos: [] }).get(k)).geos.push(shift ? p.geo.clone().translate(shift(p.bin), 0, 0) : p.geo); }
  return [...by.values()].map(v => ({ bin: v.bin, M: v.M, geo: mergeGeometries(v.geos, false) }));
}

// the model's frame onto a box's: x along its front, y up, the model's z out of the door
function frameMatrix(F, bin = 0) {
  const o = F.P(0, 0, 0), x = F.P(1, 0, 0), z = F.P(0, 1, 0);
  const m = new THREE.Matrix4().set(
    x[0] - o[0], 0, -(z[0] - o[0]), o[0],
    x[1] - o[1], 1, -(z[1] - o[1]), o[1],
    x[2] - o[2], 0, -(z[2] - o[2]), o[2],
    0, 0, 0, 1);
  return bin ? m.multiply(new THREE.Matrix4().makeTranslation(bin * (F.wx - WX0), 0, 0)) : m;
}
// your desk's footprint in your box's frame (it's in the anchor's, which is the model's but for the mirror)
function deskRect(F, deskBox) {
  if (deskBox.isEmpty()) return null;
  const s = F.mirror ? -1 : 1, xs = [deskBox.min.x * s, deskBox.max.x * s];
  return [Math.min(...xs), Math.max(...xs), -deskBox.max.z, -deskBox.min.z];
}
const rectOf = (t, F) => { const sh = t.bin * (F.wx - WX0); return [t.bb.min.x + sh, t.bb.max.x + sh, -t.bb.max.z, -t.bb.min.z]; };
const overlaps = (a, b, m = 0.05) => a[0] < b[1] - m && a[1] > b[0] + m && a[2] < b[3] - m && a[3] > b[2] + m;
function dropped(F, things, deskBox) {
  const d = deskRect(F, deskBox), out = new Set();
  if (d) for (const t of things) if (overlaps(rectOf(t, F), d)) out.add(t);
  return out;
}

// boxes: [{ F, team, mine }] -> a group (named BoxDress: js/garagewalk.js keeps the camera out of it)
export function fitBoxes(tpl, root, boxes) {
  const g = new THREE.Group(); g.name = 'BoxDress';
  const others = boxes.filter(b => !b.mine && b.F), mine = boxes.find(b => b.mine && b.F);
  const C = new THREE.Color(), tint = (M, team) => M.team === 'main' ? C.set(team?.main ?? 0xcc2222) : M.team === 'accent' ? C.set(team?.accent ?? 0xffffff) : C.set(0xffffff);
  const add = (list, sets) => {
    for (const s of sets) {
      const im = new THREE.InstancedMesh(s.geo, s.M.mat, list.length);
      list.forEach((b, i) => { im.setMatrixAt(i, frameMatrix(b.F, s.mine ? 0 : s.bin)); im.setColorAt(i, tint(s.M, b.team)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); im.userData.sharedGeo = !s.mine; im.userData.worldMat = true; im.name = 'pitbox'; // (the materials are the model's, kept for next time)
      g.add(im);
    }
  };
  if (others.length) add(others, tpl.shared);
  if (mine) { // (yours: the same, less what your desk stands in, its sides fitted to its width)
    const drop = dropped(mine.F, tpl.things, tpl.deskBox);
    const sets = merge(tpl.pieces.filter(p => !drop.has(p.thing)), (bin) => bin * (mine.F.wx - WX0)).map(s => ({ ...s, mine: true }));
    add([mine], sets);
  }
  // the team's name on each box's back wall
  if (tpl.teamName) for (const b of boxes) {
    if (!b.F || !b.team?.name) continue;
    const tex = teamNameTexture(b.team.name); if (!tex) continue;
    tex.flipY = false; // (glTF's UVs)
    const geo = tpl.teamName.geo.clone();
    if (b.F.mirror) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
    geo.computeBoundingBox(); const c = geo.boundingBox.getCenter(new THREE.Vector3());
    const L = lightAt(c.x, -c.z, c.y, [0, -1, 0]);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(L, L, L), side: THREE.DoubleSide, depthWrite: false }));
    m.matrixAutoUpdate = false; m.matrix.copy(frameMatrix(b.F, tpl.teamName.bin)); m.renderOrder = 1; m.userData.tex = tex;
    g.add(m);
  }
  g.traverse(o => { o.matrixAutoUpdate = false; });
  root.add(g);
  return g;
}

// on foot: each thing standing on the floor, below head height (against a wall, it runs on through it: stood in one,
// the nearest way out is into the room)
function footprints(F, mine, things, deskBox) {
  const drop = mine ? dropped(F, things, deskBox) : new Set(), out = [], d = BOX.depth;
  for (const t of things) {
    if (drop.has(t) || t.bb.min.y > 1.6 || t.bb.max.y < 0.25) continue;
    const r = rectOf(t, F);
    if (r[0] < -F.wx + 0.6) r[0] = -F.wx - 1;
    if (r[1] > F.wx - 0.6) r[1] = F.wx + 1;
    if (r[3] > d - 0.6) r[3] = d + 1;
    out.push(r);
  }
  return out;
}

// your desk, as it is in the model (the anchor's frame: js/pitgarage.js useTrack); its glass the computer's screen
function desk(player) {
  if (!player.length) return null;
  const group = new THREE.Group(); group.name = 'PlayerDesk';
  for (const o of player) group.add(o.clone());
  let screen = null, computer = null;
  group.traverse(o => { if (o.name === 'PLAYER_SCREEN' && o.isMesh) screen = o; if (o.name === 'PLAYER_COMPUTER') computer = o; });
  if (!screen) group.traverse(o => { if (!screen && o.isMesh && o.parent && o.parent.name === 'PLAYER_SCREEN') screen = o; });
  return { group, screen, computer };
}

// the timing screen's glass: its middle, the way it faces, its size (in the anchor's frame: the box's, not mirrored)
function tvFrame(tv, F) {
  if (!tv) return null;
  const bb = tv.bb, sh = tv.bin * (F.wx - WX0), s = F.mirror ? -1 : 1;
  const size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  // (it faces into the room along its thinnest side)
  const thin = size.x <= size.z ? 'x' : 'z';
  const n = thin === 'x' ? new THREE.Vector3(c.x < 0 ? 1 : -1, 0, 0) : new THREE.Vector3(0, 0, c.z < -BOX.depth / 2 ? 1 : -1);
  return { c: new THREE.Vector3((c.x + sh) * s, c.y, c.z), n: new THREE.Vector3(n.x * s, 0, n.z), w: thin === 'x' ? size.z : size.x, h: size.y };
}
