// Landscape sculpting (editor SCULPT tool): brush strokes that raise, lower, smooth or flatten the ground.
// track.sculpt = [{ m: 'up' | 'down' | 'smooth' | 'flat', r (brush radius, m), k (strength: metres for up / down,
// 0..1 for smooth / flatten), pts: [[x, z], ...] }]
// Applied in order onto a height grid, by the 3D world (onto its terrain before the circuit's embankments are
// blended in, so the track and its runoff always win) and by the editor preview (onto flat ground), with the
// same code so both agree.
export const SCULPT_MODES = {
  up:     { label: 'Raise',   color: '#d89a5a' },
  down:   { label: 'Lower',   color: '#5a9ad8' },
  smooth: { label: 'Smooth',  color: '#c8c8c8' },
  flat:   { label: 'Flatten', color: '#e8d870' },
  track:  { label: 'To Track', color: '#c47ae0' },
};
export const SCULPT_MAX = 40; // (strength slider, metres)

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// how much of the brush covers (x, z): 1 at the centre line, soft over the outer 45% of the radius
export function strokeCover(st, x, z) {
  const p = st.pts || [], r = st.r || 10;
  let d = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[Math.min(p.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return 1 - smoothstep(r * 0.55, r, d);
}
export function strokeBox(st, pad = 0) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of st.pts || []) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const r = (st.r || 10) + pad;
  return [x0 - r, z0 - r, x1 + r, z1 + r];
}

// the road's height nearest (x, z), just under its surface (where the ground meets it), or null with no road within
// ~1 km: for the To Track brush. T: sampleTrack, hash: analyzeTrack's
export function trackHeightAt(T, hash) {
  return (x, z) => {
    for (const r of [40, 160, 640]) {
      let bj = -1, bd = Infinity;
      hash.query(x, z, r, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } });
      if (bj >= 0 && bd <= r * r) return T.Y[bj] - 0.2;
    }
    return null;
  };
}

// H: Float32Array heights on a grid (nx by nz, origin gx0 / gz0, spacing step). Modified in place. trackY(x, z): the
// road's height nearest a point (trackHeightAt), for the To Track brush (without it, those strokes do nothing)
export function applySculpt(strokes, H, nx, nz, gx0, gz0, step, trackY = null) {
  if (!strokes || !strokes.length) return;
  const at = (x, z) => { // bilinear height
    const fx = Math.max(0, Math.min(nx - 1.001, (x - gx0) / step)), fz = Math.max(0, Math.min(nz - 1.001, (z - gz0) / step));
    const k = Math.floor(fx), j = Math.floor(fz), u = fx - k, v = fz - j;
    return (H[j * nx + k] * (1 - u) + H[j * nx + k + 1] * u) * (1 - v) + (H[(j + 1) * nx + k] * (1 - u) + H[(j + 1) * nx + k + 1] * u) * v;
  };
  for (const st of strokes) {
    if (!(st.pts || []).length) continue;
    const [x0, z0, x1, z1] = strokeBox(st, step);
    const k0 = Math.max(0, Math.floor((x0 - gx0) / step)), k1 = Math.min(nx - 1, Math.ceil((x1 - gx0) / step));
    const j0 = Math.max(0, Math.floor((z0 - gz0) / step)), j1 = Math.min(nz - 1, Math.ceil((z1 - gz0) / step));
    if (k0 > k1 || j0 > j1) continue;
    const W = k1 - k0 + 1, Hh = j1 - j0 + 1, cov = new Float32Array(W * Hh);
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) cov[(j - j0) * W + (k - k0)] = strokeCover(st, gx0 + k * step, gz0 + j * step);
    const m = st.m || 'up';
    if (m === 'up' || m === 'down') {
      const dh = (m === 'up' ? 1 : -1) * Math.min(SCULPT_MAX, Math.abs(st.k ?? 4));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const c = cov[(j - j0) * W + (k - k0)]; if (c > 0) H[j * nx + k] += dh * c; }
    } else if (m === 'flat') {
      // level everything under the brush to the height where the stroke began
      const target = at(st.pts[0][0], st.pts[0][1]), s = Math.max(0, Math.min(1, st.k ?? 1));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const c = cov[(j - j0) * W + (k - k0)] * s; if (c > 0) H[j * nx + k] += (target - H[j * nx + k]) * c; }
    } else if (m === 'track') {
      // down to the height of the road nearest each point, never below it (a hill cut back level with the track)
      if (!trackY) continue;
      const s = Math.max(0, Math.min(1, st.k ?? 1));
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const c = cov[(j - j0) * W + (k - k0)] * s, i = j * nx + k; if (c <= 0) continue;
        const ty = trackY(gx0 + k * step, gz0 + j * step); if (ty !== null && H[i] > ty) H[i] += (ty - H[i]) * c;
      }
    } else if (m === 'smooth') {
      // a blur about a third of the brush wide, blended in by the brush cover
      const R = Math.max(1, Math.round((st.r || 10) / 3 / step)), s = Math.max(0, Math.min(1, st.k ?? 0.8));
      const src = new Float32Array(W * Hh), tmp = new Float32Array(W * Hh);
      for (let j = 0; j < Hh; j++) for (let k = 0; k < W; k++) src[j * W + k] = H[(j + j0) * nx + k + k0];
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < Hh; j++) for (let k = 0; k < W; k++) { let a = 0, n = 0; for (let q = -R; q <= R; q++) { const kk = k + q; if (kk >= 0 && kk < W) { a += src[j * W + kk]; n++; } } tmp[j * W + k] = a / n; }
        for (let j = 0; j < Hh; j++) for (let k = 0; k < W; k++) { let a = 0, n = 0; for (let q = -R; q <= R; q++) { const jj = j + q; if (jj >= 0 && jj < Hh) { a += tmp[jj * W + k]; n++; } } src[j * W + k] = a / n; }
      }
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const i = (j - j0) * W + (k - k0), c = cov[i] * s; if (c > 0) H[j * nx + k] += (src[i] - H[j * nx + k]) * c; }
    }
  }
}

// the editor's preview: sculpted height (over flat ground) on a grid covering every stroke
export function sculptPreview(strokes, step = 4, trackY = null) {
  if (!strokes || !strokes.length) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const st of strokes) { const b = strokeBox(st, 8); x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]); }
  step = Math.max(step, Math.sqrt((x1 - x0) * (z1 - z0) / 250000)); // (at most ~250k cells)
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1, H = new Float32Array(nx * nz);
  applySculpt(strokes, H, nx, nz, x0, z0, step, trackY);
  return { H, nx, nz, x0, z0, step };
}
