// Pit boxes: the garages along the pit lane are real rooms. Each team's box (pit.boxes) has an open door, a floor,
// walls, a ceiling with strip lights; the rest of the garage block has its shutters down.
//
//   buildPitBoxes(root, T, A, pit, { mat })      // js/world.js: the block's front, the empty rooms (any view)
//   pitCovered(T, A, pit)                        // -> (i, j) => true where the block's front is built here
//   boxFrame(T, A, pit, k)                       // box k's frame: { P(x, z, y), x0, x1, dw, n } (null: no room)
//   dressBox(T, A, pit, k, team, { name })       // js/pitlife.js: a team's things in box k (a Group)
//   shutBox(T, A, pit, k, mat)                   // js/pitlife.js: box k's shutter down (no team in it)
//
// Inside is lit by its own strip lights, the same day or night: the light is baked into vertex colors (unlit
// materials, PSX style), so twelve rooms cost no real lights. Each room is laid out in its own frame (x along its
// front, 0 in the middle; z in from the front; y up from the lane) and is straight: its front is a chord of the
// garage line, so a bending pit lane gets a row of straight garages, like a real one.
import * as THREE from 'three';
import { envModel } from './envlib.js';

export const BOX = { doorW: 11, doorH: 4.0, depth: 14, ceil: 4.6, frontT: 0.4, wallIn: 0.15, hgt: 7.5, pitch: 15, floor: 0.06 };
// (floor: the garages' floor, a step up from the lane: level with it, the lane's tarmac run in under the doors fought it)

// The garage line (the block's front, along the main stretch) as a polyline with its length along it, and what's
// built along it: a room for each box, centred on its car's spot (as wide as the boxes' spacing lets it, 12-16 m),
// shut garages in the gaps and on to the block's ends, and plain wall where there's no room for one.
const _slots = new WeakMap();
export function pitSlots(T, A, pit) {
  if (_slots.has(pit)) return _slots.get(pit);
  const N = T.N, byReg = [], sd = pit.side;
  for (let i = 0; i < N; i++) if (pit.REG[i] >= 0) byReg[pit.REG[i]] = i;
  const isMain = (i) => pit.MAIN ? !!pit.MAIN[i] : !isNaN(pit.WALL[i]);
  let rMin = Infinity, rMax = -Infinity;
  byReg.forEach((i, r) => { if (i !== undefined && isMain(i)) { rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); } });
  const out = { byReg, rMin, rMax, G: [], S: [], slots: [], walls: [], isMain };
  const B = pit.boxes || [];
  if (!B.length || !(rMax > rMin)) { _slots.set(pit, out); return out; }
  // the line: a point per sample, y the lane's height there
  for (let r = rMin; r <= rMax; r++) {
    const i = byReg[r], f = pit.CEN[i] + pit.width / 2 + 0.6;
    out.G.push([T.X[i] + T.RX[i] * f * sd, T.Y[i] + sd * T.W[i] / 2 * Math.sin(T.B[i]) + A.LIFT[i] + 0.02, T.Z[i] + T.RZ[i] * f * sd]);
    const n = out.G.length;
    out.S.push(n === 1 ? 0 : out.S[n - 2] + Math.hypot(out.G[n - 1][0] - out.G[n - 2][0], out.G[n - 1][2] - out.G[n - 2][2]));
  }
  const Send = out.S[out.S.length - 1], sOf = (i) => out.S[pit.REG[i] - rMin];
  const c = B.map(sOf);
  const half = c.map((x, k) => {
    const gaps = [k > 0 ? x - c[k - 1] : Infinity, k < c.length - 1 ? c[k + 1] - x : Infinity].filter(isFinite);
    return Math.max(6, Math.min(8, (gaps.length ? Math.min(...gaps) : 16) / 2));
  });
  // (fill s0..s1: as many shut garages as fit, 12 m or more each, else wall)
  const fill = (s0, s1, from) => {
    const len = s1 - s0, n = Math.floor(len / 12);
    if (n < 1) { if (len > 0.05) out.walls.push({ s0, s1 }); return; }
    const w = Math.min(16, len / n), used = w * n;
    // (the shut ones next to the boxes, the wall at the block's end)
    let a = from === 'end' ? s0 : s1 - used;
    if (from === 'end' && used < len) out.walls.push({ s0: s0 + used, s1 });
    if (from === 'start' && used < len) out.walls.push({ s0, s1: s1 - used });
    if (from === 'mid' && used < len) { a = s0 + (len - used) / 2; out.walls.push({ s0, s1: a }, { s0: a + used, s1 }); }
    for (let q = 0; q < n; q++) out.slots.push({ s0: a + q * w, s1: a + (q + 1) * w, k: -1 });
  };
  let at = 0;
  c.forEach((x, k) => {
    const s0 = Math.max(0, x - half[k]), s1 = Math.min(Send, x + half[k]);
    if (s1 - s0 < 10) return; // (no room for it here: the block's end)
    fill(at, s0, k === 0 ? 'start' : 'mid');
    out.slots.push({ s0, s1, k });
    at = s1;
  });
  fill(at, Send, 'end');
  out.slots.sort((p, q) => p.s0 - q.s0);
  _slots.set(pit, out);
  return out;
}
// the point on the garage line s m along it
function lineAt(L, s) {
  const { G, S } = L;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const f = Math.max(0, Math.min(1, (s - S[lo]) / ((S[hi] - S[lo]) || 1)));
  return [G[lo][0] + (G[hi][0] - G[lo][0]) * f, G[lo][1] + (G[hi][1] - G[lo][1]) * f, G[lo][2] + (G[hi][2] - G[lo][2]) * f];
}
// js/world.js leaves the facade out wherever it's built here (along the main stretch)
export function pitCovered(T, A, pit) {
  const L = pitSlots(T, A, pit);
  return (i, j) => L.slots.length > 0 && L.isMain(i) && L.isMain(j);
}

export function boxFrame(T, A, pit, k) {
  const slot = pitSlots(T, A, pit).slots.find(s => s.k === k);
  return slot ? frameOf(T, A, pit, slot) : null;
}
// a slot's frame: P(x, z, y) -> world position; n: the way in (x, z)
function frameOf(T, A, pit, slot) {
  const L = pitSlots(T, A, pit), sd = pit.side;
  const pa = lineAt(L, slot.s0), pb = lineAt(L, slot.s1), ic = L.byReg[L.rMin + Math.min(L.S.length - 1, L.S.findIndex(x => x >= (slot.s0 + slot.s1) / 2))];
  const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) || 1, tx = (pb[0] - pa[0]) / len, tz = (pb[2] - pa[2]) / len;
  let nx = -tz, nz = tx; if (nx * T.RX[ic] * sd + nz * T.RZ[ic] * sd < 0) { nx = -nx; nz = -nz; } // (in: away from the track)
  const x0 = -len / 2, x1 = len / 2;
  const P = (x, z, y) => {
    const f = (x - x0) / len;
    return [pa[0] + (pb[0] - pa[0]) * f + nx * z, pa[1] + (pb[1] - pa[1]) * f + y, pa[2] + (pb[2] - pa[2]) * f + nz * z];
  };
  // (whether x runs to the right of someone stood in the door looking in: the lane's side and direction decide it)
  const right = -nz * tx + nx * tz;
  return { P, x0, x1, slot, n: [nx, nz], dw: Math.min(BOX.doorW, len - 3) / 2, wx: len / 2 - BOX.wallIn, mirror: right < 0 };
}

// is x, z (the world) in the garage block, its rooms (r: that much round it too)? null: no garages. js/world.js keeps
// the scenery (trees, stands, boards, props) out of them: they used to be a front with nothing behind it. y: only
// below the rooms' ceilings counts
export function pitBlockTest(T, A, pit) {
  if (!pit) return null;
  const L = pitSlots(T, A, pit); if (!L.slots.length) return null;
  const frs = L.slots.map(s => { const F = frameOf(T, A, pit, s), o = F.P(0, 0, 0), t = F.P(1, 0, 0); return { F, o, tx: t[0] - o[0], tz: t[2] - o[2] }; });
  return (x, z, r = 0, y = null) => frs.some(({ F, o, tx, tz }) => {
    const dx = x - o[0], dz = z - o[2], lx = dx * tx + dz * tz, lz = dx * F.n[0] + dz * F.n[1];
    return lx > F.x0 - r && lx < F.x1 + r && lz > -r && lz < BOX.depth + 0.6 + r && (y == null || y < F.P(lx - F.x0 + F.x0, lz, 0)[1] + BOX.ceil);
  });
}

// the garage block's floor under x, z (the world): { y: the floor's height there, d: how far outside the block's
// footprint x, z is, 0 inside }, from the nearest room; null: no garages, or more than `reach` m from them.
// js/world.js tucks the ground under it: on a site rising away from the lane the terrain came up through the floors
export function pitBlockFloor(T, A, pit, reach = 30) {
  if (!pit) return null;
  const L = pitSlots(T, A, pit); if (!L.slots.length) return null;
  const frs = L.slots.map(s => { const F = frameOf(T, A, pit, s), o = F.P(0, 0, 0), t = F.P(1, 0, 0); return { F, o, tx: t[0] - o[0], tz: t[2] - o[2] }; });
  // (the box round every room, `reach` out: anything outside it is further than that from all of them. The world
  // asks this for every grid cell, near the garages or not)
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const { F } of frs) for (const [u, v] of [[F.x0, 0], [F.x1, 0], [F.x0, BOX.depth + 0.6], [F.x1, BOX.depth + 0.6]]) {
    const p = F.P(u, v, 0); bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[2]); bz1 = Math.max(bz1, p[2]);
  }
  bx0 -= reach + 1; bx1 += reach + 1; bz0 -= reach + 1; bz1 += reach + 1;
  return (x, z) => {
    if (x < bx0 || x > bx1 || z < bz0 || z > bz1) return null;
    let best = null;
    for (const { F, o, tx, tz } of frs) {
      const dx = x - o[0], dz = z - o[2], lx = dx * tx + dz * tz, lz = dx * F.n[0] + dz * F.n[1];
      const ex = Math.max(F.x0 - lx, 0, lx - F.x1), ez = Math.max(-lz, 0, lz - BOX.depth - 0.6), d = Math.hypot(ex, ez);
      if (d > reach || (best && d >= best.d)) continue;
      best = { y: F.P(Math.max(F.x0, Math.min(F.x1, lx)), Math.max(0, Math.min(BOX.depth, lz)), BOX.floor)[1], d };
    }
    return best;
  };
}

// ---------- the light inside: three rows of strip lights across the room, a little daylight in at the door ----------
const ROWS = [3.2, 7.2, 11.2], LX = 5;
export function lightAt(x, z, y, n) {
  let L = 0.42;
  const ly = BOX.ceil - 0.12;
  for (const lz of ROWS) {
    const qx = Math.max(-LX, Math.min(LX, x)), dx = qx - x, dy = ly - y, dz = lz - z;
    const d = Math.hypot(dx, dy, dz) || 1e-3, cos = Math.max(0, (dx * n[0] + dz * n[1] + dy * n[2]) / d);
    L += 0.72 * cos / (1 + d * d * 0.11);
  }
  L += 0.16 * Math.max(0, 1 - z / 7) * (n[1] < -0.5 ? 1.4 : 1); // (the door: most on things facing it)
  return Math.min(1.12, L);
}

// a mesh builder in a box's frame: vertex colors with the light baked in
class Build {
  constructor(F, lit = true) { this.F = F; this.lit = lit; this.p = []; this.c = []; this.uv = []; }
  // a quad o, o+u, o+u+v, o+v (local [x, z, y]), n its normal (local [x, z, y]), cut into cells for the light
  quad(o, u, v, col, n, cells = 1.6, uvs = null) {
    const nu = Math.max(1, Math.ceil(Math.hypot(...u) / cells)), nv = Math.max(1, Math.ceil(Math.hypot(...v) / cells));
    const C = new THREE.Color(col);
    const at = (a, b) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
      const a0 = iu / nu, a1 = (iu + 1) / nu, b0 = iv / nv, b1 = (iv + 1) / nv;
      for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]]) {
        const q = at(a, b), w = this.F.P(q[0], q[1], q[2]), L = this.lit ? lightAt(q[0], q[1], q[2], n) : 1;
        this.p.push(...w); this.c.push(C.r * L, C.g * L, C.b * L);
        if (uvs) this.uv.push(uvs[0] + (uvs[1] - uvs[0]) * a, uvs[2] + (uvs[3] - uvs[2]) * b);
      }
    }
  }
  // a box, x0..x1 along, z0..z1 in, y0..y1 up (no bottom)
  box(x0, x1, z0, z1, y0, y1, col, cells = 2) {
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
    this.quad([x0, z0, y1], [dx, 0, 0], [0, dz, 0], col, [0, 0, 1], cells);       // top
    this.quad([x0, z0, y0], [dx, 0, 0], [0, 0, dy], col, [0, -1, 0], cells);      // front (towards the door)
    this.quad([x0, z1, y0], [dx, 0, 0], [0, 0, dy], col, [0, 1, 0], cells);       // back
    this.quad([x0, z0, y0], [0, dz, 0], [0, 0, dy], col, [-1, 0, 0], cells);      // left
    this.quad([x1, z0, y0], [0, dz, 0], [0, 0, dy], col, [1, 0, 0], cells);       // right
  }
  // an upright prism round (cx, cz), r, `sides` sides, y0..y1, with a top
  prism(cx, cz, r, y0, y1, col, sides = 8, top = col) {
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2, a1 = ((s + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
      this.quad([p0[0], p0[1], y0], [p1[0] - p0[0], p1[1] - p0[1], 0], [0, 0, y1 - y0], col, [Math.cos(am), Math.sin(am), 0], 9);
      this.tri([cx, cz, y1], [p0[0], p0[1], y1], [p1[0], p1[1], y1], top, [0, 0, 1]);
    }
  }
  tri(a, b, c, col, n) {
    const C = new THREE.Color(col);
    for (const q of [a, b, c]) {
      const w = this.F.P(q[0], q[1], q[2]), L = this.lit ? lightAt(q[0], q[1], q[2], n) : 1;
      this.p.push(...w); this.c.push(C.r * L, C.g * L, C.b * L);
    }
  }
  mesh(mat) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

const INSIDE = () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
// the rooms' surfaces: a team garage's pale epoxy floor, white composite wall panels and a tiled ceiling
// (tools/pit-textures.py), the PSX Industrial pack's dark metal skirting and hazard stripes (assets/textures; the
// light still baked into the vertex colors)
const texUrl = (n) => ((typeof window !== 'undefined' && window.__SVGP_TEXTURES) || {})[n] || `assets/textures/${n}.png`;
const TEX = {};
function surface(name) {
  if (typeof document === 'undefined') return INSIDE(); // (node: no images)
  const t = TEX[name] ||= new THREE.TextureLoader().load(texUrl(name));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return new THREE.MeshBasicMaterial({ map: t, vertexColors: true, side: THREE.DoubleSide });
}
const GLOW = () => new THREE.MeshBasicMaterial({ color: 0xf4f8ff, toneMapped: false });

// ---------- the block: fronts for every slot, rooms behind the boxes' open doors ----------
// mat: the facade's own material (js/world.js garageTexture: windows up top, a shutter in the door)
export function buildPitBoxes(root, T, A, pit, { mat, style = null, night = false } = {}) {
  const L = pitSlots(T, A, pit), { slots } = L;
  if (!slots.length) return null;
  const styled = style && pitStyleReady(style);
  // (shutters: the facade's paint, never its night glow: that's the lit garages it used to paint)
  const shutMat = mat && mat.emissiveMap ? Object.assign(mat.clone(), { emissiveMap: null, emissive: new THREE.Color(0) }) : mat;
  const g = new THREE.Group(); g.name = 'PitBoxes'; g.userData.mat = shutMat; // (js/pitlife.js shuts empty boxes with it)
  const front = { p: [], uv: [] }, shut = { p: [], uv: [] }, inside = [], glow = [];
  const { doorH, depth, ceil, frontT, hgt } = BOX, VD = 34 / 64; // (the facade's texture: its door painted in its bottom 34/64)
  const quad = (buf, a, b, c, d, u0, u1, v0, v1) => {
    buf.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  const up = (p, y) => [p[0], p[1] + y, p[2]];
  // a pit building style (tools/props/pitstyles.py): its modelled pieces along the line instead of the painted front
  if (styled) g.add(...styledFront(T, A, pit, L, style, night));
  // plain wall where there's no garage: windows up top as along the rest of the block, the wall's paint below
  if (!styled) for (const w of L.walls) {
    const pts = [w.s0, ...L.S.filter(x => x > w.s0 + 0.05 && x < w.s1 - 0.05), w.s1];
    for (let q = 0; q < pts.length - 1; q++) {
      const a = lineAt(L, pts[q]), b = lineAt(L, pts[q + 1]);
      quad(front, a, b, up(b, doorH), up(a, doorH), 0.02, 0.07, 0.05, 0.45);
      quad(front, up(a, doorH), up(b, doorH), up(b, hgt), up(a, hgt), pts[q] / 7.5, pts[q + 1] / 7.5, VD, 1);
    }
  }
  for (const s of slots) {
    const F = frameOf(T, A, pit, s), { x0, x1, dw, wx } = F, open = s.k >= 0, doorW = 2 * dw;
    const fq = (xa, xb, ya, yb, u0, u1, v0, v1, buf = front) => quad(buf, F.P(xa, 0, ya), F.P(xb, 0, ya), F.P(xb, 0, yb), F.P(xa, 0, yb), u0, u1, v0, v1);
    const U = (x) => (s.s0 + x - x0) / 7.5;
    if (!styled) {
      fq(x0, x1, doorH, hgt, U(x0), U(x1), VD, 1);                   // over the door: the windows and the roof band
      fq(x0, -dw, 0, doorH, 0.02, 0.07, 0.05, 0.45);                 // the pillars (plain wall)
      fq(dw, x1, 0, doorH, 0.02, 0.07, 0.05, 0.45);
    }
    if (!open) { fq(-dw, dw, 0, doorH, 6 / 64, 58 / 64, 0, VD - 0.01, shut); continue; } // shutter down
    const r = roomMeshes(F, s.k); inside.push(...r.inside); glow.push(r.glow);
  }
  for (const [buf, m] of [[front, mat], [shut, shutMat]]) {
    if (!buf.p.length || !m) continue;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    fg.computeVertexNormals();
    g.add(new THREE.Mesh(fg, m));
  }
  for (const m of [...inside, ...glow]) if (m) { m.matrixAutoUpdate = false; g.add(m); }
  root.add(g);
  return g;
}

// ---------- pit building styles ----------
// The pieces (assets/env/pitstyles.glb, ids ps_<style>_<bay|pier|endL|endR>) are made with the garage line at their
// origin, the lane's level at y = 0, their front (the lane side) to +z, a bay 14 m wide and a pier 1.5 m: here each bay
// is stretched over a garage (or a stretch of plain wall), a pier over the wall each side of its door, an end at each
// end of the block, all merged into one mesh a material.
export const PIT_STYLES = { classic: 'Classic', modern: 'Modern', heritage: 'Heritage', shed: 'Club Shed', terrace: 'Pit Grandstand' };
export const pitStyleReady = (style) => style && style !== 'classic' && !!envModel('ps_' + style + '_bay');
function styledFront(T, A, pit, L, style, night) {
  const byMat = new Map();
  // a piece into frame F: its x scaled by kx and moved to cx (frame x), its z (out of the front) into the room's in
  const place = (id, F, cx, kx) => {
    const parts = envModel(id); if (!parts) return;
    const o = F.P(0, 0, 0), ex = F.P(1, 0, 0).map((v, i) => v - o[i]), ez = F.P(0, 1, 0).map((v, i) => v - o[i]);
    const exl = Math.hypot(ex[0], ex[2]) || 1, ezl = Math.hypot(ez[0], ez[2]) || 1;
    for (const { geo, mat } of parts) {
      let B = byMat.get(mat); if (!B) byMat.set(mat, B = { p: [], n: [], uv: [], c: [] });
      const P = geo.getAttribute('position'), Nn = geo.getAttribute('normal'), U = geo.getAttribute('uv'), C = geo.getAttribute('color'), idx = geo.index;
      const n = idx ? idx.count : P.count;
      for (let q = 0; q < n; q++) {
        const i = idx ? idx.getX(q) : q;
        const w = F.P(cx + P.getX(i) * kx, -P.getZ(i), P.getY(i)); B.p.push(w[0], w[1], w[2]);
        const nx = Nn.getX(i) / kx, ny = Nn.getY(i), nz = -Nn.getZ(i);
        const vx = ex[0] / exl * nx + ez[0] / ezl * nz, vz = ex[2] / exl * nx + ez[2] / ezl * nz, l = Math.hypot(vx, ny, vz) || 1;
        B.n.push(vx / l, ny / l, vz / l);
        if (U) B.uv.push(U.getX(i), U.getY(i)); else B.uv.push(0, 0);
        if (C) B.c.push(C.getX(i), C.getY(i), C.getZ(i)); else B.c.push(1, 1, 1);
      }
    }
  };
  const bay = 'ps_' + style + '_bay', pier = 'ps_' + style + '_pier';
  const elems = [];
  for (const s of L.slots) {
    const F = frameOf(T, A, pit, s), w = F.x1 - F.x0;
    place(bay, F, 0, w / 14);
    const pw = F.x1 - F.dw; // (the wall each side of the door)
    place(pier, F, -(F.dw + pw / 2), pw / 1.5); place(pier, F, F.dw + pw / 2, pw / 1.5);
    elems.push({ F, s0: s.s0, s1: s.s1 });
  }
  for (const wl of L.walls) {
    if (wl.s1 - wl.s0 < 0.3) continue;
    const F = frameOf(T, A, pit, { s0: wl.s0, s1: wl.s1, k: -1 }), w = F.x1 - F.x0;
    place(bay, F, 0, w / 14); place(pier, F, 0, w / 1.5);
    elems.push({ F, s0: wl.s0, s1: wl.s1 });
  }
  elems.sort((a, b) => a.s0 - b.s0);
  if (elems.length) { const a = elems[0], b = elems[elems.length - 1]; place('ps_' + style + '_endL', a.F, a.F.x0, 1); place('ps_' + style + '_endR', b.F, b.F.x1, 1); }
  const out = [];
  for (const [mat, B] of byMat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    let m = mat;
    // at night the lamps and the lit floors glow (each its own copy: the library's material is shared)
    if (night && /LampLens/.test(mat.name)) { m = mat.clone(); m.emissive = new THREE.Color(0xfff0d0); m.emissiveIntensity = 1; }
    else if (night && /GS_Glass/.test(mat.name)) { m = mat.clone(); m.emissive = new THREE.Color(0x8a7450); m.emissiveIntensity = 0.7; }
    const mesh = new THREE.Mesh(geo, m); mesh.name = 'PitStyle'; mesh.castShadow = true; mesh.receiveShadow = true; out.push(mesh);
  }
  return out;
}

// a box's room (its floor, walls, ceiling and strip lights) in frame F; k: the box (on the meshes, for js/pitlife.js)
export function roomMeshes(F, k) {
  const { wx, dw } = F, doorW = 2 * dw, { doorH, depth, ceil, frontT } = BOX, inside = [];
  const B = new Build(F);
  // (the textured surfaces, each its own mesh: tiles of `tile` metres)
  const BF = new Build(F), BW = new Build(F), BS = new Build(F), BC = new Build(F), BH = new Build(F);
  const tq = (Bt, o, u, v, col, n, cells, tile) => Bt.quad(o, u, v, col, n, cells, [0, Math.hypot(...u) / tile, 0, Math.hypot(...v) / tile]);
  const FLOOR = 0xffffff, WALL = 0xffffff, SKIRT = 0x9a9ea4, CEIL = 0xf0f2f4;
  const fy = BOX.floor;
  tq(BF, [-wx, frontT, fy], [2 * wx, 0, 0], [0, depth - frontT, 0], FLOOR, [0, 0, 1], 1.2, 1.6);
  tq(BH, [-dw, 0, fy], [doorW, 0, 0], [0, frontT, 0], 0xffffff, [0, 0, 1], 1.2, 0.8);      // the sill: hazard stripes
  B.quad([-dw, 0, -0.04], [doorW, 0, 0], [0, 0, fy + 0.04], 0x55595f, [0, -1, 0], 1.5); // (its edge, down to the lane)
  for (const sx of [-1, 1]) {                                                            // the side walls
    const x = sx * wx, n = [-sx, 0, 0];
    tq(BS, [x, frontT, 0], [0, depth - frontT, 0], [0, 0, 0.25], SKIRT, n, 1.2, 1);
    tq(BW, [x, frontT, 0.25], [0, depth - frontT, 0], [0, 0, ceil - 0.25], WALL, n, 1.2, 2);
    // the door's reveal
    tq(BW, [sx * dw, 0, 0], [0, frontT, 0], [0, 0, doorH], WALL, [-sx, 0, 0], 1, 2);
    // inside the front, beside the door
    tq(BW, [sx * dw, frontT, 0], [sx * (wx - dw), 0, 0], [0, 0, ceil], WALL, [0, 1, 0], 1.2, 2);
  }
  tq(BW, [-dw, 0, doorH], [doorW, 0, 0], [0, frontT, 0], WALL, [0, 0, -1], 1.5, 2);          // the door's head
  tq(BW, [-dw, frontT, doorH], [doorW, 0, 0], [0, 0, ceil - doorH], WALL, [0, 1, 0], 1.5, 2); // over it, inside
  tq(BS, [-wx, depth, 0], [2 * wx, 0, 0], [0, 0, 0.25], SKIRT, [0, -1, 0], 1.2, 1);           // the back wall
  tq(BW, [-wx, depth, 0.25], [2 * wx, 0, 0], [0, 0, ceil - 0.25], WALL, [0, -1, 0], 1.2, 2);
  tq(BC, [-wx, frontT, ceil], [2 * wx, 0, 0], [0, depth - frontT, 0], CEIL, [0, 0, -1], 1.2, 1.2); // the ceiling
  // (the wall panels carry their own seams and fixings: pit_panel); two beams across the ceiling, a cable tray along
  // each side wall up high, and a dado rail where the panels meet the skirting's grubbier band
  for (const z of [5.2, 9.2]) B.box(-wx, wx, z - 0.1, z + 0.1, ceil - 0.25, ceil, 0x5c6168, 1.5);
  for (const sx of [-1, 1]) {
    const x = sx * (wx - 0.25);
    B.box(Math.min(x, x + sx * 0.2), Math.max(x, x + sx * 0.2), frontT + 0.3, depth - 0.3, ceil - 0.62, ceil - 0.58, 0x8a8f96, 2);   // the tray
    B.box(Math.min(x, x + sx * 0.2), Math.max(x, x + sx * 0.2), frontT + 0.3, depth - 0.3, ceil - 0.6, ceil - 0.52, 0x24272c, 2);    // its cables
    B.box(Math.min(sx * wx, sx * (wx - 0.04)), Math.max(sx * wx, sx * (wx - 0.04)), frontT, depth, 1.18, 1.24, 0x7c8188, 2);          // the rail
  }
  B.box(-wx, wx, depth - 0.04, depth, 1.18, 1.24, 0x7c8188, 2);
  // painted on the floor: the car's bay (a white outline), yellow lines along the walls
  const line = (xa, za, xb, zb, w, col) => {
    const lx = xb - xa, lz = zb - za, l = Math.hypot(lx, lz), nx = -lz / l * w / 2, nz = lx / l * w / 2;
    B.quad([xa - nx, za - nz, BOX.floor + 0.006], [lx, lz, 0], [2 * nx, 2 * nz, 0], col, [0, 0, 1], 1.5);
  };
  for (const sx of [-1, 1]) line(sx * (wx - 1.6), frontT + 0.6, sx * (wx - 1.6), depth - 2.2, 0.12, 0xe8c22e);
  line(-(wx - 1.6), depth - 2.2, wx - 1.6, depth - 2.2, 0.12, 0xe8c22e);
  for (const sx of [-1, 1]) line(sx * 1.6, frontT + 1.2, sx * 1.6, depth - 3.4, 0.1, 0xf2f2f0);
  // (js/pitlife.js: your box's shell shades the sun off the car in it)
  for (const [Bt, mt] of [[B, INSIDE()], [BF, surface('pit_epoxy')], [BW, surface('pit_panel')], [BS, surface('dark_industrial_metal')], [BC, surface('pit_ceiling')], [BH, surface('hazard_stripes_01')]]) {
    const m = Bt.mesh(mt); if (m) { m.userData.box = k; inside.push(m); }
  }
  // the strip lights
  const L = new Build(F, false);
  for (const lz of ROWS) for (const lx of [-LX, 0.4]) L.box(lx, lx + LX - 0.4, lz - 0.09, lz + 0.09, ceil - 0.08, ceil - 0.02, 0xffffff, 9);
  return { inside, glow: L.mesh(GLOW()) };
}

// ---------- a team's things in its box ----------
const TIRE = 0x1c1c1f, STEEL = 0x8c9196, DARK = 0x2c2f35, DESK = 0x3a3d44;
// desk: your box in a session (js/pitgarage.js puts the computer's desk left of the car, seen from the door): the air
// line that would hang over its chair is left out
export function dressBox(T, A, pit, k, team, opts = {}) {
  const F = boxFrame(T, A, pit, k);
  return F ? dressFrame(F, team, opts) : null;
}
// the same in any frame. split (tools/props/pitbox-export.mjs, for Blender): each thing its own mesh, named, its
// colors as they are (no light baked in)
export function dressFrame(F, team, { main, accent, name, desk = false, split = false } = {}) {
  const { wx } = F, { depth, ceil } = BOX;
  const M = main ?? team?.main ?? 0xcc2222, Ac = accent ?? team?.accent ?? 0xffffff;
  const g = new THREE.Group(); g.name = 'BoxDress';
  let B = new Build(F, !split), glow = new Build(F, false);
  const parts = [], part = (nm) => { if (split) { B = new Build(F, false); glow = new Build(F, false); parts.push([nm, B, glow]); } };
  // the team's colors: a panel on the back wall, a band along the side walls
  part('team_panel');
  B.quad([-6.2, depth - 0.02, 1.25], [12.4, 0, 0], [0, 0, 2.9], M, [0, -1, 0], 1.2);
  B.quad([-6.2, depth - 0.025, 1.25], [12.4, 0, 0], [0, 0, 0.14], Ac, [0, -1, 0], 2);
  for (const sx of [-1, 1]) {
    part(sx < 0 ? 'team_band_L' : 'team_band_R');
    B.quad([sx * (wx - 0.02), BOX.frontT + 0.3, 0.25], [0, depth - BOX.frontT - 0.6, 0], [0, 0, 1.0], M, [-sx, 0, 0], 1.2);
    B.quad([sx * (wx - 0.025), BOX.frontT + 0.3, 1.25], [0, depth - BOX.frontT - 0.6, 0], [0, 0, 0.1], Ac, [-sx, 0, 0], 2);
  }
  // the engineers' bench along the back wall (its monitors and stools: js/pitprops.js)
  const dz0 = depth - 1.0, dz1 = depth - 0.15;
  part('engineers_bench');
  B.box(-3.6, 3.6, dz0, dz1, 0.9, 0.96, DESK);
  for (const lx of [-3.5, -0.05, 3.4]) B.box(lx, lx + 0.1, dz0 + 0.05, dz1 - 0.05, 0, 0.9, DARK);
  // tires down the left wall: sets in their blankets (the team's color), bare ones with the compound's stripe
  const wheel = (cx, cz, y, stripe) => {
    B.prism(cx, cz, 0.33, y, y + 0.29, TIRE, 12, 0x2a2a2e);
    B.prism(cx, cz, 0.2, y + 0.29, y + 0.3, 0x9da2a8, 8);
    if (stripe != null) B.prism(cx, cz, 0.334, y + 0.25, y + 0.27, stripe, 12, 0x2a2a2e);
  };
  const blanketed = (cx, cz, n) => {
    for (let t = 0; t < n; t++) { const y = t * 0.31; B.prism(cx, cz, 0.35, y + 0.02, y + 0.27, Ac, 12, 0x2a2a2e); B.prism(cx, cz, 0.33, y, y + 0.3, TIRE, 12, 0x2a2a2e); }
  };
  part('tires');
  blanketed(-wx + 0.55, 3.0, 4); blanketed(-wx + 0.55, 3.8, 4);
  [[0xe0302a, 5.0, 4], [0xe0302a, 5.8, 3], [0xf2d22a, 6.6, 4], [0xf0f0f0, 7.4, 2]].forEach(([c, z, n]) => { for (let t = 0; t < n; t++) wheel(-wx + 0.55, z, t * 0.31, t === n - 1 ? c : null); });
  [[0x3a8af0, 9.4, 4], [0x3a8af0, 10.2, 4]].forEach(([c, z, n]) => { for (let t = 0; t < n; t++) wheel(-wx + 0.55, z, t * 0.31, t === n - 1 ? c : null); });
  // a timing screen high on the left wall by the door, fire extinguishers either side of it
  part('timing_screen_frame');
  B.box(-wx + 0.02, -wx + 0.12, 1.6, 2.9, 2.7, 3.45, DARK);
  part('TIMING_SCREEN');
  glow.quad([-wx + 0.13, 1.66, 2.76], [0, 1.18, 0], [0, 0, 0.63], 0x1c3e8a, [1, 0, 0], 2);
  part('timing_screen_text');
  for (let l = 0; l < 6; l++) glow.quad([-wx + 0.135, 1.75, 2.82 + l * 0.09], [0, 0.6 + (l * 53 % 4) * 0.1, 0], [0, 0, 0.035], 0xd8e8ff, [1, 0, 0], 2);
  for (const sx of [-1, 1]) { part(sx < 0 ? 'extinguisher_L' : 'extinguisher_R'); B.prism(sx * (wx - 0.25), 1.0, 0.09, 0, 0.62, 0xc8161a, 8, 0x222222); B.prism(sx * (wx - 0.25), 1.0, 0.03, 0.62, 0.72, 0x222222, 6); }
  // air lines dropping from the ceiling over the bay (the wheel guns' hoses), coiled at the bottom
  for (const sx of [-1, 1]) for (const z of [4.6, 9.8]) {
    if (desk && z > 9 && sx === (F.mirror ? 1 : -1)) continue;
    part(`air_line_${sx < 0 ? 'L' : 'R'}_${z < 7 ? 'front' : 'back'}`);
    B.prism(sx * 2.4, z, 0.025, 1.75, BOX.ceil, DARK, 5);
    for (let c = 0; c < 4; c++) B.prism(sx * 2.4, z, 0.11, 1.75 + c * 0.07, 1.79 + c * 0.07, 0xe8c22e, 8, 0xe8c22e);
    B.box(sx * 2.4 - 0.06, sx * 2.4 + 0.06, z - 0.1, z + 0.1, 1.45, 1.75, 0x404448, 3);
  }
  // the right wall: three tool chests in the team's color (the work bench past them: js/pitprops.js)
  for (let s = 0; s < 3; s++) {
    const z = 3.0 + s * 1.15;
    part('tool_chest_' + (s + 1));
    B.box(wx - 0.75, wx - 0.08, z, z + 1.0, 0.1, 1.05, M);
    for (let d = 0; d < 5; d++) B.box(wx - 0.77, wx - 0.08, z + 0.04, z + 0.96, 0.22 + d * 0.17, 0.235 + d * 0.17, DARK, 3);
    B.box(wx - 0.79, wx - 0.75, z + 0.3, z + 0.7, 0.98, 1.0, STEEL, 3);
    for (const dz of [0.12, 0.88]) B.prism(wx - 0.42, z + dz, 0.05, 0, 0.1, DARK, 6);
  }
  // a spare wing on brackets over the bench
  part('spare_wing');
  B.box(wx - 0.3, wx - 0.05, 7.6, 10.2, 2.1, 2.15, STEEL, 3);
  B.box(wx - 0.62, wx - 0.12, 7.7, 10.1, 2.15, 2.23, M, 3);
  for (const z of [7.62, 10.1]) B.box(wx - 0.66, wx - 0.1, z, z + 0.06, 2.15, 2.55, Ac, 3);
  // the team's name over the panel on the back wall
  const tex = teamNameTexture(name);
  if (tex) {
    const N = new Build(F, false);
    N.quad([-5.6, depth - 0.04, 2.25], [11.2, 0, 0], [0, 0, 1.4], 0xffffff, [0, -1, 0], 20, F.mirror ? [1, 0, 0, 1] : [0, 1, 0, 1]);
    const L = lightAt(0, depth - 0.1, 2.9, [0, -1, 0]);
    const m = N.mesh(new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(L, L, L), side: THREE.DoubleSide, depthWrite: false }));
    if (m) { m.renderOrder = 1; m.name = 'TEAM_NAME'; g.add(m); }
    g.userData.tex = tex;
  }
  if (split) {
    for (const [nm, b, gl] of parts) {
      const m = b.mesh(INSIDE()), m2 = gl.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
      if (m2) { m2.name = m ? nm + '_glow' : nm; m2.userData.glow = true; (m || g).add(m2); }
      if (m) { m.name = nm; g.add(m); }
    }
  } else for (const m of [B.mesh(INSIDE()), glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }))]) if (m) g.add(m);
  g.traverse(o => { o.matrixAutoUpdate = false; });
  return g;
}

// a team's name, white on clear, for the back wall (null: no document, or no name)
export function teamNameTexture(name) {
  if (typeof document === 'undefined' || !name) return null;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.font = '700 92px "SV Display", "Helvetica Neue", Arial, sans-serif'; x.letterSpacing = '-2px';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  let s = String(name).toUpperCase(); while (s.length > 2 && x.measureText(s).width > 980) s = s.slice(0, -1);
  x.fillText(s, 512, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// box k with nobody in it: its shutter down (the facade's own painted one)
export function shutBox(T, A, pit, k, mat) {
  const F = boxFrame(T, A, pit, k);
  if (!F || !mat) return null;
  const dw = F.dw, VD = 34 / 64, z = -0.02;
  const a = F.P(-dw, z, 0), b = F.P(dw, z, 0), c = F.P(dw, z, BOX.doorH), d = F.P(-dw, z, BOX.doorH);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([6 / 64, 0, 58 / 64, 0, 58 / 64, VD - 0.01, 6 / 64, 0, 58 / 64, VD - 0.01, 6 / 64, VD - 0.01], 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.name = 'Shutter';
  return m;
}
