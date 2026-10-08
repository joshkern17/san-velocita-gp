// Bakes the PSX Houses pack (postdev) into assets/env/psx_houses.glb and adds it to catalog.json.
//
//   node tools/assets/bakehouses.mjs        (bake.mjs runs this too, after a full bake)
//
// Source: ~/Downloads/PSX_Houses_100 (or set HOUSE_SRC). The pack is 10 house shapes x 10 wall / roof texture
// combos; only the shapes are baked (House_1_<shape>.obj), plus every wall and roof texture as its own tiny
// "swatch" mesh. The game swaps a house's wall / roof material at load time (envlib.js houseParts), so any shape
// can wear any wall, any roof and a paint colour without storing 100 models.
// Each house is in its own space like every other scenery model: metres, +Y up, front door facing +Z, centred on
// x/z with its base at y = 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeGlb } from './gltf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = process.env.HOUSE_SRC || path.join(os.homedir(), 'Downloads', 'PSX_Houses_100');
const CACHE = path.join(process.env.ASSET_CACHE || path.join(os.tmpdir(), 'svgp-asset-cache'), 'houses');
// (the pack's front doors already face +Z)
const YAW = Number(process.env.HOUSE_YAW ?? 0);
const SCALE = 0.92; // (the doors are 2.45 m in the source: a touch big next to the cars)
export const N_WALLS = 6, N_ROOFS = 6;

function jpeg(file, max) {
  fs.mkdirSync(CACHE, { recursive: true });
  const out = path.join(CACHE, path.basename(file).replace(/\.\w+$/, '') + '_' + max + '.jpg');
  if (!fs.existsSync(out)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '84', '-Z', String(max), file, '--out', out], { stdio: 'ignore' });
  return { mime: 'image/jpeg', bytes: fs.readFileSync(out) };
}

function readObj(file) {
  const V = [], VT = [], VN = [], groups = new Map();
  let mat = 'default';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim().split(/\s+/);
    if (s[0] === 'v') V.push(s.slice(1, 4).map(Number));
    else if (s[0] === 'vt') VT.push(s.slice(1, 3).map(Number));
    else if (s[0] === 'vn') VN.push(s.slice(1, 4).map(Number));
    else if (s[0] === 'usemtl') mat = s[1];
    else if (s[0] === 'f') {
      if (!groups.has(mat)) groups.set(mat, []);
      const idx = s.slice(1).map(t => t.split('/').map(n => (n ? parseInt(n, 10) : 0)));
      for (let k = 1; k + 1 < idx.length; k++) groups.get(mat).push([idx[0], idx[k], idx[k + 1]]); // fan
    }
  }
  return { V, VT, VN, groups };
}

export function bakeHouses() {
  if (!fs.existsSync(path.join(SRC, 'OBJ'))) { console.warn('psx houses: source not found at', SRC, '(set HOUSE_SRC) - skipped'); return false; }
  const imgs = [], mats = [], matIdx = new Map();
  const tex = (sub, name, max) => { imgs.push(jpeg(path.join(SRC, 'Textures', sub, name + '.png'), max)); return imgs.length - 1; };
  const addMat = (name, img) => { mats.push({ name, color: [1, 1, 1, 1], tex: img, emissive: [0, 0, 0], emTex: -1, alpha: 'OPAQUE', double: false, wrap: [10497, 10497] }); matIdx.set(name, mats.length - 1); };
  addMat('Atlas', tex('Atlas', 'Atlas_1', 512));
  for (let i = 1; i <= N_WALLS; i++) addMat('Wall_' + i, tex('Wall', 'Wall_' + i, 256));
  for (let i = 1; i <= N_ROOFS; i++) addMat('Roof_' + i, tex('Roof', 'Roof_' + i, 256));

  const meshes = [], assets = [];
  const yaw = YAW * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let shape = 1; shape <= 10; shape++) {
    const { V, VT, VN, groups } = readObj(path.join(SRC, 'OBJ', `House_1_${shape}.obj`));
    // bounds after the yaw, to centre it
    const P = V.map(([x, y, z]) => [x * cy + z * sy, y, -x * sy + z * cy]);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of P) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    const c = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
    const prims = [];
    let tris = 0;
    for (const [mname, faces] of groups) {
      const mat = matIdx.get(mname); if (mat === undefined) throw new Error('unknown material ' + mname);
      const pos = [], nor = [], uv = [];
      for (const f of faces) for (const [vi, ti, ni] of f) {
        const p = P[vi - 1]; pos.push((p[0] - c[0]) * SCALE, (p[1] - c[1]) * SCALE, (p[2] - c[2]) * SCALE);
        const n = ni ? VN[ni - 1] : [0, 1, 0]; nor.push(n[0] * cy + n[2] * sy, n[1], -n[0] * sy + n[2] * cy);
        const t = ti ? VT[ti - 1] : [0, 0]; uv.push(t[0], 1 - t[1]);
      }
      const nv = pos.length / 3; tris += nv / 3;
      prims.push({ pos: Float32Array.from(pos), nor: Float32Array.from(nor), uv: Float32Array.from(uv), idx: Uint16Array.from({ length: nv }, (_, i) => i), mat });
    }
    const id = 'psxh_' + shape;
    meshes.push({ name: id, prims });
    const size = [(mx[0] - mn[0]) * SCALE, (mx[1] - mn[1]) * SCALE, (mx[2] - mn[2]) * SCALE];
    assets.push({ cat: 'building', cls: 'house', tags: ['town', 'suburb', 'country', 'city'], id, pack: 'psx_houses', w: +size[0].toFixed(2), h: +size[1].toFixed(2), d: +size[2].toFixed(2), tris, w8: 1, paint: 1 });
  }
  // swatches: one tiny triangle per wall / roof material, so the game has every texture to swap in
  const sw = (name) => meshes.push({ name: '_psxh_' + name.toLowerCase(), prims: [{ pos: Float32Array.of(0, 0, 0, 0.01, 0, 0, 0, 0.01, 0), nor: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1), uv: Float32Array.of(0, 0, 1, 0, 0, 1), idx: Uint16Array.of(0, 1, 2), mat: matIdx.get(name) }] });
  for (let i = 1; i <= N_WALLS; i++) sw('Wall_' + i);
  for (let i = 1; i <= N_ROOFS; i++) sw('Roof_' + i);

  const outDir = path.join(ROOT, 'assets', 'env');
  const file = path.join(outDir, 'psx_houses.glb');
  writeGlb(file, meshes, mats, imgs);
  // into the catalogue (replacing an earlier bake of it)
  const catFile = path.join(outDir, 'catalog.json');
  const cat = JSON.parse(fs.readFileSync(catFile, 'utf8'));
  cat.packs.psx_houses = { title: 'PSX Houses 100', author: 'postdev', license: 'Free for use in commercial and non-commercial games; not to be resold or redistributed as an asset', source: '' };
  cat.assets = cat.assets.filter(a => a.pack !== 'psx_houses').concat(assets.map(({ w8, ...a }) => a));
  fs.writeFileSync(catFile, JSON.stringify(cat, null, 1));
  console.log('psx_houses'.padEnd(46), String(assets.length).padStart(3), 'assets', (fs.statSync(file).size / 1024).toFixed(0).padStart(6), 'KB');
  return true;
}

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN) bakeHouses();
