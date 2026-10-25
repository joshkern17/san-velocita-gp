// dev: Real Houses & Trees (js/scan.js) on a track file: FEMA outlines + LiDAR trees within the band, cached to
// .devtest/out/scan/<name>.json; then: how many, roof heights found, download size and time, save size, and gates:
// every tree inside the band, no tree inside a building, some roofs measured.
//   node --import ./tools/tracks/three-hook.mjs .devtest/scan.mjs <file.svgp.json> [band] [--fresh] [--write out.json]
import fs from 'node:fs';
const { sampleTrack } = await import('../js/track.js');
const { fetchScan, scanTrees, scanStats, inScanBand } = await import('../js/scan.js');
const { pointInPoly } = await import('../js/zones.js');
const args = process.argv.slice(2), file = args[0], band = +(args[1] && !args[1].startsWith('--') ? args[1] : 150);
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j, T = sampleTrack(t);
const cache = `.devtest/out/scan/${t.name.replace(/\W+/g, '_')}_${band}.json`;
let scan;
if (fs.existsSync(cache) && !args.includes('--fresh')) scan = JSON.parse(fs.readFileSync(cache, 'utf8'));
else {
  let last = ''; scan = await fetchScan(t, T, { band, onStatus: (m) => { if (m.split('…')[0] !== last.split('…')[0]) process.stdout.write('\n'); last = m; process.stdout.write('\r' + m + '   '); } });
  console.log(); fs.mkdirSync('.devtest/out/scan', { recursive: true }); fs.writeFileSync(cache, JSON.stringify(scan));
}
t.scan = scan;
const st = scanStats(scan), trees = scanTrees(scan), sv = scan.src.survey;
const kinds = {}; for (const b of scan.houses) kinds[b.k || '?'] = (kinds[b.k || '?'] || 0) + 1;
const hs = scan.houses.filter(b => b.h).map(b => b.h).sort((a, b) => a - b), th = trees.map(q => q[2]).sort((a, b) => a - b);
const L = (T.open ? T.finish : T.N) * T.ds / 1000;
console.log(`${t.name}: ${L.toFixed(1)} km, band ${band} m, ${scan.secs ?? '?'} s`);
console.log(`buildings ${st.houses} ${JSON.stringify(kinds)}, roof measured ${hs.length} (median ${hs[hs.length >> 1]} m, 10-90% ${hs[Math.floor(hs.length * 0.1)]}-${hs[Math.floor(hs.length * 0.9)]} m)`);
console.log(`trees ${st.trees}, median ${th[th.length >> 1]} m tall, 90% ${th[Math.floor(th.length * 0.9)]} m`);
console.log(`survey ${sv && sv.name} (${sv && sv.year}, covers ${sv && Math.round(sv.cover * 100)}% of the track): ${sv && sv.chunks} chunks, ${sv && sv.mb} MB, ${sv && (sv.points / 1e6).toFixed(1)} M returns`);
console.log(`in the save: ${st.kb} KB`);
const fails = [], inB = inScanBand(t);
const out = trees.filter(([x, z]) => !inB(x, z)).length; if (out) fails.push(`${out} trees outside the band`);
let inside = 0; const grid = new Map(); scan.houses.forEach((b, i) => { for (const q of b.p) { const k = Math.floor(q[0] / 20) + ',' + Math.floor(q[1] / 20); if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(i); } });
for (const [x, z] of trees) for (const i of grid.get(Math.floor(x / 20) + ',' + Math.floor(z / 20)) || []) if (pointInPoly(x, z, scan.houses[i].p)) { inside++; break; }
if (inside > trees.length * 0.002) fails.push(`${inside} trees inside buildings`);
if (scan.houses.length && hs.length < scan.houses.length * 0.5) fails.push('roof heights for under half the buildings');
if (args.includes('--write')) { fs.writeFileSync(args[args.indexOf('--write') + 1], JSON.stringify(j)); console.log('wrote', args[args.indexOf('--write') + 1]); }
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
