// The teams' pit boxes from your model: models/pitbox.glb, exported from models/pitbox.blend (tools/props/pitbox.py
// made it from the game's own box; docs/PIT-BOX-MODEL.md has the names). With no model the boxes are the game's own
// (js/pitboxes.js dressBox, js/pitprops.js furnish). The room itself (floor, walls, ceiling, lights) is always the
// game's: it's built to each box's width, so the model's REF_ objects are left out (REF_your_car says where the
// cars park).
//
// In the model: X across the box (to your right stood in the door looking in), Y in from the door, Z up (the floor's
// top at 0.06), drawn for a box WX0 wide either side; things more than SNAP off the middle stay that far off their
// wall in a wider or narrower box. On lanes that run the other way a box is the model's mirror image, as the game's
// own are. Every box has all of it; in yours PLAYER_COMPUTER's glass (PLAYER_SCREEN) is the computer's screen.
// The small things lying about (CLUTTER) differ from box to box: some left out, the rest nudged.
//
// Positions handed out (car, seats, things) are in a box's own frame (js/pitboxes.js boxFrame: F.P(x, z, y)):
//   loadPitBox()                 // Promise: the model, read (or null: none)
//   fitBoxes(tpl, root, boxes)   // boxes: [{ F, team, mine }]: every box's things, the light baked in
//   tpl.footprints(F)            // what's in the way on foot: [x0, x1, z0, z1]
//   tpl.car(F)                   // where the car parks: { x, z } (its nose to the door)
//   tpl.seats(F)                 // the chairs at the computers: [{ x, z, face: [dx, dz], player }]
//   tpl.spots(F)                 // things to go and do something at: [{ x, z, face, kind }]
//   tpl.screen(F)                // your computer's glass: { geo, matrix } (in the world, at box F)
//   tpl.tvFrame(F)               // where your box's live timing goes: { c, n, w, h } in the anchor's frame (js/pitgarage.js)
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { BOX, lightAt, teamNameTexture } from './pitboxes.js';

const WX0 = 15 / 2 - BOX.wallIn, SNAP = 3.4;
const CLUTTER = /^(box_[abc]|bucket|broom|jerry|paint|spray|tape|screw_bin|toolbox|wrench|hammer)(\.|$)/;
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

// (the model's frame is three's here: x across, y up, z OUT of the door; a box's own has z in)
const binOf = (bb) => { const c = (bb.min.x + bb.max.x) / 2; return c < -SNAP ? -1 : c > SNAP ? 1 : 0; };
const shiftOf = (bin, F) => bin * (F.wx - WX0);
// a small random number per box and thing, the same every time
const hash = (k, s) => { let h = (k * 374761393 + 668265263) ^ 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2246822519); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };

function template(scene) {
  scene.updateMatrixWorld(true);
  const pieces = [], things = [];
  let teamName = null, tv = null, screen = null, car = null;
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
    if (name === 'REF_your_car') { const c = new THREE.Box3().setFromObject(top).getCenter(new THREE.Vector3()); car = { x: c.x, z: -c.z }; }
    if (/^REF_/.test(name)) continue;
    const bb = new THREE.Box3().setFromObject(top), bin = binOf(bb);
    if (name === 'TEAM_NAME') { top.traverse(o => { if (o.isMesh && !teamName) teamName = { geo: o.geometry.clone().applyMatrix4(o.matrixWorld), bin }; }); continue; }
    const c = bb.getCenter(new THREE.Vector3());
    const thing = { name, bb, bin, clutter: CLUTTER.test(name), c: { x: c.x, z: -c.z } }; things.push(thing);
    top.traverse(o => {
      if (o.name === 'PLAYER_SCREEN' && o.isMesh && !screen) screen = { geo: o.geometry.clone().applyMatrix4(o.matrixWorld), bin };
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
        const p = g.attributes.position, n = g.attributes.normal, cl = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const L = M.glow ? 1 : Math.max(0.5, lightAt(p.getX(i), -p.getZ(i), p.getY(i), [n.getX(i), -n.getZ(i), n.getY(i)]));
          cl[i * 3] = cl[i * 3 + 1] = cl[i * 3 + 2] = L;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        pieces.push({ thing, bin, M, geo: g });
      }
    });
    if (name === 'TIMING_SCREEN') tv = thing;
  }
  // the chairs at the computers: each chair to the computer nearest it (no further than 1.6 m)
  const comps = things.filter(t => /COMPUTER/i.test(t.name)), chairs = things.filter(t => /chair|stool/i.test(t.name));
  const seatsT = [];
  for (const ch of chairs) {
    let best = null, bd = 1.6;
    for (const cp of comps) { const d = Math.hypot(cp.c.x - ch.c.x, cp.c.z - ch.c.z); if (d < bd) { bd = d; best = cp; } }
    if (best) seatsT.push({ ch, cp: best, player: /^PLAYER_COMPUTER$/.test(best.name) });
  }
  return {
    pieces, things, teamName, tv, screenT: screen, carT: car || { x: 0, z: 6.4 }, seatsT,
    // every box but yours: one merged mesh per side and material (the clutter: one per thing, so it can differ)
    shared: merge(pieces.filter(p => !p.thing.clutter)), clutter: mergeThings(pieces.filter(p => p.thing.clutter)),
    footprints: (F) => footprints(F, things),
    car: (F) => ({ ...(car || { x: 0, z: 6.4 }) }),
    seats: (F) => seatsT.map(s => { const x = s.ch.c.x + shiftOf(s.ch.bin, F), cx = s.cp.c.x + shiftOf(s.cp.bin, F); return { x, z: s.ch.c.z, face: [cx - x, s.cp.c.z - s.ch.c.z], player: s.player }; }),
    spots: (F) => spots(F, things),
    screen: (F) => screen && { geo: screen.geo, matrix: frameMatrix(F, screen.bin) },
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
function merge(pieces) {
  const by = new Map();
  for (const p of pieces) { const k = p.bin + '|' + p.M.key; (by.get(k) || by.set(k, { bin: p.bin, M: p.M, geos: [] }).get(k)).geos.push(p.geo); }
  return [...by.values()].map(v => ({ bin: v.bin, M: v.M, geo: mergeGeometries(v.geos, false) }));
}
function mergeThings(pieces) {
  const by = new Map();
  for (const p of pieces) { const k = p.thing.name + '|' + p.M.key; (by.get(k) || by.set(k, { bin: p.bin, M: p.M, thing: p.thing, geos: [] }).get(k)).geos.push(p.geo); }
  return [...by.values()].map(v => ({ bin: v.bin, M: v.M, thing: v.thing, geo: mergeGeometries(v.geos, false) }));
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
const rectOf = (t, F) => { const sh = shiftOf(t.bin, F); return [t.bb.min.x + sh, t.bb.max.x + sh, -t.bb.max.z, -t.bb.min.z]; };
// a box's clutter: left out (null) or nudged (a matrix about the thing's middle, in the model's frame)
function clutterAt(k, t) {
  const r = hash(k, t.name);
  if (r < 0.3) return null;
  const cx = (t.bb.min.x + t.bb.max.x) / 2, cz = (t.bb.min.z + t.bb.max.z) / 2, a = (hash(k + 7, t.name) - 0.5) * 1.2;
  const dx = (hash(k + 3, t.name) - 0.5) * 0.24, dz = (hash(k + 5, t.name) - 0.5) * 0.24;
  return new THREE.Matrix4().makeTranslation(cx + dx, 0, cz + dz).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
}

// boxes: [{ F, team, mine }] -> a group (named BoxDress: js/garagewalk.js keeps the camera out of it)
export function fitBoxes(tpl, root, boxes) {
  const g = new THREE.Group(); g.name = 'BoxDress';
  const list = boxes.filter(b => b.F);
  const C = new THREE.Color(), tint = (M, team) => M.team === 'main' ? C.set(team?.main ?? 0xcc2222) : M.team === 'accent' ? C.set(team?.accent ?? 0xffffff) : C.set(0xffffff);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), mm = new THREE.Matrix4();
  const add = (s, at) => {
    const im = new THREE.InstancedMesh(s.geo, s.M.mat, list.length);
    list.forEach((b, i) => { const m = at(b); im.setMatrixAt(i, m || ZERO); im.setColorAt(i, tint(s.M, b.team)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere(); im.userData.sharedGeo = true; im.userData.worldMat = true; im.name = 'pitbox'; // (the model's, kept for next time)
    g.add(im);
  };
  for (const s of tpl.shared) add(s, (b) => frameMatrix(b.F, s.bin));
  for (const s of tpl.clutter) add(s, (b) => { const c = clutterAt(b.k ?? 0, s.thing); return c && mm.multiplyMatrices(frameMatrix(b.F, s.bin), c).clone(); });
  // the team's name on each box's back wall
  if (tpl.teamName) for (const b of list) {
    if (!b.team?.name) continue;
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
function footprints(F, things) {
  const out = [], d = BOX.depth;
  for (const t of things) {
    if (t.bb.min.y > 1.6 || t.bb.max.y < 0.25) continue;
    const r = rectOf(t, F);
    if (r[0] < -F.wx + 0.6) r[0] = -F.wx - 1;
    if (r[1] > F.wx - 0.6) r[1] = F.wx + 1;
    if (r[3] > d - 0.6) r[3] = d + 1;
    out.push(r);
  }
  return out;
}

// somewhere to stand and do something: in front of each thing on the floor, on its side facing the room
const KIND = [[/tire/i, 'tires'], [/tool_chest|toolbox|tool_rack/i, 'chest'], [/bench/i, 'bench'], [/shelving|shelf|box_/i, 'shelf'], [/TIMING_SCREEN/, 'screen']];
function spots(F, things) {
  const out = [];
  for (const t of things) {
    const kind = (KIND.find(([re]) => re.test(t.name)) || [])[1];
    if (!kind || /COMPUTER|chair/i.test(t.name)) continue;
    const [x0, x1, z0, z1] = rectOf(t, F), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (kind === 'screen') { const x = cx < 0 ? x1 + 1.6 : x0 - 1.6; out.push({ x, z: cz + 0.6, face: [cx - x, -0.6], kind, look: true }); continue; }
    // (the side nearest the room's middle that isn't against a wall)
    const cand = [[cx, z0 - 0.5, [0, 1]], [cx, z1 + 0.5, [0, -1]], [x0 - 0.5, cz, [1, 0]], [x1 + 0.5, cz, [-1, 0]]]
      .filter(([x, z]) => Math.abs(x) < F.wx - 0.4 && z > BOX.frontT + 0.3 && z < BOX.depth - 0.4)
      .sort((a, b) => Math.hypot(a[0], a[1] - 7) - Math.hypot(b[0], b[1] - 7));
    if (cand.length) out.push({ x: cand[0][0], z: cand[0][1], face: cand[0][2], kind });
  }
  return out;
}

// the timing screen's glass: its middle, the way it faces, its size (in the anchor's frame: the box's, not mirrored)
function tvFrame(tv, F) {
  if (!tv) return null;
  const bb = tv.bb, sh = shiftOf(tv.bin, F), s = F.mirror ? -1 : 1;
  const size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  // (it faces into the room along its thinnest side)
  const thin = size.x <= size.z ? 'x' : 'z';
  const n = thin === 'x' ? new THREE.Vector3(c.x < 0 ? 1 : -1, 0, 0) : new THREE.Vector3(0, 0, c.z < -BOX.depth / 2 ? 1 : -1);
  return { c: new THREE.Vector3((c.x + sh) * s, c.y, c.z), n: new THREE.Vector3(n.x * s, 0, n.z), w: thin === 'x' ? size.z : size.x, h: size.y };
}
