// Lists the objects in a glTF scene: top-level pieces with world-space size and triangle count.
// usage: node inspect.mjs <dir-with-scene.gltf> [depth]
import fs from 'fs';
import path from 'path';
const dir = process.argv[2], maxDepth = +(process.argv[3] || 3);
const g = JSON.parse(fs.readFileSync(path.join(dir, 'scene.gltf'), 'utf8'));
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const local = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const tp = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
function stats(ni, M, acc) {
  const n = g.nodes[ni], W = mul(M, local(n));
  if (n.mesh !== undefined) for (const pr of g.meshes[n.mesh].primitives) {
    const a = g.accessors[pr.attributes.POSITION];
    for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
      const p = tp(W, [cx, cy, cz]); for (let k = 0; k < 3; k++) { acc.min[k] = Math.min(acc.min[k], p[k]); acc.max[k] = Math.max(acc.max[k], p[k]); }
    }
    acc.tris += pr.indices !== undefined ? g.accessors[pr.indices].count / 3 : a.count / 3;
    acc.mats.add(pr.material);
  }
  for (const c of n.children || []) stats(c, W, acc);
  return acc;
}
function walk(ni, M, depth) {
  const n = g.nodes[ni], W = mul(M, local(n));
  const kids = n.children || [];
  const s = stats(ni, M, { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], tris: 0, mats: new Set() });
  const sz = s.max.map((v, k) => (v - s.min[k]).toFixed(1));
  console.log(`${'  '.repeat(depth)}[${ni}] ${n.name || ''}  size ${sz.join('x')}  at ${s.min.map((v, k) => ((v + s.max[k]) / 2).toFixed(0)).join(',')}  tris ${s.tris}  mats ${s.mats.size}  kids ${kids.length}`);
  if (depth < maxDepth && kids.length <= 80) for (const c of kids) walk(c, W, depth + 1);
}
for (const r of g.scenes[g.scene || 0].nodes) walk(r, I, 0);
