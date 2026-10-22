// The modular grandstands (tools/props/grandstands.py -> assets/env/grandstands.glb, catalogue cls gs_S / gs_M / gs_L):
// a stand is a left end, 12 m bays (a tunnel bay in the middle, and every fifth from it) and a right end, laid along
// a line drawn with PROPS (the line is the stand's front, the track side). Each piece is an ordinary track prop
// (type gs_<size>_<role>, ln: the line, kit: which stretch of the line), so the editor, the world and the crowd see
// them like any other.
//
// On a hill a stand stays level, the way real ones are built: at the height of the highest ground under its front
// half (so its front rows never hang in the air). Where the hillside rises above that, the ground is cut away to it
// and banked back up around the stand (pads.js cuts); where the ground falls away, the stand stands on a concrete
// podium built up from the ground: pilasters at its frames, a coping along the top, vents in tall walls, and steps
// down from its ends where the stair towers come down.
//
//   isKitClass(cls)                     a family of these?
//   kitLineProps(L, segs, side, propAt) the props for a line (editor lineProps): one stand per straight stretch
//   kitStands(props, ground)            the stands among a track's props: pieces, frame, outline, level
//   kitCuts(stands)                     the ground cuts (pads.js makePlots) for them
//   buildPodiums(root, stands, ground)  the concrete under the ones standing over falling ground
import * as THREE from 'three';
import { envAsset, envModel } from './envlib.js';

export const KIT_SIZES = ['S', 'M', 'L'];
export const isKitClass = (cls) => /^gs_[SML]$/.test(cls || '');
export const isKitPiece = (type) => /^gs_[SML]_/.test(type || '');
const BAY = 12, TUNNEL_EVERY = 5;

// The props for a line (L: the editor's line, segs [{ i, s0, l }], side[j]: the way stretch j faces, [nx, nz]).
// Each straight stretch is a stand of its own: as many bays as fit (at least one), centred on the stretch.
export function kitLineProps(L, cls, segs, side) {
  const size = cls.slice(3), out = [], P = L.pts;
  const meta = (role) => envAsset(`gs_${size}_${role}`);
  if (!meta('bay')) return out;
  segs.forEach((sg, j) => {
    const a = P[sg.i], b = P[sg.i + 1], [nx, nz] = side[j];
    const n = Math.max(1, Math.round(sg.l / BAY));
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, X = [nz, -nx]; // (a piece's own +x, along the stand)
    const rot = Math.atan2(nx, nz) + (L.turn || 0);
    const put = (role, along) => {
      const m = meta(role); if (!m) return;
      const k = m.kit, fx = cx + X[0] * along, fz = cz + X[1] * along; // (the frame point: the front line, there)
      const p = { type: m.id, x: +(fx + X[0] * k.ox + nx * k.oz).toFixed(2), z: +(fz + X[1] * k.ox + nz * k.oz).toFixed(2), rot: +rot.toFixed(4), ln: L.id, kit: j };
      if (L.crowd === false) p.crowd = false;
      if (L.fill !== undefined) p.fill = L.fill;
      out.push(p);
    };
    const mid = Math.floor(n / 2);
    put('endL', -n * BAY / 2);
    for (let k = 0; k < n; k++) put(n >= 3 && Math.abs(k - mid) % TUNNEL_EVERY === 0 ? 'tunnel' : 'bay', (k - (n - 1) / 2) * BAY);
    put('endR', n * BAY / 2);
  });
  return out;
}

// The stands: the kit pieces grouped by line and stretch, each with its frame (front line point F, along X, out n),
// extent along (a0..a1) and back (front 0 .. -depth), its outline on the ground, and its level.
export function kitStands(props, ground) {
  const groups = new Map();
  for (const p of props || []) {
    if (!isKitPiece(p.type)) continue;
    const m = envAsset(p.type); if (!m || !m.kit) continue;
    const key = (p.ln ?? 'x' + p.type + p.x) + '/' + (p.kit ?? 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ p, m });
  }
  const out = [];
  for (const [key, G] of groups) {
    const r = G[0].p.rot || 0, X = [Math.cos(r), -Math.sin(r)], n = [Math.sin(r), Math.cos(r)];
    // the frame from the first piece: its centre less its offset
    const f0 = G[0], F = [f0.p.x - X[0] * f0.m.kit.ox - n[0] * f0.m.kit.oz, f0.p.z - X[1] * f0.m.kit.ox - n[1] * f0.m.kit.oz];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    const pieces = G.map(({ p, m }) => {
      const along = (p.x - F[0]) * X[0] + (p.z - F[1]) * X[1], out_ = (p.x - F[0]) * n[0] + (p.z - F[1]) * n[1];
      a0 = Math.min(a0, along - m.w / 2); a1 = Math.max(a1, along + m.w / 2);
      b0 = Math.min(b0, out_ - m.d / 2); b1 = Math.max(b1, out_ + m.d / 2);
      return { p, m, along, role: m.kit.role, frameAlong: along - m.kit.ox };
    });
    const front = Math.min(b1, 0.35), back = b0; // (front: the stand's front wall face, on the line)
    const W = (a, b) => [F[0] + X[0] * a + n[0] * b, F[1] + X[1] * a + n[1] * b];
    // its level: the highest ground under the front half (every ~3 m)
    let level = -Infinity;
    const bh = back + (front - back) * 0.5;
    for (let a = a0; a <= a1 + 1e-6; a += Math.max(1, (a1 - a0) / Math.ceil((a1 - a0) / 3))) for (let b = front; b >= bh - 1e-6; b -= Math.max(1, (front - bh) / Math.ceil((front - bh) / 3))) level = Math.max(level, ground(...W(a, b)));
    out.push({ key, pieces, F, X, n, a0, a1, front, back, level, W, size: pieces[0].p.type[3], outline: [W(a0, front), W(a1, front), W(a1, back), W(a0, back)] });
  }
  return out;
}

// pads.js cuts: where the hill rises above a stand's level, it's dug down to it (a margin round the stand), the
// cutting banked back up to the hillside
export const kitCuts = (stands) => stands.map(s => ({ p: s.outline, y: s.level - 0.05 }));

// ---------------- the podium ----------------
const RISE = 0.17, TREAD = 0.3;
export function buildPodiums(root, stands, ground) {
  const P = [], U = [], C = [], LP = [], LU = [], LC = [], DK = []; // concrete, coping (lighter), dark (vents)
  let any = false;
  const quad = (pos, uv, col, a, b, c, d, ua, ub, uc, ud, ka = 1, kb = 1, kc = 1, kd = 1) => {
    pos.push(...a, ...b, ...c, ...b, ...d, ...c); uv.push(...ua, ...ub, ...uc, ...ub, ...ud, ...uc);
    for (const k of [ka, kb, kc, kb, kd, kc]) col.push(k, k * 0.985, k * 0.96);
  };
  for (const s of stands) {
    const { W, X, n, a0, a1, front, back, level } = s;
    // the ground along the outline (every ~1.5 m): is any of it below the level?
    const g = (a, b) => ground(...W(a, b));
    let low = 0;
    for (let a = a0; a <= a1; a += 1.5) for (const b of [front, back, (front + back) / 2]) low = Math.max(low, level - g(a, b));
    for (let b = back; b <= front; b += 1.5) for (const a of [a0, a1]) low = Math.max(low, level - g(a, b));
    if (low < 0.15) continue;
    any = true;
    const top = level + 0.02, Y3 = (a, b, y) => { const w = W(a, b); return [w[0], y, w[1]]; };
    // a wall along one side of the outline: from (a, b) to (a', b'), its outward normal o ([da, db] in the frame)
    const wall = (pa, pb, o, out = 0.02) => {
      const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), N = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        const A = [pa[0] + (pb[0] - pa[0]) * t0 + o[0] * out, pa[1] + (pb[1] - pa[1]) * t0 + o[1] * out], B = [pa[0] + (pb[0] - pa[0]) * t1 + o[0] * out, pa[1] + (pb[1] - pa[1]) * t1 + o[1] * out];
        const gA = g(...A), gB = g(...B);
        if (gA > top - 0.05 && gB > top - 0.05) continue; // (buried here: the cut side)
        const yA = Math.min(gA, top) - 0.5, yB = Math.min(gB, top) - 0.5, uA = L * t0 / 2, uB = L * t1 / 2;
        // the face (darker low down, where the rain splashes)
        quad(P, U, C, Y3(...A, yA), Y3(...B, yB), Y3(...A, top - 0.35), Y3(...B, top - 0.35), [uA, yA / 2], [uB, yB / 2], [uA, (top - 0.35) / 2], [uB, (top - 0.35) / 2], 0.78, 0.78, 0.98, 0.98);
        // the coping along the top: proud by 0.12 m, 0.35 m deep, its top and underside
        const Ao = [A[0] + o[0] * 0.12, A[1] + o[1] * 0.12], Bo = [B[0] + o[0] * 0.12, B[1] + o[1] * 0.12];
        quad(LP, LU, LC, Y3(...Ao, top - 0.38), Y3(...Bo, top - 0.38), Y3(...Ao, top), Y3(...Bo, top), [uA, 0], [uB, 0], [uA, 0.18], [uB, 0.18], 0.9, 0.9, 1, 1);
        quad(LP, LU, LC, Y3(...A, top - 0.38), Y3(...B, top - 0.38), Y3(...Ao, top - 0.38), Y3(...Bo, top - 0.38), [uA, 0], [uB, 0], [uA, 0.06], [uB, 0.06], 0.55, 0.55, 0.55, 0.55);
      }
    };
    // pilasters every 4 m along the long sides (the bays' frames), and at the corners
    const pilaster = (a, b, o) => {
      const gy = g(...[a, b]); if (gy > top - 0.3) return;
      const c = [a + o[0] * 0.02, b + o[1] * 0.02], t = [o[1], -o[0]], hw = 0.28, dp = 0.22, y0 = gy - 0.5, y1 = top - 0.38;
      const p = (u, v) => [c[0] + t[0] * u + o[0] * v, c[1] + t[1] * u + o[1] * v];
      quad(P, U, C, Y3(...p(-hw, dp), y0), Y3(...p(hw, dp), y0), Y3(...p(-hw, dp), y1), Y3(...p(hw, dp), y1), [0, y0 / 2], [0.28, y0 / 2], [0, y1 / 2], [0.28, y1 / 2], 0.82, 0.82, 1, 1);
      for (const sg of [-1, 1]) quad(P, U, C, Y3(...p(sg * hw, 0), y0), Y3(...p(sg * hw, dp), y0), Y3(...p(sg * hw, 0), y1), Y3(...p(sg * hw, dp), y1), [0, y0 / 2], [0.11, y0 / 2], [0, y1 / 2], [0.11, y1 / 2], 0.7, 0.7, 0.9, 0.9);
      // and its vents: a louvred dark panel each side of it, in a tall wall
      if (top - gy > 2.8) for (const sg of [-1, 1]) {
        const u0 = sg * 0.9, u1 = sg * 2.3, v0 = gy + 0.9, v1 = Math.min(top - 1.0, gy + 2.3);
        if (v1 - v0 < 0.6) continue;
        DK.push(...Y3(...p(u0, 0.03), v0), ...Y3(...p(u1, 0.03), v0), ...Y3(...p(u0, 0.03), v1), ...Y3(...p(u1, 0.03), v0), ...Y3(...p(u1, 0.03), v1), ...Y3(...p(u0, 0.03), v1));
        for (let v = v0 + 0.15; v < v1 - 0.05; v += 0.22) quad(LP, LU, LC, Y3(...p(u0, 0.05), v), Y3(...p(u1, 0.05), v), Y3(...p(u0, 0.12), v + 0.07), Y3(...p(u1, 0.12), v + 0.07), [0, 0], [0.5, 0], [0, 0.05], [0.5, 0.05], 0.7, 0.7, 0.8, 0.8);
      }
    };
    // (in frame coordinates [a, b]: front is +b)
    wall([a0, front], [a1, front], [0, 1]); wall([a1, back], [a0, back], [0, -1]);
    wall([a0, back], [a0, front], [-1, 0]); wall([a1, front], [a1, back], [1, 0]);
    for (let a = Math.ceil(a0 / 4) * 4; a <= a1; a += 4) { pilaster(a, front, [0, 1]); pilaster(a, back, [0, -1]); }
    // the slab on top (seen under the open frame of a club stand)
    const nA = Math.ceil((a1 - a0) / 4), nB = Math.ceil((front - back) / 4);
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
      const aa = a0 + (a1 - a0) * i / nA, ab = a0 + (a1 - a0) * (i + 1) / nA, ba = back + (front - back) * j / nB, bb = back + (front - back) * (j + 1) / nB;
      quad(P, U, C, Y3(aa, ba, top - 0.01), Y3(ab, ba, top - 0.01), Y3(aa, bb, top - 0.01), Y3(ab, bb, top - 0.01), [aa / 2, ba / 2], [ab / 2, ba / 2], [aa / 2, bb / 2], [ab / 2, bb / 2], 0.8, 0.8, 0.8, 0.8);
    }
    // steps down from the back at each end (where the stair towers come down), if it's high enough to need them
    for (const piece of s.pieces) {
      if (piece.role !== 'endL' && piece.role !== 'endR') continue;
      const sgn = piece.role === 'endL' ? -1 : 1, ac = piece.frameAlong + sgn * 2.2, hw = 1.2;
      const h = top - g(ac, back - 0.5); if (h < 0.5) continue;
      for (let k = 1; k * RISE < h + RISE; k++) {
        const yT = top - k * RISE, b1_ = back - (k - 1) * TREAD, b0_ = back - k * TREAD;
        const gy = Math.min(g(ac - hw, b0_), g(ac + hw, b0_)) - 0.4;
        if (yT < g(ac, b0_)) break;
        // tread, riser, the two sides
        quad(P, U, C, Y3(ac - hw, b0_, yT), Y3(ac + hw, b0_, yT), Y3(ac - hw, b1_, yT), Y3(ac + hw, b1_, yT), [0, 0], [1.2, 0], [0, 0.15], [1.2, 0.15], 0.85, 0.85, 0.85, 0.85);
        quad(P, U, C, Y3(ac - hw, b0_, gy), Y3(ac + hw, b0_, gy), Y3(ac - hw, b0_, yT), Y3(ac + hw, b0_, yT), [0, gy / 2], [1.2, gy / 2], [0, yT / 2], [1.2, yT / 2], 0.6, 0.6, 0.72, 0.72);
        for (const sd of [-1, 1]) quad(P, U, C, Y3(ac + sd * hw, b0_, gy), Y3(ac + sd * hw, b1_, gy), Y3(ac + sd * hw, b0_, yT), Y3(ac + sd * hw, b1_, yT), [b0_ / 2, gy / 2], [b1_ / 2, gy / 2], [b0_ / 2, yT / 2], [b1_ / 2, yT / 2], 0.6, 0.6, 0.7, 0.7);
      }
    }
  }
  if (!any) return;
  // the stands' own concrete (its texture, so the podium is the same stuff as the stand on it)
  const concrete = matNamed(/GS_Concrete$/), coping = matNamed(/GS_ConcreteFloor/) || concrete;
  const mk = (pos, uv, col, mat) => {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.name = 'standPodium'; m.castShadow = true; m.receiveShadow = true; root.add(m);
  };
  const fallback = new THREE.MeshLambertMaterial({ color: 0xa8a49c, vertexColors: true });
  const dbl = (m) => { if (!m) return fallback; const c = m.clone(); c.side = THREE.DoubleSide; c.vertexColors = true; return c; };
  mk(P, U, C, dbl(concrete)); mk(LP, LU, LC, dbl(coping));
  if (DK.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(DK, 3)); g.computeVertexNormals(); root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x1a1a1c, side: THREE.DoubleSide }))); }
}
function matNamed(re) {
  for (const id of ['gs_M_bay', 'gs_S_bay', 'gs_L_bay']) {
    const parts = envModel(id); if (!parts) continue;
    const pt = parts.find(q => re.test(q.mat.name)); if (pt) return pt.mat;
  }
  return null;
}
