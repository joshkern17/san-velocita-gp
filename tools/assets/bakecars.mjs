// Bakes the downloaded Sketchfab car models into game-ready cars: models/cars/<id>.glb + models/cars/cars.json.
//
//   node tools/assets/bakecars.mjs
//
// Every car ends up in the same space as the F1 car: metres, +Y up, nose along +Z, left side +X, wheels on the
// ground at y = 0. Objects are named Body and Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR (js/roadcar.js reads them).
// Wheels are found by object name, or split out of the body when the model has them baked in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGltf, worldMatrices, writeGlb } from './gltf.mjs';
import { packDir, bakePiece, findNodes } from './bake.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC = process.env.ASSET_SRC || path.join(os.homedir(), 'Downloads', 'Racing Game Assets for claude');
const CACHE = process.env.ASSET_CACHE || path.join(os.tmpdir(), 'svgp-asset-cache');

// id, source zip, real length (m), yaw so the nose faces +Z, wheels: node names/regex, or split: nodes holding all 4
// wheels (split by corner), skip: nodes to leave out (flat fake shadows etc)
export const CAR_SOURCES = [
  { id: 'aventus', pack: 'ps1_gt1-style_model_-_1992_emery_aventus', L: 4.8, yaw: 0, wheels: '/^Wheel/', skip: '/^Shadow/' },
  { id: 'bx300', pack: 'ps1_gt1-style_model_-_1996_horai_bx300', L: 4.5, yaw: 0, wheels: '/^Wheel_/', skip: '/^Shadow/' },
  { id: 'rmx', pack: 'ps1-gt1-style-model-1994-kineto-rm-x', L: 4.4, yaw: 0, wheels: '/Wheel(FL|FR|RL|RR)$/', skip: '/Shadow|LightsUp|Light[LR]$/', nested: true,
    credit: { title: 'PS1 GT1-Style Model - 1994 Kineto RM-X', author: 'Aike (https://sketchfab.com/anathlyst)', license: 'SKETCHFAB Standard' } },
  { id: 'testarossa', pack: 'low_poly_ps1-syle_testarossa', L: 4.49, yaw: 0, split: ['Object_4'] },
  { id: 'jsport', pack: 'japanese_low-poly_sports_car', L: 4.45, yaw: 0, wheels: '/^Cylinder(\\.00\\d)?$/' },
  { id: 'rs964', pack: 'porsche_911_964_carrera_rs_club_sport', L: 4.25, yaw: 0, wheels: '/^Cylinder(\\.00\\d)?$/' },
  { id: 'mustang', pack: '2016_ford_mustang_gt_5.0', L: 4.78, yaw: 0, carve: true },
  { id: 'm5', pack: 'bmw_m5_e39_gt2psx_style', L: 4.78, yaw: 180, wheels: '/^WHEEL_(FL|FR|BL|BR)$/' },
  { id: 'transit', pack: 'ford_transit_1999', L: 4.8, yaw: 0, split: ['Object_5'] },
  { id: 'hearse', pack: 'psx_caprice_hearse', L: 5.6, yaw: 0, wheels: '/^Wheel/' },
];

// the RM-X ships its glTF inside a second zip, with texture names that don't match
function nestedDir(pack) {
  const dir = path.join(CACHE, 'src', pack);
  if (fs.existsSync(path.join(dir, 'scene.gltf'))) return dir;
  const tmp = path.join(CACHE, 'src', pack + '__outer'); fs.mkdirSync(tmp, { recursive: true });
  execFileSync('unzip', ['-oq', path.join(SRC, pack + '.zip'), '-d', tmp]);
  const inner = fs.readdirSync(path.join(tmp, 'source')).find(f => f.endsWith('.zip'));
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-oq', path.join(tmp, 'source', inner), '-d', dir]);
  const gltf = fs.readdirSync(dir).find(f => f.endsWith('.gltf'));
  fs.renameSync(path.join(dir, gltf), path.join(dir, 'scene.gltf'));
  for (const f of fs.readdirSync(path.join(tmp, 'textures'))) fs.copyFileSync(path.join(tmp, 'textures', f), path.join(dir, f.replace(/_[Ss]ilver/, '')));
  return dir;
}

// all mesh nodes below the scene (leaves only)
function meshNodes(G) {
  const out = [];
  G.json.nodes.forEach((n, i) => { if (n.mesh !== undefined) out.push(i); });
  return out;
}
const bbox = (prims) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.pos.length; i++) { const k = i % 3; mn[k] = Math.min(mn[k], p.pos[i]); mx[k] = Math.max(mx[k], p.pos[i]); }
  return { mn, mx, c: mn.map((v, k) => (v + mx[k]) / 2) };
};
const corner = (c) => (c[2] > 0 ? 'F' : 'R') + (c[0] > 0 ? 'L' : 'R');

// keep only the triangles for which keep(centroid) is true (vertices re-indexed)
function filterPrims(prims, keep) {
  const out = [];
  for (const p of prims) {
    const map = new Map(), pos = [], nor = [], uv = [], idx = [];
    for (let t = 0; t < p.idx.length; t += 3) {
      const ids = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
      const c = [0, 1, 2].map(k => (p.pos[ids[0] * 3 + k] + p.pos[ids[1] * 3 + k] + p.pos[ids[2] * 3 + k]) / 3);
      if (!keep(c, ids.map(i => [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]]))) continue;
      for (const i of ids) {
        if (!map.has(i)) {
          map.set(i, pos.length / 3);
          pos.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]); nor.push(p.nor[i * 3], p.nor[i * 3 + 1], p.nor[i * 3 + 2]);
          if (p.uv) uv.push(p.uv[i * 2], p.uv[i * 2 + 1]);
        }
        idx.push(map.get(i));
      }
    }
    if (idx.length) out.push({ pos: Float32Array.from(pos), nor: Float32Array.from(nor), uv: p.uv ? Float32Array.from(uv) : null, idx: pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), mat: p.mat });
  }
  return out;
}

const outDir = path.join(ROOT, 'models', 'cars');
fs.mkdirSync(outDir, { recursive: true });
const index = {};
const only = process.argv.slice(2);
for (const S of CAR_SOURCES) {
  if (only.length && !only.includes(S.id)) continue;
  const dir = S.nested ? nestedDir(S.pack) : packDir(S.pack);
  const G = loadGltf(dir), { W } = worldMatrices(G.json);
  const skip = new Set(S.skip ? findNodes(G, S.skip) : []);
  const all = meshNodes(G).filter(i => !skip.has(i) && !G.json.nodes[i].name?.match?.(/^$/));
  // wheel nodes (their mesh children count as wheel too)
  const wheelRoots = S.wheels ? findNodes(G, S.wheels) : [];
  const under = (i, roots) => { const parent = new Map(); G.json.nodes.forEach((n, p) => (n.children || []).forEach(c => parent.set(c, p))); for (let k = i; k !== undefined; k = parent.get(k)) if (roots.includes(k)) return k; return -1; };
  const wheelNodes = all.filter(i => under(i, wheelRoots) >= 0);
  const splitNodes = S.split ? findNodes(G, S.split) : [];
  const bodyNodes = all.filter(i => !wheelNodes.includes(i) && !splitNodes.includes(i));
  // one shared frame for every piece: scaled to the real length, centred, wheels on the ground
  let frame = null;
  const mats = [], imgs = [];
  bakePiece(G, W, all, { yaw: S.yaw, targetL: S.L, onFrame: (f) => { frame = f; } }, [], [], 16);
  const piece = (nodes) => bakePiece(G, W, nodes, { yaw: S.yaw, frame }, mats, imgs, 256);
  const meshes = [];
  let body = piece(bodyNodes).prims;
  // wheels
  const wheels = {};
  for (const r of wheelRoots) {
    const nodes = wheelNodes.filter(i => under(i, wheelRoots) === r);
    const p = piece(nodes); if (!p) continue;
    wheels[corner(bbox(p.prims).c)] = p.prims;
  }
  if (splitNodes.length) {
    const p = piece(splitNodes).prims;
    for (const k of ['FL', 'FR', 'RL', 'RR']) wheels[k] = filterPrims(p, (c) => corner(c) === k);
  }
  if (S.carve) {
    // wheels baked into a single mesh: take the low, outboard triangles inside each wheel arch
    const b = bbox(body), half = b.mx[0], len = b.mx[2] - b.mn[2];
    const isWheel = (c, vs) => vs.every(v => Math.abs(v[0]) > half - 0.26 && v[1] < 0.72 && Math.abs(Math.abs(v[2] - b.c[2]) - len * 0.3) < 0.42);
    const wp = filterPrims(body, isWheel);
    // the arch centres: from the carved triangles
    for (const k of ['FL', 'FR', 'RL', 'RR']) wheels[k] = filterPrims(wp, (c) => corner(c) === k);
    body = filterPrims(body, (c, vs) => !isWheel(c, vs));
  }
  // the ground is where the wheels touch
  let ground = 0;
  const wl = Object.values(wheels).filter(w => w && w.length);
  if (wl.length) ground = Math.min(...wl.map(w => bbox(w).mn[1]));
  const drop = (prims) => { for (const p of prims) for (let i = 1; i < p.pos.length; i += 3) p.pos[i] -= ground; return prims; };
  meshes.push({ name: 'Body', prims: drop(body) });
  for (const k of ['FL', 'FR', 'RL', 'RR']) if (wheels[k] && wheels[k].length) meshes.push({ name: 'Wheel_' + k, prims: drop(wheels[k]) });
  const file = path.join(outDir, S.id + '.glb');
  writeGlb(file, meshes, mats, imgs);
  const lic = fs.existsSync(path.join(dir, 'license.txt')) ? fs.readFileSync(path.join(dir, 'license.txt'), 'utf8') : '';
  const grab = (k) => (lic.match(new RegExp('\\* ' + k + ':\\s*(.+)')) || [])[1]?.trim() || '';
  const bb = bbox(body);
  index[S.id] = { title: grab('title') || S.pack, author: grab('author'), license: grab('license type') || 'Sketchfab Standard', source: grab('source'), ...(S.credit || {}), wheels: Object.keys(wheels).filter(k => wheels[k]?.length), size: [bb.mx[0] - bb.mn[0], bb.mx[1] - bb.mn[1], bb.mx[2] - bb.mn[2]].map(v => +v.toFixed(2)) };
  console.log(S.id.padEnd(12), (fs.statSync(file).size / 1024).toFixed(0).padStart(5), 'KB  wheels', index[S.id].wheels.join(',') || '-', ' size', index[S.id].size.join('x'));
}
const idxFile = path.join(outDir, 'cars.json');
const prev = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : {};
fs.writeFileSync(idxFile, JSON.stringify({ ...prev, ...index }, null, 1));
