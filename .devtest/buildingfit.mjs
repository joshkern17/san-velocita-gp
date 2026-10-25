// dev: what each building on a track turns into (zones.js collectScenery -> scenery.js fitModels): its source, its
// kind (s), the model it got and that model's class, the model's height against the building's real height, its area.
// Gates: no house / small low building given a tower, office or apartment block; model heights within 40% of the
// building's own (where it has one: the map's height / levels or the laser's roof). TOP=n lists the biggest misfits.
//   node --import ./tools/tracks/three-hook.mjs .devtest/buildingfit.mjs <file.svgp.json>
import fs from 'node:fs';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(ROOT + String(u), 'utf8')) });
const { sampleTrack, analyzeTrack, buildPitLane } = await import('../js/track.js');
const { applyRoadsToCircuit, raiseTrackOverRoads } = await import('../js/roads.js');
const { collectScenery, polyArea } = await import('../js/zones.js');
const { loadEnvCatalog, envAsset } = await import('../js/envlib.js');
await loadEnvCatalog();
const t = (j => j.track || j)(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const T = sampleTrack(t); raiseTrackOverRoads(t, T);
const A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
applyRoadsToCircuit(t, T, A);
const real = new Map(); // (the building's own height before fitting: by its first corner)
for (const b of (t.osm && t.osm.buildings) || []) real.set(b.p[0].join(','), { h: b.h, s: b.s, src: 'osm', lot: b.lot });
for (const b of (t.scan && t.scan.houses) || []) real.set(b.p[0].join(','), { h: b.h, s: b.k, src: 'scan', use: b.use });
// (fitHouse replaces the footprint: keep the originals by object identity before collectScenery runs)
const sc = collectScenery(t, T, A);
const rows = [];
for (const b of sc.buildings) {
  const a = b.m && envAsset(b.m), area = Math.abs(polyArea(b.p));
  rows.push({ blk: !!b.keepBlock, from: b.lot ? 'filler' : b.from, s: b.s || '', m: b.m || (b.build ? '(built)' : b.buildShop ? '(shop:' + b.buildShop + ')' : '(block)'), cls: a ? a.cls : b.build ? 'built' : '-', mh: +(b.h || 0).toFixed(1), rh: b.hReal, area: Math.round(area), use: b.use || '' });
}
const tally = {}; for (const r of rows) { const k = `${r.from} ${r.s || '?'} -> ${r.cls}`; tally[k] = (tally[k] || 0) + 1; }
console.log(`${t.name}: ${rows.length} buildings`); for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
const BIG = new Set(['tower', 'highrise', 'midrise']);
const wrong = rows.filter(r => BIG.has(r.cls) && (r.s === 'house' || r.area < 400) && /^(scan|osm|filler)$/.test(r.from)); // (real buildings: your zones and a setting's are yours to choose)
console.log(`small buildings given a tower / office / apartment block: ${wrong.length}`);
for (const r of wrong.slice(0, +(process.env.TOP || 8))) console.log('   ', JSON.stringify(r));
const big = rows.filter(r => r.area > 1200).sort((a, b) => b.area - a.area).slice(0, 6); console.log('biggest:', big.map(r => `${r.area} m² ${r.from}/${r.s}/${r.use} -> ${r.m} (${r.cls}, ${r.mh} m)`).join(' | '));
const known = rows.filter(r => r.rh && r.m !== '(built)'), off = known.filter(r => Math.abs(r.mh / r.rh - 1) > 0.4);
const err = known.map(r => Math.abs(r.mh - r.rh)).sort((a, b) => a - b);
console.log(`heights: ${known.length} buildings with a real one, model vs real: median ${(err[err.length >> 1] || 0).toFixed(1)} m off, ${off.length} more than 40% off`);
for (const r of off.slice(0, 5)) console.log('   ', JSON.stringify(r));
console.log(`plain blocks (real outline + height, no model fits): ${rows.filter(r => r.m === '(block)' && r.blk).length}; houses built to their own outline: ${rows.filter(r => r.m === '(built)').length}`);
// (with a setting on, a building with no model and not kept as a block isn't drawn at all: the grass is still cut
//  round it, a bare square in the field)
const ghosts = rows.filter(r => r.m === '(block)' && !r.blk);
if (t.env.setting && t.env.setting.kind !== 'none') { console.log(`buildings with no model that won't be drawn (a bare square): ${ghosts.length} ${JSON.stringify(ghosts.reduce((o, r) => (o[r.from + '/' + (r.s || '?')] = (o[r.from + '/' + (r.s || '?')] || 0) + 1, o), {}))}`); }
console.log(wrong.length || off.length > known.length * 0.03 ? 'FAIL: ' + [wrong.length && 'wrong kind of model', off.length > known.length * 0.03 && 'heights off'].filter(Boolean).join(', ') : 'PASS');
