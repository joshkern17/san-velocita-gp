// dev: the OpenStreetMap road import (js/osmroads.js) on a saved track, with the cached map data from osmfetch.mjs:
// counts, and the checks that matter (every street near the track meets it, none left running along it, houses clear
// of roads / the circuit / each other), plus a top-down PNG.
//   node --import ./tools/tracks/three-hook.mjs .devtest/osmroads.mjs "<track name>" [out.png] [--meet open] [--fill]
import fs from 'node:fs';
import { sampleTrack, analyzeTrack, buildPitLane } from '../js/track.js';
import { roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } from '../js/roads.js';
import { osmWays, fitOsmRoads, fillLots } from '../js/osmroads.js';
import { parseOSM } from '../js/geo.js';
const argv = process.argv.slice(2), name = argv[0], png = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = all.find(q => q && q.name === name);
const { data, box } = JSON.parse(fs.readFileSync(`.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`, 'utf8'));
let T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
const t0 = Date.now();
const ways = osmWays(data, t.geo);
const roads = fitOsmRoads(ways, T, A, { touch: 250, meet: argv.includes('--meet') ? argv[argv.indexOf('--meet') + 1] : 'barrier', walks: 'map' });
console.log(`ways ${ways.length} -> roads ${roads.length} in ${Date.now() - t0} ms; km ${(roads.reduce((s, r) => s + r.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0), 0) / 1000).toFixed(1)}`);
t.roads = roads;
T = sampleTrack(t); raiseTrackOverRoads(t, T);
A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
const t1 = Date.now(); applyRoadsToCircuit(t, T, A); const L = A.roadL || roadLayout(t, T, A);
console.log(`layout ${Date.now() - t1} ms: pieces ${L.pieces.length}, junctions ${L.junctions.length}, crossings/cuts ${L.cut.length}`);
// --- checks
const nearT = (x, z) => { let bj = -1, bd = Infinity; A.hash.query(x, z, 320, j => { const d = (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2; if (d < bd) { bd = d; bj = j; } }); if (bj < 0) return null; const lat = (x - T.X[bj]) * T.RX[bj] + (z - T.Z[bj]) * T.RZ[bj]; const al = (x - T.X[bj]) * T.FX[bj] + (z - T.Z[bj]) * T.FZ[bj]; return { j: bj, gap: Math.abs(lat) - T.W[bj] / 2, beyond: T.cut >= 0 && ((bj === (T.cut + 1) % T.N && al < -0.5) || (bj === T.cut && al > 0.5)) }; };
// loose: a drawn piece's end within 30 m of the track that isn't a junction end and doesn't touch another road
const loose = []; let pitStops = 0;
for (const pc of L.pieces) for (const q of [pc.s[0], pc.s[pc.s.length - 1]]) {
  if (q.jend || q.j) continue;
  const n = nearT(q.x, q.z); if (!n || n.beyond || n.gap > 30) continue;
  const other = L.pieces.some(o => o !== pc && o.s.some(s => Math.hypot(s.x - q.x, s.z - q.z) < o.w / 2 + 3));
  const inJn = L.junctions.some(jn => Math.hypot(jn.E.x - q.x, jn.E.z - q.z) < 3);
  const pit = L.cut.some(run => run.some(c => Math.hypot(c.x - q.x, c.z - q.z) < 5)); // (stops at the pit lane: by design)
  if (!other && !inJn && !pit) loose.push([Math.round(q.x), Math.round(q.z), +n.gap.toFixed(1), pc.road]);
  if (pit) pitStops++;
}
// alongside: road surface running parallel within 12 m of the track edge for more than 20 m
let along = 0;
for (const pc of L.pieces) { let run = 0; for (const s of pc.s) { const n = nearT(s.x, s.z); const par = n && !n.beyond && n.gap < 12 && Math.abs(s.tx * T.FX[n.j] + s.tz * T.FZ[n.j]) > 0.85; run = par ? run + 3 : 0; if (run === 21) { along++; console.log('  alongside:', roads[pc.road].name, roads[pc.road].hw, Math.round(s.x), Math.round(s.z), 'gap', n.gap.toFixed(1)); } } }
console.log(`CHECK loose ends near the track: ${loose.length}`, loose.slice(0, 12), `(${pitStops} stop at the pit lane)`);
console.log(`CHECK stretches running alongside the track: ${along}`);
// houses
const osm = parseOSM(t.geo, data, box, { rank: (x, z) => { const n = nearT(x, z); return n ? n.gap : 1e9; } });
const bl = osm.buildings.filter(b => { const n = nearT(b.p[0][0], b.p[0][1]); return n && n.gap < 260; });
const lots = argv.includes('--fill') ? fillLots(t, T, A, bl, 7, 350) : [];
const onRd = lots.filter(b => b.p.some(c => L.onRoad(c[0], c[1])));
console.log(`map buildings in reach ${bl.length}, lots filled ${lots.length}, filled lots on a road ${onRd.length}`);
if (png) {
  let xs = [...T.X], zs = [...T.Z], x0 = Math.min(...xs) - 280, z0 = Math.min(...zs) - 280, W = Math.max(...xs) + 280 - x0, H = Math.max(...zs) + 280 - z0;
  if (argv.includes('--at')) { const [cx, cz, r] = argv[argv.indexOf('--at') + 1].split(',').map(Number); x0 = cx - r; z0 = cz - r; W = H = 2 * r; } // (a close-up)
  const J = { W, H, x0, z0, track: [...Array(T.N).keys()].map(k => (T.cut + 1 + k) % T.N).map(i => [T.X[i], T.Z[i], T.W[i]]), pieces: L.pieces.map(pc => ({ w: pc.w + 2 * pc.walk, rw: pc.w, s: pc.s.map(q => [q.x, q.z]) })),
    jn: L.junctions.map(j => j.poly.map(p => [p.x, p.z])), b: bl.map(b => b.p), lots: lots.map(b => b.p), loose, roads: roads.map(r => r.pts) };
  fs.writeFileSync(png + '.json', JSON.stringify(J));
  const k = 2400 / Math.max(W, H), X = (x) => ((x - x0) * k).toFixed(1), Z = (z) => ((z - z0) * k).toFixed(1);
  const poly = (p, f) => `<polygon points="${p.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="${f}"/>`;
  const line = (p, c, w) => `<polyline points="${p.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="none" stroke="${c}" stroke-width="${Math.max(1, w * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W * k)}" height="${Math.ceil(H * k)}"><rect width="100%" height="100%" fill="#223420"/>`,
    ...J.b.map(p => poly(p, '#968c78')), ...J.lots.map(p => poly(p, '#f0c83c')),
    ...J.pieces.map(pc => line(pc.s, '#a0a0a5', pc.w)), ...J.pieces.map(pc => line(pc.s, '#50525a', pc.rw)),
    ...J.jn.map(p => poly(p, '#5a8cdc')), line(J.track.map(q => [q[0], q[1]]), '#c8281e', J.track[0][2]),
    ...J.loose.map(([x, z]) => `<circle cx="${X(x)}" cy="${Z(z)}" r="10" fill="none" stroke="#ff0" stroke-width="3"/>`), '</svg>'].join('\n');
  fs.writeFileSync(png.replace(/\.png$/, '.svg'), svg);
  console.log('wrote', png.replace(/\.png$/, '.svg'));
}
if (argv.includes('--why')) for (const [x, z, g, ri] of loose) {
  const r = roads[ri], pc = L.pieces.filter(p => p.road === ri);
  console.log('road', ri, r.hw, r.name, 'w', r.w, 'pts', r.pts.length, 'ends', r.pts[0], r.pts[r.pts.length - 1], 'pieces', pc.map(p => [p.s.length, Math.round(p.s[0].x), Math.round(p.s[0].z), Math.round(p.s[p.s.length - 1].x), Math.round(p.s[p.s.length - 1].z)]));
  const n = nearT(x, z); console.log('  at', x, z, 'gap', n.gap.toFixed(1), 'track w', T.W[n.j], 'junctions near', L.junctions.filter(j => Math.hypot(j.x - x, j.z - z) < 40).map(j => [Math.round(j.x), Math.round(j.z), j.road]));
}
