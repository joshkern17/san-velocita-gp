// Pick Roads (the Circuit Designer's Location mode): a track made by clicking real streets. The streets in view come
// from OpenStreetMap as a road network; each click snaps to the nearest street (anywhere along it, so a track can start
// or end halfway down a road), and the track runs along the streets from one click to the next, the shortest way with
// as few turns as it can (whatever street a click is on is the one it takes: click just past a junction to turn
// there). Pure maths, no DOM: node .devtest/roadpick.mjs measures it.
//
//   roadGraph(ways)                 osmWays(...) -> the network: nodes where streets meet or bend, edges between them
//   snapRoad(G, x, z, r)            -> { e, t, x, z, d }: the nearest point on a street, within r m (null: none)
//   routeRoads(G, A, B)             -> { pts: [{ x, z, wi }], edges: [e], len }: along the streets from A to B
//   routeLine(G, legs, closed)      the legs as one centre line: every street exactly where the map has it, the corners
//                                   at junctions as round as the real curb is (not a racing sweep), widths from the map
//   routeAll(G, clicks, closed)    every leg, each going on the way the last came in (no turning round at a click)
//   routeOverlaps(G, legs)          the edges the route drives more than once
//   lineClashes(line, closed)       where the line runs alongside itself, and where it crosses itself
//   pickTrackPoints(line, closed)   the centre line as the track's nodes (as few as keep it within 30 cm), with handles
import { osmKind, osmWidth } from './osmroads.js';
import { fitPath } from './spline.js';

const CELL = 60; // (the snapping grid, m)

export function roadGraph(ways) {
  const idx = new Map(), X = [], Z = [], uses = [];
  const node = (id, p) => { let k = idx.get(id); if (k == null) { k = X.length; idx.set(id, k); X.push(p[0]); Z.push(p[1]); uses.push(0); } return k; };
  const W = [], E = [];
  for (const w of ways) {
    if (!w.nodes || w.nodes.length !== w.pts.length) continue;
    const t = w.tags || {}, wi = W.length;
    W.push({
      id: w.id, hw: w.hw, kind: osmKind(w.hw), name: t.name || t.ref || '', width: osmWidth(w.hw, t),
      bridge: !!(t.bridge && t.bridge !== 'no'), tunnel: !!(t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage'),
      layer: parseInt(t.layer) || 0,
    });
    let prev = -1;
    for (let i = 0; i < w.nodes.length; i++) {
      const k = node(w.nodes[i], w.pts[i]);
      uses[k] += i === 0 || i === w.nodes.length - 1 ? 1 : 2;
      if (prev >= 0 && prev !== k) E.push({ a: prev, b: k, len: Math.hypot(X[k] - X[prev], Z[k] - Z[prev]), wi });
      prev = k;
    }
  }
  const adj = X.map(() => []);
  E.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  // (a junction: three or more ways of road out of it; a bend in one street isn't one)
  const deg = Int32Array.from(adj, (l) => l.length);
  const grid = new Map(), key = (i, j) => i * 100003 + j;
  E.forEach((e, i) => {
    const x0 = Math.min(X[e.a], X[e.b]), x1 = Math.max(X[e.a], X[e.b]), z0 = Math.min(Z[e.a], Z[e.b]), z1 = Math.max(Z[e.a], Z[e.b]);
    for (let gi = Math.floor(x0 / CELL); gi <= Math.floor(x1 / CELL); gi++) for (let gj = Math.floor(z0 / CELL); gj <= Math.floor(z1 / CELL); gj++) {
      const k = key(gi, gj); (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
  });
  return { X: Float64Array.from(X), Z: Float64Array.from(Z), E, W, adj, deg, grid, key, uses };
}

export function snapRoad(G, x, z, r = 25, ok = null) { // (ok(way): only streets it accepts)
  let best = null;
  const seen = new Set();
  for (let gi = Math.floor((x - r) / CELL); gi <= Math.floor((x + r) / CELL); gi++) for (let gj = Math.floor((z - r) / CELL); gj <= Math.floor((z + r) / CELL); gj++) {
    for (const i of G.grid.get(G.key(gi, gj)) || []) {
      if (seen.has(i)) continue; seen.add(i);
      if (ok && !ok(G.W[G.E[i].wi])) continue;
      const e = G.E[i], ax = G.X[e.a], az = G.Z[e.a], dx = G.X[e.b] - ax, dz = G.Z[e.b] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < r && (!best || d < best.d)) best = { e: i, t, x: px, z: pz, d };
    }
  }
  return best;
}

// ---------------- routing ----------------
// Dijkstra over directed edges (arriving along edge e at its b end: state 2e, at its a end: 2e + 1), so each step knows
// which way it came in: turning off a street costs a little (the route stays on the street it's on unless the
// shortest way is clearly another), and a U-turn is only taken at a dead end.
const TURN = 18, UTURN = 200;
export const HAIRPIN = 2.45; // (rad, ~140°: a turn sharper than that is a hairpin; between two streets it's tighter than the road can turn)
const far = (G, s) => (s & 1 ? G.E[s >> 1].a : G.E[s >> 1].b); // (the node a state arrives at)
const near = (G, s) => (s & 1 ? G.E[s >> 1].b : G.E[s >> 1].a); // (and the one it left)
function heading(G, s) { const n0 = near(G, s), n1 = far(G, s); return Math.atan2(G.Z[n1] - G.Z[n0], G.X[n1] - G.X[n0]); }
const sameStreet = (G, a, b) => { const A = G.W[a], B = G.W[b]; return a === b || (A.name && A.name === B.name); };
function turnCost(G, s, s2) {
  if ((s >> 1) === (s2 >> 1)) return UTURN;
  let d = Math.abs(heading(G, s2) - heading(G, s)); if (d > Math.PI) d = 2 * Math.PI - d;
  const wi = G.E[s >> 1].wi, wj = G.E[s2 >> 1].wi;
  if (d < 0.35 && sameStreet(G, wi, wj)) return 0; // (straight on, along the same street)
  return TURN * (0.5 + d / Math.PI) + (sameStreet(G, wi, wj) ? 0 : 6) + (d > HAIRPIN ? 80 : 0); // (doubling back at a junction: only if it's clearly the way)
}
class Heap { // (min-heap of [cost, state])
  constructor() { this.a = []; }
  push(c, s) { const a = this.a; a.push([c, s]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

// A, B: snapRoad results. Returns the polyline from A to B along the streets, each point with the street (wi) of the
// stretch that leads to it, plus the edges driven in order, and which end of each click's edge it left A by / came
// in to B by ('a' | 'b'). opt.leave / opt.arrive: only that way (a click is a point the track drives through, so the
// next leg goes on the way the last one came in: no turning round at a click), and if there's no such way, any.
export function routeRoads(G, A, B, opt = {}) {
  if (opt.leave || opt.arrive) { const r = routeOnce(G, A, B, opt); if (r) return r; }
  return routeOnce(G, A, B, {});
}
function routeOnce(G, A, B, opt) {
  const eA = G.E[A.e], eB = G.E[B.e];
  const dist = new Map(), from = new Map(), H = new Heap();
  // leaving A: along its edge towards b (state 2e) or a (2e + 1)
  const start = (s, c) => { if (c < (dist.get(s) ?? Infinity)) { dist.set(s, c); from.set(s, -1); H.push(c, s); } };
  if (opt.leave !== 'a') start(2 * A.e, (1 - A.t) * eA.len);
  if (opt.leave !== 'b') start(2 * A.e + 1, A.t * eA.len);
  // the same edge, straight there
  let best = Infinity, bestS = -2;
  if (A.e === B.e && (!opt.leave || (opt.leave === 'b') === (B.t > A.t)) && (!opt.arrive || (opt.arrive === 'a') === (B.t > A.t))) { best = Math.abs(B.t - A.t) * eA.len; bestS = -1; }
  while (H.size) {
    const [c, s] = H.pop();
    if (c > (dist.get(s) ?? Infinity)) continue;
    if (c >= best) break;
    const n = far(G, s);
    // B's edge from this end
    if ((n === eB.a && opt.arrive !== 'b') || (n === eB.b && opt.arrive !== 'a')) {
      const sIn = n === eB.a ? 2 * B.e : 2 * B.e + 1, tc = (s >> 1) === B.e ? 0 : turnCost(G, s, sIn);
      const tot = c + tc + (n === eB.a ? B.t : 1 - B.t) * eB.len;
      if ((s >> 1) !== B.e && tot < best) { best = tot; bestS = s; }
    }
    // (the way it was heading ~40 m back: turning round over two turns close together, across the link between the
    // two halves of a divided road, is a hairpin too, and the track would lie on itself)
    let back = s, run = 0; while (run < 40 && from.get(back) >= 0) { run += G.E[back >> 1].len; back = from.get(back); }
    const h0 = back !== s ? heading(G, back) : null;
    for (const e of G.adj[n]) {
      const s2 = G.E[e].a === n ? 2 * e : 2 * e + 1;
      if (e === s >> 1 && G.adj[n].length > 1) continue; // (no U-turns but at a dead end)
      let c2 = c + turnCost(G, s, s2) + G.E[e].len * (G.W[G.E[e].wi].kind === 'alley' ? 1.5 : 1);
      if (h0 != null) { let d = Math.abs(heading(G, s2) - h0); if (d > Math.PI) d = 2 * Math.PI - d; if (d > HAIRPIN) c2 += 120; }
      if (c2 < (dist.get(s2) ?? Infinity)) { dist.set(s2, c2); from.set(s2, s); H.push(c2, s2); }
    }
  }
  if (bestS === -2) return null;
  // (parts: [edge, t0, t1], the share of each edge driven: the first and last only partly, from or to the click)
  const pts = [{ x: A.x, z: A.z, wi: eA.wi }], edges = [], parts = [];
  if (bestS === -1) { pts.push({ x: B.x, z: B.z, wi: eA.wi }); edges.push(A.e); parts.push([A.e, Math.min(A.t, B.t), Math.max(A.t, B.t)]); }
  else {
    const chain = []; for (let s = bestS; s !== -1; s = from.get(s)) chain.push(s);
    chain.reverse();
    chain.forEach((s, k) => {
      const n = far(G, s), e = s >> 1; pts.push({ x: G.X[n], z: G.Z[n], wi: G.E[e].wi, node: n }); edges.push(e);
      parts.push(k ? [e, 0, 1] : s & 1 ? [e, 0, A.t] : [e, A.t, 1]);
    });
    pts.push({ x: B.x, z: B.z, wi: eB.wi }); edges.push(B.e);
    parts.push(far(G, bestS) === eB.a ? [B.e, 0, B.t] : [B.e, B.t, 1]);
  }
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const first = parts[0], last = parts[parts.length - 1];
  const left = bestS === -1 ? (B.t > A.t ? 'b' : 'a') : first[2] === 1 ? 'b' : 'a';
  const arrived = bestS === -1 ? (B.t > A.t ? 'a' : 'b') : last[1] === 0 ? 'a' : 'b';
  return { pts: pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05), edges, parts, len, left, arrived };
}

// every leg between the clicks, each going on the way the one before came in (a loop's last leg also arriving the
// way its first leaves). changed: the clicks that moved (only their legs are routed again: prev is the old legs).
export function routeAll(G, clicks, closed, prev = null, changed = null) {
  const n = clicks.length, m = closed ? (n > 2 ? n : 0) : n - 1, legs = [];
  const other = (s) => (s === 'a' ? 'b' : 'a');
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n, keep = prev && prev[i] && changed && !changed.has(i) && !changed.has(j) && (i === 0 || legs[i - 1] === prev[i - 1]);
    if (keep) { legs.push(prev[i]); continue; }
    const leave = i > 0 && legs[i - 1] ? other(legs[i - 1].arrived) : undefined;
    const arrive = closed && i === m - 1 && legs[0] ? other(legs[0].left) : undefined;
    legs.push(routeRoads(G, clicks[i], clicks[j], { leave, arrive }));
  }
  return legs;
}

// edges driven twice or more (the same street there and back, or a figure of eight over the same stretch): the track
// would lie on itself there
// (a click's edge is driven up to it by one leg and on from it by the next: only where the two shares cover the same
// metres of street is it driven twice). Returns [{ e, t0, t1 }]: the stretches driven twice.
export function routeOverlaps(G, legs) {
  const by = new Map(), out = [];
  for (const L of legs) if (L) for (const [e, t0, t1] of L.parts) (by.get(e) || by.set(e, []).get(e)).push([t0, t1]);
  for (const [e, list] of by) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const t0 = Math.max(list[i][0], list[j][0]), t1 = Math.min(list[i][1], list[j][1]);
    if ((t1 - t0) * G.E[e].len > 1) out.push({ e, t0, t1 });
  }
  return out;
}

// Where the line runs alongside itself (the two halves of a divided road, a street there and back): stretches closer
// than the two roads' half widths and a metre, for 12 m or more, that aren't the same stretch (more than 80 m apart
// along the line). A short touch is a crossing (a figure of eight on the flat: the editor's own check asks for a
// bridge). line: routeLine's pts. Returns { alongside: [[i0, i1]], crossings: [i] } (indices into line).
export function lineClashes(line, closed) {
  const n = line.length, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  const L = cum[n - 1], C = 16, grid = new Map(), key = (x, z) => Math.floor(x / C) * 100003 + Math.floor(z / C);
  line.forEach((p, i) => { const k = key(p.x, p.z); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const hit = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = line[i];
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const j of grid.get(key(p.x + gx * C, p.z + gz * C)) || []) {
      let along = Math.abs(cum[j] - cum[i]); if (closed) along = Math.min(along, L - along);
      if (along < 80) continue;
      if (Math.hypot(line[j].x - p.x, line[j].z - p.z) < (p.w + line[j].w) / 2 + 1) hit[i] = 1;
    }
  }
  const alongside = [], crossings = [];
  for (let i = 0; i < n;) {
    if (!hit[i]) { i++; continue; }
    let j = i; while (j + 1 < n && hit[j + 1]) j++;
    if (cum[j] - cum[i] >= 12) alongside.push([i, j]); else crossings.push((i + j) >> 1);
    i = j + 1;
  }
  return { alongside, crossings };
}

// ---------------- the centre line ----------------
// A real street corner is tight: the curb's radius is ~6 m on a side street, ~9 m where a bigger road meets, so the
// middle of the road turns round ~10-14 m. That's as tight as the Monaco hairpin, which cars and the AI take, so a
// junction keeps the corner it really has (a racing sweep would pull the streets off where they are). Every street
// runs exactly on its map line up to the corner; only inside the junction does the line curve round. A bend in one
// street with no junction there is a curve the map drew with a corner: there it's as round as the points either side
// allow (the road between them is what's real), up to BEND_MAX.
export const CURB = { freeway: 14, avenue: 9, street: 6, alley: 4 };
const BEND_MAX = 80, MIN_TURN = 0.06, MIN_INSIDE = 1.8; // (rad: a smaller kink is left to the curve fit)
export const PICK_W = [8, 22]; // (the track's narrowest and widest, the editor's own range)
// the points that matter (Douglas-Peucker, tol m): the map puts a point at every crossing and driveway, a few metres
// apart, and each would be a corner too short to round. A junction's point stays if the street turns there; a
// point's street (wi) is the one leading to it, so a dropped one hands its street on.
function thin(P, closed, tol) {
  const n = P.length; if (n < 3) return P;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const dp = (a, b) => {
    const A = P[a], B = P[b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1e-9;
    let w = -1, wd = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i].x - A.x) * dz - (P[i].z - A.z) * dx) / L; if (d > wd) { wd = d; w = i; } }
    if (w >= 0) { keep[w] = 1; dp(a, w); dp(w, b); }
  };
  if (closed) { // (a loop: split at the point furthest from the first)
    let f = 1, fd = 0; for (let i = 1; i < n; i++) { const d = Math.hypot(P[i].x - P[0].x, P[i].z - P[0].z); if (d > fd) { fd = d; f = i; } }
    keep[f] = 1; dp(0, f); dp(f, n - 1);
  } else dp(0, n - 1);
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push({ ...P[i] });
  return out;
}
// legs: routeRoads results in driving order (a loop's last leg back to its first point). shape: per corner
// (junction node) 'tighter' | 'wider', else real. Returns [{ x, z, w, wi }] every ~2 m (a loop's end not repeating
// its start), and corners: [{ x, z, node, r }] for the editor.
export function routeLine(G, legs, closed, shape = {}) {
  // one polyline, the legs end to end
  let P = [];
  for (const L of legs) for (const p of L.pts) { const q = P[P.length - 1]; if (q && Math.hypot(p.x - q.x, p.z - q.z) < 0.3) { if (p.node != null) q.node = p.node; continue; } P.push({ ...p }); }
  if (closed && P.length > 2 && Math.hypot(P[0].x - P[P.length - 1].x, P[0].z - P[P.length - 1].z) < 0.3) P.pop();
  P = thin(P, closed, 0.5);
  if (P.length < 2) return { pts: [], corners: [] };
  const width = (wi) => Math.max(PICK_W[0], Math.min(PICK_W[1], G.W[wi].width));
  const at = (i) => P[((i % P.length) + P.length) % P.length];
  // the corners: at each turning point, the arc that meets both streets, its tangent points tl back along each.
  // Where the map has two bends a few metres apart (a junction drawn with a kink, a short link between two streets)
  // there's no room for either corner: the two are one corner, at where the streets either side would meet.
  const wOf = (i) => width(at(i + 1).wi); // (stretch i, from P[i] to P[i+1]: the street it's on)
  const corner = (i) => {
    const a = at(i - 1), p = at(i), b = at(i + 1);
    const ux = p.x - a.x, uz = p.z - a.z, vx = b.x - p.x, vz = b.z - p.z, lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (lu < 0.05 || lv < 0.05) return null;
    const th = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv))));
    if (th < MIN_TURN) return null;
    const junction = p.node != null && G.deg[p.node] >= 3;
    const wIn = wOf(i - 1), wOut = wOf(i);
    const kinds = [G.W[a.wi]?.kind, G.W[p.wi]?.kind, G.W[b.wi]?.kind].filter(Boolean);
    const curb = Math.max(...kinds.map(k => CURB[k] || 6));
    let r = curb + (wIn + wOut) / 4; // (the inside curb's radius, out to the middle of the road)
    if (!junction) r = Math.max(r, Math.min(BEND_MAX, 0.5 * Math.min(lu, lv) / Math.tan(th / 2))); // (a bend: as round as the points allow)
    const sh = shape[p.node]; if (sh === 'tighter') r *= 0.7; else if (sh === 'wider') r *= 1.6;
    r = Math.max(r, Math.max(wIn, wOut) / 2 + MIN_INSIDE); // (never so tight the road's inside edge folds: track.js unkink)
    return { r, tl: r * Math.tan(th / 2), th, side: Math.sign(ux * vz - uz * vx), junction };
  };
  for (let pass = 0; pass < 200; pass++) {
    const m = P.length; let merged = false;
    for (let i = closed ? 0 : 1; i < (closed ? m : m - 2) && P.length > 3; i++) {
      const j = (i + 1) % m; if (!closed && j >= m - 1) break;
      const A = corner(i), B = corner(j); if (!A || !B || A.side !== B.side) continue;
      const p = P[i], q = P[j], L = Math.hypot(q.x - p.x, q.z - p.z);
      if (A.tl + B.tl <= L) continue;
      // where the stretch before i and the one after j meet
      const a = at(i - 1), b = at(j + 1), dx1 = p.x - a.x, dz1 = p.z - a.z, dx2 = b.x - q.x, dz2 = b.z - q.z, den = dx1 * dz2 - dz1 * dx2;
      if (Math.abs(den) < 1e-6) continue;
      const s = ((q.x - p.x) * dz2 - (q.z - p.z) * dx2) / den, X = { x: p.x + dx1 * s, z: p.z + dz1 * s };
      if (s < 0 || Math.hypot(X.x - p.x, X.z - p.z) > 3 * L + 15 || Math.hypot(X.x - q.x, X.z - q.z) > 3 * L + 15) continue;
      const node = A.junction ? p.node : B.junction ? q.node : p.node;
      P[i] = { x: X.x, z: X.z, wi: p.wi, node }; P.splice(j, 1); if (j < i) i--;
      merged = true; break;
    }
    if (!merged) break;
  }
  const n = P.length; if (n < 2) return { pts: [], corners: [] };
  const segW = P.map((_, i) => wOf(i));
  const fil = new Array(n).fill(null), corners = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) fil[i] = corner(i);
  // (two corners that still want more of a stretch than it has: each gets its share)
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const A = fil[i], B = fil[(i + 1) % n]; if (!A && !B) continue;
    const L = Math.hypot(at(i + 1).x - P[i].x, at(i + 1).z - P[i].z), need = (A ? A.tl : 0) + (B ? B.tl : 0);
    if (need > L) { const k = L / need; for (const F of [A, B]) if (F) { F.tl *= k; F.r *= k; if (k < 0.85) F.squeezed = true; } }
  }
  for (let i = 0; i < n; i++) if (fil[i] && (fil[i].junction || fil[i].th > HAIRPIN)) corners.push({ x: P[i].x, z: P[i].z, node: P[i].node, r: fil[i].r, th: fil[i].th, squeezed: !!fil[i].squeezed, hairpin: fil[i].th > HAIRPIN });
  // walk it: straight stretches between the corners' tangent points, each corner an arc, a point every ~2 m
  const out = [], STEP = 2;
  const push = (x, z, w, wi) => { const q = out[out.length - 1]; if (!q || Math.hypot(x - q.x, z - q.z) > 0.2) out.push({ x, z, w, wi }); };
  const line = (x0, z0, x1, z1, w, wi) => { const L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(L / STEP)); for (let j = 0; j < k; j++) push(x0 + (x1 - x0) * j / k, z0 + (z1 - z0) * j / k, w, wi); };
  const segs = closed ? n : n - 1;
  // where each stretch starts and ends (past the corners' tangent points)
  const ends = (i) => { // stretch i: from P[i] to P[i+1]
    const a = P[i], b = at(i + 1), L = Math.hypot(b.x - a.x, b.z - a.z), fx = (b.x - a.x) / L, fz = (b.z - a.z) / L;
    const t0 = fil[i] ? fil[i].tl : 0, t1 = fil[(i + 1) % n] && (closed || i + 1 < n) ? fil[(i + 1) % n].tl : 0;
    return { x0: a.x + fx * t0, z0: a.z + fz * t0, x1: b.x - fx * t1, z1: b.z - fz * t1, fx, fz };
  };
  const arc = (i) => { // the corner at P[i]: from the end of stretch i-1 to the start of stretch i
    const f = fil[i], p = P[i], A = ends(((i - 1) % n + n) % n), B = ends(i);
    const nx = -A.fz * f.side, nz = A.fx * f.side, cx = A.x1 + nx * f.r, cz = A.z1 + nz * f.r; // (the arc's centre: inside)
    const a0 = Math.atan2(A.z1 - cz, A.x1 - cx), k = Math.max(2, Math.ceil(f.r * f.th / STEP));
    const w0 = segW[((i - 1) % n + n) % n], w1 = segW[i];
    for (let j = 0; j < k; j++) { const u = j / k, a = a0 + f.side * f.th * u; push(cx + Math.cos(a) * f.r, cz + Math.sin(a) * f.r, w0 + (w1 - w0) * u, u < 0.5 ? at(i).wi : at(i + 1).wi); }
    void B; void p;
  };
  for (let i = 0; i < segs; i++) {
    if (fil[i] && (closed || i > 0)) arc(i);
    const s = ends(i); line(s.x0, s.z0, s.x1, s.z1, segW[i], at(i + 1).wi);
  }
  if (!closed) { const q = P[n - 1]; push(q.x, q.z, segW[n - 2], q.wi); }
  return { pts: out, corners };
}

// the line as track nodes: fitted with as few curves as keep it (and its width) within tol, the first point the start
export function pickTrackPoints(line, closed, tol = 0.3) {
  const f = fitPath(line.map(p => [p.x, p.z, p.w]), { closed, tol, maxSeg: 250 });
  const r1 = (v) => Math.round(v * 10) / 10;
  let pts = f.map(q => ({ x: r1(q.p[0]), z: r1(q.p[1]), w: r1(Math.max(PICK_W[0], Math.min(PICK_W[1], q.p[2]))), e: 0, b: 0, ...(q.hi ? { hi: [r1(q.hi[0]), r1(q.hi[1])] } : {}), ...(q.ho ? { ho: [r1(q.ho[0]), r1(q.ho[1])] } : {}) }));
  if (closed) { const k = f.findIndex(q => q.i === 0); if (k > 0) pts = pts.slice(k).concat(pts.slice(0, k)); }
  return pts;
}
