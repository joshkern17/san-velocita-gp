// The map's street details (track.osm.street, js/streetdata.js) put into the world with the street kit's models
// (tools/props/streetkit.py -> assets/env/streetkit.glb, catalogue cat 'street'): where each one really goes, worked
// out from the roads and the track the way it is on a real street.
//
//   stop / yield     on the right-hand curb of the street that has to stop, facing the traffic coming into the
//                    junction, a metre before it
//   signals          a mast arm on the far right corner of each way into the junction, its arm out over the lanes
//   crosswalks       painted bars across the road (continental), where the map has a marked crossing
//   gates            across their driveway; bollards where they stand
//   power            poles / towers at the map's own supports along each line (more put in where a span would be too
//                    long), turned across the line, and the wires strung between them, sagging, 5.5 m clear of a road
//   rail             6 m sections of track along the line, a crossing signal each side of a road it crosses
//   barriers         guard rail (with its ends), jersey barrier, block wall, board fence along their lines; hedges
// Nothing stands on the track or its runoff, or on a road (pushed out to the side, else left out).
//
//   placeStreet(track, T, A, roadL, ground, opts) -> { pl: env placements (envlib addEnvInstances), wires: [[x, y, z], ...][],
//                     bars: crosswalk bars [{ x, z, y, rot, w, l }], stats }
//   buildStreetExtras(root, out)   the wires and the crosswalk paint, as meshes
import * as THREE from 'three';
import { envAsset } from './envlib.js';
import { pointClear } from './zones.js';

const SPAN = { pole: 50, tower: 330 };           // the longest span before another support goes in (m)
const REACH = 450;                               // supports, rail and barriers only this close to the track (m)
const CLEAR_ROAD = 5.5;                          // the lowest a wire may hang over a road (m)

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const yawOf = (fx, fz) => Math.atan2(fx, fz);            // a model's front (+Z) to face (fx, fz)
const yawAcross = (dx, dz) => Math.atan2(-dx, -dz);       // its +X across a line running (dx, dz)
const yawAlong = (dx, dz) => Math.atan2(-dz, dx);         // its +X along it
// a point in a placed model's own space (x, y, z: library space) -> the world
const toWorld = (p, q) => { const c = Math.cos(p.rot), s = Math.sin(p.rot), k = p.s || 1; return [p.x + (q[0] * c + q[2] * s) * k, p.y + q[1] * k, p.z + (-q[0] * s + q[2] * c) * k]; };

export function placeStreet(track, T, A, roadL, ground, opts = {}) {
  const st = track.osm && track.osm.street, out = { pl: [], wires: [], bars: [], drives: [], lit: [], stats: {}, why: [] };
  if (!st || !envAsset('sk_stop_a')) return out;
  const rng = mulberry(((track.geo && Math.round(track.geo.lat * 1e4)) || 7) ^ 0x51ee7);
  const count = (k, ok, why, x, z) => { const s = out.stats[k] || (out.stats[k] = { placed: 0, skipped: 0 }); ok ? s.placed++ : s.skipped++; if (!ok && opts.debug) out.why.push([k, why || '?', Math.round(x || 0), Math.round(z || 0)]); };
  // ---- the roads, as samples on a 20 m grid (and the track's own samples, A.hash)
  const G = new Map(), C = 20, samples = [];
  for (const pc of (roadL && roadL.pieces) || []) {
    const n = pc.s.length;
    pc.s.forEach((q, i) => { const r = { x: q.x, z: q.z, tx: q.tx, tz: q.tz, half: pc.w / 2, walk: pc.walk || 0, pc, i, n }; samples.push(r);
      const k = Math.floor(q.x / C) + ',' + Math.floor(q.z / C); if (!G.has(k)) G.set(k, []); G.get(k).push(r); });
  }
  const tTan = (i) => { const a = Math.max(0, i - 1), b = Math.min(T.N - 1, i + 1); let dx = T.X[b] - T.X[a], dz = T.Z[b] - T.Z[a]; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const nearestRoad = (x, z, max = 25) => {
    let best = null, bd = max;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const r of G.get((Math.floor(x / C) + a) + ',' + (Math.floor(z / C) + b)) || []) {
      const d = Math.hypot(r.x - x, r.z - z); if (d < bd) { bd = d; best = { kind: 'road', ...r, d }; } }
    A.hash.query(x, z, max, (i) => { const d = Math.hypot(T.X[i] - x, T.Z[i] - z); if (d < bd) { bd = d; const [tx, tz] = tTan(i); best = { kind: 'track', x: T.X[i], z: T.Z[i], tx, tz, half: T.W[i] / 2, walk: 0, ti: i, d }; } });
    return best;
  };
  const onRoad = (x, z, m = 0.3) => !!(roadL && roadL.onRoad(x, z, m));
  const clear = (x, z, r = 0.4) => pointClear(x, z, r, T, A) && !onRoad(x, z, r);
  // (how far from the track: supports, rail and barriers only within REACH)
  // (50 m cells whose middle is within REACH of the track, worked out once: a search 450 m round every point was slow)
  const NC = 50, near = new Set();
  for (let i = 0; i < T.N; i += Math.max(1, Math.round(NC / 2 / T.ds))) {
    const ci = Math.floor(T.X[i] / NC), cj = Math.floor(T.Z[i] / NC), r = Math.ceil(REACH / NC);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.hypot((ci + a + 0.5) * NC - T.X[i], (cj + b + 0.5) * NC - T.Z[i]) < REACH) near.add((ci + a) + ',' + (cj + b));
  }
  const nearTrack = (x, z) => near.has(Math.floor(x / NC) + ',' + Math.floor(z / NC));
  const put = (id, x, z, rot, extra) => { const a = envAsset(id); if (!a) return null; const p = { id, x, z, y: ground(x, z), rot, s: 1, ...extra }; out.pl.push(p); return p; };
  // a spot beside the road at (x, z) + side * (off..off+push): the first one that's clear
  const sideSpot = (x, z, nx, nz, off, push = 4, r = 0.4) => { for (let o = off; o <= off + push; o += 0.5) { const px = x + nx * o, pz = z + nz * o; if (clear(px, pz, r)) return [px, pz]; } return null; };
  // ... and if there's none there, further back along the road (bx, bz: back): at a street's mouth on the circuit the
  // runoff and barrier come first, so the sign stands behind them a little way up the street, as real ones do
  const spotBack = (x, z, bx, bz, nx, nz, off, push, r, backs = [0, 2, 4, 7, 11, 16]) => { for (const b of backs) { const s = sideSpot(x + bx * b, z + bz * b, nx, nz, off, push, r); if (s) return s; } return null; };

  // ---- stop and yield signs
  // (the street that stops: the nearest imported street piece if there's one, heading for its end at the junction; a
  //  sign on the track itself is a 4-way stop the circuit runs through: one each way, outside the barrier; a street
  //  the import didn't bring that meets the track: heading for the track)
  const junctions = (roadL && roadL.junctions) || [];
  const nearestStreet = (x, z, max) => { let best = null, bd = max; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const r of G.get((Math.floor(x / C) + a) + ',' + (Math.floor(z / C) + b)) || []) { const d = Math.hypot(r.x - x, r.z - z); if (d < bd) { bd = d; best = { kind: 'road', ...r, d }; } } return best; };
  const nearestTrack = (x, z, max) => { let bi = -1, bd = max; A.hash.query(x, z, max, (i) => { const d = Math.hypot(T.X[i] - x, T.Z[i] - z); if (d < bd) { bd = d; bi = i; } }); return bi < 0 ? null : { i: bi, d: bd }; };
  const signAt = (kind, x, z, hx, hz, half, push) => {
    const rx = -hz, rz = hx; // (its right: the curb the sign stands on)
    const s = spotBack(x - hx * 1.2, z - hz * 1.2, -hx, -hz, rx, rz, half, push, 0.4);
    if (!s) { count(kind, false, 'no clear spot beside the road', x, z); return; }
    put(kind === 'stop' ? (rng() < 0.3 ? 'sk_stop_b' : 'sk_stop_a') : 'sk_yield', s[0], s[1], yawOf(-hx, -hz), { tz: (rng() - 0.5) * 0.04 }); count(kind, true);
  };
  for (const [list, kind] of [[st.stop, 'stop'], [st.yield, 'yield']]) for (const q of list || []) {
    const r = nearestStreet(q[0], q[1], 20), tr = nearestTrack(q[0], q[1], 30);
    if (tr && tr.d < 3 && (!r || r.d > 3)) { // (on the circuit)
      const [tx, tz] = tTan(tr.i), half = T.W[tr.i] / 2 + 0.5;
      for (const sg of [1, -1]) signAt(kind, q[0], q[1], tx * sg, tz * sg, half, 14);
      continue;
    }
    if (r) {
      let hx = r.tx, hz = r.tz; const e = r.pc.s[r.i < r.n / 2 ? 0 : r.n - 1];
      if ((e.x - r.x) * hx + (e.z - r.z) * hz < 0) { hx = -hx; hz = -hz; }
      signAt(kind, r.x, r.z, hx, hz, r.half + r.walk * 0.6 + 0.5, 4); continue;
    }
    if (tr) { // (towards the track)
      let hx = T.X[tr.i] - q[0], hz = T.Z[tr.i] - q[1]; const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l;
      signAt(kind, q[0], q[1], hx, hz, 4, 4); continue;
    }
    count(kind, false, 'no street or track near', q[0], q[1]);
  }

  // ---- traffic signals: the map's signal nodes near each other are one junction
  const sig = (st.signals || []).slice(), used = new Uint8Array(sig.length);
  for (let a = 0; a < sig.length; a++) {
    if (used[a]) continue;
    const grp = [sig[a]]; used[a] = 1;
    for (let b = a + 1; b < sig.length; b++) if (!used[b] && Math.hypot(sig[b][0] - sig[a][0], sig[b][1] - sig[a][1]) < 40) { grp.push(sig[b]); used[b] = 1; }
    const cx = grp.reduce((s, q) => s + q[0], 0) / grp.length, cz = grp.reduce((s, q) => s + q[1], 0) / grp.length;
    // the ways in: each road / the track through here, from each side it carries on past the junction
    const lines = [];
    const seenPc = new Set();
    for (let k = -2; k <= 2; k++) for (let m = -2; m <= 2; m++) for (const r of G.get((Math.floor(cx / C) + k) + ',' + (Math.floor(cz / C) + m)) || []) {
      if (seenPc.has(r.pc)) continue; let bi = -1, bd = 22;
      r.pc.s.forEach((q, i) => { const d = Math.hypot(q.x - cx, q.z - cz); if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) continue; seenPc.add(r.pc); const q = r.pc.s[bi];
      lines.push({ x: q.x, z: q.z, tx: q.tx, tz: q.tz, half: r.pc.w / 2, walk: r.pc.walk || 0, before: bi > 3, after: bi < r.pc.s.length - 4, push: 6 });
    }
    let ti = -1, td = 22; A.hash.query(cx, cz, 22, (i) => { const d = Math.hypot(T.X[i] - cx, T.Z[i] - cz); if (d < td) { td = d; ti = i; } });
    if (ti >= 0) { const [tx, tz] = tTan(ti); lines.push({ x: T.X[ti], z: T.Z[ti], tx, tz, half: T.W[ti] / 2, walk: 0, before: true, after: true, push: 14 }); } // (the track: past its runoff and barrier)
    const cross = Math.max(6, ...lines.map(l => l.half + l.walk)), onCircuit = ti >= 0;
    let n = 0;
    for (const l of lines) for (const dir of [1, -1]) {
      if (n >= 4 || !(dir > 0 ? l.before : l.after)) continue;
      const hx = l.tx * dir, hz = l.tz * dir, rx = -hz, rz = hx; // (coming in heading h)
      // (the far right corner; on the circuit, past its runoff: further out and further on)
      const s = spotBack(cx + hx * (cross + 1.5), cz + hz * (cross + 1.5), hx, hz, rx, rz, l.half + l.walk + 0.9, onCircuit ? 16 : l.push, 0.6, onCircuit ? [0, 3, 6, 10] : [0, 2]);
      if (!s) { count('signals', false, `no clear corner (${l.push === 14 ? 'track' : 'street'} approach)`, cx, cz); continue; }
      const p = put(l.half * 2 > 9 ? 'sk_signal' : 'sk_signal_s', s[0], s[1], yawOf(-hx, -hz)); count('signals', true); n++;
      // (lit: green for the circuit's own way through, red for the streets across it; the walk signal shows the hand)
      const show = l.push === 14 ? 'g' : 'r';
      if (p) for (const q of envAsset(p.id).lamps || []) if (q[3] === show || q[3] === 'w') out.lit.push({ at: toWorld(p, q), rot: p.rot, c: q[3] === 'w' ? 'h' : show });
    }
  }

  // ---- crosswalks: continental bars across the road (a street circuit paints its own where a street meets it)
  for (const q of st.crossings || []) {
    const r = nearestRoad(q[0], q[1], 8); if (!r) { count('crossings', false); continue; }
    if (track.env && track.env.markings === 'street' && junctions.some(j => Math.hypot(j.x - r.x, j.z - r.z) < 14)) { count('crossings', false); continue; }
    const rx = -r.tz, rz = r.tx, rot = yawAlong(r.tx, r.tz);
    for (let o = -r.half + 0.5; o <= r.half - 0.4; o += 1.1) out.bars.push({ x: r.x + rx * o, z: r.z + rz * o, rot, l: 3.0, w: 0.55, track: r.kind === 'track' ? r.ti : -1 });
    count('crossings', true);
  }

  // ---- gates (across their driveway) and bollards
  for (const q of st.gates || []) {
    if (q.length < 4 || !clear(q[0], q[1], 2.4)) { count('gates', false); continue; }
    put(rng() < 0.65 ? 'sk_gate_ranch' : 'sk_gate_iron', q[0], q[1], yawAcross(q[2], q[3])); count('gates', true);
  }
  for (const q of st.bollards || []) { if (!clear(q[0], q[1], 0.3)) { count('bollards', false); continue; } put('sk_bollard', q[0], q[1], rng() * 6.28); count('bollards', true); }

  // ---- power lines: their supports and wires
  const sup = new Map(); // (the map's supports by 2 m cell: which kind)
  for (const [list, kind] of [[st.poles, 'pole'], [st.towers, 'tower']]) for (const q of list || []) sup.set(Math.round(q[0] / 2) + ',' + Math.round(q[1] / 2), kind);
  const supAt = (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = sup.get((Math.round(x / 2) + a) + ',' + (Math.round(z / 2) + b)); if (k) return k; } return null; };
  const houses = (track.scan && track.scan.houses) || [];
  const nearHouse = (x, z) => houses.some(h => { const p = h.p[0]; return Math.abs(p[0] - x) < 45 && Math.abs(p[1] - z) < 45; });
  for (const line of st.power || []) {
    const P = line.pts; if (P.length < 2) continue;
    const kinds = P.map(p => supAt(p[0], p[1])), mapped = kinds.filter(Boolean);
    const kind = mapped.includes('tower') ? 'tower' : mapped.includes('pole') ? 'pole' : (line.v >= 60000 || (line.k === 'line' && !line.v)) ? 'tower' : 'pole';
    // supports: the line's own vertices, more in between where a span is too long
    const S = [];
    for (let i = 0; i < P.length; i++) {
      if (i) { const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / SPAN[kind]);
        for (let k = 1; k < n; k++) S.push({ x: a[0] + (b[0] - a[0]) * k / n, z: a[1] + (b[1] - a[1]) * k / n, i, made: 1 }); }
      S.push({ x: P[i][0], z: P[i][1], i, end: i === 0 || i === P.length - 1 });
    }
    let prev = null, rot0 = null, nPole = 0;
    for (let k = 0; k < S.length; k++) {
      const s = S[k], a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (!nearTrack(s.x, s.z)) { prev = null; continue; }
      // off the road / track: sideways across the line up to 8 m
      let spot = clear(s.x, s.z, kind === 'tower' ? 4 : 0.5) ? [s.x, s.z] : null;
      for (let o = 1; !spot && o <= 8; o++) for (const sg of [1, -1]) { const x = s.x - dz * o * sg, z = s.z + dx * o * sg; if (!spot && clear(x, z, kind === 'tower' ? 4 : 0.5)) spot = [x, z]; }
      if (!spot) { count('power', false); prev = null; continue; }
      let rot = yawAcross(dx, dz);
      if (rot0 !== null && Math.cos(rot - rot0) < 0) rot += Math.PI; // (turned the same way as the last: no crossed wires)
      rot0 = rot;
      const id = kind === 'tower' ? 'sk_tower' : (nPole++ % 5 === 2 && nearHouse(spot[0], spot[1])) ? 'sk_pole_tx' : 'sk_pole';
      const p = put(id, spot[0], spot[1], rot, { tz: kind === 'pole' ? (rng() - 0.5) * 0.03 : 0 }); count('power', true);
      if (prev && p) string(prev, p, kind);
      prev = p;
    }
  }
  function string(a, b, kind) {
    const wa = envAsset(a.id).wires || [], wb = envAsset(b.id).wires || [], n = Math.min(wa.length, wb.length);
    const span = Math.hypot(b.x - a.x, b.z - a.z); if (span > SPAN[kind] * 1.6 || span < 2) return;
    const seg = kind === 'tower' ? 18 : 10;
    for (let k = 0; k < n; k++) {
      const p0 = toWorld(a, wa[k]), p1 = toWorld(b, wb[k]);
      let sag = span * (kind === 'tower' ? 0.028 : 0.03);
      // (lifted where it crosses a road or the track: never under CLEAR_ROAD over one)
      for (let j = 1; j < seg; j++) {
        const t = j / seg, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[2] + (p1[2] - p0[2]) * t, yl = p0[1] + (p1[1] - p0[1]) * t;
        if (onRoad(x, z, 2) || !pointClear(x, z, 0, T, A)) { const room = yl - (ground(x, z) + CLEAR_ROAD); sag = Math.max(0, Math.min(sag, room / (4 * t * (1 - t)))); }
      }
      const pts = [];
      for (let j = 0; j <= seg; j++) { const t = j / seg; pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t]); }
      out.wires.push(pts);
    }
  }

  // ---- rail: sections along the line, a crossing signal each side of a road it crosses
  for (const line of st.rail || []) {
    if (line.bridge) continue;
    const P = line.pts; let carry = 0, wasBlocked = false;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.1) continue;
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      let d = carry;
      for (; d < L; d += 6) {
        const x = a[0] + dx * (d + 3), z = a[1] + dz * (d + 3);
        if (!nearTrack(x, z)) { wasBlocked = false; continue; }
        const blocked = [-3, 0, 3].some(o => onRoad(x + dx * o, z + dz * o, 2.3) || !pointClear(x + dx * o, z + dz * o, 2.3, T, A));
        if (blocked && !wasBlocked) { // (a road here: the crossing's signals, one each side of it, facing its traffic)
          const r = nearestRoad(x, z, 12);
          if (r) for (const sg of [1, -1]) {
            const hx = r.tx * sg, hz = r.tz * sg, rx = -hz, rz = hx;
            const s = sideSpot(x - dx * 4 * sg - hx * 4, z - dz * 4 * sg - hz * 4, rx, rz, r.half + r.walk + 1.2, 4, 0.5);
            if (s) { put('sk_xing', s[0], s[1], yawOf(-hx, -hz)); count('rail_xing', true); }
          }
        }
        wasBlocked = blocked;
        if (blocked) { count('rail', false); continue; }
        put('sk_rail', x, z, yawAlong(dx, dz), { y: ground(x, z) - 0.05 }); count('rail', true);
      }
      carry = d - L; // (the next section starts where this one's spacing left off, round the bend)
    }
  }

  // ---- driveways: a paved strip from the street up to the house (cut where it would be on the track, its runoff or
  //      the street itself: the street's own surface covers its mouth)
  for (const d of st.drives || []) {
    let run = [];
    const flush = () => { let L = 0; for (let i = 1; i < run.length; i++) L += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]); if (run.length > 1 && L >= 4) { out.drives.push(run); count('driveways', true); } run = []; };
    for (let i = 1; i < d.pts.length; i++) {
      const a = d.pts[i - 1], b = d.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
        if (nearTrack(x, z) && pointClear(x, z, 1.7, T, A) && !onRoad(x, z, 0)) run.push([x, z]); else flush();
      }
    }
    flush();
  }

  // ---- barriers, walls, fences, hedges along their lines
  const LINE_ID = { guard_rail: 'sk_guardrail', jersey_barrier: 'sk_jersey', wall: 'sk_wall_cmu', retaining_wall: 'sk_wall_cmu', fence: 'sk_fence_wood' };
  for (const bl of st.barriers || []) {
    const id = LINE_ID[bl.k], P = bl.pts;
    if (bl.k === 'hedge') { // (a hedge: shrubs every 1.4 m from the track's own mix)
      const bush = opts.hedge; if (!bush) continue;
      for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < L; d += 1.4) { const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L; if (nearTrack(x, z) && clear(x, z, 0.6)) { out.pl.push({ id: bush, x, z, y: ground(x, z) - 0.1, rot: rng() * 6.28, s: 1.1 + rng() * 0.4 }); count('hedge', true); } } }
      continue;
    }
    const a0 = id && envAsset(id); if (!a0) continue;
    const len = a0.len || a0.w, hk = bl.h && a0.h ? Math.max(0.6, Math.min(1.6, bl.h / a0.h)) : 1;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const n = Math.max(1, Math.round(L / len)), sx = L / n / len, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      for (let k = 0; k < n; k++) {
        const x = a[0] + dx * (k + 0.5) * L / n, z = a[1] + dz * (k + 0.5) * L / n;
        if (!nearTrack(x, z) || !pointClear(x, z, 0.8, T, A) || onRoad(x, z, 0.2)) { count(bl.k, false); continue; }
        const first = i === 1 && k === 0, last = i === P.length - 1 && k === n - 1;
        const pid = bl.k === 'guard_rail' && (first || last) && envAsset('sk_guardrail_end') ? 'sk_guardrail_end' : id;
        out.pl.push({ id: pid, x, z, y: ground(x, z), rot: yawAlong(dx, dz) + (pid === 'sk_guardrail_end' && last ? Math.PI : 0), sx, sy: hk, sz: 1 });
        count(bl.k, true);
      }
    }
  }
  return out;
}

// the wires (thin dark lines), the crosswalk bars (white paint on the road), the driveways (concrete strips) and the
// signals' lit lenses (a glowing disc just in front of the one that's on)
const LIT = { g: 0x3dff9a, r: 0xff2a1c, y: 0xffb020, h: 0xff7a1e };
export function buildStreetExtras(root, out, surface, tex = null) {
  if (out.lit.length) {
    for (const [c, col] of Object.entries(LIT)) {
      const list = out.lit.filter(l => l.c === c); if (!list.length) continue;
      const im = new THREE.InstancedMesh(new THREE.CircleGeometry(c === 'h' ? 0.1 : 0.135, 12), new THREE.MeshBasicMaterial({ color: col }), list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((l, i) => { q.setFromAxisAngle(up, l.rot); const f = [Math.sin(l.rot), Math.cos(l.rot)]; m4.compose(new THREE.Vector3(l.at[0] + f[0] * 0.012, l.at[1], l.at[2] + f[1] * 0.012), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
      im.name = 'street-signal-lit'; root.add(im);
    }
  }
  if (out.drives.length) {
    const pos = [], uv = [], idx = [], W = 1.6;
    for (const run of out.drives) {
      let d = 0;
      run.forEach((q, k) => {
        const a = run[Math.max(0, k - 1)], b = run[Math.min(run.length - 1, k + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (k) d += Math.hypot(q[0] - run[k - 1][0], q[1] - run[k - 1][1]);
        const v = pos.length / 3;
        for (const s of [-1, 1]) { const x = q[0] - dz * W * s, z = q[1] + dx * W * s; pos.push(x, surface(x, z, -1) + 0.05, z); uv.push(s * 0.4, d * 0.25); }
        if (k) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
      });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xb4b0a6 : 0x9c9890, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = 'street-driveways'; m.receiveShadow = true; root.add(m);
  }
  if (out.wires.length) {
    const pos = [];
    for (const w of out.wires) for (let i = 1; i < w.length; i++) pos.push(...w[i - 1], ...w[i]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1c1c1e })); m.name = 'street-wires'; root.add(m);
  }
  if (out.bars.length) {
    const pos = [], idx = [];
    for (const b of out.bars) {
      const c = Math.cos(b.rot), s = Math.sin(b.rot), y = surface(b.x, b.z, b.track) + 0.035, base = pos.length / 3;
      for (const [u, v] of [[-b.l / 2, -b.w / 2], [b.l / 2, -b.w / 2], [b.l / 2, b.w / 2], [-b.l / 2, b.w / 2]]) pos.push(b.x + u * c + v * s, y, b.z - u * s + v * c);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xd8d5ca, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.name = 'street-crosswalks'; root.add(m);
  }
}
