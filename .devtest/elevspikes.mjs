// dev: real elevation on a track (terrain.js projectOntoTrack), checked for what broke Lake of the Pines: a node left
// at height 0 between nodes 30 m up, or nodes inserted into a curved stretch without splitting its handles (the road
// folded back on itself and fell into a 20 m pit). Gates: no sample more than 1.5 m off its neighbours' line, no
// grade over 25% across 10 m, every node within 3 m of the profile, the plan within 0.3 m of the road before.
//   node --import ./tools/tracks/three-hook.mjs .devtest/elevspikes.mjs <file.svgp.json> [--strip] [--write out.json]
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { projectOntoTrack } from '../js/terrain.js';
const args = process.argv.slice(2), file = args[0];
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j;
if (args.includes('--strip')) { // (nodes an older projection put in: off the 0.1 m grid Pick Roads writes, no handles)
  const off = (v) => Math.abs(v * 10 - Math.round(v * 10)) > 1e-3;
  const before = t.points.length; t.points = t.points.filter((p, i) => i === (t.start || 0) || !(off(p.x) || off(p.z)) || p.hi || p.ho);
  console.log(`stripped ${before - t.points.length} inserted nodes`);
}
const T0 = sampleTrack(t);
const added = projectOntoTrack(t, sampleTrack);
const T = sampleTrack(t), fails = [];
console.log(`${t.points.length} nodes (${added} added), ${T.N} samples, ${(T.L / 1000).toFixed(2)} km`);
const at = (i) => T.open ? Math.max(0, Math.min(T.N - 1, i)) : (i + T.N) % T.N, end = T.open ? T.finish : T.N;
let spike = 0, grade = 0, sx = 0, sz = 0;
const k5 = Math.max(1, Math.round(5 / T.ds));
for (let i = 0; i < end; i++) {
  const d = T.Y[i] - (T.Y[at(i - k5)] + T.Y[at(i + k5)]) / 2; if (Math.abs(d) > Math.abs(spike)) { spike = d; sx = T.X[i]; sz = T.Z[i]; }
  const g = Math.abs(T.Y[at(i + 2 * k5)] - T.Y[i]) / (2 * k5 * T.ds); grade = Math.max(grade, g);
}
console.log(`worst bump ${spike.toFixed(2)} m at ${sx.toFixed(0)},${sz.toFixed(0)} · steepest ${(grade * 100).toFixed(0)}% over 10 m`);
if (Math.abs(spike) > 1.5) fails.push('a dip / jump in the road');
if (grade > 0.25) fails.push('steeper than 25%');
const zero = t.points.filter(p => p.e === 0).length, lo = Math.min(...Array.from(T.Y));
console.log(`nodes at height 0: ${zero} (lowest sample ${lo.toFixed(1)} m)`);
// the plan didn't move: every new sample within 0.3 m of the old road
let move = 0; for (let i = 0; i < T.N; i += 3) { let b = Infinity; for (let q = 0; q < T0.N; q++) b = Math.min(b, (T0.X[q] - T.X[i]) ** 2 + (T0.Z[q] - T.Z[i]) ** 2); move = Math.max(move, Math.sqrt(b)); }
console.log(`road moved by up to ${move.toFixed(2)} m`); if (move > 0.3) fails.push('inserting nodes moved the road');
if (args.includes('--write')) { fs.writeFileSync(args[args.indexOf('--write') + 1], JSON.stringify(j)); console.log('wrote', args[args.indexOf('--write') + 1]); }
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
