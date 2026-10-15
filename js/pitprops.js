// The pit boxes' furniture (models/pitprops.glb: tools/props/pitprops.py, from a PSX garage tools pack and a CRT
// monitor): the engineers' monitors and stools, a work bench, shelving, cans, boxes, a fuse box. Every team box gets
// the same layout (in its frame: js/pitboxes.js boxFrame), each prop one InstancedMesh across all the boxes, unlit
// with the room's light baked into its color (as the room is).
//
//   furnish(root, frames)   // frames: [{ F, mine }]; adds the props once the model's in. Returns a Promise
//   PROP_OBSTACLES(wx)      // what's in the way on foot (js/pitwalk.js), in a box's frame
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { BOX, lightAt } from './pitboxes.js';

let load = null;
const url = () => (typeof window !== 'undefined' && window.__SVGP_PITPROPS_GLB) || 'models/pitprops.glb';
export function loadPitProps() { return load ||= new GLTFLoader().loadAsync(url()).then(g => g.scene, () => null); }

// the layout, in a box's frame (x along the front, z in from it, y up from the floor; face: the way its front looks)
const TOP = 0.95; // (the work bench's top)
function layout(F, d) {
  const L = [], wx = F.wx;
  const put = (name, x, z, y, face) => L.push({ name, x, z, y, face });
  for (let s = 0; s < 4; s++) put('monitor', -2.7 + s * 1.8, d - 0.5, 0.96, [0, -1]);      // the engineers' bench
  for (const x of [-2.2, 0, 2.2]) put('stool_low', x, d - 1.55, 0, [0, 1]);
  put('paint', 2.9, d - 0.45, 0, [0, -1]); put('paint', 3.15, d - 0.6, 0, [0, -1]);
  put('spray', -3.25, d - 0.35, 0.96, [0, -1]);
  put('bench_tall', wx - 0.44, 8.9, 0, [-1, 0]);                                              // the work bench, things on it
  put('toolbox', wx - 0.5, 8.3, TOP, [-1, 0]); put('screw_bin', wx - 0.4, 9.35, TOP, [-1, 0]); put('tape', wx - 0.55, 9.75, TOP, [-1, 0]);
  put('mat', wx - 1.5, 8.9, 0.004, [-1, 0]);
  put('shelving_a', -wx + 0.19, d - 1.4, 0, [1, 0]); put('shelving_c', wx - 0.19, d - 1.4, 0, [-1, 0]); // the back corners
  put('box_b', -wx + 0.45, 11.45, 0, [1, 0]); put('box_a', -wx + 0.45, 11.45, 0.21, [1, 0.2]); put('box_c', -wx + 0.95, 11.6, 0, [1, -0.3]);
  put('jerry', wx - 0.3, 2.4, 0, [-1, 0]); put('jerry', wx - 0.3, 1.78, 0, [-1, 0.15]);       // by the door
  put('bucket', -wx + 0.35, 2.05, 0, [1, 0]); put('broom', -wx + 0.12, 1.55, 0, [1, 0]);
  put('fuse', (F.dw + wx) / 2, BOX.frontT + 0.06, 1.45, [0, 1]);                         // beside the door, inside
  return L;
}
// in a box's frame: rectangles [x0, x1, z0, z1] (past the walls they stand against, so the way out is into the room)
export function PROP_OBSTACLES(wx, d = BOX.depth) {
  return [[-wx - 1, -wx + 0.4, d - 2, d - 0.8], [wx - 0.4, wx + 1, d - 2, d - 0.8],         // shelving
    [-wx - 1, -wx + 1.15, 11.2, 11.85],                                                         // the boxes
    [wx - 0.5, wx + 1, 1.55, 2.6], [-wx - 1, -wx + 0.55, 1.3, 2.25]];                          // cans, bucket and broom
}

// frames: [{ F, mine }] (F: boxFrame). Resolves to the group added (or null: no model)
export function furnish(root, frames) {
  return loadPitProps().then(src => {
    if (!src || !frames.length) return null;
    const protos = {};   // name -> [{ geo, mat, rel }]
    src.updateMatrixWorld(true);
    for (const o of src.children) {
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), parts = [];
      o.traverse(m => {
        if (!m.isMesh) return;
        const map = m.material.map || null;
        parts.push({ geo: m.geometry, mat: new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : m.material.color, side: THREE.DoubleSide }), rel: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
      });
      protos[o.name] = parts;
    }
    // every prop of every box
    const want = {}, mm = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
    for (const { F } of frames) {
      for (const p of layout(F, BOX.depth)) {
        if (!protos[p.name]) continue;
        const at = F.P(p.x, p.z, p.y + BOX.floor), ah = F.P(p.x + p.face[0], p.z + p.face[1], p.y + BOX.floor);
        q.setFromAxisAngle(UP, Math.atan2(ah[0] - at[0], ah[2] - at[2]));
        const fl = Math.hypot(...p.face) || 1, L = Math.max(0.55, Math.min(1.08, lightAt(p.x, p.z, p.y + 0.6, [p.face[0] / fl * 0.7, p.face[1] / fl * 0.7, 0.7])));
        (want[p.name] ||= []).push({ m: new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(1, 1, 1)), L });
      }
    }
    const g = new THREE.Group(); g.name = 'PitProps';
    const c = new THREE.Color();
    for (const [name, list] of Object.entries(want)) for (const part of protos[name]) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((it, i) => { im.setMatrixAt(i, mm.multiplyMatrices(it.m, part.rel)); im.setColorAt(i, c.setScalar(it.L)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); im.userData.sharedGeo = true; im.name = 'prop:' + name;
      g.add(im);
    }
    root.add(g);
    return g;
  });
}
