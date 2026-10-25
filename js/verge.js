// The runoff ("verge"): a strip of ground that follows the circuit exactly, from the track edge out to the barrier
// (or the end of the runoff where there's none), flat at the height of the track edge. It's drawn as its own mesh
// (world.js) instead of being left to the terrain grid, which is far too coarse (5-14 m) to keep a narrow strip flat
// beside a slope, or to put the step exactly at the wall where two sections at different heights run back to back
// (a hairpin's two legs, a figure of eight, switchbacks). The terrain under it is tucked out of sight.
//
// Where two sections' runoffs meet, the ground belongs to the nearer one, so they meet in the middle (and a wall
// standing there separates them). Every apron stops at roads crossing the runoff, under bridge decks and at the pit
// lane (they have surfaces of their own); along the garages it runs up to the pit wall.

import { sameStretch, wallCaps } from './track.js';

// how deep each kind of barrier is (the runoff runs on under it, so the ground behind can't show in front)
export const WALL_DEPTH = { tires: 1.0, armco: 0.6, concrete: 0.5 };

export function makeVerge(T, A, env, roadL) {
  const N = T.N, sep = Math.ceil(40 / T.ds), runoff = env.runoff || 0, depth = WALL_DEPTH[env.barrier] ?? 0.6;
  const pit = A.pit;
  const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, N - d); };
  // per side (0: left, 1: right): how far the apron reaches before anything else (BASE), and the walls
  const BASE = [new Float32Array(N), new Float32Array(N)], EXT = [new Float32Array(N), new Float32Array(N)];
  const WALLED = [new Uint8Array(N), new Uint8Array(N)], AY = [new Float32Array(N), new Float32Array(N)];
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, has = s ? A.HAS_R : A.HAS_L, off = s ? A.BR : A.BL;
    for (let i = 0; i < N; i++) {
      AY[s][i] = T.Y[i] + side * T.W[i] / 2 * Math.sin(T.B[i]) + (A.LIFT ? A.LIFT[i] : 0) - 0.03;
      // (decks; on the pit lane's ramps the runoff runs on under the lane, up to its tarmac; along the garages, up to
      // the pit wall, which stands where the barrier would)
      if (A.BRIDGE[i]) continue;
      if (pit && pit.REG[i] >= 0 && pit.side === side && !isNaN(pit.WALL[i])) { WALLED[s][i] = 1; BASE[s][i] = pit.WALL[i] - 0.25 + 0.5; continue; }
      WALLED[s][i] = has[i] ? 1 : 0;
      BASE[s][i] = has[i] ? off[i] + depth : T.W[i] / 2 + runoff;
    }
  }
  // the section claiming (x, z) by its BASE reach (nearest centre line wins): { i, s, al } or null
  // (A.hash.query(x, z, 45, ...) walked here directly: called for every point of ground near the track)
  const HM = A.hash.map, HK = A.hash.key, HC = A.hash.cell, win = T.ds * 0.75;
  const claim = (x, z, R, skip = -1) => {
    let bi = -1, bs = 0, bal = Infinity;
    const c0 = Math.floor((x - 45) / HC), c1 = Math.floor((x + 45) / HC), r0 = Math.floor((z - 45) / HC), r1 = Math.floor((z + 45) / HC);
    for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
      const a = HM.get(HK(cx, cz)); if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const j = a[k];
        if (skip >= 0 && sameStretch(T, j, skip, sep)) continue;
        const dx = x - T.X[j], dz = z - T.Z[j];
        if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) > win) continue;
        const lat = dx * T.RX[j] + dz * T.RZ[j], s = lat < 0 ? 0 : 1, al = Math.abs(lat);
        if (al > R[s][j] || (bi >= 0 && al >= bal)) continue;
        bi = j; bs = s; bal = al;
      }
    }
    return bi < 0 ? null : { i: bi, s: bs, al: bal };
  };
  // each apron's reach: up to where another section is nearer (or a road crosses the runoff). Stepping out along the
  // apron 0.5 m at a time, claim() would ask the hash for ~100 samples at every step; along this one line, each of
  // them can only count over a short stretch (its 0.75 ds window across the line), found once here, so each step
  // tests just those, exactly as claim() does (the same cells, the same tests: the same reach)
  const cell = A.hash.cell, cand = [];
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    for (let i = 0; i < N; i++) {
      const base = BASE[s][i]; if (!base) continue;
      let ext = base;
      const t0 = T.W[i] / 2 + 0.5, ux = T.RX[i] * side, uz = T.RZ[i] * side;
      cand.length = 0;
      if (t0 <= base) {
        const xa = T.X[i] + ux * t0, za = T.Z[i] + uz * t0, xb = T.X[i] + ux * base, zb = T.Z[i] + uz * base;
        const qx = (xa + xb) / 2, qz = (za + zb) / 2, qr = Math.max(Math.abs(xb - xa), Math.abs(zb - za)) / 2 + 46;
        A.hash.query(qx, qz, qr, (j) => {
          if (sameStretch(T, j, i, sep)) return;
          // along(t) = (X_i + u t - X_j) . F_j, linear in t: the t where |along| <= 0.75 ds (a little wider, for rounding)
          const a0 = (T.X[i] - T.X[j]) * T.FX[j] + (T.Z[i] - T.Z[j]) * T.FZ[j], b = ux * T.FX[j] + uz * T.FZ[j], w = T.ds * 0.75 + 1e-3;
          let lo, hi;
          if (Math.abs(b) < 1e-9) { if (Math.abs(a0) > w) return; lo = -Infinity; hi = Infinity; }
          else { const p = (-w - a0) / b, q = (w - a0) / b; lo = Math.min(p, q); hi = Math.max(p, q); }
          if (hi < t0 || lo > base) return;
          cand.push(j, lo, hi, Math.floor(T.X[j] / cell), Math.floor(T.Z[j] / cell));
        });
      }
      for (let t = t0; t <= base; t += 0.5) {
        const x = T.X[i] + T.RX[i] * side * t, z = T.Z[i] + T.RZ[i] * side * t;
        if (roadL && t > T.W[i] / 2 + 1 && roadL.onRoad(x, z, 0.2)) { ext = t - 0.5; break; }
        // (claim(x, z, BASE, i)'s nearest al: only the samples in the cells its query would visit)
        const c0 = Math.floor((x - 45) / cell), c1 = Math.floor((x + 45) / cell), r0 = Math.floor((z - 45) / cell), r1 = Math.floor((z + 45) / cell);
        let best = Infinity;
        for (let k = 0; k < cand.length; k += 5) {
          if (t < cand[k + 1] || t > cand[k + 2] || cand[k + 3] < c0 || cand[k + 3] > c1 || cand[k + 4] < r0 || cand[k + 4] > r1) continue;
          const j = cand[k], dx = x - T.X[j], dz = z - T.Z[j];
          if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) > T.ds * 0.75) continue;
          const lat = dx * T.RX[j] + dz * T.RZ[j], sj = lat < 0 ? 0 : 1, al = Math.abs(lat);
          if (al > BASE[sj][j] || al >= best) continue;
          best = al;
        }
        if (best < t) { ext = t - 0.25; break; }
      }
      EXT[s][i] = ext;
    }
    // (eased along the track: no saw teeth where the clip changes from sample to sample)
    const src = EXT[s].slice(), w = 2;
    for (let i = 0; i < N; i++) {
      if (!src[i]) continue;
      let m = Infinity; for (let k = -w; k <= w; k++) { const v = src[(i + k + N) % N]; if (v) m = Math.min(m, v); }
      EXT[s][i] = Math.max(T.W[i] / 2 + 0.3, Math.min(src[i], m + 0.5));
    }
    // (inside a tight corner, never past where this side's rows cross the next sample's: past it the strip folded
    // back over itself, a fan of slivers across the infield. Where not even a sliver fits, none: the infield's ground
    // meets the road edge there)
    const cap = wallCaps(T, side, 0.1); // (only a 10 cm margin: the strip is flat ground, not a wall that needs room)
    for (let i = 0; i < N; i++) if (EXT[s][i] > cap[i]) EXT[s][i] = cap[i] >= T.W[i] / 2 + 0.6 ? cap[i] : 0;
  }
  // the apron at (x, z): { y, i, s } or null (the nearer section's, within its reach)
  const at = (x, z) => { const c = claim(x, z, EXT); return c ? { y: AY[c.s][c.i], i: c.i, s: c.s } : null; };
  // just behind a wall (within w metres past the end of a walled apron): that apron's height, or null
  const behindWall = (x, z, w) => {
    let y = null;
    const c0 = Math.floor((x - 45) / HC), c1 = Math.floor((x + 45) / HC), r0 = Math.floor((z - 45) / HC), r1 = Math.floor((z + 45) / HC);
    for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
      const a = HM.get(HK(cx, cz)); if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const j = a[k], dx = x - T.X[j], dz = z - T.Z[j];
        if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) > win) continue;
        const lat = dx * T.RX[j] + dz * T.RZ[j], s = lat < 0 ? 0 : 1, al = Math.abs(lat), e = EXT[s][j];
        if (!WALLED[s][j] || !e || al <= e || al > e + w) continue;
        if (y === null || AY[s][j] < y) y = AY[s][j];
      }
    }
    return y;
  };
  return { EXT, AY, WALLED, BASE, at, behindWall, depth };
}
