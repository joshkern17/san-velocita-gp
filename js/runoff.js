// The runoff's surfaces, laid out the way a real circuit's are: a paved strip off the white line, gravel traps on the
// outside of the corners where a car that misses its braking or loses the back ends up (a fan from turn-in to the
// apex), paved runoff on the exits where cars run wide on the power, grass everywhere else. Where cars arrive fast the
// runoff is wider and the barrier stands further back.
//
// Two steps: runoffReach (inside analyzeTrack) widens the barriers, from the corners and from runoff painted past the
// wall in the editor; runoffLayout (once the pit lane and roads are in) lays out each side's runoff in 0.5 m cells
// from the track edge: for each of paved, gravel and painted grass, how far the cell is inside it (m, signed: < 0
// outside). Blended between cells and samples, a distance moves an edge smoothly however fast it swings out (a
// coverage would jump), so the world draws it as crisp curves (a texture the runoff's shader reads); the physics
// reads the same cells (runoffKind), and the editor's map draws them too.

export const RUN_RES = 0.5;            // m per cell, across the runoff
export const RUN_SD = 4;               // the distances are kept to +-4 m (one byte each: 128 = on the edge)
export const RUN_NAT = 0, RUN_PAVED = 1, RUN_GRAVEL = 2, RUN_GRASS = 3;
const MAX_WIDEN = 36, PAINT_REACH = 80, MAX_CELLS = 240;
export const EDGE_STRIP = 1.5;       // m of paved strip past the white line or the kerb, all the way round

// env.runoffStyle. Auto: a circuit gets the modern mix; a street circuit (its runoff is the city's concrete) or a
// narrow road (runoff under 6 m: a mountain pass, a road through the country) keeps plain ground beside it.
export const RUNOFF_STYLES = {
  auto:   { label: 'Auto' },
  mixed:  { label: 'Mixed',  hint: 'Paved off the white line, gravel traps on the outside of the corners, paved runoff on the exits.' },
  paved:  { label: 'Paved',  hint: 'Paved all the way to the barrier, all the way round, with a strip of gravel at the back of the big corners.' },
  gravel: { label: 'Gravel', hint: 'The classic: grass from a strip off the white line, gravel traps on the outside of every corner.' },
  grass:  { label: 'Grass',  hint: 'Grass from a strip off the white line and nothing else, like an old club circuit.' },
  real:   { label: 'Real',   hint: 'As the real circuit: paved, gravel and grass where they really are (aerial photos + the map).', real: true },
};
// full: paved out to the barrier everywhere (less the gravel at the back of the corners: entry, a share of the
// runoff, is where it starts); shoulder: paved strip along the straights (m); apron: paved behind the kerb on a corner's inside; entry: paved
// before the gravel on a corner's outside (m, or a share of the runoff if under 1); exit: paved on the exit, fixed m
// plus perD x how fast the corner is; gravel: gravel traps on corner entry (and exit share); widen: how much wider
// fast corners get
const STYLE = {
  mixed:  { shoulder: 1, apron: 1.6, entry: 3, exit: 4, perD: 10, gravel: 1, gravelExit: 0, widen: 1 },
  paved:  { full: true, entry: 0.72, gravel: 1, gravelExit: 0, widen: 1 },
  gravel: { shoulder: 0, apron: 0, entry: 0, exit: 0, perD: 0, gravel: 1, gravelExit: 0.7, grassGap: 2, widen: 1 },
  grass:  { shoulder: 0, apron: 0, entry: 0, exit: 0, perD: 0, gravel: 0, gravelExit: 0, widen: 0.6 },
  none:   { shoulder: 0, apron: 0, entry: 0, exit: 0, perD: 0, gravel: 0, gravelExit: 0, widen: 0 },
};
STYLE.real = STYLE.mixed; // (the barriers still stand back as the mix has them; without the map it's the mix)
export function runoffStyle(env) {
  const s = env.runoffStyle || 'auto';
  if (s !== 'auto' && STYLE[s]) return s;
  return env.theme === 'city' || (env.runoff ?? 0) < 6 ? 'none' : 'mixed';
}
// painted runoff (editor PAINT tool): these brushes put their surface on the runoff and push the wall back
export const isRunoffPaint = (st) => st.kind === 'paved' || st.kind === 'gravel';

// ---- a real circuit's barriers (tools/tracks/build.mjs: OSM walls, fences, guard rails as [{ k, p: [[x, z]...] }]) ----
// Where each side's barrier really stands: from the track edge straight out, the first real wall / fence / rail
// (within reach, and not past another part of the circuit). Short gaps (a gate, a marshals' opening, a missing bit
// of map) are bridged, odd ones out dropped (a median along the track); where there's nothing it's NaN (the usual
// layout stands). Returns [left, right] offsets from the centre line (m), or null. nearWall: how close to the track
// edge a mapped wall still counts (m): on a circuit, walls traced along the edge are the map marking the track's
// limits (the real barrier is the fence or rail further out); on a street circuit, the walls really are there.
const WALL_REACH = 90;
// surf (surfaceGrid): the barrier stands past the paved and gravel runoff the photos see from the track edge out (a
// wall or fence the map draws through a gravel trap or across painted runoff is the map's, or another road's).
export function realWallOffsets(T, walls, hash, sep, nearWall = 4, surf = null) {
  if (!walls || !walls.length) return null;
  const N = T.N, CELL = 20, grid = new Map();
  const segs = [];
  for (const w of walls) for (let k = 0; k + 1 < w.p.length; k++) {
    const [ax, az] = w.p[k], [bx, bz] = w.p[k + 1], id = segs.length; segs.push([ax, az, bx, bz, w.k === 'wall' ? nearWall : 1]);
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (CELL / 2)));
    for (let j = 0; j <= n; j++) {
      const key = Math.floor((ax + (bx - ax) * j / n) / CELL) + ',' + Math.floor((az + (bz - az) * j / n) / CELL);
      let a = grid.get(key); if (!a) grid.set(key, a = new Set()); a.add(id);
    }
  }
  let maxW = 0; for (let i = 0; i < N; i++) maxW = Math.max(maxW, T.W[i]);
  const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, N - d); };
  const out = [new Float32Array(N).fill(NaN), new Float32Array(N).fill(NaN)];
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, raw = new Float32Array(N).fill(NaN);
    for (let i = 0; i < N; i++) {
      const half = T.W[i] / 2, dx = T.RX[i] * side, dz = T.RZ[i] * side, x0 = T.X[i], z0 = T.Z[i];
      // (another part of the circuit across the way: the ray stops short of its road)
      let free = half + WALL_REACH;
      hash.query(x0, z0, half + WALL_REACH + maxW / 2, (j) => {
        if (circ(i, j) < sep) return;
        const ex = T.X[j] - x0, ez = T.Z[j] - z0, r = T.W[j] / 2 + 1;
        const lat = ex * dx + ez * dz, along = ex * T.FX[i] + ez * T.FZ[i];
        if (Math.abs(along) >= r || lat <= 0) return;
        free = Math.min(free, lat - Math.sqrt(r * r - along * along));
      });
      // the first wall the ray meets past the track edge (+1 m: a wall on the white line is the map's slop)
      const ids = new Set();
      for (let t = 0; t <= free + CELL; t += CELL / 2) {
        const a = grid.get(Math.floor((x0 + dx * t) / CELL) + ',' + Math.floor((z0 + dz * t) / CELL)); if (a) for (const id of a) ids.add(id);
      }
      // (the runoff the photos see: paved or gravel from the edge out, through gaps of grass or nothing up to 4 m)
      let run = half;
      if (surf) for (let t = half + 0.5, miss = 0; t < half + 60; t += 1) {
        const k = surf.at(x0 + dx * t, z0 + dz * t);
        if (k === 1 || k === 2) { run = t; miss = 0; } else if (++miss > 4) break;
      }
      let best = Infinity;
      for (const id of ids) {
        const [ax, az, bx, bz, near] = segs[id], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - x0) * ez - (az - z0) * ex) / den, u = ((ax - x0) * dz - (az - z0) * dx) / den;
        if (u >= 0 && u <= 1 && t > Math.max(half + near, run) && t < best) best = t;
      }
      if (best <= free) raw[i] = best;
    }
    // odd ones out: a median of the hits around (needs most of them to agree), then gaps under 25 m bridged
    const w = Math.max(2, Math.round(10 / T.ds)), med = new Float32Array(N).fill(NaN), buf = [];
    for (let i = 0; i < N; i++) {
      buf.length = 0; for (let k = -w; k <= w; k++) { const v = raw[(i + k + N) % N]; if (v === v) buf.push(v); }
      if (buf.length > w && raw[i] === raw[i]) { buf.sort((a, b) => a - b); med[i] = buf[buf.length >> 1]; }
    }
    const gap = Math.round(25 / T.ds);
    for (let i = 0; i < N; i++) {
      if (med[i] === med[i] || med[(i - 1 + N) % N] !== med[(i - 1 + N) % N]) continue;
      let n = 0; while (n < gap && med[(i + n) % N] !== med[(i + n) % N]) n++;
      if (n >= gap) continue;
      const a = med[(i - 1 + N) % N], b = med[(i + n) % N];
      for (let k = 0; k < n; k++) out[s][(i + k) % N] = a + (b - a) * (k + 1) / (n + 1);
    }
    for (let i = 0; i < N; i++) if (med[i] === med[i]) out[s][i] = med[i];
  }
  return out;
}

// ---- (dev) a reference model's ground (tools/tracks/build.mjs --ref): heights on a grid, the model's own in cm ----
// { res, x0, z0, w, h, cm: base64 Int16 (-32768: none) }; M: the track's refModel (game y = (y + dy) * exag).
// at(x, z): the game height there (blended between cells), or NaN where the model has no ground
const heights = new WeakMap();
export function groundGrid(G, M) {
  if (!G || !G.cm || !M) return null;
  let g = heights.get(G);
  if (!g) {
    const bin = atob(G.cm), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const cm = new Int16Array(u8.buffer), e = M.exag || 1, dy = M.dy || 0;
    const H = (cx, cz) => { if (cx < 0 || cz < 0 || cx >= G.w || cz >= G.h) return NaN; const v = cm[cz * G.w + cx]; return v === -32768 ? NaN : (v / 100 + dy) * e; };
    g = { at(x, z) {
      const fx = (x - G.x0) / G.res - 0.5, fz = (z - G.z0) / G.res - 0.5, cx = Math.floor(fx), cz = Math.floor(fz), u = fx - cx, v = fz - cz;
      const a = H(cx, cz), b = H(cx + 1, cz), c = H(cx, cz + 1), d = H(cx + 1, cz + 1);
      if (a === a && b === b && c === c && d === d) return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      return u < 0.5 ? (v < 0.5 ? a : c) : (v < 0.5 ? b : d); // (at the model's edge: the nearest cell, if it has one)
    } };
    heights.set(G, g);
  }
  return g;
}

// The ground beside the road as the wheels ride it, from a reference model's ground (groundGrid): for each sample and
// side, every RUN_RES out from the edge to PROF_REACH, its height above the road's edge there (m). Built so nothing in
// it can kick the suspension, however the model's ground is: gaps filled from beside them, averaged over ~12 m along
// the track (a drain, a kerb's end, a seam between two meshes), starting level with the road's edge and never rising
// faster than PROF_UP or falling faster than PROF_DOWN per metre out (a bank is still a bank). edgeY(i, s): the road's
// height at sample i's edge on side s (-1 / 1). Returns { C, N, rel: Float32Array(N * 2 * C) } or null.
const PROF_REACH = 40, PROF_UP = 0.4, PROF_DOWN = 0.6;
// otherY(x, z, i): the height of another part of the circuit's road at (x, z) (not the stretch round sample i), or
// NaN: where a row runs into one (across a chicane, inside a hairpin) the profile eases onto its height over the last
// 3 m before it, so a car crossing over meets that road where it is.
export function groundProfile(T, grid, edgeY, otherY = null) {
  if (!grid) return null;
  const N = T.N, C = Math.ceil(PROF_REACH / RUN_RES) + 1, raw = new Float32Array(N * 2 * C).fill(NaN);
  for (let i = 0; i < N; i++) for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, half = T.W[i] / 2, ey = edgeY(i, side), o = (i * 2 + s) * C;
    for (let c = 0; c < C; c++) {
      const t = half + c * RUN_RES, g = grid.at(T.X[i] + T.RX[i] * side * t, T.Z[i] + T.RZ[i] * side * t);
      if (g === g) raw[o + c] = g - ey;
    }
    // (gaps across: carried on from the nearest cell inside, or level with the road where there's none yet)
    let last = 0; for (let c = 0; c < C; c++) { if (raw[o + c] === raw[o + c]) last = raw[o + c]; else raw[o + c] = last; }
  }
  // along the track: averaged over +-6 m
  const w = Math.max(1, Math.round(6 / T.ds)), rel = new Float32Array(N * 2 * C), open = T.cut >= 0;
  for (let i = 0; i < N; i++) for (let s = 0; s < 2; s++) for (let c = 0; c < C; c++) {
    let sum = 0, n = 0;
    for (let k = -w; k <= w; k++) { let j = i + k; if (open) { if (j < 0 || j >= N) continue; } else j = (j + N) % N; sum += raw[(j * 2 + s) * C + c]; n++; }
    rel[(i * 2 + s) * C + c] = sum / n;
  }
  // another part of the circuit's road across the way: the row eases onto it over the 3 m before it and holds it
  if (otherY) for (let i = 0; i < N; i++) for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, half = T.W[i] / 2, ey = edgeY(i, side), o = (i * 2 + s) * C;
    for (let c = 2; c < C; c += 2) {
      const t = half + c * RUN_RES, y = otherY(T.X[i] + T.RX[i] * side * t, T.Z[i] + T.RZ[i] * side * t, i);
      if (y !== y) continue;
      const target = y - ey, ease = Math.round(3 / RUN_RES);
      for (let q = Math.max(1, c - ease); q < C; q++) { const u = q >= c ? 1 : (q - (c - ease)) / ease, e = u * u * (3 - 2 * u); rel[o + q] = rel[o + q] * (1 - e) + target * e; }
      break;
    }
  }
  // across: from the edge, level, then no steeper than the limits
  for (let i = 0; i < N; i++) for (let s = 0; s < 2; s++) {
    const o = (i * 2 + s) * C; let prev = 0;
    for (let c = 0; c < C; c++) { const v = Math.max(prev - PROF_DOWN * RUN_RES, Math.min(prev + PROF_UP * RUN_RES, c ? rel[o + c] : 0)); rel[o + c] = v; prev = v; }
  }
  return { C, N, rel };
}
// the profile's height at row (fractional sample), side 0 / 1, t m out from the edge: blended between rows and cells
export function profileAt(P, row, s, t) {
  const C = P.C, N = P.N, x = Math.max(0, Math.min(C - 1.001, t / RUN_RES)), c = Math.floor(x), u = x - c;
  const r = Math.floor(row), v = row - r, r0 = ((r % N) + N) % N, r1 = (r0 + 1) % N;
  const a = (r0 * 2 + s) * C + c, b = (r1 * 2 + s) * C + c, R = P.rel;
  return (R[a] * (1 - u) + R[a + 1] * u) * (1 - v) + (R[b] * (1 - u) + R[b + 1] * u) * v;
}

// ---- a real circuit's surface map (tools/tracks/surface.mjs): classes on a grid in track metres ----
// { res, x0, z0, w, h, rle: base64 of [class, run (varint)]... row-major }; classes 0 none, 1 paved, 2 gravel, 3 grass
const grids = new WeakMap();
export function surfaceGrid(S) {
  if (!S || !S.rle) return null;
  let g = grids.get(S);
  if (!g) {
    const bin = atob(S.rle), cls = new Uint8Array(S.w * S.h);
    for (let i = 0, o = 0; i < bin.length && o < cls.length;) {
      const v = bin.charCodeAt(i++); let m = 0, sh = 0, b;
      do { b = bin.charCodeAt(i++); m |= (b & 127) << sh; sh += 7; } while (b & 128);
      cls.fill(v, o, o + m); o += m;
    }
    g = { ...S, cls, at(x, z) { const cx = Math.floor((x - S.x0) / S.res), cz = Math.floor((z - S.z0) / S.res); return cx < 0 || cz < 0 || cx >= S.w || cz >= S.h ? 0 : cls[cz * S.w + cx]; } };
    grids.set(S, g);
  }
  return g;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the corners: where each side is a corner's outside (entry: turn-in to apex, exit: apex onwards), or inside ----
// V: speed along the centre line (computeSpeedProfile). Per side (0 left, 1 right) and sample: E entry, X exit and
// I inside weights (0..1, eased in and out along the track), and D, how fast the corner is (0 slow .. 1 flat out).
export function cornerZones(T, V) {
  const N = T.N, ds = T.ds, open = T.cut >= 0;
  const idx = (j) => ((j % N) + N) % N;
  const w = Math.max(1, Math.round(8 / ds)), K = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -w; k <= w; k++) s += T.K[idx(i + k)]; K[i] = s / (2 * w + 1); }
  const Z = { E: [new Float32Array(N), new Float32Array(N)], X: [new Float32Array(N), new Float32Array(N)], I: [new Float32Array(N), new Float32Array(N)], D: [new Float32Array(N), new Float32Array(N)] };
  const TH = 1 / 320;
  // runs of one sign, starting somewhere straight (a point-to-point: at its start, runs don't wrap past its ends)
  let start = open ? T.cut + 1 : 0;
  if (!open) for (let i = 0; i < N; i++) if (Math.abs(K[i]) < TH) { start = i; break; }
  const corners = [];
  for (let n = 0; n < N;) {
    const i = idx(start + n), sg = Math.sign(K[i]);
    if (Math.abs(K[i]) < TH) { n++; continue; }
    let m = n; while (m + 1 < N && Math.abs(K[idx(start + m + 1)]) >= TH && Math.sign(K[idx(start + m + 1)]) === sg) m++;
    let turn = 0; for (let k = n; k <= m; k++) turn += Math.abs(K[idx(start + k)]) * ds;
    if (turn > 0.26) corners.push({ a: start + n, b: start + m, sg }); // (15 degrees or more: a corner, not a wiggle)
    n = m + 1;
  }
  // (j counts on from start, unwrapped: a point-to-point has nothing before its start or after its end)
  const put = (A, s, j, v) => { if (open && (j < start || j >= start + N)) return; const q = idx(j); if (v > A[s][q]) A[s][q] = v; };
  for (const c of corners) {
    const out = c.sg > 0 ? 0 : 1, ins = 1 - out; // (K > 0 bends right: the left is the outside)
    let apex = c.a, vA = Infinity;
    for (let j = c.a; j <= c.b; j++) if (V[idx(j)] < vA - 0.05) { vA = V[idx(j)]; apex = j; }
    let vE = vA; const look = Math.round(250 / ds);
    for (let k = 0; k <= look; k++) { const j = c.a - k; if (open && j < start) break; vE = Math.max(vE, V[idx(j)]); }
    const D = smooth(20, 66, Math.max(vE, vA * 1.25));
    // entry: from a lead-in before turn-in (longer, the harder the braking) to the apex, easing out after it
    const brake = (vE * vE - vA * vA) / (2 * 14);
    const lead = Math.max(15, Math.min(70, 10 + brake * 0.35)) / ds;
    const fade = Math.max(15, (c.b - apex) * ds * 0.6) / ds;
    for (let j = Math.floor(c.a - lead); j <= Math.ceil(apex + fade); j++) {
      const e = j < c.a ? smooth(c.a - lead, c.a, j) : j <= apex ? 1 : 1 - smooth(apex, apex + fade, j);
      put(Z.E, out, j, e); put(Z.D, out, j, D * e);
    }
    // exit: from just before the apex to the end of the corner, then out along the exit (longer, the faster it is)
    const exitLen = Math.max(25, Math.min(90, 20 + V[idx(c.b)] * 0.8)) / ds, pre = 10 / ds, rise = 15 / ds;
    for (let j = Math.floor(apex - pre); j <= Math.ceil(c.b + exitLen); j++) {
      const x = j < apex + rise ? smooth(apex - pre, apex + rise, j) : j <= c.b ? 1 : 1 - smooth(c.b, c.b + exitLen, j);
      put(Z.X, out, j, x); put(Z.D, out, j, D * x);
    }
    // inside: the corner itself, eased in and out over 10 m
    const ease = 10 / ds;
    for (let j = Math.floor(c.a - ease); j <= Math.ceil(c.b + ease); j++) put(Z.I, ins, j, j < c.a ? smooth(c.a - ease, c.a, j) : j <= c.b ? 1 : 1 - smooth(c.b, c.b + ease, j));
  }
  Z.corners = corners;
  return Z;
}

// distance from (x, z) to a stroke's path (pts [[x, z], ...])
// how far (x, z) is from a painted stroke's line (its brush reaches st.r from it); an area (st.area: a closed outline,
// the PAINT tool's Shape) the same way round: from its edge, negative inside it (so r - this is how far in)
export function strokeDist(st, x, z) {
  const p = st.pts; let best = Infinity;
  if (st.area && p.length > 2) {
    let inside = false;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const [ax, az] = p[k], [bx, bz] = p[j];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return inside ? -best : best;
  }
  if (p.length === 1) return Math.hypot(x - p[0][0], z - p[0][1]);
  for (let k = 0; k + 1 < p.length; k++) {
    const ax = p[k][0], az = p[k][1], dx = p[k + 1][0] - ax, dz = p[k + 1][1] - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}
export const strokeBox = (st) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of st.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const r = st.r || 8; return [x0 - r, z0 - r, x1 + r, z1 + r];
};
// does the line from (x, z) along (dx, dz), length L, come near a box?
const rayNearBox = (b, x, z, dx, dz, L) => Math.max(x, x + dx * L) >= b[0] && Math.min(x, x + dx * L) <= b[2] && Math.max(z, z + dz * L) >= b[1] && Math.min(z, z + dz * L) <= b[3];

// ---- step 1: how far back each barrier stands (analyzeTrack) ----
// off: [BL, BR], the barrier offsets from the centre line, already smoothed (moved out in place, never in). V: speed
// along the centre line; hash, sep from analyzeTrack; BR2: bridge decks. Returns the corner zones (A.RZ).
export function runoffReach(T, env, paint, V, hash, sep, BR2, off) {
  const N = T.N, base = env.runoff || 0, style = STYLE[runoffStyle(env)];
  const Z = cornerZones(T, V);
  const strokes = (paint || []).filter(st => isRunoffPaint(st) && (st.pts || []).length).map(st => ({ st, b: strokeBox(st) }));
  const widen = Math.min(MAX_WIDEN, base * 1.6) * style.widen;
  if (!(widen > 0.5) && !strokes.length) return Z;
  const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, N - d); };
  // how far out from the centre line (m) the ray from sample i can go before it's on another section's road or its
  // runoff (less 2 m), up to range: every other section nearby is a disc (its road and runoff) the ray meets or misses
  let maxW = 0; for (let i = 0; i < N; i++) maxW = Math.max(maxW, T.W[i]);
  const FREE = [new Float32Array(N).fill(-1), new Float32Array(N).fill(-1)];
  const free = (i, s) => {
    if (FREE[s][i] >= 0) return FREE[s][i];
    const side = s ? 1 : -1, range = T.W[i] / 2 + base + Math.max(widen, strokes.length ? PAINT_REACH : 0) + 2;
    let f = range;
    hash.query(T.X[i], T.Z[i], range + maxW / 2 + base, (j) => {
      if (circ(i, j) < sep) return;
      const dx = T.X[j] - T.X[i], dz = T.Z[j] - T.Z[i], r = T.W[j] / 2 + base;
      const lat = (dx * T.RX[i] + dz * T.RZ[i]) * side, along = dx * T.FX[i] + dz * T.FZ[i];
      if (Math.abs(along) >= r || lat <= 0) return;
      f = Math.min(f, lat - Math.sqrt(r * r - along * along) - 2);
    });
    return (FREE[s][i] = f);
  };
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1, O = off[s], want = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (BR2[i]) continue;
      const half = T.W[i] / 2;
      let t = 0;
      // fast corners and braking zones: wider on the outside
      const d = Math.max(Z.E[s][i], Z.X[s][i] * 0.55) * Z.D[s][i];
      if (d > 0.02) t = half + base + widen * d;
      // runoff painted past the wall: the wall moves back to take it in (if it joins the runoff, not an island)
      if (strokes.length) {
        const x0 = T.X[i], z0 = T.Z[i], dx = T.RX[i] * side, dz = T.RZ[i] * side, L = half + base + PAINT_REACH;
        const near = strokes.filter(o => rayNearBox(o.b, x0, z0, dx, dz, L));
        if (near.length) {
          let last = -1, gap = 0;
          for (let u = half + 0.5; u <= L; u += 0.5) {
            const x = x0 + dx * u, z = z0 + dz * u;
            if (near.some(o => strokeDist(o.st, x, z) <= (o.st.r || 8))) { last = u; gap = 0; }
            else if (u > O[i] && (gap += 0.5) > 2) break;
          }
          if (last > 0) t = Math.max(t, last + 1);
        }
      }
      // (a corner's inside never past the corner's centre)
      const k = T.K[i];
      if (t && Math.abs(k) > 1e-4 && (k > 0) === (side > 0)) t = Math.min(t, Math.max(half + 1.2, 0.8 / Math.abs(k)));
      if (t > O[i]) want[i] = Math.min(t, free(i, s));
    }
    // eased along the track: held a little either side, then averaged, so the wall swings out and back smoothly
    const wd = Math.max(2, Math.round(8 / T.ds)), m = new Float32Array(N), O0 = O.slice();
    for (let i = 0; i < N; i++) { let v = 0; for (let k = -wd; k <= wd; k++) v = Math.max(v, want[(i + k + N) % N]); m[i] = v; }
    for (let i = 0; i < N; i++) {
      if (BR2[i]) continue;
      let sum = 0; for (let k = -wd; k <= wd; k++) sum += Math.max(m[(i + k + N) % N], O0[(i + k + N) % N]);
      const v = sum / (2 * wd + 1);
      if (v > O[i] + 0.05) O[i] = Math.max(O[i], Math.min(v, free(i, s)));
    }
  }
  return Z;
}

// ---- step 2: the surfaces ----
// track: { env, paint }. A after the pit lane and roads (A.RZ from analyzeTrack). Returns
// { C, N, cells: Uint8Array(N * 2 * C * 4) (paved, gravel, grass distances, 255 per cell), reach: [Float32Array x2] }
export function runoffLayout(T, A, track) {
  const N = T.N, env = track.env, base = env.runoff || 0, styleId = runoffStyle(env), S = STYLE[styleId];
  const grid = styleId === 'real' ? surfaceGrid(track.osm && track.osm.surface) : null;
  const Z = A.RZ, pit = A.pit;
  const reach = [new Float32Array(N), new Float32Array(N)];
  let maxR = 0;
  for (let s = 0; s < 2; s++) {
    const has = s ? A.HAS_R : A.HAS_L, off = s ? A.BR : A.BL;
    for (let i = 0; i < N; i++) {
      const half = T.W[i] / 2;
      const pw = pit && pit.REG[i] >= 0 && pit.side === (s ? 1 : -1) && !isNaN(pit.WALL[i]); // (along the garages: up to the pit wall)
      reach[s][i] = Math.max(0.5, (pw ? pit.WALL[i] - 0.25 : has[i] ? off[i] : Math.max(off[i], half + base)) - half);
      maxR = Math.max(maxR, reach[s][i]);
    }
  }
  const C = Math.min(MAX_CELLS, Math.ceil(maxR / RUN_RES) + 2);
  const cells = new Uint8Array(N * 2 * C * 4); // (0: 4 m outside everything)
  for (let o = 3; o < cells.length; o += 4) cells[o] = 255;
  const at = (i, s, c) => ((i * 2 + s) * C + c) * 4;
  // (no runoff on a bridge deck; on the pit lane's ramps it runs up to the lane's tarmac)
  const skip = (i, s) => A.BRIDGE[i];
  if (grid) realLayout(T, grid, reach, C, cells, skip);
  else for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
    if (skip(i, s)) continue;
    const R = reach[s][i], E = Z ? Z.E[s][i] : 0, X = Z ? Z.X[s][i] : 0, I = Z ? Z.I[s][i] : 0, D = Z ? Math.max(Z.D[s][i], 0) : 0;
    const entry = S.entry < 1 ? S.entry * R : S.entry, exit = Math.min(R, S.exit + S.perD * D);
    let pOut = S.full ? R - (R - entry) * E : Math.max(S.shoulder, S.apron * I, S.shoulder + (entry - S.shoulder) * E, S.shoulder + (exit - S.shoulder) * X);
    pOut = Math.min(R, pOut);
    const gw = S.gravel ? Math.max(E, S.gravelExit * X) : 0;
    const gIn = Math.max(pOut, S.grassGap || 0), gOut = gw > 0.01 ? gIn + (R - gIn) * Math.pow(gw, 0.7) : gIn;
    for (let c = 0; c < C; c++) {
      const t = (c + 0.5) * RUN_RES, o = at(i, s, c);
      // (paved from under the road out to pOut; none at all is a little under the road, so never shows)
      cells[o] = enc(pOut > 0.05 ? pOut - t : -t - 0.5);
      cells[o + 1] = enc(gOut > gIn + 0.02 ? Math.min(t - gIn, gOut - t) : -RUN_SD);
    }
  }
  // a paved strip off the white line (or the kerb) all the way round, whatever the style: a wheel put a little wide
  // finds tarmac, not grass (on grass a car has ~60% of its grip and it feels like ice); a street circuit's edge is
  // already the city's concrete
  if (env.theme !== 'city') for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) {
    if (skip(i, s)) continue;
    const w = Math.min(reach[s][i], (A.KW ? A.KW[s][i] : 0) + EDGE_STRIP);
    for (let c = 0; c < C; c++) {
      const t = (c + 0.5) * RUN_RES, o = at(i, s, c), d = w - t; if (d < -RUN_SD) break;
      cells[o] = enc(Math.max(dec(cells[o]), d));
      for (let q = 1; q < 3; q++) cells[o + q] = enc(Math.min(dec(cells[o + q]), -d));
    }
  }
  // painted ground over it, in the order it was painted: paved, gravel or grass is added there and taken from the
  // others; the eraser (ground) puts the circuit's own layout back
  const strokes = (track.paint || []).filter(st => (st.pts || []).length && (isRunoffPaint(st) || st.kind === 'grass' || (st.kind === 'erase' && (st.what || 'gn').includes('g'))));
  if (strokes.length) {
    const auto = cells.slice();
    for (const st of strokes) {
      const b = strokeBox(st), r = st.r || 8, ch = st.kind === 'paved' ? 0 : st.kind === 'gravel' ? 1 : st.kind === 'grass' ? 2 : -1;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        for (let i = 0; i < N; i++) {
          if (skip(i, s)) continue;
          const half = T.W[i] / 2, dx = T.RX[i] * side, dz = T.RZ[i] * side;
          const x0 = T.X[i] + dx * half, z0 = T.Z[i] + dz * half;
          if (!rayNearBox(b, x0, z0, dx, dz, C * RUN_RES)) continue;
          for (let c = 0; c < C; c++) {
            const t = (c + 0.5) * RUN_RES, x = x0 + dx * t, z = z0 + dz * t;
            if (x < b[0] - RUN_SD || x > b[2] + RUN_SD || z < b[1] - RUN_SD || z > b[3] + RUN_SD) continue;
            const d = r - strokeDist(st, x, z);
            if (d < -RUN_SD) continue;
            const o = at(i, s, c);
            for (let q = 0; q < 3; q++) {
              const v = dec(cells[o + q]);
              cells[o + q] = enc(ch < 0 ? Math.max(Math.min(v, -d), Math.min(dec(auto[o + q]), d)) : q === ch ? Math.max(v, d) : Math.min(v, -d));
            }
          }
        }
      }
    }
  }
  return { C, N, cells, reach, style: styleId, open: T.cut >= 0 };
}

// the real circuit's surfaces, read off its map across each row: for paved, gravel and grass, each cell's signed
// distance (m) to that surface's edge along the row (the rows blend into each other, so an edge across the track
// comes out as smooth as one along it). Out past the barrier, and where the map has nothing (trees, buildings),
// it's the ground.
function realLayout(T, grid, reach, C, cells, skip) {
  const N = T.N, kind = new Uint8Array(C);
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    for (let i = 0; i < N; i++) {
      if (skip(i, s)) continue;
      const half = T.W[i] / 2, dx = T.RX[i] * side, dz = T.RZ[i] * side, R = reach[s][i];
      const x0 = T.X[i] + dx * half, z0 = T.Z[i] + dz * half;
      for (let c = 0; c < C; c++) { const t = (c + 0.5) * RUN_RES; kind[c] = t > R + RUN_RES ? 0 : grid.at(x0 + dx * t, z0 + dz * t); }
      for (let q = 0; q < 3; q++) {
        const want = q + 1;
        for (let c = 0; c < C; c++) {
          const inside = kind[c] === want;
          let k = 1; const lim = Math.ceil(RUN_SD / RUN_RES);
          while (k <= lim && (c - k < 0 || (kind[c - k] === want) === inside) && (c + k >= C || (kind[c + k] === want) === inside)) k++;
          // (off the row's inner end it carries on as the first cell: no edge there)
          const d = Math.min(RUN_SD, (k - 0.5) * RUN_RES);
          cells[((i * 2 + s) * C + c) * 4 + q] = enc(inside ? d : -d);
        }
      }
    }
  }
}

const enc = (d) => Math.max(0, Math.min(255, Math.round(128 + d * 127 / RUN_SD)));
const dec = (v) => (v - 128) * RUN_SD / 127;

// what's at a spot: row (fractional sample index), side 0 / 1, t m from the track edge. The distances blended
// (bilinear), then whichever surface the spot is deepest inside, or the ground if none: exactly as the runoff's
// shader picks its colour. RUN_NAT, RUN_PAVED, RUN_GRAVEL or RUN_GRASS.
export function runoffKind(L, row, s, t) {
  if (!L || t < 0) return RUN_NAT;
  const N = L.N, C = L.C, cells = L.cells;
  const x = t / RUN_RES - 0.5;
  if (x > C - 1) return RUN_NAT;
  const c0 = Math.max(0, Math.floor(x)), c1 = Math.min(C - 1, c0 + 1), fc = Math.max(0, Math.min(1, x - c0));
  const r = Math.floor(row), fr = row - r, r0 = ((r % N) + N) % N, r1 = (r0 + 1) % N;
  let p = 0, g = 0, gr = 0;
  for (const [rr, wr] of [[r0, 1 - fr], [r1, fr]]) for (const [cc, wc] of [[c0, 1 - fc], [c1, fc]]) {
    const w = wr * wc; if (!w) continue;
    const o = ((rr * 2 + s) * C + cc) * 4;
    p += cells[o] * w; g += cells[o + 1] * w; gr += cells[o + 2] * w;
  }
  if (p <= 128 && g <= 128 && gr <= 128) return RUN_NAT;
  return p >= g && p >= gr ? RUN_PAVED : g >= gr ? RUN_GRAVEL : RUN_GRASS;
}
// (the editor's map: one cell, unblended)
export function runoffCell(L, i, s, c) {
  const o = ((i * 2 + s) * L.C + c) * 4, p = L.cells[o], g = L.cells[o + 1], gr = L.cells[o + 2];
  if (p <= 128 && g <= 128 && gr <= 128) return RUN_NAT;
  return p >= g && p >= gr ? RUN_PAVED : g >= gr ? RUN_GRAVEL : RUN_GRASS;
}
