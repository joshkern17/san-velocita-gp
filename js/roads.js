// Public roads drawn in the editor (streets around a circuit). Shared by the editor preview and the 3D world.
// A road = { kind, pts: [[x, z], ...], w, walk, lines }. Where a road meets the circuit (track, runoff,
// barriers or pit lane) it is cut, so the circuit stays clear; where roads meet each other the markings stop.
import { pointClear } from './zones.js';
import { genStreets } from './scenery.js';

export const ROAD_TYPES = {
  street:  { label: 'Street', w: 8, walk: 2.5, lines: 'dash', color: '#5a5d63', meet: 'barrier' },
  avenue:  { label: 'Avenue', w: 13, walk: 3.2, lines: 'double', color: '#4e5156', meet: 'barrier' },
  alley:   { label: 'Alley', w: 5, walk: 0, lines: 'none', color: '#6a6c70', meet: 'barrier' },
  freeway: { label: 'Freeway', w: 24, walk: 0, lines: 'freeway', color: '#46494e', meet: 'over' },
};
// what happens where a road meets the circuit
export const MEET = {
  barrier: 'Closed (barrier across)', open: 'Open (joins the track)', gate: 'Gate (closed)',
  over: 'Bridge over the track', under: 'Track bridges it (road under)',
};
export const OVERPASS_WALK = 2.4; // sidewalk width on a track overpass
export const TRACK_RAISE = 4.5; // how much the track climbs to bridge a road (the road also dips ~3 m)
export const newRoad = (kind, pts) => ({ kind, pts, w: ROAD_TYPES[kind].w, walk: ROAD_TYPES[kind].walk, lines: ROAD_TYPES[kind].lines, meet: ROAD_TYPES[kind].meet });

// smooth (Catmull-Rom) and resample every `step` metres: [{ x, z, tx, tz, d }]
export function roadSamples(pts, step = 3) {
  if (!pts || pts.length < 2) return [];
  const fine = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      fine.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  fine.push(pts[pts.length - 1]);
  const out = [];
  let acc = 0, d = 0;
  out.push({ x: fine[0][0], z: fine[0][1], d: 0 });
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - acc;
    while (s <= L) { const t = s / L; d += step; out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, d }); s += step; }
    acc = L - (s - step);
  }
  const last = fine[fine.length - 1], lo = out[out.length - 1];
  if (Math.hypot(last[0] - lo.x, last[1] - lo.z) > step * 0.3) out.push({ x: last[0], z: last[1], d: lo.d + Math.hypot(last[0] - lo.x, last[1] - lo.z) });
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l; out[i].tz = (b.z - a.z) / l;
  }
  return out;
}

// is this point on the circuit (track + runoff + barriers) or its pit lane?
function onCircuit(x, z, r, T, A) {
  if (!pointClear(x, z, r, T, A)) return true;
  const pit = A.pit; if (!pit) return false;
  let hit = false;
  A.hash.query(x, z, 40, (j) => {
    if (hit || pit.REG[j] < 0) return;
    const lat = ((x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j]) * pit.side;
    const along = Math.abs((x - T.X[j]) * T.FX[j] + (z - T.Z[j]) * T.FZ[j]);
    if (along < T.ds * 2 && lat > T.W[j] / 2 - 2 - r && lat < pit.CEN[j] + pit.width / 2 + 3 + r) hit = true;
  });
  return hit;
}

// nearest track sample to a point: { i, lat } (lat = signed distance from the centre line, + = right)
function nearestTrack(x, z, T, A) {
  let bi = -1, bd = Infinity;
  A.hash.query(x, z, 60, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bi = j; } });
  if (bi < 0) return null;
  return { i: bi, lat: (x - T.X[bi]) * T.RX[bi] + (z - T.Z[bi]) * T.RZ[bi] };
}
function inPitArea(x, z, T, A) {
  const pit = A.pit; if (!pit) return false;
  let hit = false;
  A.hash.query(x, z, 40, (j) => {
    if (hit || pit.REG[j] < 0) return;
    const lat = ((x - T.X[j]) * T.RX[j] + (z - T.Z[j]) * T.RZ[j]) * pit.side;
    if (Math.abs((x - T.X[j]) * T.FX[j] + (z - T.Z[j]) * T.FZ[j]) < T.ds * 2 && lat > T.W[j] / 2 - 2 && lat < pit.CEN[j] + pit.width / 2 + 3) hit = true;
  });
  return hit;
}

// the circuit's frame at a fractional sample index f (centre, forward, right, width), interpolated
function frameAt(T, f) {
  const N = T.N, a = ((Math.floor(f) % N) + N) % N, b = (a + 1) % N, t = f - Math.floor(f);
  const L = (arr) => arr[a] + (arr[b] - arr[a]) * t;
  let fx = L(T.FX), fz = L(T.FZ); const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  return { x: L(T.X), z: L(T.Z), fx, fz, w: L(T.W) };
}
// where a point sits relative to the circuit: fractional sample f, lat (signed, + = right), gap past the track edge
function trackFrame(x, z, T, A) {
  let bi = -1, bd = Infinity;
  A.hash.query(x, z, 60, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bi = j; } });
  if (bi < 0) return null;
  const N = T.N, along = (x - T.X[bi]) * T.FX[bi] + (z - T.Z[bi]) * T.FZ[bi];
  const f = ((bi + Math.max(-1, Math.min(1, along / T.ds)) % N) + N) % N, e = frameAt(T, f);
  const rx = T.RX[bi], rz = T.RZ[bi];
  const lat = (x - e.x) * rx + (z - e.z) * rz;
  return { f, i: Math.round(f) % N, lat, w: e.w, gap: Math.abs(lat) - e.w / 2 };
}
const edgePt = (T, f, side) => { const e = frameAt(T, f), a = ((Math.floor(f) % T.N) + T.N) % T.N; return [e.x + T.RX[a] * side * e.w / 2, e.z + T.RZ[a] * side * e.w / 2]; };
const wrapD = (d, N) => ((d % N) + N * 1.5) % N - N / 2; // signed index difference in [-N/2, N/2)
// radius of the rounded kerb where a road flares into the track edge
// generated streets depend on the setting: a cached layout is only valid for the same one
const setKey = (track) => JSON.stringify(track.env && track.env.setting || null);
export const flareRadius = (w) => Math.max(3, Math.min(10, w * 0.7));

// a road that stops a little short of the track (drawn by eye) is carried on straight to meet it
function extendToTrack(ss, T, A) {
  for (const end of [1, 0]) {
    if (ss.length < 2) return;
    const q = end ? ss[ss.length - 1] : ss[0];
    const fr = trackFrame(q.x, q.z, T, A);
    if (!fr || fr.gap < -1 || fr.gap > 26) continue; // (ending right on the edge counts: it still needs to reach in)
    const dx = end ? q.tx : -q.tx, dz = end ? q.tz : -q.tz; // out of the road's end
    let hit = -1;
    for (let s = 1.5; s <= 42; s += 1.5) { const f2 = trackFrame(q.x + dx * s, q.z + dz * s, T, A); if (f2 && f2.gap < -0.5) { hit = s; break; } }
    if (hit < 0) continue;
    const add = [];
    for (let s = 3; s < hit + 3; s += 3) add.push({ x: q.x + dx * s, z: q.z + dz * s, tx: q.tx, tz: q.tz, d: 0, ext: true });
    if (end) { add.forEach((p, k) => { p.d = q.d + 3 * (k + 1); }); ss.push(...add); }
    else { add.reverse(); const sh = 3 * add.length; for (const s of ss) s.d += sh; add.forEach((p, k) => { p.d = 3 * k; }); ss.unshift(...add); }
  }
}

// Where a road reaches the track edge: the road stops a few metres back and a junction "apron" fills the rest,
// its kerbs sweeping round in curves (fillets) onto the track edge, like a real side street.
// ss[a] = last sample clear of the racing surface, dir = +1/-1 = which way along the road leads into the track.
// Marks the samples it replaces (.drop) and the ones that ease their height into the track edge (.blend).
function makeJunction(ss, a, dir, r, T, A) {
  const N = T.N, qa = ss[a], qb = ss[a + dir];
  const fa = trackFrame(qa.x, qa.z, T, A), fb = trackFrame(qb.x, qb.z, T, A);
  if (!fa || !fb || fa.gap <= 0) return null;
  const t0 = fa.gap / Math.max(1e-6, fa.gap - Math.min(0, fb.gap));
  const C = [qa.x + (qb.x - qa.x) * t0, qa.z + (qb.z - qa.z) * t0];
  const side = fa.lat < 0 ? -1 : 1;
  // heading into the track, averaged over the last ~10 m so a wiggle in the spline doesn't skew it
  const back = ss[Math.max(0, Math.min(ss.length - 1, a - dir * 3))];
  let dx = C[0] - back.x, dz = C[1] - back.z, dl = Math.hypot(dx, dz);
  if (dl < 1) { dx = qb.x - qa.x; dz = qb.z - qa.z; dl = Math.hypot(dx, dz) || 1; }
  dx /= dl; dz /= dl;
  const fc = trackFrame(C[0], C[1], T, A); if (!fc) return null;
  const ci = Math.round(fc.f) % N, nox = T.RX[ci] * side, noz = T.RZ[ci] * side; // outward from the track
  const dn = dx * nox + dz * noz;
  if (dn > -0.22) return null; // too shallow (road nearly alongside the track): no sensible corner
  const hw = r.w / 2, R = Math.max(flareRadius(r.w), (r.walk || 0) + 2), mx = -dz, mz = dx; // (the sidewalk rounds the inside of the curve)
  const corners = [1, -1].map(sg => {
    const px = C[0] + sg * hw * mx, pz = C[1] + sg * hw * mz;
    // where this road edge meets the track edge (straight-edge guess, then refined on the real, curving edge)
    let t = -sg * hw * (mx * nox + mz * noz) / dn;
    for (let it = 0; it < 5; it++) { const fr = trackFrame(px + dx * t, pz + dz * t, T, A); if (!fr) break; t -= fr.gap / dn; }
    const K = [px + dx * t, pz + dz * t], fk = trackFrame(K[0], K[1], T, A) || fc;
    const e = frameAt(T, fk.f);
    const s = (e.fx * mx + e.fz * mz) * sg >= 0 ? 1 : -1; // along the lap = away from the road on this side?
    const cosA = Math.max(-1, Math.min(1, -(dx * e.fx * s + dz * e.fz * s)));
    const tanH = Math.tan(Math.acos(cosA) / 2);
    // acute corners get a tighter radius so the flare doesn't run off down the track
    const tl = Math.min(2.4 * R, Math.min(R, 1.8 * R * tanH) / Math.max(0.08, tanH));
    const Ap = [K[0] - dx * tl, K[1] - dz * tl];
    const fB = ((fk.f + s * tl / T.ds) % N + N) % N, B = edgePt(T, fB, side);
    const curve = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8, a1 = (1 - u) * (1 - u), b1 = 2 * u * (1 - u), c1 = u * u; curve.push([a1 * Ap[0] + b1 * K[0] + c1 * B[0], a1 * Ap[1] + b1 * K[1] + c1 * B[1]]); }
    return { sg, tA: t - tl, fB, curve };
  });
  // the road proper ends before both flares start
  const limit = Math.min(corners[0].tA, corners[1].tA) - 0.3;
  let q = a;
  while (q >= 0 && q < ss.length && (ss[q].x - C[0]) * dx + (ss[q].z - C[1]) * dz > limit) { ss[q].drop = true; q -= dir; }
  if (q < 0 || q >= ss.length) return null;
  const E = ss[q], fe = trackFrame(E.x, E.z, T, A); if (!fe) return null;
  const gapE = Math.max(0.5, fe.gap);
  // tagged vertex: position, track sample for the edge height, weight (1 = road height at E, 0 = track edge height)
  const tag = (p, edge) => {
    if (edge !== undefined) return { x: p[0], z: p[1], ti: ((Math.round(edge) % N) + N) % N, w: 0 };
    const fr = trackFrame(p[0], p[1], T, A);
    return { x: p[0], z: p[1], ti: fr ? fr.i : fe.i, w: fr ? Math.max(0, Math.min(1, fr.gap / gapE)) : 1 };
  };
  const Eoff = (sg) => { const off = sg * dir * hw; return { x: E.x - E.tz * off, z: E.z + E.tx * off, ti: fe.i, w: 1 }; };
  const [cp, cm] = corners, poly = [Eoff(1)];
  cp.curve.forEach((p, k) => poly.push(tag(p, k === 8 ? cp.fB : undefined)));
  // track edge between the two flares
  const span = wrapD(cm.fB - cp.fB, N), st = span > 0 ? 1 : -1;
  for (let j = st > 0 ? Math.floor(cp.fB) + 1 : Math.ceil(cp.fB) - 1; st > 0 ? j < cp.fB + span : j > cp.fB + span; j += st) {
    if (Math.abs(j - cp.fB) < 0.15 || Math.abs(j - (cp.fB + span)) < 0.15) continue;
    poly.push(tag(edgePt(T, j, side), j));
  }
  for (let k = 8; k >= 0; k--) poly.push(tag(cm.curve[k], k === 8 ? cm.fB : undefined));
  poly.push(Eoff(-1));
  // sidewalks sweeping round each flare: inner (kerb) line from E, out along the curve to the track edge
  const walks = r.walk > 0 ? corners.map(c => {
    const pts = [Eoff(c.sg), ...c.curve.map((p, k) => tag(p, k === 8 ? c.fB : undefined))];
    return { pts, out: [c.sg * mx, c.sg * mz] };
  }) : [];
  // the road eases its height into the track edge over its last 30 m
  for (let k = q, n = 0; k >= 0 && k < ss.length && n < 40; k -= dir, n++) {
    const dd = Math.abs(ss[k].d - E.d);
    if (dd > 30) break;
    const tb = 1 - dd / 30;
    if (!ss[k].blend || ss[k].blend.t < tb) ss[k].blend = { ti: fe.i, side, t: tb };
  }
  E.jend = true;
  const f0 = span > 0 ? cp.fB : cm.fB;
  // walks[k].jb: the circuit sample just outside the junction's mouth on that corner's side, where the circuit's
  // own sidewalk (if it has one) resumes; the corner sidewalk runs on along the track edge to meet it there
  const fE = f0 + Math.abs(span), jbS = ((Math.ceil(f0) - 1) % N + N) % N, jbE = (Math.floor(fE) + 1) % N;
  walks.forEach((w, k) => { w.jb = (k === 0) === (span > 0) ? jbS : jbE; });
  return { side, poly, walks, E, dir, hw, gapE, f0, span: Math.abs(span), n: Math.ceil(Math.abs(span)) + 1, ti: ci, x: C[0], z: C[1] };
}

const pointInPoly = (x, z, P) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};
const segDist = (x, z, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1e-9)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
};

// Everything the world and editor need: drivable-looking pieces of every road, handled at the circuit.
// piece = { road, kind, w, walk, lines, s: samples }. Sample flags: j (junction with another road),
//   span (over/under the circuit: .br bridge / .tun tunnel, .ti track sample), blend (eases its height into
//   the track edge at a junction: { ti, side, t }), jend (the road ends here and a junction apron takes over).
// Also: junctions (aprons where roads meet the track edge, with flared kerbs and sidewalks), cut (removed
// bits), gaps (where roads meet the circuit, for the editor's markers), tunnels (where the track bridges a road).
export function roadLayout(track, T, A) {
  if (A && A.roadL && A.roadL.src === track.roads && A.roadL.setKey === setKey(track)) return A.roadL;
  // your roads, then the streets the setting generates (town / city grids)
  const roads = [...(track.roads || []), ...(T && A ? genStreets(track, T, A) : [])];
  const all = roads.map(r => roadSamples(r.pts));
  if (T && A) all.forEach((ss, ri) => { const m = roads[ri].meet || ROAD_TYPES[roads[ri].kind]?.meet; if (m !== 'over' && m !== 'under') extendToTrack(ss, T, A); });
  // spatial hash of every sample, for junction tests
  const cell = 20, grid = new Map();
  all.forEach((ss, ri) => ss.forEach((s, si) => { const k = Math.floor(s.x / cell) + ',' + Math.floor(s.z / cell); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([ri, si]); }));
  const near = (x, z, r, skip) => {
    for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) for (let cz = Math.floor((z - r) / cell); cz <= Math.floor((z + r) / cell); cz++) {
      const a = grid.get(cx + ',' + cz); if (!a) continue;
      for (const [ri, si] of a) { if (ri === skip) continue; const s = all[ri][si], rr = roads[ri].w / 2 + r; if (Math.hypot(s.x - x, s.z - z) < rr) return true; }
    }
    return false;
  };
  const pieces = [], cut = [], gaps = [], tunnels = [], junctions = [];
  roads.forEach((r, ri) => {
    // (tunnels were removed: on real terrain the cuttings came out as cliffs; old tunnel roads become bridges)
    const ss = all[ri], half = r.w / 2 + (r.walk || 0), mode = r.meet || ROAD_TYPES[r.kind]?.meet || 'barrier';
    // classify: blocked by the circuit?
    for (const s of ss) { s.j = near(s.x, s.z, 1.5, ri); s.b = T && A ? onCircuit(s.x, s.z, half, T, A) : false; }
    // runs of blocked samples: an end (touches the road's end) or a crossing (road continues on the far side)
    let k = 0;
    while (k < ss.length) {
      if (!ss[k].b) { k++; continue; }
      let e = k; while (e + 1 < ss.length && ss[e + 1].b) e++;
      const isEnd = k === 0 || e === ss.length - 1, run = ss.slice(k, e + 1);
      const pit = run.some(s => inPitArea(s.x, s.z, T, A));
      let m = mode;
      if ((m === 'over' || m === 'under') && (isEnd || pit)) m = 'barrier';
      if (pit) m = 'pitcut';
      // pit lane in the way: the road stops short of it. Everything else runs right up to the track edge
      // (it's the same road network); 'barrier' keeps the circuit's barrier across the junction, like a
      // real street circuit on race day, 'open' removes it, 'gate' puts a gate in it.
      if (m === 'pitcut') { for (const s of run) s.drop = true; cut.push(run); }
      else if (m === 'over' || m === 'under') {
        for (const s of run) { s.span = true; s[m === 'over' ? 'br' : 'tun'] = true; const nt = nearestTrack(s.x, s.z, T, A); s.ti = nt ? nt.i : -1; }
        if (m === 'under') tunnels.push({ road: ri, pts: run.map(s => [s.x, s.z]), half }); // the track was raised onto a bridge here
      } else {
        // open / gate / closed: the road meets the track edge through a flared junction apron
        const lo = Math.max(0, k - 1), hi = Math.min(ss.length - 1, e + 1);
        for (let q = lo; q <= hi; q++) { const fr = trackFrame(ss[q].x, ss[q].z, T, A); ss[q].on = !!fr && fr.gap < 0; }
        const contacts = [];
        for (let q = lo; q < hi; q++) {
          if (!ss[q].on && ss[q + 1].on) contacts.push([q, 1]);
          else if (ss[q].on && !ss[q + 1].on) contacts.push([q + 1, -1]);
        }
        for (let q = lo; q <= hi; q++) if (ss[q].on) ss[q].drop = true;
        for (const [a, dir] of contacts) {
          const jn = makeJunction(ss, a, dir, r, T, A);
          if (!jn) continue;
          Object.assign(jn, { road: ri, kind: r.kind, w: r.w, walk: r.walk || 0, lines: r.lines, gate: m === 'gate', closed: m === 'barrier' });
          junctions.push(jn);
          gaps.push({ ti: jn.ti, side: jn.side, half, gate: jn.gate, closed: jn.closed, road: ri, x: jn.x, z: jn.z });
        }
      }
      k = e + 1;
    }
    // split into drawable pieces at dropped samples
    let cur = null;
    for (const s of ss) {
      if (s.drop) { if (cur && cur.s.length >= 2) pieces.push(cur); cur = null; continue; }
      (cur ||= { road: ri, kind: r.kind, w: r.w, walk: r.walk || 0, lines: r.lines, s: [] }).s.push(s);
    }
    if (cur && cur.s.length >= 2) pieces.push(cur);
  });
  for (const jn of junctions) { // bounding boxes for hit tests
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of jn.poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const m = jn.walk + 2; jn.bb = [x0 - m, z0 - m, x1 + m, z1 + m];
  }
  // hash of road surface (incl. sidewalks) for "is this on a road?" tests. Samples flagged .elev (set by the
  // world once heights are known: bridges, tunnels, ramps) aren't at ground level, so `ground` tests skip them.
  const rgrid = new Map();
  pieces.forEach(pc => pc.s.forEach(s => { const k = Math.floor(s.x / cell) + ',' + Math.floor(s.z / cell); let a = rgrid.get(k); if (!a) rgrid.set(k, a = []); a.push([s.x, s.z, pc.w / 2 + pc.walk, s]); }));
  const test = (x, z, pad, ground, tunnelsOnly) => {
    for (let cx = Math.floor((x - 14) / cell); cx <= Math.floor((x + 14) / cell); cx++) for (let cz = Math.floor((z - 14) / cell); cz <= Math.floor((z + 14) / cell); cz++) {
      const a = rgrid.get(cx + ',' + cz); if (!a) continue;
      for (const [sx, sz, rr, s] of a) {
        if (ground && (s.elev || s.span)) continue;
        if (tunnelsOnly && !s.tun && !s.elevLow) continue;
        if (Math.hypot(sx - x, sz - z) < rr + pad + 1.6) return true;
      }
    }
    if (tunnelsOnly) return false;
    for (const jn of junctions) {
      const bb = jn.bb, m = pad + 1.6;
      if (x < bb[0] - m || x > bb[2] + m || z < bb[1] - m || z > bb[3] + m) continue;
      if (pointInPoly(x, z, jn.poly)) return true;
      for (const w of jn.walks) for (let i = 0; i < w.pts.length - 1; i++) if (segDist(x, z, w.pts[i], w.pts[i + 1]) < jn.walk + pad + 1.6) return true;
      if (pad + 1.6 > 0) for (let i = 0, P = jn.poly; i < P.length; i++) if (segDist(x, z, P[i], P[(i + 1) % P.length]) < pad + 1.6) return true;
    }
    return false;
  };
  const onRoad = (x, z, pad = 0) => test(x, z, pad, false, false);
  const onGroundRoad = (x, z, pad = 0) => test(x, z, pad, true, false);
  const underRoad = (x, z, pad = 0) => test(x, z, pad, false, true); // a road passing below here
  const out = { pieces, cut, gaps, tunnels, junctions, onRoad, onGroundRoad, underRoad, src: track.roads, setKey: setKey(track) };
  return out;
}

// Changes the circuit analysis for roads that meet it: barrier gaps / gates, and the track becomes a
// bridge where a road tunnels under it. Call after analyzeTrack + buildPitLane, before building the world.
export function applyRoadsToCircuit(track, T, A) {
  A.roadL = null;
  const L0 = roadLayout(track, T, A);
  if (!L0.pieces.length && !L0.junctions.length) return null;
  const L = L0;
  const N = T.N;
  A.GATE_L = new Uint8Array(N); A.GATE_R = new Uint8Array(N);
  A.NOWALK_L = new Uint8Array(N); A.NOWALK_R = new Uint8Array(N);
  const idx = (j) => ((j % N) + N) % N;
  for (const jn of L.junctions) {
    jn.circuitWalk = !!(track.env && track.env.walks);
    // no kerbs or circuit sidewalk across the junction's mouth (its own sidewalks wrap round onto the edge)
    for (let k = -3; k <= jn.n + 3; k++) A.KERB[idx(Math.floor(jn.f0) + k)] = 0;
    // the circuit sidewalk stops only across the mouth itself, so it meets the corner sidewalks with no gap
    for (let j = Math.ceil(jn.f0); j <= Math.floor(jn.f0 + jn.span); j++) (jn.side < 0 ? A.NOWALK_L : A.NOWALK_R)[idx(j)] = 1;
    if (jn.closed) continue; // the barrier stays across the junction
    // open / gate the barrier wherever the road (apron, sidewalks included) crosses the barrier line
    const hits = [];
    for (let k = -14; k <= jn.n + 14; k++) {
      const j = idx(Math.floor(jn.f0) + k), off = (jn.side < 0 ? A.BL[j] : A.BR[j]) * jn.side;
      if (L.onRoad(T.X[j] + T.RX[j] * off, T.Z[j] + T.RZ[j] * off, -1.2)) hits.push(j);
    }
    for (const h of hits) for (let k = -1; k <= 1; k++) {
      const j = idx(h + k);
      if (jn.gate) (jn.side < 0 ? A.GATE_L : A.GATE_R)[j] = 1;
      else (jn.side < 0 ? A.HAS_L : A.HAS_R)[j] = 0;
    }
  }
  // the raised track section over a road becomes a bridge deck (barriers pull in to its edge, smoothly)
  if (T.SPAN) {
    const touched = new Uint8Array(N);
    A.OVERPASS = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (T.SPAN[i]) { A.BRIDGE[i] = 1; A.OVERPASS[i] = 1; A.KERB[i] = 0; const e = T.W[i] / 2 + OVERPASS_WALK + 0.45; A.BL[i] = Math.min(A.BL[i], e); A.BR[i] = Math.min(A.BR[i], e); for (let k = -10; k <= 10; k++) touched[(i + k + N) % N] = 1; }
    for (const arr of [A.BL, A.BR]) { // same smoothing analyzeTrack uses: windowed min, then average
      const src = Float32Array.from(arr), mn = Float32Array.from(arr), w = 6;
      for (let i = 0; i < N; i++) if (touched[i]) { let v = 1e9; for (let k = -w; k <= w; k++) v = Math.min(v, src[(i + k + N) % N]); mn[i] = v; }
      for (let i = 0; i < N; i++) if (touched[i]) { let s2 = 0; for (let k = -w; k <= w; k++) s2 += mn[(i + k + N) % N]; arr[i] = s2 / (2 * w + 1); }
    }
    for (let i = 0; i < N; i++) if (T.SPAN[i]) { const e = T.W[i] / 2 + OVERPASS_WALK + 0.45; A.BL[i] = e; A.BR[i] = e; }
  }
  A.roadL = L;
  return L;
}

// Before analyzeTrack: where a road set to "under" crosses the circuit, lift the track onto a bridge (smooth
// cosine ramps). Marks T.SPAN (bridge deck samples). Deterministic, so every player gets the same track.
export function raiseTrackOverRoads(track, T, env = track.env || {}) {
  T.SPAN = null;
  const roads = (track.roads || []).filter(r => r.meet === 'under');
  if (!roads.length) return;
  const N = T.N, core = new Uint8Array(N);
  for (const r of roads) {
    const ss = roadSamples(r.pts, 3), half = r.w / 2 + (r.walk || 0);
    if (ss.length < 2) continue;
    const hit = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let bd = Infinity; for (const s of ss) { const d = (s.x - T.X[i]) ** 2 + (s.z - T.Z[i]) ** 2; if (d < bd) bd = d; }
      if (Math.sqrt(bd) < half + T.W[i] / 2 + 2) hit[i] = 1;
    }
    // only real crossings: the road's two ends lie on opposite sides of the track, clear of it
    for (let i = 0; i < N; i++) if (hit[i]) {
      const lat = (p) => (p.x - T.X[i]) * T.RX[i] + (p.z - T.Z[i]) * T.RZ[i];
      const a = lat(ss[0]), b = lat(ss[ss.length - 1]);
      if (Math.sign(a) !== Math.sign(b) && Math.abs(a) > T.W[i] / 2 + 8 && Math.abs(b) > T.W[i] / 2 + 8) core[i] = 1;
    }
  }
  if (!core.some(v => v)) return;
  // deck = crossing + enough either side that the ramps' embankments stay clear of the road
  const deckM = (env.runoff || 8) + 10, rampM = TRACK_RAISE / 0.055;
  const dist = new Float32Array(N).fill(Infinity);
  for (let i = 0; i < N; i++) if (core[i]) dist[i] = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 2 * N; i++) { const a = i % N, b = (i + 1) % N; dist[b] = Math.min(dist[b], dist[a] + T.ds); }
  for (let pass = 0; pass < 2; pass++) for (let i = 2 * N; i > 0; i--) { const a = i % N, b = (i - 1 + N) % N; dist[b] = Math.min(dist[b], dist[a] + T.ds); }
  T.SPAN = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const d = dist[i];
    if (d <= deckM) { T.Y[i] += TRACK_RAISE; T.SPAN[i] = 1; }
    else if (d < deckM + rampM) T.Y[i] += TRACK_RAISE * (0.5 + 0.5 * Math.cos(Math.PI * (d - deckM) / rampM));
  }
}
