// Building plots: cut-and-fill under every building so nothing ends up half-buried in a hillside or perched over a
// drop.
//
// Each building gets a level plot at the average height of the ground under it (as much dug out of the hill as is
// filled in below it, like a real building site), a little bigger than its walls, banked back into the natural
// ground at about 1 in 1.6. Where plots overlap (a row of houses down a hill), the nearer building wins, so they
// step down the slope as terraces. Nothing changes at the circuit or on roads (fadeAt = 0 there).
//
// The plots are exact, not limited by the terrain grid (5-14 m between points, too coarse for a 12 m house): the
// world re-meshes the ground under them at about 3-4 m (world.js), and its ground height includes them, so the
// buildings, trees, props and cars all sit on the same shaped land.

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// distance from (x, z) to a polygon ([[x, z], ...]); 0 inside
export function polyDist(x, z, p) {
  let inside = false, d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return inside ? 0 : d;
}
// points to sample a footprint's ground at: its corners, the middle of each side and its centre
export function footSamples(p) {
  const out = [];
  let cx = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    cx += a[0]; cz += a[1];
  }
  out.push([cx / p.length, cz / p.length]);
  return out;
}
// a rectangle footprint for a placed prop (businesses, courthouse): centre, rotation about +Y, half sizes
export function rectFoot(x, z, rot, hw, hd) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
}

export const PLOT = { margin: 2.2, bankK: 1.6, bankMin: 4, bankMax: 30 };

// feet: footprints. ground(x, z): the natural ground. fadeAt(x, z): 0..1, how much the plots may change the ground
// there (0 on the circuit and roads). Returns null if nothing needs shaping, else
// { list (each with bb: [x0, z0, x1, z1], the area it changes), delta(x, z): the change in ground height there }
export function makePlots(feet, ground, fadeAt) {
  const list = [];
  for (const p of feet) {
    if (!p || p.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    // the ground under it: a lattice over the footprint (a ridge can run under the middle of a big building)
    let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
    const N = Math.max(2, Math.ceil(Math.max(x1 - x0, z1 - z0) / 3));
    const take = (x, z) => { const g = ground(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); sum += g; n++; };
    for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) { const x = x0 + (x1 - x0) * a / N, z = z0 + (z1 - z0) * b / N; if (polyDist(x, z, p) < 0.01) take(x, z); }
    for (const q of footSamples(p)) take(q[0], q[1]);
    if (hi - lo < 0.12) continue; // (level already)
    const bank = Math.max(PLOT.bankMin, Math.min(PLOT.bankMax, (hi - lo) * PLOT.bankK + 2));
    const reach = PLOT.margin + bank;
    list.push({ p, y: sum / n, lo, hi, reach, bb: [x0 - reach, z0 - reach, x1 + reach, z1 + reach] });
  }
  if (!list.length) return null;
  const C = 24, cells = new Map();
  for (const m of list) for (let i = Math.floor(m.bb[0] / C); i <= Math.floor(m.bb[2] / C); i++) for (let j = Math.floor(m.bb[1] / C); j <= Math.floor(m.bb[3] / C); j++) {
    const k = i + ',' + j; let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(m);
  }
  const delta = (x, z) => {
    const a = cells.get(Math.floor(x / C) + ',' + Math.floor(z / C)); if (!a) return 0;
    let sw = 0, st = 0, mw = 0;
    for (const m of a) {
      if (x < m.bb[0] || x > m.bb[2] || z < m.bb[1] || z > m.bb[3]) continue;
      const d = polyDist(x, z, m.p); if (d > m.reach) continue;
      const w = d <= PLOT.margin ? 1 : 1 - smoothstep(PLOT.margin, m.reach, d);
      if (w <= 0) continue;
      const wa = w / Math.pow(0.4 + d, 4); // (the nearer plot wins: terraces down a hill)
      sw += wa; st += wa * m.y; if (w > mw) mw = w;
    }
    if (!mw) return 0;
    const f = fadeAt(x, z); if (f <= 0) return 0;
    return (st / sw - ground(x, z)) * mw * f;
  };
  return { list, delta };
}
