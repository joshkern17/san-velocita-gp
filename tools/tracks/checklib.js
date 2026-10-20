// A circuit checked the way a player would find it, in the game's own page (tools/tracks/check.mjs runs it): the
// road (kinks, bumps, width and banking steps), where it crosses itself (an overpass with room under it), its pit lane
// (where it leaves and rejoins the track, never through a corner or across another bit of track), the barriers (never
// on or hard by another stretch, no steps), what's at the edge (paved or kerb, not grass: a wheel off isn't ice), the
// ground beside the road (no road floating or sunk), and the scenery (no tree through a stand, building or landmark,
// nothing on the road, no stands stacked, no models floating). Every finding: { sev: 'fail' | 'warn', what, d (m
// round the lap, if it has one), x, z, n (how many), note }.
// sim: a Race (its T, A, pit, world, track).
import { solidsAround, treeInto, overlap, standInside, OVERHEAD, TREE_INTO } from '../../js/solids.js';
import { kerbW, BARRIER_CLEAR } from '../../js/track.js';


export function checkTrack(sim) {
  const T = sim.T, A = sim.A, pit = sim.pit || A.pit, track = sim.track, world = sim.world, N = T.N, ds = T.ds, L = T.L;
  const gh = world.groundHeight;
  const F = [], add = (sev, what, f = {}) => F.push({ sev, what, ...f });
  const idx = (i) => ((i % N) + N) % N;
  const sep = Math.ceil(60 / ds); // (another stretch: more than 60 m of track away)
  const circ = (i, j) => { const d = Math.abs(i - j); return Math.min(d, N - d); };
  const at = (i, off, side) => [T.X[i] + T.RX[i] * off * side, T.Z[i] + T.RZ[i] * off * side];
  const open = !!track.open;
  // (a point-to-point road: only start line to finish line, m metres in from each; its run-off and the grid behind
  // the start sit at the ends of the samples, and the step between them isn't the road)
  const onMain = (i, m = 0) => !open || (i >= Math.round(m / ds) && i <= T.finish - Math.round(m / ds));
  // runs of flagged samples -> one finding each (its worst, where it is, how long)
  const runs = (flag, val, sev, what, note, minLen = 1) => {
    let i = 0;
    while (i < N) {
      if (!flag[i]) { i++; continue; }
      let j = i, w = i; while (j + 1 < N && flag[j + 1]) { j++; if (val[j] > val[w]) w = j; }
      if (j - i + 1 >= minLen) add(typeof sev === 'function' ? sev(val[w]) : sev, what, { d: Math.round(T.D[w]), x: Math.round(T.X[w]), z: Math.round(T.Z[w]), len: Math.round((j - i + 1) * ds), v: +val[w].toFixed(2), note: note(val[w], (j - i + 1) * ds) });
      i = j + 1;
    }
  };
  // other stretches of track near a point: [j, distance from its centre line] (more than 60 m of track from i)
  const others = (x, z, i, r) => {
    const out = [];
    A.hash.query(x, z, r, (j) => { if (circ(i, j) >= sep) { const d = Math.hypot(x - T.X[j], z - T.Z[j]); if (d < r) out.push([j, d]); } });
    return out;
  };
  const nearestOther = (x, z, i, r) => { let best = null; for (const [j, d] of others(x, z, i, r)) if (!best || d - T.W[j] / 2 < best[1] - T.W[best[0]] / 2) best = [j, d]; return best; };

  // ---------- the road ----------
  {
    // heading change per metre (plan curvature), over ±1 sample and over ±10 m
    const head = new Float32Array(N); for (let i = 0; i < N; i++) head[i] = Math.atan2(T.FZ[i], T.FX[i]);
    const dh = (a, b) => { let d = head[b] - head[a]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const k1 = new Float32Array(N), k10 = new Float32Array(N), w10 = Math.max(2, Math.round(10 / ds));
    for (let i = 0; i < N; i++) {
      if (!onMain(i, 10 * 2 + 4)) continue;
      k1[i] = dh(idx(i - 1), idx(i + 1)) / (2 * ds);
      k10[i] = dh(idx(i - w10), idx(i + w10)) / (2 * w10 * ds);
    }
    // a kink: the road bending far tighter over a couple of metres than over twenty (a zig-zag in the line, a corner
    // drawn with a notch in it), or turning one way then straight back
    const kink = new Uint8Array(N), kv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r1 = Math.abs(k1[i]);
      if (r1 > 1 / 25 && r1 > 2.5 * Math.abs(k10[i])) { kink[i] = 1; kv[i] = 1 / r1; }
      const a = k1[idx(i - 2)], b = k1[idx(i + 2)];
      if (Math.abs(a) > 1 / 40 && Math.abs(b) > 1 / 40 && Math.sign(a) !== Math.sign(b) && Math.abs(k10[i]) < Math.max(Math.abs(a), Math.abs(b)) / 3) { kink[i] = 1; kv[i] = Math.max(kv[i], 1 / Math.max(Math.abs(a), Math.abs(b))); }
    }
    for (let i = 0; i < N; i++) if (kink[i]) kv[i] = 1 / kv[i]; // (worst = tightest: kept as 1/radius for runs)
    runs(kink, kv, 'fail', 'kink in the road', (v) => `bends at ${(1 / v).toFixed(0)} m radius over a few metres (a zig-zag in the line)`);
    // a corner tighter than the road is wide: its inside edge turning round a post (under 6 m radius)
    const tight = new Uint8Array(N), tv = new Float32Array(N);
    for (let i = 0; i < N; i++) { if (!onMain(i, 24)) continue; const r = 1 / Math.max(1e-6, Math.abs(k1[i])), inner = r - T.W[i] / 2; if (inner < 6) { tight[i] = 1; tv[i] = 6 - inner; } }
    runs(tight, tv, (v) => v > 2 ? 'fail' : 'warn', 'corner too tight', (v) => `the inside edge turns round a ${(6 - v).toFixed(1)} m radius (the line's radius less half the road's width)`);
    // bumps: the road's vertical curve tighter than 120 m (crest or dip) over 10 m; steep grades
    const bump = new Uint8Array(N), bv = new Float32Array(N), w5 = Math.max(1, Math.round(5 / ds));
    for (let i = 0; i < N; i++) {
      if (!onMain(i, 12)) continue;
      if (A.BRIDGE && (A.BRIDGE[i] || A.BRIDGE[idx(i - w5)] || A.BRIDGE[idx(i + w5)])) continue;
      const g1 = (T.Y[i] - T.Y[idx(i - w5)]) / (w5 * ds), g2 = (T.Y[idx(i + w5)] - T.Y[i]) / (w5 * ds), kvv = Math.abs(g2 - g1) / (w5 * ds);
      if (kvv > 1 / 120) { bump[i] = 1; bv[i] = kvv; }
    }
    runs(bump, bv, (v) => v > 1 / 50 ? 'fail' : 'warn', 'bump', (v) => `the road's vertical curve ${(1 / v).toFixed(0)} m (a crest or dip that tight throws a car)`);
    const steep = new Uint8Array(N), sv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const g = Math.abs(T.Y[idx(i + w5)] - T.Y[idx(i - w5)]) / (2 * w5 * ds); if (g > 0.17 && onMain(i, 8)) { steep[i] = 1; sv[i] = g; } }
    runs(steep, sv, 'warn', 'steep', (v) => `${(v * 100).toFixed(0)}% grade`, Math.round(10 / ds));
    // width and banking steps
    const wst = new Uint8Array(N), wv = new Float32Array(N), bst = new Uint8Array(N), bvv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!onMain(i, 4)) continue;
      const j = idx(i + 1), dw = Math.abs(T.W[j] - T.W[i]) / ds, db = Math.abs(T.B[j] - T.B[i]) * 180 / Math.PI / ds;
      if (dw > 0.25) { wst[i] = 1; wv[i] = dw; }
      if (db > 1) { bst[i] = 1; bvv[i] = db; }
    }
    runs(wst, wv, 'warn', 'width step', (v) => `the road widens or narrows ${v.toFixed(2)} m per metre`);
    runs(bst, bvv, 'warn', 'banking step', (v) => `the camber changes ${v.toFixed(1)}° per metre`);
    // the road's width wandering where it runs straight (more than 1.5 m in 50 m)
    const wob = new Uint8Array(N), wbv = new Float32Array(N), w25 = Math.max(1, Math.round(25 / ds));
    for (let i = 0; i < N; i++) { if (!onMain(i, 30) || Math.abs(k10[i]) > 1 / 300) continue; const d = Math.abs(T.W[idx(i + w25)] - T.W[idx(i - w25)]); if (d > 1.5) { wob[i] = 1; wbv[i] = d; } }
    runs(wob, wbv, 'warn', 'width wanders', (v) => `the road's width changes ${v.toFixed(1)} m in 50 m along a straight`);
    let wmin = Infinity, wi = 0; for (let i = 0; i < N; i++) if (onMain(i) && T.W[i] < wmin) { wmin = T.W[i]; wi = i; }
    if (wmin < 8) add(wmin < 6.5 ? 'fail' : 'warn', 'narrow', { d: Math.round(T.D[wi]), x: Math.round(T.X[wi]), z: Math.round(T.Z[wi]), note: `${wmin.toFixed(1)} m wide` });
  }

  // ---------- where the track meets itself ----------
  const crossings = [];
  {
    const seen = new Set();
    for (let i = 0; i < N; i += 2) {
      for (const [j, d] of others(T.X[i], T.Z[i], i, 40)) {
        if (d > (T.W[i] + T.W[j]) / 2 + 0.5) continue;
        const key = Math.round(Math.min(i, j) / (30 / ds)) + ':' + Math.round(Math.max(i, j) / (30 / ds));
        if (seen.has(key)) continue; seen.add(key);
        const up = T.Y[i] > T.Y[j] ? i : j, lo = up === i ? j : i, gap = T.Y[up] - T.Y[lo];
        const deck = A.BRIDGE && A.BRIDGE[up];
        crossings.push({ up, lo, x: T.X[i], z: T.Z[i] });
        { const sp = Math.round(100 / ds), base = (T.Y[idx(up - sp)] + T.Y[idx(up + sp)]) / 2;
          if (T.Y[up] - base > 0.5 && base - T.Y[lo] >= 6) add('warn', 'hump over the crossing', { d: Math.round(T.D[up]), x: Math.round(T.X[up]), z: Math.round(T.Z[up]), note: `the road over rises ${(T.Y[up] - base).toFixed(1)} m to cross, where it'd clear the one below by ${(base - T.Y[lo]).toFixed(1)} m flat` }); }
        if (gap < 0.5) add('warn', 'level crossing', { d: Math.round(T.D[i]), x: Math.round(T.X[i]), z: Math.round(T.Z[i]), note: `the track crosses itself at ${Math.round(T.D[j])} m on the level` });
        else if (gap < 5.5 || !deck) add('fail', 'overpass', { d: Math.round(T.D[up]), x: Math.round(T.X[i]), z: Math.round(T.Z[i]), note: `crosses ${Math.round(T.D[lo])} m ${gap.toFixed(1)} m above it${deck ? '' : ', no bridge deck'}${gap < 5.5 ? ' (a car needs ~5.5 m)' : ''}` });
      }
    }
    for (const c of crossings) add('info', 'crossing', { d: Math.round(T.D[c.up]), x: Math.round(c.x), z: Math.round(c.z), note: `over ${Math.round(T.D[c.lo])} m, ${(T.Y[c.up] - T.Y[c.lo]).toFixed(1)} m above it` });
    // (a bump or a steep grade on the way up to or down from a bridge: the overpass's ramp)
    for (const f of F) if ((f.what === 'bump' || f.what === 'steep') && f.d != null && crossings.some(c => { const dd = Math.abs(f.d - T.D[c.up]); return Math.min(dd, L - dd) < 200; })) { f.what = f.what === 'bump' ? 'overpass ramp bump' : 'overpass ramp steep'; f.note += ' (on the way onto the bridge)'; }
    // stretches side by side (sharing a wall or a strip of grass): how close their edges come
    const near = new Uint8Array(N), nv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const o = nearestOther(T.X[i], T.Z[i], i, 60); if (!o) continue;
      const gap = o[1] - T.W[i] / 2 - T.W[o[0]] / 2;
      if (gap > 0.5 && gap < 6) { near[i] = 1; nv[i] = 6 - gap; }
    }
    runs(near, nv, 'warn', 'stretches close', (v) => `another bit of track ${(6 - v).toFixed(1)} m from this one's edge`, Math.round(10 / ds));
  }

  // ---------- the pit lane ----------
  if (track.env.pits !== false) {
    if (!pit) add('fail', 'no pit lane', { note: 'the track has pits on but no lane could be laid' });
    else {
      // the lane leaving / rejoining the track: how fast it moves out (m sideways per m along)
      let worstIn = 0, wiIn = -1, worstOut = 0, wiOut = -1;
      const mid = (pit.start + Math.round(pit.count / 2)) % N;
      for (let k = 0; k < pit.count; k++) {
        const i = idx(pit.start + k), j = idx(i + 1); if (isNaN(pit.CEN[i]) || isNaN(pit.CEN[j])) continue;
        const s = Math.abs(pit.CEN[j] - pit.CEN[i]) / ds;
        if (k < pit.count / 2) { if (s > worstIn) { worstIn = s; wiIn = i; } } else if (s > worstOut) { worstOut = s; wiOut = i; }
      }
      for (const [s, i, which] of [[worstIn, wiIn, 'entry'], [worstOut, wiOut, 'exit']]) if (i >= 0 && s > 0.3)
        add(s > 0.55 ? 'fail' : 'warn', `pit ${which} sharp`, { d: Math.round(T.D[i]), x: Math.round(T.X[i]), z: Math.round(T.Z[i]), note: `the lane swings ${(Math.atan(s) * 180 / Math.PI).toFixed(0)}° off the track` });
      // the lane on another bit of track, or round a tight corner
      const cross = new Uint8Array(N), cv = new Float32Array(N), bend = new Uint8Array(N), bv = new Float32Array(N);
      for (let k = 0; k < pit.count; k++) {
        const i = idx(pit.start + k); if (isNaN(pit.CEN[i])) continue;
        for (const off of [pit.CEN[i] - pit.width / 2, pit.CEN[i] + pit.width / 2]) {
          if (off < T.W[i] / 2 + 0.5) continue;
          const [x, z] = at(i, off, pit.side), o = nearestOther(x, z, i, 40);
          if (o) { const g = o[1] - T.W[o[0]] / 2; if (g < 1.5) { cross[i] = 1; cv[i] = Math.max(cv[i], 1.5 - g); } }
        }
        if (pit.CEN[i] > T.W[i] / 2 + 2) {
          const w = Math.round(15 / ds), a = idx(i - w), b = idx(i + w);
          let d = Math.atan2(T.FZ[b], T.FX[b]) - Math.atan2(T.FZ[a], T.FX[a]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const r = 2 * w * ds / Math.max(1e-6, Math.abs(d));
          if (r < 70) { bend[i] = 1; bv[i] = 1 / r; }
        }
      }
      runs(cross, cv, 'fail', 'pit lane on the track', (v) => `the lane runs over / against another stretch of track (${v.toFixed(1)} m into it)`);
      runs(bend, bv, 'fail', 'pit lane round a corner', (v) => `the lane follows a ${(1 / v).toFixed(0)} m corner (it belongs on a straight)`, Math.round(10 / ds));
      if (pit.boxes.length < 10) add('warn', 'few pit boxes', { note: `${pit.boxes.length} garages` });
    }
  }

  // ---------- barriers ----------
  {
    for (const side of [-1, 1]) {
      const HAS = side < 0 ? A.HAS_L : A.HAS_R, OFF = side < 0 ? A.BL : A.BR;
      const on = new Uint8Array(N), ov = new Float32Array(N), close = new Uint8Array(N), cv = new Float32Array(N), step = new Uint8Array(N), sv = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        if (!HAS[i] || !onMain(i) || (A.BRIDGE && A.BRIDGE[i])) continue;
        if (pit && pit.HIDE && pit.HIDE[i] && side === pit.side) continue; // (the garages are the barrier there)
        const [x, z] = at(i, OFF[i], side), o = nearestOther(x, z, i, 40);
        if (o && Math.abs(T.Y[o[0]] - T.Y[i]) < 3) { // (a stretch on another level, over a bridge or under one, isn't in its way)
          const g = o[1] - T.W[o[0]] / 2;
          if (g < 0.5) { on[i] = 1; ov[i] = 0.5 - g; } else if (g < 3) { close[i] = 1; cv[i] = 3 - g; }
        }
        const j = idx(i + 1);
        if (HAS[j] && !(pit && pit.HIDE && (pit.HIDE[i] || pit.HIDE[j]) && side === pit.side)) { const s = Math.abs(OFF[j] - OFF[i]); if (s > Math.max(1.5, ds * 0.6)) { step[i] = 1; sv[i] = s; } }
      }
      const nm = side < 0 ? 'left' : 'right';
      runs(on, ov, 'fail', `barrier on the track (${nm})`, (v, len) => `the ${nm} barrier stands on another stretch of track for ${len.toFixed(0)} m`);
      runs(close, cv, 'warn', `barrier by another stretch (${nm})`, (v) => `the ${nm} barrier ${(3 - v).toFixed(1)} m from another stretch's edge`, Math.round(6 / ds));
      runs(step, sv, 'warn', `barrier step (${nm})`, (v) => `the ${nm} barrier jumps ${v.toFixed(1)} m in or out`);
      // right by the road (a circuit's; a street circuit's walls and an oval's concrete stand at the edge), and folding
      // back on itself (a zig-zag round a hairpin)
      const tight = new Uint8Array(N), tv = new Float32Array(N), fold = new Uint8Array(N), fv = new Float32Array(N);
      const circuit = track.env.theme !== 'city' && (track.env.runoff ?? 0) >= 6;
      for (let i = 0; i < N; i++) {
        if (!HAS[i] || !onMain(i) || (A.BRIDGE && A.BRIDGE[i]) || (pit && pit.REG[i] >= 0 && side === pit.side)) continue;
        const g = OFF[i] - T.W[i] / 2 - kerbW(A, i, side), concrete = A.WT && A.WT[side < 0 ? 0 : 1][i] === 1;
        if (circuit && !concrete && g < BARRIER_CLEAR - 0.2) { tight[i] = 1; tv[i] = BARRIER_CLEAR - g; }
        const j = idx(i + 1); if (!HAS[j] || i === T.cut) continue;
        const [ax, az] = at(i, OFF[i], side), [bx, bz] = at(j, OFF[j], side), l = Math.hypot(bx - ax, bz - az);
        if (l > 1e-6 && ((bx - ax) * T.FX[i] + (bz - az) * T.FZ[i]) / l < 0.3 && Math.abs(OFF[j] - OFF[i]) < 4) { fold[i] = 1; fv[i] = 1; }
      }
      runs(tight, tv, 'fail', `barrier by the road (${nm})`, (v) => `the ${nm} barrier ${(BARRIER_CLEAR - v).toFixed(1)} m past the edge or kerb (${BARRIER_CLEAR} m at least on a circuit)`);
      runs(fold, fv, 'fail', `barrier folds (${nm})`, (v, len) => `the ${nm} barrier runs back on itself for ${len.toFixed(0)} m`);
    }
  }

  // ---------- the edge: what a wheel finds just past the white line (or the kerb), as the game itself decides ----------
  {
    const LOOSE = new Set(['grass', 'gravel', 'sand']);
    let looseN = 0, edges = 0;
    for (let i = 0; i < N; i++) for (const side of [-1, 1]) {
      if (!onMain(i) || (A.BRIDGE && A.BRIDGE[i])) continue;
      if (pit && pit.REG[i] >= 0 && side === pit.side) continue;
      const HAS = side < 0 ? A.HAS_L : A.HAS_R, OFF = side < 0 ? A.BL : A.BR;
      const kw = kerbW(A, i, side), t = T.W[i] / 2 + kw + 0.5;
      if (HAS[i] && OFF[i] < t) continue; // (a wall right at the edge: a street circuit)
      edges++;
      const [x, z] = at(i, t, side);
      if (LOOSE.has(sim.surfaceKind(i, t * side, x, z))) looseN++;
    }
    const share = edges ? looseN / edges : 0;
    if (share > 0.05) add(share > 0.2 ? 'fail' : 'warn', 'grass at the edge', { n: looseN, note: `${(share * 100).toFixed(0)}% of the edge is grass / gravel half a metre past the line or kerb (a wheel off loses ~40% grip)` });
  }

  // ---------- the ground beside the road ----------
  {
    const fl = new Uint8Array(N), fv = new Float32Array(N), sk = new Uint8Array(N), skv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!onMain(i) || (A.BRIDGE && A.BRIDGE[i])) continue;
      for (const side of [-1, 1]) {
        if (pit && pit.REG[i] >= 0 && side === pit.side) continue;
        const [x, z] = at(i, T.W[i] / 2 + 3, side), o = nearestOther(x, z, i, 30);
        if (o && o[1] < T.W[o[0]] / 2 + 3) continue; // (another stretch there)
        const g = gh(x, z), y = T.Y[i] + Math.sin(T.B[i]) * T.W[i] / 2 * side;
        if (y - g > 1.2) { fl[i] = 1; fv[i] = Math.max(fv[i], y - g); }
        if (g - y > 0.8) { sk[i] = 1; skv[i] = Math.max(skv[i], g - y); }
      }
    }
    runs(fl, fv, 'warn', 'road above the ground', (v) => `the ground 3 m out is ${v.toFixed(1)} m below the road`, Math.round(6 / ds));
    runs(sk, skv, 'warn', 'road sunk', (v) => `the ground 3 m out is ${v.toFixed(1)} m above the road`, Math.round(6 / ds));
  }

  // ---------- scenery ----------
  {
    const P = world.placed || { models: [], footprints: [], stands: [], boards: [] };
    // every solid thing as a convex outline (models: buildings, stands, trackside; the map's building footprints;
    // the circuit's landmarks), trees as circles: as the world itself keeps trees out of them (js/solids.js)
    const S0 = solidsAround(P.models, P.footprints, (track.landmarks && track.landmarks.items) || []), solids = S0.solids, trees = S0.trees, near = S0.near;
    for (const st of P.stands || []) add('warn', 'default grandstand', { x: Math.round(st.x), z: Math.round(st.z), note: 'the old default grandstand prop: use the pack\'s covered / flags stands' });
    // trees through solids
    const tr = { stand: [], building: [], landmark: [], trackside: [], skyline: [], vehicle: [] };
    for (const t of trees) { const [pen, by] = treeInto(S0, t.x, t.z, t.r); if (pen > TREE_INTO) (tr[by.kind] || tr.building).push([t, [pen, by]]); }
    for (const [kind, list] of Object.entries(tr)) if (list.length) {
      const through = list.filter(([, w]) => w[0] >= 99);
      const ex = list.slice(0, 3).map(([t]) => `${Math.round(t.x)},${Math.round(t.z)}`).join(' ');
      add(through.length ? 'fail' : 'warn', `trees in ${kind}s`, { n: list.length, x: Math.round(list[0][0].x), z: Math.round(list[0][0].z), note: `${list.length} tree${list.length > 1 ? 's' : ''} into ${kind}s (${through.length} trunk${through.length === 1 ? '' : 's'} inside), e.g. at ${ex}` });
    }
    // solids into each other: stands stacked or crossing, a stand / building into a building or landmark
    let stacked = [], clash = [];
    solids.forEach((S, k) => {
      for (const j of near(...S.box)) {
        if (j <= k) continue; const B = solids[j];
        if (S.kind === 'building' && B.kind === 'building') continue; // (the map's own blocks: terraces touch)
        if (S.kind === 'landmark' && B.kind === 'landmark') continue; // (a circuit's landmarks are built as one set)
        const o = overlap(S.poly, B.poly); if (o < 0.6) continue;
        if (S.kind === 'stand' && B.kind === 'stand') {
          // (a line of stands overlaps a little by design, all facing one way; stacked = nearly on top, or at an angle)
          let dr = Math.abs(((S.rot - B.rot) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
          if (Math.hypot(S.x - B.x, S.z - B.z) < 6 || dr > 0.35) stacked.push([S, B, o]);
        } else clash.push([S, B, o]);
      }
    });
    // grandstands behind the barrier, as real ones are
    const inside = solids.filter(S => S.kind === 'stand').map(S => [S, standInside(T, A, S.x, S.z, S.rot, S.a.d)]).filter(([, v]) => v > 0.5);
    if (inside.length) add('fail', 'stands inside the barrier', { n: inside.length, x: Math.round(inside[0][0].x), z: Math.round(inside[0][0].z), note: `${inside.length} stand${inside.length > 1 ? 's' : ''} between the barrier and the track (worst ${Math.max(...inside.map(q => q[1])).toFixed(1)} m inside it)` });
    if (stacked.length) add('fail', 'stands stacked', { n: stacked.length, x: Math.round(stacked[0][0].x), z: Math.round(stacked[0][0].z), note: `${stacked.length} pair${stacked.length > 1 ? 's' : ''} of stands on top of each other or crossing` });
    if (clash.length) add('fail', 'scenery into scenery', { n: clash.length, x: Math.round(clash[0][0].x), z: Math.round(clash[0][0].z), note: clash.slice(0, 4).map(([S, B, o]) => `${S.kind} ${S.id} / ${B.kind} ${B.id} ${o.toFixed(1)} m`).join('; ') });
    // anything on the road or the pit lane
    const onRoad = [];
    const roadGap = (x, z) => { let best = Infinity, bi = -1; A.hash.query(x, z, 40, (j) => { const d = Math.hypot(x - T.X[j], z - T.Z[j]) - T.W[j] / 2; if (d < best) { best = d; bi = j; } }); return [best, bi]; };
    for (const S of solids) {
      if (S.lk === 'bridge' || (S.a && OVERHEAD.has(S.a.cls))) continue; // (a footbridge, a gantry: they span the road)
      let worst = Infinity, wi = -1;
      for (const [x, z] of [...S.poly, [S.x, S.z]]) { const [g, j] = roadGap(x, z); if (g < worst) { worst = g; wi = j; } }
      if (worst < 0.5) onRoad.push([S, worst, wi]);
    }
    for (const t of trees) { const [g, j] = roadGap(t.x, t.z); if (g < 1) onRoad.push([{ kind: 'tree', id: t.id, x: t.x, z: t.z }, g, j]); }
    if (onRoad.length) add('fail', 'scenery on the road', { n: onRoad.length, d: onRoad[0][2] >= 0 ? Math.round(T.D[onRoad[0][2]]) : undefined, x: Math.round(onRoad[0][0].x), z: Math.round(onRoad[0][0].z), note: onRoad.slice(0, 4).map(([S, g, j]) => `${S.kind} ${S.id} at ${j >= 0 ? Math.round(T.D[j]) + ' m' : '?'}`).join('; ') });
    // models floating over the ground at a corner (not trees: their trunks reach down)
    const floating = [];
    for (const S of solids) {
      if (S.y == null || !(S.kind === 'stand' || S.kind === 'trackside')) continue; // (buildings sit on their high side, a foundation under the rest)
      let lo = Infinity; for (const [x, z] of S.poly) lo = Math.min(lo, gh(x, z));
      if (S.y - lo > 0.8) floating.push([S, S.y - lo]);
    }
    if (floating.length) { floating.sort((a, b) => b[1] - a[1]); add('warn', 'floating stands / trackside', { n: floating.length, x: Math.round(floating[0][0].x), z: Math.round(floating[0][0].z), note: floating.slice(0, 3).map(([S, h]) => `${S.id} ${h.toFixed(1)} m up`).join('; ') }); }
    F.push({ sev: 'info', what: 'scenery', note: `${solids.length} solids (${solids.filter(s => s.kind === 'stand').length} stands, ${(track.landmarks && track.landmarks.items || []).length} landmarks), ${trees.length} trees` });
  }

  // the same thing found more than 8 times: one finding, its worst few named
  {
    const by = new Map(); for (const f of F) if (f.v != null) { const k = f.sev + '|' + f.what.replace(/ \((left|right)\)$/, ''); if (!by.has(k)) by.set(k, []); by.get(k).push(f); }
    for (const [k, list] of by) if (list.length > 8) {
      const [sev, what] = k.split('|'), worst = [...list].sort((a, b) => b.v - a.v);
      for (const f of list) F.splice(F.indexOf(f), 1);
      F.push({ ...worst[0], sev, what, n: list.length, len: list.reduce((s, f) => s + (f.len || 0), 0), note: `${list.length} places; worst ${worst[0].note}; also at ${worst.slice(1, 6).map(f => f.d + ' m').join(', ')}` });
    }
  }
  // names for where each finding is (the real corner names)
  const names = (track.real && track.real.names) || [];
  for (const f of F) if (f.d != null) { const n = names.find(s => f.d >= s.from - 15 && f.d <= s.to + 15); if (n) f.at = n.name; }
  const order = { fail: 0, warn: 1, info: 2 };
  F.sort((a, b) => order[a.sev] - order[b.sev] || (a.d ?? 1e9) - (b.d ?? 1e9));
  return { id: track.real && track.real.id, name: track.name, L: Math.round(L), fails: F.filter(f => f.sev === 'fail').length, warns: F.filter(f => f.sev === 'warn').length, findings: F };
}
