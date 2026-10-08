// The runoff ("verge"): a strip of ground that follows the circuit exactly, from the track edge out to the barrier
// (or the end of the runoff where there's none), flat at the height of the track edge. It's drawn as its own mesh
// (world.js) instead of being left to the terrain grid, which is far too coarse (5-14 m) to keep a narrow strip flat
// beside a slope, or to put the step exactly at the wall where two sections at different heights run back to back
// (a hairpin's two legs, a figure of eight, switchbacks). The terrain under it is tucked out of sight.
//
// Where two sections' runoffs meet, the ground belongs to the nearer one, so they meet in the middle (and a wall
// standing there separates them). Every apron stops at roads crossing the runoff, under bridge decks and at the pit
// lane (they have surfaces of their own); along the garages it runs up to the pit wall.

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
  const claim = (x, z, R, skip = -1) => {
    let best = null;
    A.hash.query(x, z, 45, (j) => {
      if (skip >= 0 && circ(j, skip) < sep) return;
      const dx = x - T.X[j], dz = z - T.Z[j];
      if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) > T.ds * 0.75) return;
      const lat = dx * T.RX[j] + dz * T.RZ[j], s = lat < 0 ? 0 : 1, al = Math.abs(lat);
      if (al > R[s][j] || (best && al >= best.al)) return;
      best = { i: j, s, al };
    });
    return best;
  };
  // each apron's reach: up to where another section is nearer (or a road crosses the runoff)
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    for (let i = 0; i < N; i++) {
      const base = BASE[s][i]; if (!base) continue;
      let ext = base;
      for (let t = T.W[i] / 2 + 0.5; t <= base; t += 0.5) {
        const x = T.X[i] + T.RX[i] * side * t, z = T.Z[i] + T.RZ[i] * side * t;
        if (roadL && t > T.W[i] / 2 + 1 && roadL.onRoad(x, z, 0.2)) { ext = t - 0.5; break; }
        const c = claim(x, z, BASE, i);
        if (c && c.al < t) { ext = t - 0.25; break; }
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
  }
  // the apron at (x, z): { y, i, s } or null (the nearer section's, within its reach)
  const at = (x, z) => { const c = claim(x, z, EXT); return c ? { y: AY[c.s][c.i], i: c.i, s: c.s } : null; };
  // just behind a wall (within w metres past the end of a walled apron): that apron's height, or null
  const behindWall = (x, z, w) => {
    let y = null;
    A.hash.query(x, z, 45, (j) => {
      const dx = x - T.X[j], dz = z - T.Z[j];
      if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) > T.ds * 0.75) return;
      const lat = dx * T.RX[j] + dz * T.RZ[j], s = lat < 0 ? 0 : 1, al = Math.abs(lat), e = EXT[s][j];
      if (!WALLED[s][j] || !e || al <= e || al > e + w) return;
      if (y === null || AY[s][j] < y) y = AY[s][j];
    });
    return y;
  };
  return { EXT, AY, WALLED, BASE, at, behindWall, depth };
}
