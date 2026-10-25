// dev: how many trees / bushes a track's setting scatters, and how far from the track they land (js/scenery.js
// generateSetting: only within reach of the track, not over its whole bounding box).
//   node --import ./tools/tracks/three-hook.mjs .devtest/settingtrees.mjs ["<track name>" ...]
import fs from 'node:fs';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(ROOT + String(u), 'utf8')) });
const { sampleTrack, analyzeTrack, buildPitLane } = await import('../js/track.js');
const { roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } = await import('../js/roads.js');
const { generateSetting } = await import('../js/scenery.js');
const { loadEnvCatalog } = await import('../js/envlib.js');
const { settingOf } = await import('../js/scenery.js');
await loadEnvCatalog();
const all = [JSON.parse(fs.readFileSync(ROOT + 'saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync(ROOT + 'saves/storage/svgp.tracks.txt', 'utf8'))];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['Joeger 2', 'Lake of The Pines', 'Auburn GP2'];
let bad = 0;
for (const name of names) {
  const t = structuredClone(all.find(q => q && q.name && q.name.startsWith(name)));
  if (!t) { console.log(name, 'not found'); continue; }
  const st = settingOf(t.env); if (st.kind === 'none') t.env.setting = { ...st, kind: 'forest', seed: 7 };
  const T = sampleTrack(t); raiseTrackOverRoads(t, T);
  const A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
  applyRoadsToCircuit(t, T, A);
  const roads = A.roadL || ((t.roads || []).length ? roadLayout(t, T, A) : null);
  const t0 = performance.now(), g = generateSetting(t, T, A, roads, null), ms = performance.now() - t0;
  const far = (x, z) => { let bd = Infinity; A.hash.query(x, z, 420, (i) => { bd = Math.min(bd, Math.hypot(x - T.X[i], z - T.Z[i])); }); return bd; };
  const d = g.trees.map(q => far(q[0], q[1])), out = d.filter(v => v > 400).length;
  console.log(`${t.name.padEnd(20)} ${settingOf(t.env).kind.padEnd(8)} trees ${g.trees.length}  bushes/props ${g.props.length}  past 400 m: ${out}  ${ms.toFixed(0)} ms`);
  if (out) bad++;
}
console.log(bad ? 'FAIL: trees placed far from the track' : 'PASS');
