// dev: hairpins and tight corners on every circuit, without a browser. Fails where
//   runoff  - a runoff row (verge.js) reaches onto another stretch's road (slivers over the road), or crosses the next
//             row out past the road edge (the strip folded over itself: a fan of slivers in a hairpin's infield)
//   barrier - a barrier stands on another stretch's road
// and warns where
//   fold    - the road's own inside edge crosses itself between two samples (a spike on the inside curb at a nose:
//             the spline bunching its samples round a tight node, or a glitch in a map's line)
// Built-in and real circuits, and any track files given (the test hairpins).
//   node --import ./tools/tracks/three-hook.mjs .devtest/hairpins.mjs [track.json ...]
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
globalThis.window ||= globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TR = await import(join(ROOT, 'js/track.js')), V = await import(join(ROOT, 'js/verge.js')), RO = await import(join(ROOT, 'js/runoff.js')), RD = await import(join(ROOT, 'js/roads.js'));
const tracks = TR.presetTracks().map(t => [t.name, t]);
for (const f of readdirSync(join(ROOT, 'tracks/real')).filter(f => f.endsWith('.json') && f !== 'index.json')) tracks.push([f.replace('.json', ''), JSON.parse(readFileSync(join(ROOT, 'tracks/real', f)))]);
for (const f of process.argv.slice(2)) tracks.push([f.split('/').pop(), JSON.parse(readFileSync(f))]);
let bad = 0;
for (const [name, t] of tracks) {
  t.env = { ...TR.defaultEnv(t.env?.theme || 'grass'), ...(t.env || {}) };
  const T = TR.sampleTrack(t); RD.raiseTrackOverRoads(t, T);
  const A = TR.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
  A.pit = TR.buildPitLane(T, A, t.env, t.osm && t.osm.pitLane, RO.surfaceGrid(t.osm && t.osm.surface), t.dress && t.dress.pit);
  const M = V.makeVerge(T, A, t.env, null), N = T.N, sep = Math.ceil(40 / T.ds), out = [];
  // (on another stretch's road: within its half width of one of its samples, at about the same height)
  const onRoad = (i, x, z, y) => { let hit = -1; A.hash.query(x, z, 12, (j) => { if (hit >= 0 || TR.sameStretch(T, i, j, sep) || Math.abs(T.Y[j] - y) > 3) return; const dx = x - T.X[j], dz = z - T.Z[j]; if (Math.abs(dx * T.FX[j] + dz * T.FZ[j]) <= T.ds * 0.6 && Math.abs(dx * T.RX[j] + dz * T.RZ[j]) < T.W[j] / 2 - 0.3) hit = j; }); return hit; };
  const note = (kind, i, extra) => { if (!out.some(o => o.kind === kind && Math.abs(o.d - T.D[i]) < 30)) out.push({ kind, d: Math.round(T.D[i]), extra }); };
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    for (let i = 0; i < N; i++) {
      if (i === T.cut) continue;
      // the inside edge: does this sample's edge row cross the next one's? (the edge points swap order along the road)
      const j = (i + 1) % N, h = T.W[i] / 2, hj = T.W[j] / 2;
      const ax = T.X[i] + T.RX[i] * side * h, az = T.Z[i] + T.RZ[i] * side * h, bx = T.X[j] + T.RX[j] * side * hj, bz = T.Z[j] + T.RZ[j] * side * hj;
      if ((bx - ax) * T.FX[i] + (bz - az) * T.FZ[i] < 0) note('fold', i, `${side < 0 ? 'left' : 'right'} edge, radius ${(1 / Math.abs(T.K[i])).toFixed(1)} m, half width ${h.toFixed(1)} m`);
      const e = M.EXT[s][i], ej = M.EXT[s][j];
      if (e && ej && Math.min(e, ej) > T.W[i] / 2 + 0.5) { const m = Math.min(e, ej);
        const px = T.X[i] + T.RX[i] * side * m, pz = T.Z[i] + T.RZ[i] * side * m, qx = T.X[j] + T.RX[j] * side * m, qz = T.Z[j] + T.RZ[j] * side * m;
        if ((qx - px) * T.FX[i] + (qz - pz) * T.FZ[i] < -0.05) note('runoff', i, `${side < 0 ? 'left' : 'right'} apron folds over itself ${m.toFixed(1)} m out`); }
      if (e) { const k = onRoad(i, T.X[i] + T.RX[i] * side * e, T.Z[i] + T.RZ[i] * side * e, T.Y[i]); if (k >= 0) note('runoff', i, `${side < 0 ? 'left' : 'right'} apron ${e.toFixed(1)} m out reaches the road at ${Math.round(T.D[k])} m`); }
      const has = s ? A.HAS_R : A.HAS_L, off = s ? A.BR : A.BL;
      if (has[i]) { const k = onRoad(i, T.X[i] + T.RX[i] * side * off[i], T.Z[i] + T.RZ[i] * side * off[i], T.Y[i]); if (k >= 0) note('barrier', i, `${side < 0 ? 'left' : 'right'} barrier ${off[i].toFixed(1)} m out stands on the road at ${Math.round(T.D[k])} m`); }
    }
  }
  if (out.some(o => o.kind !== 'fold')) bad++;
  console.log(name.padEnd(22), out.length ? out.map(o => `${o.kind === 'fold' ? 'warn fold' : o.kind.toUpperCase()} @${o.d} m (${o.extra})`).join('\n' + ' '.repeat(23)) : 'ok');
}
console.log(bad ? `${bad} circuits with problems` : 'every circuit ok');
process.exit(bad ? 1 : 0);
