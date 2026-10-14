// Where a real circuit's start/finish line goes when nothing better says (no F1 outline, no named spot): on the straight
// the pit lane runs beside, in the middle of the stretch they share; with no pit lane mapped (or none beside a
// straight), the middle of the longest straight. Used by the importer (tools/tracks/bake.js) and to move the line on
// circuits already built (tools/tracks/fixstarts.mjs).
import { lapShift } from './lapshift.js';

// T: sampleTrack; pitLane: [[x, z], ...] or null -> { i (sample), node (the track node nearest it), how, len }
export function pitStraightStart(T, pitLane, nodes) {
  const N = T.N, wrap = (i) => ((i % N) + N) % N;
  // curvature smoothed over ~40 m (a mapped centre line wiggles)
  const w = Math.round(20 / T.ds), K = Float32Array.from(T.K, (_, i) => { let v = 0; for (let k = -w; k <= w; k++) v += T.K[wrap(i + k)]; return Math.abs(v / (2 * w + 1)); });
  const straight = (i) => K[wrap(i)] < 1 / 350;
  // the track beside the pit lane (within 45 m of it, every 5 m along it)
  const beside = new Uint8Array(N);
  if (pitLane && pitLane.length > 1) {
    const CELL = 50, grid = new Map(), key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (let i = 0; i < N; i++) { const k = key(T.X[i], T.Z[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    for (let k = 0; k + 1 < pitLane.length; k++) {
      const [ax, az] = pitLane[k], [bx, bz] = pitLane[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 5));
      for (let j = 0; j <= n; j++) {
        const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n, gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
        let bi = -1, bd = 45;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of grid.get((gx + a) + ',' + (gz + b)) || []) { const d = Math.hypot(T.X[i] - x, T.Z[i] - z); if (d < bd) { bd = d; bi = i; } }
        if (bi >= 0) beside[bi] = 1;
      }
    }
  }
  const g = Math.round(15 / T.ds), near = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (beside[i]) for (let k = -g; k <= g; k++) near[wrap(i + k)] = 1;
  // runs of samples where ok(i), longest first
  const runs = (ok) => {
    let s0 = 0; while (s0 < N && ok(s0)) s0++; if (s0 >= N) return [[0, N]];
    const out = []; for (let k = 1, a = -1; k <= N; k++) { const i = s0 + k; if (ok(wrap(i))) { if (a < 0) a = i; } else if (a >= 0) { out.push([a, i]); a = -1; } }
    return out.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
  };
  let r = runs((i) => straight(i) && near[i])[0], how = 'pit straight';
  if (!r || (r[1] - r[0]) * T.ds < 120) { r = runs(straight)[0]; how = 'longest straight'; }
  if (!r) return null;
  const i = wrap(Math.round((r[0] + r[1]) / 2));
  return { i, node: nodes ? Math.round(T.NODE[i]) % nodes : null, how, len: (r[1] - r[0]) * T.ds };
}

// a circuit with node k as its start: everything placed by lap distance kept where it is (lapShift), the nodes turned
// so k comes first (start stays 0, as the importer makes them). extra: other objects holding a dress / real (the
// circuit's dress and edits files) shifted the same way.
export function moveStart(T, track, k, extra = []) {
  const n = track.points.length; k = ((k % n) + n) % n; if (!k) return;
  for (const o of [track, ...extra]) lapShift(T, { open: false, points: track.points, dress: o.dress, real: o.real }, k);
  track.points = [...track.points.slice(k), ...track.points.slice(0, k)];
  track.start = 0;
}
