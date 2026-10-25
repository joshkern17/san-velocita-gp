// Real streets from OpenStreetMap around a circuit, as the editor's own roads (track.roads, marked osm), so they
// render, form junctions and meet the track like roads drawn by hand (js/roads.js).
//
//   osmWays(data, geo, opts)                  Overpass JSON -> the streets worth importing [{ id, hw, tags, pts, nodes }]
//   fitOsmRoads(ways, T, A, opts)             -> roads: the stretches the circuit itself drives on are taken out, and
//                                                every road that ends near the track is carried on into it, curving
//                                                round to meet the edge at a proper angle (no road stops short)
//   setOsmSidewalks(roads, mode)              'map' | 'on' | 'off' on the imported roads
//   fillLots(track, T, A, buildings, seed, reach)  houses along the imported streets where the map has none (empty lots),
//                                                within reach of the track
import { toLocal } from './geo.js';
import { roadSamples, roadLayout, ROAD_TYPES } from './roads.js';
import { buildingClear, buildingGrid } from './zones.js';

// which ways come in, and as what: [kind, width (m) with no lanes tag, sidewalk (m) when the map says nothing, lines]
const CLASS = {
  motorway: ['freeway', 24, 0, 'freeway'], trunk: ['avenue', 14, 0, 'double'],
  primary: ['avenue', 12, 2.5, 'double'], secondary: ['avenue', 10.5, 2.5, 'double'],
  tertiary: ['street', 9, 2.5, 'dash'], unclassified: ['street', 7.5, 0, 'dash'],
  residential: ['street', 7.5, 2.5, 'dash'], living_street: ['street', 6, 0, 'none'],
  motorway_link: ['street', 7, 0, 'none'], trunk_link: ['street', 7, 0, 'none'], primary_link: ['street', 7, 0, 'none'],
  secondary_link: ['street', 7, 0, 'none'], tertiary_link: ['street', 7, 0, 'none'],
  service: ['alley', 5, 0, 'none'],
};
export const OSM_ROAD_QUERY = (around) => `way["highway"~"^(${Object.keys(CLASS).join('|')})$"]["area"!="yes"](${around});`;
const num = (v) => { const m = v != null && String(v).match(/[\d.]+/); return m ? parseFloat(m[0]) : NaN; };
// a street's kind ('freeway' | 'avenue' | 'street' | 'alley') and its width (m): the map's own, else from its lanes, else
// what that class of road usually is
export const osmKind = (hw) => CLASS[hw] ? CLASS[hw][0] : null;
export function osmWidth(hw, tags) {
  const [kind, w0] = CLASS[hw], lanes = num(tags.lanes), wid = num(tags.width);
  return isFinite(wid) && wid > 3 ? Math.min(30, wid) : isFinite(lanes) ? Math.max(5, Math.min(30, lanes * 3.4 + (kind === 'street' ? 0.8 : 1.2))) : w0;
}

export function osmWays(data, geo, { driveways = false } = {}) {
  const out = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    if (el.type !== 'way' || !el.geometry || !CLASS[t.highway] || t.area === 'yes') continue;
    // service roads: alleys and named ones; driveways, car park aisles and drive-throughs only if asked
    if (t.highway === 'service' && !driveways && !(t.service === 'alley' || (t.name && !t.service))) continue;
    if (t.access === 'private' && t.highway === 'service' && !driveways) continue;
    const pts = el.geometry.map(g => toLocal(geo, g.lat, g.lon));
    if (pts.length < 2) continue;
    out.push({ id: el.id, hw: t.highway, tags: t, pts, nodes: el.nodes || [] });
  }
  return out;
}

// ---------------- geometry helpers ----------------
const R1 = (v) => Math.round(v * 10) / 10;
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
function even(pts, step) { // the line through pts, re-pointed at equal spacing (about step), ends kept
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / step)), out = [];
  for (let k = 0, i = 1; k <= n; k++) {
    const d = L * k / n; while (i < pts.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], l = cum[i] - cum[i - 1] || 1, f = Math.max(0, Math.min(1, (d - cum[i - 1]) / l));
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function simplify(pts, tol) { // Douglas-Peucker, ends kept
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let bi = -1, bd = tol;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > bd) { bd = d; bi = i; } }
    if (bi > 0) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// the nearest circuit sample to a point and where the point sits from it: { j, lat (+ right), gap past the edge, fx, fz }
function near(T, A, x, z, r = 80) {
  let bj = -1, bd = Infinity;
  // (close first, a little wider if nothing's there; further out (most of a long street) the nearest of every 10th
  // sample is plenty: there it only matters how far away the track is)
  for (const rr of [Math.min(r, 60), Math.min(r, 200)]) {
    A.hash.query(x, z, rr, (j) => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } });
    if (bj >= 0) break;
  }
  if (bj < 0 && r > 200) for (let j = 0; j < T.N; j += 10) { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } }
  if (bj < 0 || bd > r * r) return null;
  if (bj < 0) return null;
  const lat = (x - T.X[bj]) * T.RX[bj] + (z - T.Z[bj]) * T.RZ[bj];
  // past either end of a point-to-point track: the street carries on from it (the real road goes on past the finish)
  const along = (x - T.X[bj]) * T.FX[bj] + (z - T.Z[bj]) * T.FZ[bj];
  const beyond = T.cut >= 0 && ((bj === (T.cut + 1) % T.N && along < -0.5) || (bj === T.cut && along > 0.5)); // (T.cut: the run-off's end; T.cut + 1: the back of the grid)
  return { j: bj, lat, gap: Math.abs(lat) - T.W[bj] / 2, fx: T.FX[bj], fz: T.FZ[bj], beyond };
}

// Ways that carry straight on into each other at a node only they share are one street: joined, so a street is one road
// (no seams in its markings, and its ends are its real ends)
function joinWays(ways) {
  const use = new Map(); // node -> how many ways pass through / end there
  for (const w of ways) for (const n of new Set(w.nodes)) use.set(n, (use.get(n) || 0) + 1);
  let list = ways.map(w => ({ ...w, pts: w.pts.slice(), nodes: w.nodes.slice() }));
  for (let changed = true; changed;) {
    changed = false;
    const ends = new Map();
    list.forEach((w, i) => { for (const e of [0, 1]) { const n = e ? w.nodes[w.nodes.length - 1] : w.nodes[0]; if (n != null) (ends.get(n) || ends.set(n, []).get(n)).push([i, e]); } });
    for (const [n, at] of ends) {
      if (at.length !== 2 || use.get(n) !== 2 || at[0][0] === at[1][0]) continue;
      const [[i, ei], [k, ek]] = at, a = list[i], b = list[k];
      if (!a || !b || CLASS[a.hw][0] !== CLASS[b.hw][0] || (a.tags.name || '') !== (b.tags.name || '')) continue;
      // a's end at n, then b from n onwards
      const A1 = ei ? a : { ...a, pts: a.pts.slice().reverse(), nodes: a.nodes.slice().reverse() };
      const B1 = ek ? { ...b, pts: b.pts.slice().reverse(), nodes: b.nodes.slice().reverse() } : b;
      list[i] = { ...A1, pts: A1.pts.concat(B1.pts.slice(1)), nodes: A1.nodes.concat(B1.nodes.slice(1)) };
      list[k] = null; list = list.filter(Boolean); changed = true; break;
    }
  }
  return list;
}

// ---------------- the roads ----------------
// opts: { meet: 'barrier' | 'open', walks: 'map' | 'on' | 'off', touch: a street comes in if it gets this close to the
// track (m), reach: how far out from the track it's kept (a street is the whole street, not the bit inside the margin) }
export const ROAD_REACH = 700;
export function fitOsmRoads(ways, T, A, opts = {}) {
  const reach = Math.max(opts.reach ?? ROAD_REACH, opts.touch ?? 0), touch = opts.touch ?? reach, meet = opts.meet || 'barrier';
  const joined = joinWays(ways);
  const all = [];
  for (const w of joined) {
    const [kind, , walk0, lines] = CLASS[w.hw];
    const width = osmWidth(w.hw, w.tags);
    const swTag = w.tags.sidewalk || w.tags['sidewalk:both'];
    const walkMap = swTag ? (/^(no|none|separate)$/.test(swTag) ? 0 : 2.2) : walk0;
    // samples every 2 m: what each is to the circuit. 'own' = the circuit drives along this street here (close and
    // running the same way): those stretches are the track itself and are left out
    const S = resample(w.pts, 2).map(p => ({ x: p[0], z: p[1] }));
    for (let i = 0; i < S.length; i++) {
      const a = S[Math.max(0, i - 2)], b = S[Math.min(S.length - 1, i + 2)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const s = S[i], n = near(T, A, s.x, s.z, reach + 40);
      s.tx = (b.x - a.x) / l; s.tz = (b.z - a.z) / l;
      s.n = n; s.far = !n || n.gap > reach;
      s.own = !!n && !n.beyond && n.gap < 10 && Math.abs(s.tx * n.fx + s.tz * n.fz) > 0.8;
    }
    if (!S.some(q => q.n && q.n.gap < touch)) continue; // (never comes near the track)
    // (a short 'own' blip, a few metres where a street merely touches the track's line at a shallow angle: kept)
    for (let i = 0; i < S.length;) {
      if (!S[i].own) { i++; continue; }
      let e = i; while (e + 1 < S.length && S[e + 1].own) e++;
      if ((e - i + 1) * 2 < 8) for (let k = i; k <= e; k++) S[k].own = false;
      i = e + 1;
    }
    // split into the stretches kept; each end is 'node' (the street's real end), 'cut' (the track takes over) or 'edge'
    // (the edge of the imported area)
    let cur = null;
    const close = (endKind) => { if (cur && cur.s.length) { cur.e1 = endKind; all.push(cur); } cur = null; };
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s.own || s.far) { close(s.own ? 'cut' : 'edge'); continue; }
      if (!cur) cur = { w, kind, width, walkMap, lines, s: [], e0: i === 0 ? 'node' : (S[i - 1].own ? 'cut' : 'edge') };
      cur.s.push(s);
    }
    close('node');
  }
  const frags = all.filter(f => { let len = 0; for (let i = 1; i < f.s.length; i++) len += Math.hypot(f.s[i].x - f.s[i - 1].x, f.s[i].z - f.s[i - 1].z); return len >= 14; });
  // a street end another kept street carries on from, or ends on, isn't loose
  const cell = 16, grid = new Map();
  frags.forEach((f, fi) => f.s.forEach(q => { const k = Math.floor(q.x / cell) + ',' + Math.floor(q.z / cell); (grid.get(k) || grid.set(k, []).get(k)).push([fi, q]); }));
  const joinedAt = (fi, q) => {
    for (let cx = Math.floor((q.x - 5) / cell); cx <= Math.floor((q.x + 5) / cell); cx++) for (let cz = Math.floor((q.z - 5) / cell); cz <= Math.floor((q.z + 5) / cell); cz++)
      for (const [fj, o] of grid.get(cx + ',' + cz) || []) if (fj !== fi && Math.hypot(o.x - q.x, o.z - q.z) < 4) return true;
    return false;
  };
  const roads = [];
  frags.forEach((f, fi) => {
    let pts = f.s.map(s => [s.x, s.z]);
    // the ends: a cut end always meets the track; a street's own end does if it's near the track and no other street
    // carries on from it (a dead end by the circuit: on a race track that's a junction)
    for (const end of [0, 1]) {
      const kindE = end ? f.e1 : f.e0; if (kindE === 'edge') continue;
      const s = end ? f.s[f.s.length - 1] : f.s[0];
      if (!s.n || s.n.beyond || s.n.gap > (kindE === 'cut' ? 40 : 30)) continue;
      if (kindE === 'node' && joinedAt(fi, s)) continue;
      // (the street pulled back to 6 m off the edge first, so the curve into the track has room and never hooks)
      let k = end ? pts.length - 1 : 0, q = s; const step = end ? -1 : 1, keep = Math.floor(pts.length / 2);
      while (q.n && q.n.gap < 6 && (end ? k > keep : k < pts.length - 1 - keep)) { k += step; q = f.s[k]; }
      if (end) pts = pts.slice(0, k + 1); else pts = pts.slice(k);
      const add = connector(q, end ? 1 : -1, T, A);
      if (!add) continue;
      if (end) pts = pts.concat(add); else pts = add.reverse().concat(pts);
    }
    // evenly spaced points (the roads' smoothing, a uniform Catmull-Rom, overshoots and loops where neighbouring gaps
    // differ a lot: a 9 m gap next to a 250 m one sent a street back across the track)
    pts = even(pts, 8).map(p => [R1(p[0]), R1(p[1])]);
    if (pts.length < 2) return;
    roads.push({ kind: f.kind, pts, w: R1(f.width), walk: walks(opts.walks, f.walkMap, f.kind), walkMap: f.walkMap, lines: f.lines, meet: f.kind === 'freeway' ? 'over' : meet, osm: 1, name: f.w.tags.name || '', hw: f.w.hw });
  });
  return roads;
}
const walks = (mode, map, kind) => mode === 'off' ? 0 : mode === 'on' ? (kind === 'freeway' || kind === 'alley' ? 0 : Math.max(map, 2.2)) : map;
export function setOsmSidewalks(roads, mode) { for (const r of roads) if (r.osm) r.walk = walks(mode, r.walkMap ?? r.walk, r.kind); }

// A street end near the track carried on into it: a smooth curve leaving the end the way the street runs and arriving
// at the track edge at about 60 degrees to it (head on if it was already pointing at the track), 1.5 m over the edge so
// the junction (js/roads.js makeJunction) always forms. Points every 2 m, or null if the end is on the track already.
function connector(s, dir, T, A) {
  const n = s.n; if (!n || n.gap < -0.5) return null;
  const dx = s.tx * dir, dz = s.tz * dir;                          // out of the street's end
  const side = n.lat < 0 ? -1 : 1, j = n.j;
  const ox = T.RX[j] * side, oz = T.RZ[j] * side;                  // outward from the track, on the street's side
  let fx = T.FX[j], fz = T.FZ[j]; if (dx * fx + dz * fz < 0) { fx = -fx; fz = -fz; } // along the track, the way the street leans
  const into = -(dx * ox + dz * oz);                               // how squarely it already points at the track (1 = head on)
  // where it lands: ahead along the track by how much the street is running along it
  const lead = Math.max(0, Math.min(40, (n.gap + 6) * (dx * fx + dz * fz) / Math.max(0.35, into + 0.35)));
  const N = T.N, k = Math.round(lead / T.ds);
  let jq = j; for (let q = 0; q < k; q++) { const st = T.FX[jq] * fx + T.FZ[jq] * fz > 0 ? 1 : -1; if (T.cut >= 0 && ((st > 0 && jq === T.cut) || (st < 0 && jq === (T.cut + 1) % N))) break; jq = (jq + st + N) % N; }
  const off = (T.W[jq] / 2 - 1.5) * side;
  const Q = [T.X[jq] + T.RX[jq] * off, T.Z[jq] + T.RZ[jq] * off];
  // arriving direction: into the track, leaning along it (60 degrees to the edge) unless it came in square
  const lean = into > 0.85 ? 0 : 0.55;
  let ax = -T.RX[jq] * side + T.FX[jq] * Math.sign(fx * T.FX[jq] + fz * T.FZ[jq]) * lean, az = -T.RZ[jq] * side + T.FZ[jq] * Math.sign(fx * T.FX[jq] + fz * T.FZ[jq]) * lean;
  const al = Math.hypot(ax, az); ax /= al; az /= al;
  const L = Math.hypot(Q[0] - s.x, Q[1] - s.z); if (L < 1) return null;
  const c1 = [s.x + dx * L * 0.45, s.z + dz * L * 0.45], c2 = [Q[0] - ax * L * 0.4, Q[1] - az * L * 0.4];
  const out = [], m = Math.max(2, Math.ceil(L / 2));
  for (let i = 1; i <= m; i++) {
    const t = i / m, u = 1 - t;
    out.push([u * u * u * s.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * Q[0], u * u * u * s.z + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * Q[1]]);
  }
  return out;
}

// ---------------- houses on the empty lots ----------------
// Along imported residential streets, both sides: a house every lot (16-24 m), set back past the sidewalk, facing the
// street, out to `reach` from the track, wherever there's room: clear of the circuit, every road, the map's own buildings (and its other houses) by a
// yard's width. Gabled footprints, so the scenery fits a PSX house to each (js/scenery.js fitHouse).
const LOT_STREETS = new Set(['residential', 'living_street', 'unclassified']);
export function fillLots(track, T, A, buildings = [], seed = 7, reach = 350) { // reach: no further from the track than this (m)
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const L = roadLayout(track, T, A), grid = buildingGrid(buildings.map(b => ({ p: b.p })));
  const made = [], mine = [];
  for (const r of track.roads || []) {
    if (!r.osm || !LOT_STREETS.has(r.hw)) continue;
    const ss = roadSamples(r.pts, 2); if (ss.length < 6) continue;
    for (const side of [-1, 1]) {
      for (let d = 8 + rnd() * 6; d < ss[ss.length - 1].d - 8;) {
        const q = ss[Math.min(ss.length - 1, Math.round(d / 2))];
        const W = 11 + rnd() * 4, D = 9 + rnd() * 3, back = r.w / 2 + (r.walk || 0) + 5 + rnd() * 4;
        const nx = -q.tz * side, nz = q.tx * side, cx = q.x + nx * (back + D / 2), cz = q.z + nz * (back + D / 2);
        const p = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([u, v]) => [R1(cx + q.tx * u + nx * v), R1(cz + q.tz * u + nz * v)]);
        const rad = Math.hypot(W, D) / 2, nt = near(T, A, cx, cz, reach + 40);
        const ok = !!nt && nt.gap < reach && buildingClear(p, T, A) && !p.some(c => L.onRoad(c[0], c[1], 2)) && !L.onRoad(cx, cz, rad * 0.5)
          && !grid.hits(cx, cz, rad * 0.7 + 4) && !p.some(c => grid.hits(c[0], c[1], 3)) && !mine.some(m => Math.hypot(m[0] - cx, m[1] - cz) < m[2] + rad + 2);
        if (ok) { made.push({ p, h: 6, s: 'house', r: 'gable', lot: 1 }); mine.push([cx, cz, rad]); d += W + 5 + rnd() * 6; }
        else d += 4;
      }
    }
  }
  return made;
}
