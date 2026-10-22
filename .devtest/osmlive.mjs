// dev: the editor's map download (js/geo.js importOSM) against the real servers, for a saved track at a few margins:
// how long it takes, how many squares, what comes back.   node --import ./tools/tracks/three-hook.mjs .devtest/osmlive.mjs "<track>" 50,250,600
import fs from 'node:fs';
const realFetch = globalThis.fetch; // (node: the servers want a User-Agent, which a browser always sends)
globalThis.fetch = (u, o = {}) => realFetch(u, { ...o, headers: { ...(o.headers || {}), 'User-Agent': 'SanVelocitaGP-dev/1.0' } });
const { sampleTrack, analyzeTrack } = await import('../js/track.js');
const { importOSM } = await import('../js/geo.js');
const { fitOsmRoads } = await import('../js/osmroads.js');
const [name, ms = '50,250,600'] = process.argv.slice(2);
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = all.find(q => q && q.name === name), T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
for (const m of ms.split(',').map(Number)) {
  // (as the editor does it)
  const line = []; for (let k = 0; k < T.N; k += Math.max(1, Math.round(60 / T.ds))) { const i = T.cut >= 0 ? (T.cut + 1 + k) % T.N : k; line.push([T.X[i], T.Z[i]]); }
  if (T.cut >= 0) line.push([T.X[T.cut], T.Z[T.cut]]);
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); c = Math.min(c, T.Z[i]); d = Math.max(d, T.Z[i]); }
  const rank = (x, z) => { let bd = Infinity; A.hash.query(x, z, m + 60, (j) => { bd = Math.min(bd, (x - T.X[j]) ** 2 + (z - T.Z[j]) ** 2); }); return bd; };
  const t0 = Date.now(); let last = '';
  const res = await importOSM(t.geo, [a - m, c - m, b + m, d + m], { buildings: true, trees: true, roads: true, line, margin: m, rank }, (s) => { last = s; });
  const t1 = Date.now(), roads = fitOsmRoads(res.ways, T, A, { touch: m });
  const km = roads.reduce((s, r) => s + r.pts.slice(1).reduce((q, p, i) => q + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0), 0) / 1000;
  console.log(`margin ${m}: ${((t1 - t0) / 1000).toFixed(1)} s download (${last}), fit ${Date.now() - t1} ms | ways ${res.ways.length} -> roads ${roads.length} (${km.toFixed(1)} km) | buildings ${res.buildings.length} trees ${res.trees.length}`);
}
