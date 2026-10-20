// Scenery asset library: the PS1-style models baked by tools/assets/bake.mjs (assets/env/*.glb + catalog.json).
//
// The catalogue (sizes, categories, tags) loads at start-up and is all the generator needs, so the editor can lay
// out a setting straight away. The models load in the background; a race waits for them (loading screen).
// Every model is in its own space: metres, +Y up, front facing +Z, centred on x/z with its base at y = 0.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { applyPSXMaterial } from '../vendor/psx/src/PSXMaterial.js';

let catalog = null, byId = new Map(), models = new Map(), loadingCat = null, loadingModels = null;
const embedded = () => (typeof window !== 'undefined' && window.__SVGP_ENV) || null; // single-file build

export function loadEnvCatalog() {
  if (loadingCat) return loadingCat;
  const E = embedded();
  loadingCat = (E ? Promise.resolve(E.catalog) : fetch('assets/env/catalog.json').then(r => r.json()))
    .then(c => { catalog = c; byId = new Map(c.assets.map(a => [a.id, a])); return c; })
    .catch(e => { console.warn('scenery catalog not loaded:', e && e.message); catalog = { packs: {}, assets: [] }; return catalog; });
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
  out.name = m.name || '';
  const slot = /^(Wall|Roof)_(\d+)$/.exec(out.name); if (slot) out.userData.slot = slot[1].toLowerCase(); // (PSX houses: swappable)
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

// ---------------- PSX houses: any shape can wear any wall, any roof and a paint colour ----------------
// look = { w: wall 1..6, r: roof 1..6, c: '#rrggbb' paint over the walls, or null }. A house with no look of its
// own gets one from where it stands (one of the pack's own combinations, white siding often painted), so every
// player sees the same street.
export const HOUSE_WALLS = [
  { label: 'Brick' }, { label: 'White siding' }, { label: 'Gray siding' }, { label: 'Teal siding' }, { label: 'Olive siding' }, { label: 'Stone' },
];
export const HOUSE_ROOFS = [
  { label: 'Green slate' }, { label: 'Red tile' }, { label: 'Gray slate' }, { label: 'Brown shingle' }, { label: 'Clay tile' }, { label: 'Black tile' },
];
export const HOUSE_PAINTS = ['#f3ede0', '#efe0b0', '#f2c9a8', '#e6b8b8', '#c9dcc0', '#bcd3e6', '#d6cce6', '#b8b0a4', '#8fa8c0', '#9cb890'];
const HOUSE_COMBOS = [[1, 3], [2, 2], [2, 3], [3, 3], [2, 4], [4, 1], [5, 4], [2, 5], [6, 3], [3, 4]];
export function houseLook(hv, x = 0, z = 0) {
  if (hv && hv.w && hv.r) return { w: hv.w, r: hv.r, c: hv.c || null };
  const rng = mulberry32((Math.floor(x * 13.7) * 73856093) ^ (Math.floor(z * 71.3) * 19349663));
  const [w, r] = HOUSE_COMBOS[Math.floor(rng() * HOUSE_COMBOS.length)];
  return { w, r, c: w === 2 && rng() < 0.6 ? HOUSE_PAINTS[Math.floor(rng() * HOUSE_PAINTS.length)] : null };
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// a house's parts with its wall / roof textures swapped in (cached per combination)
const houseCache = new Map();
function houseParts(id, w, r) {
  const key = id + '#' + w + r;
  let parts = houseCache.get(key); if (parts) return parts;
  const base = models.get(id); if (!base) return null;
  const sw = (kind, n) => { const s = models.get('_psxh_' + kind + '_' + n); return s && s[0].mat; };
  parts = base.map(pt => {
    const slot = pt.mat.userData.slot, m = slot === 'wall' ? sw('wall', w) : slot === 'roof' ? sw('roof', r) : null;
    return m ? { geo: pt.geo, mat: m } : pt;
  });
  houseCache.set(key, parts);
  return parts;
}
// a house's wall / roof textures as small images, for the editor's paint swatches
export function houseSwatch(kind, n) {
  const s = models.get('_psxh_' + kind + '_' + n), img = s && s[0].mat.map && s[0].mat.map.image;
  if (!img) return null;
  try { const cv = document.createElement('canvas'); cv.width = cv.height = 48; cv.getContext('2d').drawImage(img, 0, 0, 48, 48); return cv.toDataURL('image/jpeg', 0.8); } catch (e) { return null; }
}

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
// (a generator: world.js builds in steps, and this stops between batches once opts.slice() says the time's up)
export function* addEnvInstances(root, placements, opts = {}) {
  const pause = opts.slice || (() => false);
  const groups = new Map(), cells = new Map(), sizes = new Map();
  for (const p of placements) {
    if (pause()) yield;
    if (!models.has(p.id)) continue;
    const a0 = byId.get(p.id), far = reachOf(a0, p), whole = a0 && (a0.cat === 'skyline' || a0.w > 60); // (the skyline: one batch each)
    let CH = sizes.get(p.id + far); if (!CH) sizes.set(p.id + far, CH = cellSize(p.id, far));
    const ix = Math.floor(p.x / CH), iz = Math.floor(p.z / CH), cell = whole ? 'all' : far + '|' + CH + '|' + ix + ',' + iz;
    const key = p.id + (p.look ? '#' + p.look.w + p.look.r : '') + '|' + cell; // (a house's wall / roof: its own batch)
    let a = groups.get(key); if (!a) groups.set(key, a = Object.assign([], { cell })); a.push(p);
    // (the camera test: the square's corner radius plus a margin for tall / overhanging models and wandering rubbish)
    if (!cells.has(cell)) cells.set(cell, whole || far === Infinity ? null : { far, x: (ix + 0.5) * CH, z: (iz + 0.5) * CH, r: CH * Math.SQRT1_2 + 30 });
  }
  const cellGroups = [], groupOf = new Map();
  for (const [cell, c] of cells) {
    const g = new THREE.Group(); g.name = 'env-cell'; g.updateMatrixWorld = frozenMatrices; root.add(g); groupOf.set(cell, g);
    if (c) { g.userData = c; cellGroups.push(g); }
  }
  const m4 = new THREE.Matrix4(), _col = new THREE.Color();
  const nightMats = new Map();
  const matFor = (mat) => {
    if (!mat.userData.lit) return mat;
    // lit skyline windows: full glow at night, off by day (a per-world copy so day / night tracks don't clash)
    let m = nightMats.get(mat); if (!m) { m = mat.clone(); m.emissiveIntensity = opts.night ? 1.25 : 0; nightMats.set(mat, m); }
    return m;
  };
  let draws = 0, count = 0;
  const merges = new Map(); // cell|material (or texture class)|shadow -> the few-of-a-kind pieces drawn as one mesh
  // each material's biggest piece: world.js leaves the PSX vertex snapping off a material on anything over 40 m, and a
  // material merged into a texture class has to have had it (it's always on there)
  const bigR = new Map();
  for (const list of groups.values()) {
    const look = list[0].look;
    for (const part of (look && houseParts(list[0].id, look.w, look.r)) || models.get(list[0].id)) bigR.set(part.mat, Math.max(bigR.get(part.mat) || 0, part.geo.boundingSphere.radius));
  }
  for (const [key, list] of groups) {
    if (pause()) yield;
    const id = list[0].id, a = byId.get(id), look = list[0].look;
    const parts = (look && houseParts(id, look.w, look.r)) || models.get(id);
    // (ground cover and litter don't cast sun shadows: too small to see in the shadow map, but every one of them
    // is drawn again into it. Their soft contact shadows stay.)
    const shadow = a ? a.cat !== 'skyline' && a.cls !== 'litter' && a.cat !== 'grass' && reachOf(a, list[0]) > REACH[0][1] : true;
    // A town is mostly one-offs (a house in its own look, three benches in a cell): one draw each, thousands of them.
    // Those are merged instead, every piece sharing a material in a cell drawn at once (things that move later keep
    // their own slots). Many of a kind stay instanced: merging them would only copy the same model over and over.
    const merge = !list.some(p => p.mv) && (list.length <= 3 || list.length * trisOf(id) <= MERGE_TRIS);
    for (const part of parts) {
      // paint: a house's colour goes on its walls; a tint on any other building colours all of it
      const painted = list.some(p => p.paint || (p.look && p.look.c)) && (look ? part.mat.userData.slot === 'wall' : true);
      if (merge) {
        // (what has no draw distance goes on one 320 m grid, whatever its own batches' cells; the rest keep theirs)
        const mat = matFor(part.mat), cls = bigR.get(part.mat) <= 40 ? arrayClass(mat) : null, inf = list.cell.startsWith('Infinity|');
        for (const p of list) {
          const cell = inf ? 'm|' + Math.floor(p.x / 320) + ',' + Math.floor(p.z / 320) : list.cell, mk = cell + '|' + (cls ? cls.key : mat.uuid) + '|' + shadow;
          let mg = merges.get(mk); if (!mg) merges.set(mk, mg = { cell, mat: cls ? cls.mat : mat, cls, shadow, items: [] });
          mg.items.push({ geo: part.geo, p, a, mat, paint: painted ? (p.look && p.look.c) || p.paint || '#ffffff' : null });
        }
        continue;
      }
      const im = new THREE.InstancedMesh(part.geo, matFor(part.mat), list.length); im.name = id;
      list.forEach((p, k) => {
        im.setMatrixAt(k, envMatrix(p, a, m4));
        if (painted) im.setColorAt(k, _col.set((p.look && p.look.c) || p.paint || '#ffffff'));
        if (p.mv) (p._h ||= []).push([im, k]); // things that move later (rolling cans, blowing bags) keep their slots
      });
      im.computeBoundingSphere();
      if (list.some(p => p.mv)) im.boundingSphere.radius += 25; // (loose rubbish can wander a bit)
      im.castShadow = shadow;
      groupOf.get(list.cell).add(im); draws++;
    }
    count += list.length;
  }
  for (const mg of merges.values()) if (mg.cls) buildArray(mg.cls);
  for (const mg of merges.values()) {
    if (pause()) yield;
    let g = groupOf.get(mg.cell);
    if (!g) { g = new THREE.Group(); g.name = 'env-cell'; g.updateMatrixWorld = frozenMatrices; root.add(g); groupOf.set(mg.cell, g); }
    g.add(mergedMesh(mg)); draws++;
  }
  // show the cells in reach of this camera (no camera: all of them)
  const update = (camera) => {
    const cx = camera ? camera.position.x : 0, cz = camera ? camera.position.z : 0;
    for (const g of cellGroups) { const u = g.userData; g.visible = !camera || Math.hypot(u.x - cx, u.z - cz) - u.r < u.far; }
  };
  return { draws, count, update };
}

// The merged pieces of one material in one cell, baked into world space: what the InstancedMesh would have drawn
// (the paint multiplies the baked light in the vertex colours, as the instance colour did). userData.partR: the
// biggest piece's radius, so world.js still gives these small-triangle models the PSX vertex snapping.
const MERGE_TRIS = 4000;
const _nm = new THREE.Matrix3(), _mc = new THREE.Color();
function mergedMesh({ mat, cls, shadow, items }) {
  let nv = 0, ni = 0;
  for (const it of items) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  const layer = cls ? new Uint8Array(nv) : null;
  let ov = 0, oi = 0, partR = 0;
  for (const { geo, p, a, paint, mat: pm } of items) {
    envMatrix(p, a, m4); _nm.getNormalMatrix(m4);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, C = geo.attributes.color, n = P.count;
    if (paint) _mc.set(paint); else _mc.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
    if (cls) { _mc.multiply(pm.color); layer.fill(cls.layers.get(pm.map.source.uuid), ov, ov + n); } // (its own material's colour and texture)
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m4); v.toArray(pos, (ov + i) * 3);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); v.toArray(nor, (ov + i) * 3); }
      if (U) { uv[(ov + i) * 2] = U.getX(i); uv[(ov + i) * 2 + 1] = U.getY(i); }
      const k = (ov + i) * 3;
      if (C) { col[k] = C.getX(i) * _mc.r; col[k + 1] = C.getY(i) * _mc.g; col[k + 2] = C.getZ(i) * _mc.b; } else { col[k] = _mc.r; col[k + 1] = _mc.g; col[k + 2] = _mc.b; }
    }
    const I = geo.index, cnt = I ? I.count : n;
    for (let k = 0; k < cnt; k++) idx[oi++] = ov + (I ? I.getX(k) : k);
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    partR = Math.max(partR, geo.boundingSphere.radius);
    ov += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (layer) g.setAttribute('envLayer', new THREE.BufferAttribute(layer, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'env-merged'; mesh.castShadow = shadow; mesh.userData.partR = partR;
  if (cls && cls.depth) mesh.customDepthMaterial = cls.depth; // (cut-out leaves: shadows with the holes in)
  return mesh;
}

// Texture classes: a town's one-offs wear a couple of hundred textures (one material each), so merging per material
// still leaves dozens of draws a cell. Textures of the same size and sampling go into one texture array instead, and
// a merged mesh picks its layer per vertex: one material for the whole class. The texels are the textures' own
// (read back exactly, no resampling), sampled the same way, through the same PSX vertex snapping and affine warp.
// Classes and their arrays are shared by every world, and grow as new textures turn up.
const ARR = new Map(), DUMMY = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); DUMMY.needsUpdate = true;
function arrayClass(m) {
  const t = m.map, img = t && t.image;
  if (!img || !img.width || m.emissiveMap || m.userData.lit || !m.isMeshLambertMaterial || m.transparent || !m.vertexColors || m.emissive.getHex() !== 0) return null;
  if (t.offset.x || t.offset.y || t.repeat.x !== 1 || t.repeat.y !== 1 || t.rotation || t.channel) return null;
  const key = ['arr', img.width, img.height, t.colorSpace, t.wrapS, t.wrapT, t.minFilter, t.magFilter, t.anisotropy, t.flipY, t.premultiplyAlpha, m.alphaTest, m.side, m.polygonOffset ? m.polygonOffsetFactor + '/' + m.polygonOffsetUnits : 0].join('|');
  let c = ARR.get(key);
  if (!c) {
    const u = { value: null };
    const mat = new THREE.MeshLambertMaterial({ map: DUMMY, side: m.side, alphaTest: m.alphaTest, vertexColors: true, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits });
    applyPSXMaterial(mat, { snap: true, affine: 0.6 }); mat.userData.psx = true; // (as world.js gives the materials it replaces)
    const psx = mat.onBeforeCompile, psxKey = mat.customProgramCacheKey();
    const vert = (sh) => { sh.vertexShader = 'attribute float envLayer;\nvarying float vLayer;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vLayer = envLayer;'); };
    const frag = (sh) => { sh.uniforms.uMapArr = u; sh.fragmentShader = 'varying float vLayer;\nuniform highp sampler2DArray uMapArr;\n' + sh.fragmentShader; };
    mat.onBeforeCompile = (sh, r) => {
      psx.call(mat, sh, r); vert(sh); frag(sh);
      sh.fragmentShader = sh.fragmentShader.replace('texture2D( map, psxUv )', 'texture( uMapArr, vec3( psxUv, floor( vLayer + 0.5 ) ) )');
    };
    mat.customProgramCacheKey = () => 'envarr_' + psxKey;
    let depth = null;
    if (m.alphaTest > 0) {
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: DUMMY, alphaTest: m.alphaTest });
      depth.onBeforeCompile = (sh) => { vert(sh); frag(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= texture( uMapArr, vec3( vMapUv, floor( vLayer + 0.5 ) ) );'); };
      depth.customProgramCacheKey = () => 'envarr_depth';
    }
    ARR.set(key, c = { key, w: img.width, h: img.height, tpl: t, u, mat, depth, layers: new Map(), srcs: [] });
  }
  if (!c.layers.has(t.source.uuid)) {
    if (c.srcs.length >= 255) return null; // (array full: its own material)
    c.layers.set(t.source.uuid, c.srcs.length); c.srcs.push(t); c.dirty = true;
  }
  return c;
}
// the class's array, built again (bigger) when textures have joined it
function buildArray(c) {
  if (!c.dirty) return; c.dirty = false;
  const { w, h, tpl } = c, size = w * h * 4, data = new Uint8Array(size * c.srcs.length);
  c.srcs.forEach((t, i) => data.set(texels(t, w, h), i * size));
  const tex = new THREE.DataArrayTexture(data, w, h, c.srcs.length);
  Object.assign(tex, { colorSpace: tpl.colorSpace, wrapS: tpl.wrapS, wrapT: tpl.wrapT, minFilter: tpl.minFilter, magFilter: tpl.magFilter, anisotropy: tpl.anisotropy, flipY: tpl.flipY, premultiplyAlpha: tpl.premultiplyAlpha, generateMipmaps: tpl.generateMipmaps });
  tex.needsUpdate = true; tex.onUpdate = () => { tex.image.data = null; }; // (on the GPU now)
  if (c.u.value) c.u.value.dispose();
  c.u.value = tex;
}
// a texture's exact texels (a 2D canvas would premultiply them and lose the colour under the cut-out leaves)
let pixGL = null;
function texels(t, w, h) {
  const gl = pixGL ||= (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('webgl2');
  const tx = gl.createTexture(), fb = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, t.flipY); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, t.premultiplyAlpha);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, t.colorSpace === THREE.NoColorSpace ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, t.image);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
  const out = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tx);
  return out;
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
