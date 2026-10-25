// dev: the scenery a track ends up with (zones.js collectScenery) with and without its Real Houses & Trees scan
// (.devtest/scan.mjs cache): buildings by where they came from, trees inside / outside the scanned strip. Gates: no
// filler house (b.lot) or setting building or setting tree left inside the strip, the real ones in, nothing on the road.
//   node --import ./tools/tracks/three-hook.mjs .devtest/scanscene.mjs <file.svgp.json> [band]
import fs from 'node:fs';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(ROOT + String(u), 'utf8')) });
const { sampleTrack, analyzeTrack, buildPitLane } = await import('../js/track.js');
const { applyRoadsToCircuit, raiseTrackOverRoads } = await import('../js/roads.js');
const { collectScenery } = await import('../js/zones.js');
const { loadEnvCatalog } = await import('../js/envlib.js');
const { inScanBand, scanTrees } = await import('../js/scan.js');
await loadEnvCatalog();
const [file, bandS = '150'] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t0 = j.track || j;
const scan = JSON.parse(fs.readFileSync(`${ROOT}.devtest/out/scan/${t0.name.replace(/\W+/g, '_')}_${bandS}.json`, 'utf8'));
const run = (withScan) => {
  const t = structuredClone(t0); if (withScan) t.scan = scan; else delete t.scan;
  const T = sampleTrack(t); raiseTrackOverRoads(t, T);
  const A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
  applyRoadsToCircuit(t, T, A);
  const ms = performance.now(), sc = collectScenery(t, T, A); return { t, T, A, sc, ms: performance.now() - ms };
};
const a = run(false), b = run(true), inB = inScanBand(b.t);
const cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
const tally = (sc) => { const o = {}; for (const q of sc.buildings) { const k = (q.lot ? 'filler' : q.from) + (inB(...cen(q.p)) ? ' in' : ' out'); o[k] = (o[k] || 0) + 1; } return o; };
const tin = (sc) => sc.trees.filter(q => inB(q[0], q[1])).length;
console.log(`without scan: buildings ${JSON.stringify(tally(a.sc))}, trees ${a.sc.trees.length} (${tin(a.sc)} in the strip), ${a.ms.toFixed(0)} ms`);
console.log(`with scan:    buildings ${JSON.stringify(tally(b.sc))}, trees ${b.sc.trees.length} (${tin(b.sc)} in the strip, of ${scanTrees(scan).length} measured), ${b.ms.toFixed(0)} ms`);
const fails = [];
const leftFill = b.sc.buildings.filter(q => (q.lot || q.from === 'gen') && inB(...cen(q.p))).length; if (leftFill) fails.push(`${leftFill} made-up buildings left in the strip`);
if (!b.sc.buildings.some(q => q.from === 'scan')) fails.push('no real buildings');
const realT = new Set(scanTrees(scan).map(([x, z]) => x + ',' + z));
const fakeT = b.sc.trees.filter(q => inB(q[0], q[1]) && !realT.has(q[0] + ',' + q[1])).length; if (fakeT) fails.push(`${fakeT} made-up trees in the strip`);
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
