// dev: the street details a track's map import brings (js/streetdata.js via geo.js importOSM opts.street), cached to
// .devtest/out/street/<name>.json: how many of each, and that the points carry a direction where they should.
//   node --import ./tools/tracks/three-hook.mjs .devtest/streetdata.mjs <file.svgp.json> [margin] [--fresh]
import fs from 'node:fs';
const f0 = globalThis.fetch; globalThis.fetch = (u, o = {}) => f0(u, { ...o, headers: { ...(o.headers || {}), 'User-Agent': 'SanVelocitaGP-dev/1.0' } }); // (the map servers turn away Node's default)
const { sampleTrack, analyzeTrack } = await import('../js/track.js');
const { importOSM } = await import('../js/geo.js');
const { streetCounts } = await import('../js/streetdata.js');
const args = process.argv.slice(2), file = args[0], m = +(args[1] && !args[1].startsWith('--') ? args[1] : 250);
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j, T = sampleTrack(t), A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
const cache = `.devtest/out/street/${t.name.replace(/\W+/g, '_')}.json`;
let st;
if (fs.existsSync(cache) && !args.includes('--fresh')) st = JSON.parse(fs.readFileSync(cache, 'utf8'));
else {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < T.N; i++) { a = Math.min(a, T.X[i]); b = Math.max(b, T.X[i]); c = Math.min(c, T.Z[i]); d = Math.max(d, T.Z[i]); }
  const line = []; for (let k = 0; k < T.N; k += Math.max(1, Math.round(60 / T.ds))) line.push([T.X[k], T.Z[k]]);
  const rank = (x, z) => { let bd = Infinity; A.hash.query(x, z, m + 60, (i) => { bd = Math.min(bd, (x - T.X[i]) ** 2 + (z - T.Z[i]) ** 2); }); return bd; };
  const t0 = Date.now();
  const res = await importOSM(t.geo, [a - m, c - m, b + m, d + m], { street: true, line, margin: m, rank }, (s) => process.stdout.write('\r' + s + '      '));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
  st = res.street; fs.mkdirSync('.devtest/out/street', { recursive: true }); fs.writeFileSync(cache, JSON.stringify(st));
}
console.log(t.name, JSON.stringify(streetCounts(st)));
const fails = [];
// (signs, signals and crosswalks take their road's direction in the game, from the track's own roads: js/streetkit.js;
//  gates and poles need the map's, from their driveway / power line)
for (const k of ['gates', 'poles']) {
  const n = st[k].length, withDir = st[k].filter(p => p.length >= 4).length;
  console.log(`  ${k}: ${n}, ${withDir} with a direction`);
  if (n && withDir < n * 0.8) fails.push(`${k} mostly without a direction`);
}
const byK = (l) => JSON.stringify(l.reduce((o, w) => (o[w.k] = (o[w.k] || 0) + 1, o), {}));
const len = (l) => Math.round(l.reduce((s, w) => { let L = 0; for (let i = 1; i < w.pts.length; i++) L += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]); return s + L; }, 0));
console.log(`  power lines ${st.power.length} (${len(st.power)} m), rail ${st.rail.length} (${len(st.rail)} m), waterways ${byK(st.water)} (${len(st.water)} m), driveways ${st.drives.length}`);
console.log(`  barriers ${byK(st.barriers)} (${len(st.barriers)} m), bollards ${st.bollards.length}`);
console.log(`  saved size ${(JSON.stringify(st).length / 1024).toFixed(0)} KB`);
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
