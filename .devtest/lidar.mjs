// dev: LiDAR heights (js/lidar.js) on a track file: download the tiles round it (cached), put them in its terrain,
// re-project the road, then check: the road's profile (no dips / jumps, grades), how far it moved from the 30 m one,
// the tiles' coverage and size, and that the ground blends into the 30 m grid at the edge of the tiles (no step);
// no step where two tiles meet (tiles came back squashed north-south once: 5-23 m steps); the ground matches the
// server's own height (getSamples) at points along the road; the road sits on the ground (not buried in a hillside).
//   node --import ./tools/tracks/three-hook.mjs .devtest/lidar.mjs <file.svgp.json> [--write out.json]
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { projectOntoTrack, rawHeight } from '../js/terrain.js';
import { fetchLidar, lidarStats, TILE_M } from '../js/lidar.js';
const args = process.argv.slice(2), file = args[0];
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j;
if (!t.terrain) throw new Error('no terrain: Get Real Elevation first');
const T0 = sampleTrack(t), Y0 = T0.Y.slice();
const cache = `.devtest/out/lidar/${t.name.replace(/\W+/g, '_')}.tiles.json`;
let tiles;
if (fs.existsSync(cache)) tiles = JSON.parse(fs.readFileSync(cache, 'utf8'));
if (!tiles || tiles.some(q => q.v !== 2)) {
  const t0 = Date.now();
  const r = await fetchLidar(t, T0, { onStatus: (m) => process.stdout.write('\r' + m + '   ') });
  console.log(`\n${r.asked} tiles asked, ${r.tiles.length} with data, ${r.empty} empty, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  tiles = r.tiles; fs.mkdirSync('.devtest/out/lidar', { recursive: true }); fs.writeFileSync(cache, JSON.stringify(tiles));
}
const coarse = { ...t.terrain, fine: undefined };
t.terrain = { ...t.terrain, fine: tiles };
const st = lidarStats(t.terrain);
console.log(`tiles ${st.tiles}, cover ${(st.cover * 100).toFixed(0)}%, ${st.kb} KB in the track (was ${Math.round(JSON.stringify(j).length / 1024 - st.kb)} KB)`);
// the ground: LiDAR vs 30 m along the track (how wrong the 30 m one was), and at the edge of the tiles (no step)
let dMax = 0, dSum = 0;
for (let i = 0; i < T0.N; i++) { const d = rawHeight(t.terrain, T0.X[i], T0.Z[i]) - rawHeight(coarse, T0.X[i], T0.Z[i]); dMax = Math.max(dMax, Math.abs(d)); dSum += Math.abs(d); }
console.log(`ground under the road: LiDAR vs 30 m, mean ${(dSum / T0.N).toFixed(2)} m, worst ${dMax.toFixed(1)} m`);
let step = 0; // (walk out of the tiles along rows: the biggest jump between neighbouring metres)
for (const tl of tiles) for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
  if (tiles.some(o => o.i === tl.i + dx && o.j === tl.j + dz)) continue;
  for (let s = 0; s < TILE_M; s += 32) for (let d = -20; d < 20; d += 1) {
    const ex = dx ? (dx < 0 ? tl.i * TILE_M : (tl.i + 1) * TILE_M) - dx * d : tl.i * TILE_M + s, ez = dz ? (dz < 0 ? tl.j * TILE_M : (tl.j + 1) * TILE_M) - dz * d : tl.j * TILE_M + s;
    step = Math.max(step, Math.abs(rawHeight(t.terrain, ex, ez) - rawHeight(t.terrain, ex + dx, ez + dz)));
  }
}
console.log(`steepest metre across the edge of the LiDAR: ${step.toFixed(2)} m`);
// where two tiles meet: the mean jump across the shared edge, 1 m each side, less what the slope either side gives
let seam = 0, seamAt = '';
const has = (x, z) => tiles.some(o => o.i === Math.floor(x / TILE_M) && o.j === Math.floor(z / TILE_M));
const inner = (x, z) => [-96, 0, 96].every(a => [-96, 0, 96].every(b => has(x + a, z + b))); // (not in the fade to the 30 m grid)
for (const tl of tiles) for (const [dx, dz] of [[1, 0], [0, 1]]) {
  if (!tiles.some(o => o.i === tl.i + dx && o.j === tl.j + dz)) continue;
  let s = 0, m = 0;
  for (let a = 8; a < TILE_M; a += 16) { const ex = dx ? (tl.i + 1) * TILE_M : tl.i * TILE_M + a, ez = dz ? (tl.j + 1) * TILE_M : tl.j * TILE_M + a;
    if (!inner(ex, ez)) continue;
    const h = (o) => rawHeight(t.terrain, ex + dx * o, ez + dz * o);
    s += (h(1) - h(-1)) - ((h(-1) - h(-3)) + (h(3) - h(1))) / 2; m++; }
  if (m && Math.abs(s / m) > Math.abs(seam)) { seam = s / m; seamAt = `${tl.i},${tl.j} ${dx ? 'east' : 'south'}`; }
}
console.log(`worst seam between tiles: ${seam.toFixed(2)} m (tile ${seamAt})`);
// the server's own heights at 12 points along the road
const { toLatLon } = await import('../js/geo.js');
let tErr = 0, tN = 0, tWorst = 0;
for (let k = 0; k < 12; k++) {
  const i = Math.floor((k + 0.5) / 12 * (T0.open ? T0.finish : T0.N)), [la, lo] = toLatLon(t.geo, T0.X[i], T0.Z[i]);
  const u = `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples?geometry=${encodeURIComponent(JSON.stringify({ x: lo, y: la, spatialReference: { wkid: 4326 } }))}&geometryType=esriGeometryPoint&returnFirstValueOnly=true&interpolation=RSP_BilinearInterpolation&f=json`;
  try { const v = +(await (await fetch(u)).json()).samples[0].value; if (!isFinite(v)) continue;
    const d = Math.abs(rawHeight(t.terrain, T0.X[i], T0.Z[i]) + t.terrain.lo - v); tErr += d; tN++; tWorst = Math.max(tWorst, d); } catch (e) {}
}
console.log(`ground vs the server's own heights at ${tN} points: mean ${(tErr / Math.max(1, tN)).toFixed(2)} m, worst ${tWorst.toFixed(2)} m`);
const added = projectOntoTrack(t, sampleTrack);
const T = sampleTrack(t), fails = [];
const at = (i) => T.open ? Math.max(0, Math.min(T.N - 1, i)) : (i + T.N) % T.N, end = T.open ? T.finish : T.N, k5 = Math.max(1, Math.round(5 / T.ds));
let spike = 0, grade = 0, sx = 0, sz = 0;
for (let i = 0; i < end; i++) {
  const d = T.Y[i] - (T.Y[at(i - k5)] + T.Y[at(i + k5)]) / 2; if (Math.abs(d) > Math.abs(spike)) { spike = d; sx = T.X[i]; sz = T.Z[i]; }
  grade = Math.max(grade, Math.abs(T.Y[at(i + 2 * k5)] - T.Y[i]) / (2 * k5 * T.ds));
}
let mv = 0, mvAt = 0; for (let i = 0; i < Math.min(T.N, T0.N); i++) { const q = Math.round(i * T0.N / T.N); const d = Math.abs((T.Y[i] - Math.min(...[0])) - Y0[Math.min(T0.N - 1, q)]); if (d > mv) { mv = d; mvAt = T.D[i]; } }
console.log(`road: ${added} nodes added, worst bump ${spike.toFixed(2)} m at ${sx.toFixed(0)},${sz.toFixed(0)}, steepest ${(grade * 100).toFixed(0)}% over 10 m, height changed by up to ${mv.toFixed(1)} m (at ${mvAt.toFixed(0)} m round)`);
if (Math.abs(spike) > 1.5) fails.push('a dip / jump in the road');
if (grade > 0.25) fails.push('steeper than 25%');
if (step > 0.6) fails.push('a step at the edge of the LiDAR');
if (Math.abs(seam) > 0.5) fails.push('a step where tiles meet');
if (tN && tWorst > 1.5) fails.push('ground off the server\'s heights');
// the road on the ground: stretches over 20 m where the road is more than 3 m under or over the bare earth
{ const { gameHeight } = await import('../js/terrain.js'); let run = 0, worst = 0, where = '', n = 0;
  for (let i = 0; i < (T.open ? T.finish : T.N); i++) { const d = T.Y[i] - gameHeight(t.terrain, T.X[i], T.Z[i]);
    if (Math.abs(d) > 3) { run += T.ds; if (Math.abs(d) > Math.abs(worst)) { worst = d; where = `${T.X[i].toFixed(0)},${T.Z[i].toFixed(0)} (${T.D[i].toFixed(0)} m)`; } } else { if (run > 20) n++; run = 0; } }
  if (run > 20) n++;
  console.log(`road off the ground by over 3 m for 20 m+: ${n} stretches, worst ${worst.toFixed(1)} m ${worst < 0 ? 'under' : 'over'} at ${where}`);
  if (n) fails.push('road buried in / floating over the ground'); }
if (args.includes('--write')) { fs.writeFileSync(args[args.indexOf('--write') + 1], JSON.stringify(j)); console.log('wrote', args[args.indexOf('--write') + 1]); }
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
