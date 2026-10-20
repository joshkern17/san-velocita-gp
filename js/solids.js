// What stands solid on the ground around a circuit (buildings, stands, trackside structures, a circuit's
// landmarks) as convex outlines, and how far a tree reaches into one. The world keeps trees out of them
// (world.js), and the Track Check finds any that got in (tools/tracks/checklib.js), by the same measure.
import { envAsset } from './envlib.js';

const SOLID_CATS = new Set(['building', 'landmark', 'trackside', 'skyline', 'vehicle']);
// (small trackside things a tree can stand beside or behind: no outline)
const SMALL_TRACKSIDE = new Set(['flag', 'lamppost', 'lamppost_plain', 'worklight', 'board', 'fence', 'festoon', 'tire_rack']);
export const OVERHEAD = new Set(['gantry', 'gantry_wide', 'start_gantry', 'arch', 'arch_balloons']); // (they span the road)

// a model's outline on the ground, as scenery.js modelFootprint lays it: local x along (cos, -sin) of its turn
export function rectPoly(x, z, ux, uz, hw, hd) {
  const fx = -uz, fz = ux;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + ux * u + fx * v, z + uz * u + fz * v]);
}

// placements: the world's model placements ({ id, x, z, rot, s / sx / sz, y }); footprints: building outlines
// ({ p: [[x, z]...] }); landmarks: a circuit's landmark footprints (track.landmarks.items: { key, kind, x, z, hw, hd,
// rot }). Returns { solids: [{ poly, kind, id, x, z, rot, y, a, lk, box }], trees: [{ x, z, r, id, k }], near(x0, x1,
// z0, z1) -> indices of solids whose box meets that one }
export function solidsAround(placements = [], footprints = [], landmarks = []) {
  const solids = [], trees = [];
  placements.forEach((p, k) => {
    const a = envAsset(p.id); if (!a) return;
    const sx = p.sx ?? p.s ?? 1, sz = p.sz ?? p.s ?? 1;
    if (a.cat === 'tree') { trees.push({ x: p.x, z: p.z, r: Math.max(a.w * sx, a.d * sz) / 2, id: p.id, k }); return; }
    if (!SOLID_CATS.has(a.cat) || (a.cat === 'trackside' && SMALL_TRACKSIDE.has(a.cls))) return;
    const stand = a.cat === 'trackside' && /^stand/.test(a.cls);
    // (a stand's outline: the seating, not the roof's overhang: 80% of its depth)
    solids.push({ poly: rectPoly(p.x, p.z, Math.cos(p.rot || 0), -Math.sin(p.rot || 0), a.w * sx / 2, a.d * sz / 2 * (stand ? 0.8 : 1)), kind: stand ? 'stand' : a.cat, id: p.id, x: p.x, z: p.z, rot: p.rot || 0, y: p.y, a });
  });
  for (const b of footprints) if (b && b.p && b.p.length >= 3) {
    const c = b.p.reduce((s, q) => [s[0] + q[0] / b.p.length, s[1] + q[1] / b.p.length], [0, 0]);
    solids.push({ poly: b.p, kind: 'building', id: 'footprint', x: c[0], z: c[1] });
  }
  for (const L of landmarks) {
    const c = Math.cos(L.rot || 0), s = Math.sin(L.rot || 0);
    solids.push({ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [L.x + c * u * L.hw - s * v * L.hd, L.z + s * u * L.hw + c * v * L.hd]), kind: 'landmark', lk: L.kind, id: L.key, x: L.x, z: L.z });
  }
  // a grid of them, 32 m cells
  const G = new Map(), cell = 32, key = (cx, cz) => cx + ',' + cz;
  solids.forEach((S, k) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of S.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    S.box = [x0, x1, z0, z1];
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
      const kk = key(cx, cz); if (!G.has(kk)) G.set(kk, []); G.get(kk).push(k);
    }
  });
  const near = (x0, x1, z0, z1) => {
    const out = new Set();
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) for (const k of G.get(key(cx, cz)) || []) out.add(k);
    return out;
  };
  return { solids, trees, near };
}

// signed distance from a point to a convex outline (negative inside: how deep)
export function sdPoly(poly, x, z) {
  let inside = true, best = Infinity, area = 0; const n = poly.length;
  for (let k = 0; k < n; k++) { const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % n]; area += ax * bz - bx * az; }
  const sgn = area > 0 ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % n], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    best = Math.min(best, Math.hypot(x - ax - ex * u, z - az - ez * u));
    if (sgn * (ex * (z - az) - ez * (x - ax)) < 0) inside = false;
  }
  return inside ? -best : best;
}

// how far two convex outlines overlap (0 if apart): the smallest push that parts them (separating axes)
export function overlap(A, B) {
  let least = Infinity;
  for (const poly of [A, B]) for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length], l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l, nz = (bx - ax) / l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const p = x * nx + z * nz; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of B) { const p = x * nx + z * nz; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return 0; least = Math.min(least, o);
  }
  return least;
}

// how far a tree (trunk at x, z; crown radius r) gets into the solids: 99 with its trunk inside one (a trunk
// counts as 0.5 m across), else how far its crown (70% of the model's width: the leaves thin out) reaches in, and
// which solid. A tree is in the way past 1.5 m (TREE_INTO).
export const TREE_INTO = 1.5;
export function treeInto(S, x, z, r) {
  const canopy = r * 0.7; let worst = 0, by = null;
  for (const k of S.near(x - canopy, x + canopy, z - canopy, z + canopy)) {
    const d = sdPoly(S.solids[k].poly, x, z), pen = d < 0.5 ? 99 : canopy - d;
    if (pen > worst) { worst = pen; by = S.solids[k]; }
  }
  return [worst, by];
}
