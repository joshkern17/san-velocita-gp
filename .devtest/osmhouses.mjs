// dev: the editor's import (roads + map buildings + trees + empty lots) on a saved track with the cached map data, then
// the scenery the game would build from it (zones.js collectScenery, with the real model catalogue), and the checks:
// houses on a road, houses overlapping, trees whose crown reaches into a house, buildings on the circuit.
//   node --import ./tools/tracks/three-hook.mjs .devtest/osmhouses.mjs "<track name>"
import fs from 'node:fs';
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => (typeof u === 'string' && !/^https?:/.test(u) ? Promise.resolve({ ok: true, json: async () => JSON.parse(fs.readFileSync(u, 'utf8')) }) : realFetch(u, o));
const { loadEnvCatalog, envAsset } = await import('../js/envlib.js');
await loadEnvCatalog();
const { sampleTrack, analyzeTrack, buildPitLane } = await import('../js/track.js');
const { applyRoadsToCircuit, raiseTrackOverRoads } = await import('../js/roads.js');
const { osmWays, fitOsmRoads, fillLots } = await import('../js/osmroads.js');
const { parseOSM } = await import('../js/geo.js');
const { collectScenery, polysOverlap, pointClear } = await import('../js/zones.js');
const name = process.argv[2];
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = structuredClone(all.find(q => q && q.name === name));
const { data, box } = JSON.parse(fs.readFileSync(`.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`, 'utf8'));
let T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
const m = 250, rank = (x, z) => { let bd = Infinity; A.hash.query(x, z, m + 60, (j) => { bd = Math.min(bd, (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2); }); return bd; };
const res = parseOSM(t.geo, data, box, { rank });
res.buildings = res.buildings.filter(b => rank(...b.p[0]) < (m + 20) ** 2);
res.trees = res.trees.filter(q => rank(q[0], q[1]) < (m + 20) ** 2);
t.roads = fitOsmRoads(osmWays(data, t.geo), T, A, { touch: m });
t.osm = { buildings: res.buildings, trees: res.trees, bbox: box };
t.osm.buildings.push(...fillLots(t, T, A, t.osm.buildings, 7, m + 100));
T = sampleTrack(t); raiseTrackOverRoads(t, T);
A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
applyRoadsToCircuit(t, T, A);
const t0 = Date.now(), S = collectScenery(t, T, A), L = A.roadL;
if (process.argv[3]) { // (the imported track, and spots to look at: junctions, and lots with houses on them)
  const jn = L.junctions.map(j => [Math.round(j.x), Math.round(j.z), j.side, j.ti]);
  const lots = S.buildings.filter(b => b.lot).map(b => b.p[0]);
  fs.writeFileSync(process.argv[3], JSON.stringify({ track: t, jn, lots }));
}
console.log(`scenery ${Date.now() - t0} ms: buildings ${S.buildings.length} (map ${S.buildings.filter(b => b.from === 'osm' && !b.lot).length}, lots ${S.buildings.filter(b => b.lot).length}, as PSX houses ${S.buildings.filter(b => b.m).length}), rejected ${S.rejected.length}, trees ${S.trees.length}`);
const onRoad = S.buildings.filter(b => b.p.some(q => L.onRoad(q[0], q[1])));
let overl = 0; for (let i = 0; i < S.buildings.length; i++) for (let k = i + 1; k < S.buildings.length; k++) { const a = S.buildings[i].p, b = S.buildings[k].p; if (Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) < 60 && polysOverlap(a, b)) overl++; }
const inTree = S.trees.filter(q => { const a = q[2] && envAsset(q[2]), r = a ? Math.max(a.w, a.d) / 2 * (q[3] || 1) * 0.6 : 1; return S.buildings.some(b => { const c = b.p; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return q[0] > x0 - r && q[0] < x1 + r && q[1] > z0 - r && q[1] < z1 + r; }); });
const onCircuit = S.buildings.filter(b => b.p.some(q => !pointClear(q[0], q[1], 0, T, A)));
console.log(`CHECK houses touching a road: ${onRoad.length}`);
console.log(`CHECK buildings overlapping: ${overl}`);
console.log(`CHECK trees with their crown in a building: ${inTree.length}`);
console.log(`CHECK buildings on the circuit: ${onCircuit.length}`);
for (const b of onCircuit) console.log('  on circuit:', b.from, b.lot ? 'lot' : '', b.m, b.p[0]);
console.log('setting', JSON.stringify(t.env.setting), 'imported trees', t.osm.trees.length, 'paint strokes', (t.paint || []).length);
const t2 = structuredClone(all.find(q => q && q.name === name)); const T2 = sampleTrack(t2), A2 = analyzeTrack(T2, t2.env, t2.paint, t2.osm, t2.dress); A2.pit = buildPitLane(T2, A2, t2.env, null, null, null); applyRoadsToCircuit(t2, T2, A2);
const S2 = collectScenery(t2, T2, A2); console.log('before import: buildings', S2.buildings.length, 'trees', S2.trees.length);
const by = {}; for (const b of onRoad) { const k = b.from + (b.lot ? '-lot' : '') + (b.m ? '-model' : ''); by[k] = (by[k] || 0) + 1; } console.log('touching a road by source', by);
const L2 = A2.roadL; if (L2) console.log('before import, touching a road:', S2.buildings.filter(b => b.p.some(q => L2.onRoad(q[0], q[1]))).length);
const pairs = {}; for (let i = 0; i < S.buildings.length; i++) for (let k = i + 1; k < S.buildings.length; k++) { const a = S.buildings[i], b = S.buildings[k]; if (Math.hypot(a.p[0][0] - b.p[0][0], a.p[0][1] - b.p[0][1]) < 60 && polysOverlap(a.p, b.p)) { const key = [a.from + (a.lot ? '-lot' : ''), b.from + (b.lot ? '-lot' : '')].sort().join(' x '); pairs[key] = (pairs[key] || 0) + 1; } }
console.log('overlaps by source', pairs);
let o2 = 0; for (let i = 0; i < S2.buildings.length; i++) for (let k = i + 1; k < S2.buildings.length; k++) { const a = S2.buildings[i].p, b = S2.buildings[k].p; if (Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) < 60 && polysOverlap(a, b)) o2++; } console.log('before import overlaps', o2);
