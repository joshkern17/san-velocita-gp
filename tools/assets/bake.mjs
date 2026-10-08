// Bakes the downloaded PS1-style asset packs (Sketchfab glTF zips) into game-ready scenery.
//
//   node tools/assets/bake.mjs            bake everything listed in manifest.mjs -> assets/env/*.glb + catalog.json
//   node tools/assets/bake.mjs --auto     split every pack into its top-level pieces (for browsing, -> <cache>/auto)
//
// Source zips: ~/Downloads/Racing Game Assets for claude (or set ASSET_SRC). They're unzipped into
// a temp folder (ASSET_CACHE). Each piece is baked into its own space: metres, +Y up, front facing +Z, centred on
// x/z with its base at y = 0. Textures are shrunk to PS1 sizes (sips, built into macOS).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGltf, loadGlb, worldMatrices, mul, IDENT, xfPoint, xfDir, det3, normalMatrix, writeGlb } from './gltf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = process.env.ASSET_SRC || path.join(os.homedir(), 'Downloads', 'Racing Game Assets for claude');
const CACHE = process.env.ASSET_CACHE || path.join(os.tmpdir(), 'svgp-asset-cache'); // unzipped packs + shrunk textures (safe to delete)
const AUTO = process.argv.includes('--auto');

// ---------- unzip ----------
export function packDir(pack) {
  const dir = path.join(CACHE, 'src', pack);
  if (fs.existsSync(path.join(dir, 'scene.gltf'))) return dir;
  const zip = path.join(SRC, pack + '.zip');
  if (!fs.existsSync(zip)) throw new Error('missing ' + zip);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-oq', zip, '-d', dir]);
  return dir;
}

// ---------- textures ----------
const texCache = new Map();
function imageSize(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return [+out.match(/pixelWidth: (\d+)/)[1], +out.match(/pixelHeight: (\d+)/)[1]];
}
function bakeImage(file, max, alpha) {
  const key = file + '|' + max + '|' + alpha;
  if (texCache.has(key)) return texCache.get(key);
  const outDir = path.join(CACHE, 'tex'); fs.mkdirSync(outDir, { recursive: true });
  const ext = alpha ? 'png' : 'jpg';
  const out = path.join(outDir, path.basename(path.dirname(path.dirname(file))) + '__' + path.basename(file).replace(/\.\w+$/, '') + '_' + max + '.' + ext);
  if (!fs.existsSync(out)) {
    const [w, h] = imageSize(file);
    const args = ['-s', 'format', alpha ? 'png' : 'jpeg'];
    if (!alpha) args.push('-s', 'formatOptions', '82');
    if (Math.max(w, h) > max) args.push('-Z', String(max));
    execFileSync('sips', [...args, file, '--out', out], { stdio: 'ignore' });
  }
  const r = { mime: alpha ? 'image/png' : 'image/jpeg', bytes: fs.readFileSync(out) };
  texCache.set(key, r);
  return r;
}

// ---------- materials ----------
function srcMaterial(G, mi) {
  const m = (G.json.materials || [])[mi] || {};
  const pbr = m.pbrMetallicRoughness || {}, sg = m.extensions?.KHR_materials_pbrSpecularGlossiness;
  const texInfo = pbr.baseColorTexture || sg?.diffuseTexture || null;
  let color = pbr.baseColorFactor || sg?.diffuseFactor || [1, 1, 1, 1];
  const texFile = (ti) => { if (!ti) return null; const t = G.json.textures[ti.index], im = G.json.images[t.source]; return im.uri ? path.join(G.dir, decodeURIComponent(im.uri)) : null; };
  const wrapOf = (ti) => { const t = ti && G.json.textures[ti.index]; const s = t && t.sampler !== undefined ? G.json.samplers[t.sampler] : {}; return [s.wrapS || 10497, s.wrapT || 10497]; };
  const strength = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength || 1;
  return {
    name: m.name || 'mat' + mi, color, texInfo, tex: texFile(texInfo), wrap: wrapOf(texInfo),
    emissive: (m.emissiveFactor || [0, 0, 0]).map(v => Math.min(1, v * strength)), emTex: texFile(m.emissiveTexture), emInfo: m.emissiveTexture,
    alpha: m.alphaMode || 'OPAQUE', cutoff: m.alphaCutoff, double: !!m.doubleSided,
    unlit: !!m.extensions?.KHR_materials_unlit,
  };
}

// ---------- gathering a piece ----------
// every primitive below the given nodes, in pack world space
function gather(G, W, nodeIdx) {
  const out = [];
  const visit = (i) => {
    const n = G.json.nodes[i];
    if (n.mesh !== undefined) for (const pr of G.json.meshes[n.mesh].primitives) if (pr.mode === undefined || pr.mode === 4) out.push({ pr, M: W[i] });
    for (const c of n.children || []) visit(c);
  };
  for (const i of nodeIdx) visit(i);
  return out;
}

// Bakes a set of primitives into one mesh (one primitive per material). spec: { scale, yaw, targetH, drop, keepY }
export function bakePiece(G, W, nodeIdx, spec, matOut, imgOut, texMax) {
  const prims = gather(G, W, nodeIdx);
  if (spec.skipMats) for (let k = prims.length - 1; k >= 0; k--) if (spec.skipMats.some(s => (srcMaterial(G, prims[k].pr.material).name || '').includes(s))) prims.splice(k, 1);
  if (!prims.length) return null;
  // raw world-space geometry per primitive
  const raw = prims.map(({ pr, M }) => {
    const P = G.read(pr.attributes.POSITION), Nn = pr.attributes.NORMAL !== undefined ? G.read(pr.attributes.NORMAL) : null;
    const sm = srcMaterial(G, pr.material);
    const uvSet = sm.texInfo?.texCoord || 0, uvAcc = pr.attributes['TEXCOORD_' + uvSet];
    const UV = uvAcc !== undefined ? G.read(uvAcc) : null;
    const idx = pr.indices !== undefined ? G.read(pr.indices).data : Float64Array.from({ length: P.count }, (_, i) => i);
    const NM = normalMatrix(M), flip = det3(M) < 0;
    const pos = new Float64Array(P.count * 3), nor = new Float64Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const p = xfPoint(M, P.data[i * 3], P.data[i * 3 + 1], P.data[i * 3 + 2]); pos.set(p, i * 3);
      if (Nn) { const q = xfDir(NM, Nn.data[i * 3], Nn.data[i * 3 + 1], Nn.data[i * 3 + 2]); const l = Math.hypot(...q) || 1; nor.set([q[0] / l, q[1] / l, q[2] / l], i * 3); }
    }
    let uv = null;
    if (UV) {
      uv = Float64Array.from(UV.data);
      const tt = sm.texInfo?.extensions?.KHR_texture_transform;
      if (tt) {
        const [ox, oy] = tt.offset || [0, 0], [sx, sy] = tt.scale || [1, 1], r = tt.rotation || 0, c = Math.cos(r), s = Math.sin(r);
        for (let i = 0; i < uv.length; i += 2) { const u = uv[i] * sx, v = uv[i + 1] * sy; uv[i] = c * u + s * v + ox; uv[i + 1] = -s * u + c * v + oy; }
      }
    }
    const tri = Array.from(idx);
    if (flip) for (let k = 0; k < tri.length; k += 3) { const t = tri[k + 1]; tri[k + 1] = tri[k + 2]; tri[k + 2] = t; }
    return { pos, nor, uv, tri, sm, hasN: !!Nn, mi: pr.material };
  });
  // piece transform: yaw (so the front faces +Z) and scale, then centre it on x/z with its base at 0
  const yaw = (spec.yaw || 0) * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const r of raw) for (let i = 0; i < r.pos.length; i += 3) {
    const x = r.pos[i], z = r.pos[i + 2];
    r.pos[i] = x * cy + z * sy; r.pos[i + 2] = -x * sy + z * cy;
    const nx = r.nor[i], nz = r.nor[i + 2]; r.nor[i] = nx * cy + nz * sy; r.nor[i + 2] = -nx * sy + nz * cy;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], r.pos[i + k]); mx[k] = Math.max(mx[k], r.pos[i + k]); }
  }
  let s = spec.scale || 1;
  if (spec.targetH) s = spec.targetH / (mx[1] - mn[1]);
  if (spec.targetL) s = spec.targetL / (mx[2] - mn[2]);
  let c = [(mn[0] + mx[0]) / 2, spec.keepY ? 0 : mn[1] + (spec.drop || 0) / s, (mn[2] + mx[2]) / 2];
  if (spec.frame) { s = spec.frame.s; c = spec.frame.c; } // several pieces sharing one space (car body + wheels)
  if (spec.onFrame) spec.onFrame({ s, c });
  for (const r of raw) for (let i = 0; i < r.pos.length; i += 3) for (let k = 0; k < 3; k++) r.pos[i + k] = (r.pos[i + k] - c[k]) * s;
  // group by material
  const groups = new Map();
  for (const r of raw) {
    const sm = r.sm, alpha = sm.alpha !== 'OPAQUE';
    const img = sm.tex && r.uv ? bakeImage(sm.tex, texMax, alpha || /\.png$/i.test(sm.tex) && spec.pngAlpha) : null;
    const em = sm.emTex && r.uv ? bakeImage(sm.emTex, texMax, false) : null;
    const key = [sm.name, img ? sm.tex : '', em ? sm.emTex : '', sm.alpha, sm.color.join()].join('|');
    let mat = matOut.findIndex(m => m.key === key);
    if (mat < 0) {
      const imgIndex = (b) => { if (!b) return -1; let i = imgOut.indexOf(b); if (i < 0) { imgOut.push(b); i = imgOut.length - 1; } return i; };
      matOut.push({ key, name: sm.name, color: sm.color, tex: imgIndex(img), emissive: em ? [1, 1, 1] : sm.emissive, emTex: imgIndex(em), alpha: sm.alpha, cutoff: sm.cutoff, double: sm.double || alpha, wrap: sm.wrap });
      mat = matOut.length - 1;
    }
    let g = groups.get(mat); if (!g) groups.set(mat, g = { pos: [], nor: [], uv: [], idx: [], hasUV: !!(img || em), n: 0 });
    const base = g.n;
    for (let i = 0; i < r.pos.length; i++) { g.pos.push(r.pos[i]); g.nor.push(r.nor[i]); }
    if (g.hasUV) for (let i = 0; i < r.pos.length / 3; i++) { g.uv.push(r.uv ? r.uv[i * 2] : 0, r.uv ? r.uv[i * 2 + 1] : 0); }
    for (const t of r.tri) g.idx.push(t + base);
    g.n += r.pos.length / 3;
  }
  const out = [];
  let tris = 0;
  for (const [mat, g] of groups) {
    // flat-shaded pieces without normals get face normals
    const pos = Float32Array.from(g.pos), nor = Float32Array.from(g.nor);
    tris += g.idx.length / 3;
    out.push({ pos, nor, uv: g.hasUV ? Float32Array.from(g.uv) : null, idx: g.n > 65535 ? Uint32Array.from(g.idx) : Uint16Array.from(g.idx), mat });
  }
  const size = [(mx[0] - mn[0]) * s, (mx[1] - mn[1]) * s, (mx[2] - mn[2]) * s];
  return { prims: out, size, tris };
}

// nodes by name (exact, or /regex/) or index
export function findNodes(G, sel) {
  const list = Array.isArray(sel) ? sel : [sel];
  const out = [];
  for (const s of list) {
    if (typeof s === 'number') { out.push(s); continue; }
    if (s.startsWith('/')) { const re = new RegExp(s.slice(1, -1)); G.json.nodes.forEach((n, i) => { if (re.test(n.name || '')) out.push(i); }); continue; }
    const i = G.json.nodes.findIndex(n => n.name === s);
    if (i < 0) throw new Error(`node "${s}" not found in ${G.dir}`);
    out.push(i);
  }
  return out;
}

// the node whose children are the pack's separate pieces (skip single-child wrappers)
export function container(G) {
  let i = G.json.scenes[G.json.scene || 0].nodes[0];
  for (;;) { const n = G.json.nodes[i]; if ((n.children || []).length === 1 && n.mesh === undefined) i = n.children[0]; else return i; }
}

// ---------- auto split (for browsing) ----------
const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN && AUTO) {
  const outDir = path.join(CACHE, 'auto'); fs.mkdirSync(outDir, { recursive: true });
  const SKIP = /mustang|japanese_low-poly_sports|nissan|porsche|testarossa|gt1|hearse|iphone|microwave|vhs|taco|fat_joint|smoking|concrete_barriers\(1\)/;
  const zips = fs.readdirSync(SRC).filter(f => f.endsWith('.zip') && !SKIP.test(f)).map(f => f.slice(0, -4));
  const index = [];
  for (const pack of zips) {
    let G; try { G = loadGltf(packDir(pack)); } catch (e) { console.warn('skip', pack, e.message); continue; }
    const { W } = worldMatrices(G.json);
    const cont = container(G), kids = G.json.nodes[cont].children || [cont];
    const meshes = [], mats = [], imgs = [], info = [];
    for (const k of kids.slice(0, 160)) {
      const p = bakePiece(G, W, [k], { keepY: false }, mats, imgs, 128);
      if (!p) continue;
      const name = `${k}_${(G.json.nodes[k].name || '').replace(/[^\w.-]/g, '')}`;
      meshes.push({ name, prims: p.prims }); info.push({ name, size: p.size.map(v => +v.toFixed(2)), tris: p.tris });
    }
    if (!meshes.length) continue;
    writeGlb(path.join(outDir, pack + '.glb'), meshes, mats, imgs);
    index.push({ pack, pieces: info });
    console.log(pack.padEnd(48), meshes.length, 'pieces');
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  process.exit(0);
}

// ---------- full bake from the manifest ----------
if (MAIN) {
const { PACKS, ASSETS } = await import('./manifest.mjs');
const outDir = path.join(ROOT, 'assets', 'env');
fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
const catalog = { packs: {}, assets: [] };
const byPack = new Map();
for (const a of ASSETS) { if (!byPack.has(a.pack)) byPack.set(a.pack, []); byPack.get(a.pack).push(a); }
let total = 0;
for (const [pack, list] of byPack) {
  const P = PACKS[pack]; if (!P) throw new Error('pack not in PACKS: ' + pack);
  // packs of loose .glb files (P.dir: folder in SRC; asset.file: the .glb in it) or one Sketchfab scene.gltf
  const scenes = new Map();
  const sceneOf = (a) => {
    const key = a.file || '';
    if (!scenes.has(key)) { const G = a.file ? loadGlb(path.join(SRC, P.dir || pack, a.file), path.join(CACHE, 'glb', pack)) : loadGltf(packDir(pack)); scenes.set(key, { G, W: worldMatrices(G.json).W }); }
    return scenes.get(key);
  };
  if (P.credit) catalog.packs[pack] = P.credit;
  else {
    const lic = fs.readFileSync(path.join(sceneOf(list[0]).G.dir, 'license.txt'), 'utf8');
    const grab = (k) => (lic.match(new RegExp('\\* ' + k + ':\\s*(.+)')) || [])[1]?.trim() || '';
    catalog.packs[pack] = { title: grab('title'), author: grab('author'), license: grab('license type'), source: grab('source') };
  }
  const meshes = [], mats = [], imgs = [], seen = new Map();
  for (const a of list) {
    const { G, W } = sceneOf(a);
    const p = bakePiece(G, W, a.node === undefined ? G.json.scenes[G.json.scene || 0].nodes : findNodes(G, a.node), a, mats, imgs, a.tex || P.tex || 256);
    if (!p) { console.warn('empty', a.id); continue; }
    // the same model placed several times in a pack: keep one
    const sig = p.tris + ':' + p.size.map(v => v.toFixed(2)).join(',') + ':' + p.prims.map(q => mats[q.mat].key + (q.uv ? q.uv.reduce((a, v, i) => a + v * ((i % 7) + 1), 0).toFixed(3) : '')).join(';');
    if (seen.has(sig)) { console.log('  duplicate of', seen.get(sig) + ':', a.id); continue; }
    seen.set(sig, a.id);
    meshes.push({ name: a.id, prims: p.prims });
    const { pack: _p, node: _n, file: _f, scale: _s, yaw: _y, targetH: _t, drop: _d, tex: _x, skipMats: _m, pngAlpha: _pa, keepY: _k, ...meta } = a;
    catalog.assets.push({ ...meta, pack, w: +p.size[0].toFixed(2), h: +p.size[1].toFixed(2), d: +p.size[2].toFixed(2), tris: p.tris });
  }
  const file = path.join(outDir, pack + '.glb');
  writeGlb(file, meshes, mats, imgs);
  const kb = fs.statSync(file).size / 1024; total += kb;
  console.log(pack.padEnd(46), String(meshes.length).padStart(3), 'assets', kb.toFixed(0).padStart(6), 'KB');
}
fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 1));
console.log(`total ${(total / 1024).toFixed(1)} MB, ${catalog.assets.length} assets`);
// the PSX houses come from their own pack (OBJ + shared textures): bakehouses.mjs
const { bakeHouses } = await import('./bakehouses.mjs');
bakeHouses();
}
