// A real circuit's grandstands behind their barriers, as real ones are (js/solids.js standInside): a line of stands
// with any inside the barrier moves back whole, each along the way it faces, until all are 1 m behind it; a line that
// would have to go more than 8 m keeps its place and gets a concrete wall in front of it instead (the map's barrier
// was a fence far out behind the stands, where a real grandstand has a wall in front: track.dress.walls, made afresh
// each time, why: 'grandstand'). Changes the track in place; returns { lines, moved, walled, worst }.
// tools/tracks/build.mjs runs it on every circuit it bakes; tools/tracks/standsbehind.mjs on the circuits as they are.
import { sampleTrack, analyzeTrack, buildPitLane } from './track.js';
import { surfaceGrid } from './runoff.js';
import { standInside, STAND_DEPTH } from './solids.js';

const MOVE = 8;
const depthOf = (type) => /flags/.test(type) ? STAND_DEPTH.stand_flags : STAND_DEPTH.stand_roof;

export function standsBehind(t) {
  if (t.dress && t.dress.walls) t.dress.walls = t.dress.walls.filter(w => w.why !== 'grandstand');
  const T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
  A.pit = buildPitLane(T, A, t.env, t.osm && t.osm.pitLane, surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit); // (the garages move the barrier)
  const stands = (t.props || []).filter(p => /^tp_stand_/.test(p.type));
  const groups = new Map(); stands.forEach((p, k) => { const key = p.ln != null ? 'l' + p.ln : 's' + k; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
  let moved = 0, walled = 0, worst = 0;
  for (const G of groups.values()) {
    const was = G.map(p => [p.x, p.z]); let total = 0;
    for (let pass = 0; pass < 4 && total <= MOVE; pass++) {
      const need = Math.max(...G.map(p => standInside(T, A, p.x, p.z, p.rot || 0, depthOf(p.type))));
      if (need < 0.05) break;
      total += need + 0.2;
      for (const p of G) { p.x = +(p.x - Math.sin(p.rot || 0) * (need + 0.2)).toFixed(1); p.z = +(p.z - Math.cos(p.rot || 0) * (need + 0.2)).toFixed(1); }
    }
    if (total > MOVE) {
      G.forEach((p, k) => { p.x = was[k][0]; p.z = was[k][1]; });
      // (the wall: 2 m in front of the stands' fronts, along the line and 12 m past each end, round the lap)
      const near = G.map(p => { const fx = p.x + Math.sin(p.rot || 0) * depthOf(p.type) / 2, fz = p.z + Math.cos(p.rot || 0) * depthOf(p.type) / 2; let b = 1e9, bi = 0; for (let i = 0; i < T.N; i++) { const d = Math.hypot(fx - T.X[i], fz - T.Z[i]) - T.W[i] / 2; if (d < b) { b = d; bi = i; } } return [bi, b, ((fx - T.X[bi]) * T.RX[bi] + (fz - T.Z[bi]) * T.RZ[bi]) > 0 ? 1 : -1]; });
      const ds = near.map(n => T.D[n[0]]).sort((a, b) => a - b), side = near[0][2], off = Math.max(2, Math.min(...near.map(n => n[1])) - 2);
      let gapAt = 0, gapMax = ds[0] + T.L - ds[ds.length - 1];
      for (let k = 1; k < ds.length; k++) if (ds[k] - ds[k - 1] > gapMax) { gapMax = ds[k] - ds[k - 1]; gapAt = k; }
      const norm = (d) => +(((d % T.L) + T.L) % T.L).toFixed(1);
      t.dress = t.dress || { kerbs: [], walls: [] }; t.dress.walls = t.dress.walls || [];
      t.dress.walls.push({ side, a: norm(ds[gapAt] - 12), b: norm(ds[(gapAt - 1 + ds.length) % ds.length] + 12), type: 'concrete', off: +off.toFixed(1), why: 'grandstand' });
      walled++; continue;
    }
    if (total > 0) {
      moved++; worst = Math.max(worst, total);
      const L = (t.propLines || []).find(l => l.id === G[0].ln);
      if (L) L.pts = L.pts.map(([x, z]) => { const p = G.reduce((b, q) => Math.hypot(q.x - x, q.z - z) < Math.hypot(b.x - x, b.z - z) ? q : b, G[0]); return [+(x - Math.sin(p.rot || 0) * total).toFixed(1), +(z - Math.cos(p.rot || 0) * total).toFixed(1)]; });
    }
  }
  if (t.landmarks) t.landmarks.stands = (t.props || []).filter(p => /^tp_stand_/.test(p.type)).map(p => [p.x, p.z, p.rot]);
  return { lines: groups.size, moved, walled, worst };
}
