// Scenery asset library: the PS1-style models baked by tools/assets/bake.mjs (assets/env/*.glb + catalog.json).
//
// The catalogue (sizes, categories, tags) loads at start-up and is all the generator needs, so the editor can lay
// out a setting straight away. The models load in the background; a race waits for them (loading screen).
// Every model is in its own space: metres, +Y up, front facing +Z, centred on x/z with its base at y = 0.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

let catalog = null, byId = new Map(), models = new Map(), loadingCat = null, loadingModels = null;
const embedded = () => (typeof window !== 'undefined' && window.__SVGP_ENV) || null; // single-file build

export function loadEnvCatalog() {
  if (loadingCat) return loadingCat;
  const E = embedded();
  loadingCat = (E ? Promise.resolve(E.catalog) : fetch('assets/env/catalog.json').then(r => r.json()))
    .then(c => { catalog = c; byId = new Map(c.assets.map(a => [a.id, a])); return c; })
    .catch(e => { console.warn('scenery catalogue not loaded:', e && e.message); catalog = { packs: {}, assets: [] }; return catalog; });
  return loadingCat;
}
export const envCatalog = () => catalog;
export const envAsset = (id) => byId.get(id);
export const envReady = () => !!catalog && catalog.assets.length > 0;
export const envModelsReady = () => !!loadingModels && models.size > 0;

// assets matching a filter: { cat, cls (string or array), tags (any of) }
export function envAssets(f = {}) {
  if (!catalog) return [];
  const cls = f.cls && (Array.isArray(f.cls) ? f.cls : [f.cls]);
  return catalog.assets.filter(a => (!f.cat || a.cat === f.cat) && (!cls || cls.includes(a.cls)) && (!f.tags || (a.tags || []).some(t => f.tags.includes(t))));
}

// ---------------- models ----------------
// PS1 look: Lambert, crisp texture magnification, cut-out alpha (no sorting), optional lit windows at night
function convertMaterial(m) {
  const cut = m.transparent || m.alphaTest > 0 || (m.map && m.userData.alpha);
  const out = new THREE.MeshLambertMaterial({
    map: m.map || null, color: m.color ? m.color.clone() : 0xffffff,
    side: m.side, alphaTest: cut ? 0.45 : 0, transparent: false, vertexColors: true,
    emissiveMap: m.emissiveMap || null, emissive: m.emissiveMap ? 0xffffff : (m.emissive ? m.emissive.clone() : 0x000000),
  });
  if (out.map) { out.map.magFilter = THREE.NearestFilter; out.map.anisotropy = 4; }
  out.userData.lit = !!m.emissiveMap; // skyline windows: glow at night only
  return out;
}
// geometry out of a (quantised) glTF mesh, baked into the piece's space, attributes as plain floats
function bakeGeometry(mesh) {
  const src = mesh.geometry, g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name); if (!a) continue;
    const n = a.itemSize, f = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) { f[i * n] = a.getX(i); f[i * n + 1] = a.getY(i); if (n > 2) f[i * n + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, n));
  }
  g.setIndex(src.index ? Array.from(src.index.array) : null);
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(mesh.matrixWorld);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
// Baked light, PS1 style (in the vertex colours): darker towards the ground where light can't reach, and on
// faces pointing down. Done per model once all its parts are known (the gradient scales with its height).
function bakeAO(parts, cat) {
  let top = 0; for (const p of parts) top = Math.max(top, p.geo.boundingBox.max.y);
  const band = Math.max(0.35, Math.min(cat === 'building' || cat === 'landmark' ? 3.2 : 1.6, top * 0.4)), floor = cat === 'tree' || cat === 'bush' ? 0.62 : 0.5;
  for (const p of parts) {
    const pos = p.geo.getAttribute('position'), nor = p.geo.getAttribute('normal'), col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = Math.min(1, Math.max(0, y / band));
      let k = floor + (1 - floor) * (t * t * (3 - 2 * t));
      const ny = nor ? nor.getY(i) : 0;
      if (ny < -0.3) k *= 0.72; // undersides (awnings, balconies, canopies)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    p.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
}

// Leaves are flat cut-out cards: lit by their own normals, half of them face away from the sun and the canopy
// goes black. Point the normals of cut-out parts up and out from the middle of the tree (like a round crown).
function foliageNormals(parts) {
  const box = new THREE.Box3(); for (const p of parts) box.union(p.geo.boundingBox);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), v = new THREE.Vector3();
  for (const p of parts) {
    if (!(p.mat.alphaTest > 0)) continue; // (trunks keep theirs)
    const pos = p.geo.getAttribute('position'), nor = p.geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      v.set((pos.getX(i) - c.x) / (s.x / 2 || 1) * 0.55, 0.35 + Math.max(0, (pos.getY(i) - box.min.y) / (s.y || 1)) * 0.9, (pos.getZ(i) - c.z) / (s.z / 2 || 1) * 0.55).normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    nor.needsUpdate = true;
  }
}

export function loadEnvModels() {
  if (loadingModels) return loadingModels;
  loadingModels = loadEnvCatalog().then(async (cat) => {
    const E = embedded(), loader = new GLTFLoader();
    const packs = [...new Set(cat.assets.map(a => a.pack))];
    await Promise.all(packs.map(async (pack) => {
      try {
        const gl = await loader.loadAsync(E ? E.glbs[pack] : `assets/env/${pack}.glb`);
        gl.scene.updateMatrixWorld(true);
        const mats = new Map();
        for (const node of gl.scene.children) {
          const parts = [];
          node.traverse(o => {
            if (!o.isMesh) return;
            let m = mats.get(o.material); if (!m) mats.set(o.material, m = convertMaterial(o.material));
            parts.push({ geo: bakeGeometry(o), mat: m });
          });
          if (parts.length) {
            const meta = byId.get(node.name) || {};
            if (meta.cat === 'tree' || meta.cat === 'bush' || meta.cat === 'grass') foliageNormals(parts);
            bakeAO(parts, meta.cat);
            // litter lies flat on the road / pavement: always draw it on top of the surface under it
            if (meta.cls === 'litter' || meta.cls === 'junk') for (const pt of parts) { const m2 = pt.mat.clone(); m2.polygonOffset = true; m2.polygonOffsetFactor = -8; m2.polygonOffsetUnits = -8; pt.mat = m2; }
            models.set(node.name, parts);
          }
        }
      } catch (e) { console.warn('scenery pack not loaded:', pack, e && e.message); }
    }));
    return models.size;
  });
  return loadingModels;
}
export const envModel = (id) => models.get(id);

// ---------------- drawing ----------------
// placements: [{ id, x, y, z, rot, sx, sy, sz }] (rot about +Y; scale per axis, default 1)
// Everything with the same model shares one InstancedMesh per material, per cell of the map; each draw costs far
// more than a few hundred triangles, so the cells are sized by how heavy the model is (a 30-triangle tree: one batch
// per km square, a 2,000-triangle building: per 160 m). The cells are groups that update(camera) shows or hides as a
// whole. Small things also have a draw distance: past it they'd be a few pixels tall (a 1 m flower at 200 m is under
// 3 pixels at 448p), so ground cover and street clutter far off are skipped. Returns stats + update.
const REACH = [[1.3, 200], [4, 480]]; // [size up to (m), drawn up to (m)]; bigger: to the horizon
const reachOf = (a, p) => {
  if (!a) return Infinity;
  const s = Math.max(a.h * (p.sy ?? p.s ?? 1), 0.5 * Math.max(a.w * (p.sx ?? p.s ?? 1), a.d * (p.sz ?? p.s ?? 1)));
  for (const [size, far] of REACH) if (s <= size) return far;
  return Infinity;
};
const trisOf = (id) => { let n = 0; for (const p of models.get(id)) n += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3; return n; };
const cellSize = (id, far) => { if (far < Infinity) return 160; const n = trisOf(id); return n <= 150 ? 960 : n <= 600 ? 480 : n <= 3000 ? 320 : 160; };
// The scenery never moves (loose rubbish moves inside its batch), but three.js re-walks and re-multiplies every
// object's matrix each frame: thousands of batches on a well-decorated map. A cell works its matrices out once.
function frozenMatrices(force) {
  if (this._frozen) return;
  THREE.Object3D.prototype.updateMatrixWorld.call(this, true); this._frozen = true;
}
export function addEnvInstances(root, placements, opts = {}) {
  const groups = new Map(), cells = new Map(), sizes = new Map();
  for (const p of placements) {
    if (!models.has(p.id)) continue;
    const a0 = byId.get(p.id), far = reachOf(a0, p), whole = a0 && (a0.cat === 'skyline' || a0.w > 60); // (the skyline: one batch each)
    let CH = sizes.get(p.id + far); if (!CH) sizes.set(p.id + far, CH = cellSize(p.id, far));
    const ix = Math.floor(p.x / CH), iz = Math.floor(p.z / CH), cell = whole ? 'all' : far + '|' + CH + '|' + ix + ',' + iz;
    const key = p.id + '|' + cell;
    let a = groups.get(key); if (!a) groups.set(key, a = Object.assign([], { cell })); a.push(p);
    // (the camera test: the square's corner radius plus a margin for tall / overhanging models and wandering rubbish)
    if (!cells.has(cell)) cells.set(cell, whole || far === Infinity ? null : { far, x: (ix + 0.5) * CH, z: (iz + 0.5) * CH, r: CH * Math.SQRT1_2 + 30 });
  }
  const cellGroups = [], groupOf = new Map();
  for (const [cell, c] of cells) {
    const g = new THREE.Group(); g.name = 'env-cell'; g.updateMatrixWorld = frozenMatrices; root.add(g); groupOf.set(cell, g);
    if (c) { g.userData = c; cellGroups.push(g); }
  }
  const m4 = new THREE.Matrix4();
  const nightMats = new Map();
  const matFor = (mat) => {
    if (!mat.userData.lit) return mat;
    // lit skyline windows: full glow at night, off by day (a per-world copy so day / night tracks don't clash)
    let m = nightMats.get(mat); if (!m) { m = mat.clone(); m.emissiveIntensity = opts.night ? 1.25 : 0; nightMats.set(mat, m); }
    return m;
  };
  let draws = 0, count = 0;
  for (const [key, list] of groups) {
    const id = list[0].id, a = byId.get(id);
    for (const part of models.get(id)) {
      const im = new THREE.InstancedMesh(part.geo, matFor(part.mat), list.length); im.name = id;
      list.forEach((p, k) => {
        im.setMatrixAt(k, envMatrix(p, a, m4));
        if (p.mv) (p._h ||= []).push([im, k]); // things that move later (rolling cans, blowing bags) keep their slots
      });
      im.computeBoundingSphere();
      if (list.some(p => p.mv)) im.boundingSphere.radius += 25; // (loose rubbish can wander a bit)
      // (ground cover and litter don't cast sun shadows: too small to see in the shadow map, but every one of them
      // is drawn again into it. Their soft contact shadows stay.)
      im.castShadow = a ? a.cat !== 'skyline' && a.cls !== 'litter' && a.cat !== 'grass' && reachOf(a, list[0]) > REACH[0][1] : true;
      groupOf.get(list.cell).add(im); draws++;
    }
    count += list.length;
  }
  // show the cells in reach of this camera (no camera: all of them)
  const update = (camera) => {
    const cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
    for (const g of cellGroups) { const u = g.userData; g.visible = !camera || Math.hypot(u.x - cx, u.z - cz) - u.r < u.far; }
  };
  return { draws, count, update };
}

// Placement matrix. p: { x, y (surface height), z, rot (yaw), s | sx sy sz, tx / tz (tilt about local x / z),
// sp (spin about the model's own up axis, e.g. a can rolling) }. Tilted things pivot about their middle and are
// lifted so their lowest corner just touches the surface (nothing sinks into the ground).
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Matrix4();
export function envMatrix(p, a, out = new THREE.Matrix4()) {
  const sx = p.sx ?? p.s ?? 1, sy = p.sy ?? p.s ?? 1, sz = p.sz ?? p.s ?? 1;
  _q.setFromAxisAngle(_v.set(0, 1, 0), p.rot || 0);
  if (!p.tx && !p.tz && !p.sp) return out.compose(_v.set(p.x, p.y || 0, p.z), _q, _s.set(sx, sy, sz));
  _e.set(p.tx || 0, 0, p.tz || 0); _q2.setFromEuler(_e); _q.multiply(_q2);                // yaw, then tilt
  if (p.sp) { _q2.setFromAxisAngle(_v.set(0, 1, 0), p.sp); _q.multiply(_q2); }            // then spin about its own axis
  const hw = (a ? a.w : 1) * sx / 2, hh = (a ? a.h : 1) * sy / 2, hd = (a ? a.d : 1) * sz / 2;
  // lowest corner of the (unspun) box after the tilt
  _q2.setFromAxisAngle(_v.set(0, 1, 0), p.rot || 0); _e.set(p.tx || 0, 0, p.tz || 0); const qt = _q2.clone().multiply(new THREE.Quaternion().setFromEuler(_e));
  let low = 0;
  for (const cx of [-hw, hw]) for (const cy of [-hh, hh]) for (const cz of [-hd, hd]) low = Math.min(low, _c.set(cx, cy, cz).applyQuaternion(qt).y);
  // rolling round things: use the radius, so they don't bob as the square box turns
  if (p.sp && p.round) low = -Math.min(hw, hd);
  out.compose(_v.set(p.x, (p.y || 0) - low, p.z), _q, _s.set(sx, sy, sz));
  return out.multiply(_t.makeTranslation(0, -(a ? a.h : 1) / 2, 0));
}
