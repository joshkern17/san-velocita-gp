// Minimal glTF reader / GLB writer for the asset baker (no dependencies).
import fs from 'node:fs';
import path from 'node:path';

// ---------- 4x4 matrices (column-major, like glTF) ----------
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}
export function nodeMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
export const xfPoint = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
export const xfDir = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
export const det3 = (m) => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
// normal matrix = inverse transpose of the upper 3x3
export function normalMatrix(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  // returns column-major 4x4 with inverse-transpose in the 3x3
  return [A / det, B / det, C / det, 0, D / det, E / det, F / det, 0, G / det, H / det, I / det, 0, 0, 0, 0, 1];
}

// ---------- reading ----------
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function loadGltf(dir) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'scene.gltf'), 'utf8'));
  const buffers = (json.buffers || []).map(b => fs.readFileSync(path.join(dir, decodeURIComponent(b.uri))));
  // accessor -> array of arrays (one per element), normalised ints mapped to 0..1 / -1..1
  const read = (ai) => {
    const a = json.accessors[ai], n = NCOMP[a.type], [Arr, size] = COMP[a.componentType];
    const out = new Float64Array(a.count * n);
    if (a.bufferView !== undefined) {
      const bv = json.bufferViews[a.bufferView], buf = buffers[bv.buffer];
      const stride = bv.byteStride || size * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const get = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
      for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = get(base + i * stride + k * size);
    }
    if (a.normalized) { const div = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType]; for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, out[i] / div); }
    if (a.sparse) {
      const s = a.sparse, ib = json.bufferViews[s.indices.bufferView], vb = json.bufferViews[s.values.bufferView];
      const idv = new DataView(buffers[ib.buffer].buffer, buffers[ib.buffer].byteOffset), vdv = new DataView(buffers[vb.buffer].buffer, buffers[vb.buffer].byteOffset);
      for (let i = 0; i < s.count; i++) {
        const io = (ib.byteOffset || 0) + (s.indices.byteOffset || 0);
        const idx = s.indices.componentType === 5125 ? idv.getUint32(io + i * 4, true) : s.indices.componentType === 5123 ? idv.getUint16(io + i * 2, true) : idv.getUint8(io + i);
        for (let k = 0; k < n; k++) out[idx * n + k] = vdv.getFloat32((vb.byteOffset || 0) + (s.values.byteOffset || 0) + (i * n + k) * 4, true);
      }
    }
    return { data: out, n, count: a.count };
  };
  return { json, read, dir };
}
// A .glb file read the same way: the binary chunk becomes buffer 0 and embedded images are written out next to
// imgDir (so the baker can shrink them like any other texture).
export function loadGlb(file, imgDir) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  const tmp = path.join(imgDir, path.basename(file, '.glb')); fs.mkdirSync(tmp, { recursive: true });
  const buf = Buffer.from(bin);
  fs.writeFileSync(path.join(tmp, 'scene.bin'), buf);
  (json.images || []).forEach((im, i) => {
    if (im.uri || im.bufferView === undefined) return;
    const bv = json.bufferViews[im.bufferView], ext = /jpe?g/.test(im.mimeType || '') ? 'jpg' : 'png';
    const name = (im.name || 'image' + i).replace(/[^\w.-]/g, '_') + '.' + ext;
    fs.writeFileSync(path.join(tmp, name), buf.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    im.uri = name;
  });
  json.buffers = [{ uri: 'scene.bin', byteLength: buf.length }];
  fs.writeFileSync(path.join(tmp, 'scene.gltf'), JSON.stringify(json));
  return loadGltf(tmp);
}

// world matrices of every node below the scene roots
export function worldMatrices(json) {
  const W = new Array(json.nodes.length), parent = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const get = (i) => W[i] || (W[i] = parent[i] < 0 ? nodeMatrix(json.nodes[i]) : mul(get(parent[i]), nodeMatrix(json.nodes[i])));
  json.nodes.forEach((_, i) => get(i));
  return { W, parent };
}

// ---------- writing a GLB ----------
// meshes: [{ name, prims: [{ pos: Float32Array, nor: Float32Array, uv: Float32Array|null, idx: Uint16Array|Uint32Array, mat }] }]
// materials: [{ name, color:[r,g,b,a], tex: imageIndex|-1, emissive:[r,g,b], emTex: -1, alpha:'OPAQUE'|'MASK'|'BLEND', cutoff, double, wrap:[s,t] }]
// images: [{ mime, bytes: Buffer }]
export function writeGlb(file, meshes, materials, images, extras = {}) {
  const chunks = [], views = [], accessors = [];
  let off = 0;
  const addView = (buf, target) => {
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) });
    chunks.push(b); off += b.length; return views.length - 1;
  };
  const addAcc = (arr, type, ctype, target, minmax, stride, normalized) => {
    const bv = addView(arr, target), n = NCOMP[type];
    if (stride) views[bv].byteStride = stride;
    const acc = { bufferView: bv, componentType: ctype, count: stride ? arr.length / (stride / arr.BYTES_PER_ELEMENT) : arr.length / n, type };
    if (normalized) acc.normalized = true;
    if (minmax) { const per = stride ? stride / arr.BYTES_PER_ELEMENT : n, mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < acc.count; i++) for (let k = 0; k < n; k++) { const v = arr[i * per + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); } acc.min = mn; acc.max = mx; }
    accessors.push(acc); return accessors.length - 1;
  };
  // KHR_mesh_quantization: positions as normalised int16 (dequantised by the node's translation / scale),
  // normals as normalised int8. Per mesh, so every piece keeps full precision over its own size.
  const nodeXf = [];
  const gMeshes = meshes.map(m => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of m.prims) for (let i = 0; i < p.pos.length; i++) { const k = i % 3; mn[k] = Math.min(mn[k], p.pos[i]); mx[k] = Math.max(mx[k], p.pos[i]); }
    const c = mn.map((v, k) => (v + mx[k]) / 2), h = mn.map((v, k) => Math.max(1e-4, (mx[k] - v) / 2));
    nodeXf.push({ translation: c, scale: h });
    return { name: m.name, prims: m.prims, c, h };
  }).map(m => ({
    name: m.name,
    primitives: m.prims.map(p => {
      const nv = p.pos.length / 3, qp = new Int16Array(nv * 4), qn = new Int8Array(nv * 4);
      for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) {
        qp[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, (p.pos[i * 3 + k] - m.c[k]) / m.h[k])) * 32767);
        qn[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, p.nor[i * 3 + k])) * 127);
      }
      const attributes = { POSITION: addAcc(qp, 'VEC3', 5122, 34962, true, 8, true), NORMAL: addAcc(qn, 'VEC3', 5120, 34962, false, 4, true) };
      if (p.uv) attributes.TEXCOORD_0 = addAcc(p.uv, 'VEC2', 5126, 34962);
      return { attributes, indices: addAcc(p.idx, 'SCALAR', p.idx instanceof Uint32Array ? 5125 : 5123, 34963), material: p.mat };
    }),
  }));
  const gImages = images.map(im => ({ mimeType: im.mime, bufferView: addView(new Uint8Array(im.bytes)) }));
  const samplers = [], samplerKey = new Map();
  const sampler = (wrap) => { const k = wrap.join(','); if (!samplerKey.has(k)) { samplers.push({ magFilter: 9728, minFilter: 9987, wrapS: wrap[0], wrapT: wrap[1] }); samplerKey.set(k, samplers.length - 1); } return samplerKey.get(k); };
  const textures = [];
  const texFor = (img, wrap) => { textures.push({ source: img, sampler: sampler(wrap || [10497, 10497]) }); return textures.length - 1; };
  const gMats = materials.map(m => {
    const o = { name: m.name, pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: !!m.double };
    if (m.tex >= 0) o.pbrMetallicRoughness.baseColorTexture = { index: texFor(m.tex, m.wrap) };
    if (m.alpha && m.alpha !== 'OPAQUE') { o.alphaMode = m.alpha; if (m.alpha === 'MASK') o.alphaCutoff = m.cutoff ?? 0.5; }
    if (m.emissive && (m.emissive[0] || m.emissive[1] || m.emissive[2])) o.emissiveFactor = m.emissive;
    if (m.emTex >= 0) o.emissiveTexture = { index: texFor(m.emTex, m.wrap) };
    return o;
  });
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'svgp asset baker' },
    scene: 0, scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i, ...nodeXf[i] })),
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    meshes: gMeshes, materials: gMats, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
    ...(gImages.length ? { images: gImages, textures, samplers } : {}),
    extras,
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const binP = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4E4F534A, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(binP.length, 0); c2.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, c1, js, c2, binP]));
}
