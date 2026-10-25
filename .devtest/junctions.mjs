// dev: where imported / drawn streets meet a track, from its file: junctions closer together than their mouths are
// wide (aprons and sidewalk corners overlap: spikes), sidewalk corners that fold (a flare crossing itself), and street
// pieces lying under the barrier or the runoff beside the track (a street alongside the track).
//   node --import ./tools/tracks/three-hook.mjs .devtest/junctions.mjs <file.svgp.json>
import fs from 'node:fs';
import { sampleTrack, analyzeTrack, buildPitLane } from '../js/track.js';
import { roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } from '../js/roads.js';
const file = process.argv[2], j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j;
const T = sampleTrack(t); raiseTrackOverRoads(t, T);
const A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
applyRoadsToCircuit(t, T, A);
const L = A.roadL || roadLayout(t, T, A), J = L.junctions;
console.log(`${t.roads.length} roads, ${L.pieces.length} pieces, ${J.length} junctions`);
const near = [];
for (let a = 0; a < J.length; a++) for (let b = a + 1; b < J.length; b++) {
  const d = Math.hypot(J[a].x - J[b].x, J[a].z - J[b].z), room = (J[a].w + J[b].w) / 2 + J[a].walk + J[b].walk + 6;
  if (d < room && J[a].side === J[b].side) near.push([a, b, d]); // (a crossroads has one each side: fine)
}
console.log(`same-side junctions closer than their mouths need: ${near.length}`);
for (const [a, b, d] of near) console.log(`  ${a} (${t.roads[J[a].road].name || t.roads[J[a].road].hw}) + ${b} (${t.roads[J[b].road].name || t.roads[J[b].road].hw}) ${d.toFixed(1)} m apart at ${J[a].x.toFixed(0)},${J[a].z.toFixed(0)} lap ${T.D[J[a].ti].toFixed(0)} m`);
// sidewalk corners that cross themselves
const segX = (p, q, r, s) => { const d = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x); if (Math.abs(d) < 1e-9) return false; const u = ((r.x - p.x) * (s.z - r.z) - (r.z - p.z) * (s.x - r.x)) / d, v = ((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) / d; return u > 0.01 && u < 0.99 && v > 0.01 && v < 0.99; };
let folds = 0;
J.forEach((jn, k) => { const P = jn.poly; let x = 0; for (let a = 0; a < P.length; a++) for (let b = a + 2; b < P.length; b++) if ((b + 1) % P.length !== a && segX(P[a], P[(a + 1) % P.length], P[b], P[(b + 1) % P.length])) x++; if (x) { folds++; console.log(`  junction ${k} apron crosses itself ${x}x at ${jn.x.toFixed(0)},${jn.z.toFixed(0)}`); } });
console.log(`aprons that fold: ${folds}`);
// street samples inside the track's barrier line (between the edge and the barrier), not at a junction
let under = new Map();
for (const pc of L.pieces) for (const s of pc.s) {
  if (s.blend || s.jend) continue;
  let bi = -1, bd = Infinity; A.hash.query(s.x, s.z, 40, (i) => { const d = (s.x - T.X[i]) ** 2 + (s.z - T.Z[i]) ** 2; if (d < bd) { bd = d; bi = i; } });
  if (bi < 0) continue;
  const lat = (s.x - T.X[bi]) * T.RX[bi] + (s.z - T.Z[bi]) * T.RZ[bi], bar = lat < 0 ? A.BL[bi] : A.BR[bi];
  if (Math.abs(lat) - pc.w / 2 - (pc.walk || 0) < bar + 0.5) { const k = pc.road; const u = under.get(k) || { n: 0, x: s.x, z: s.z, d: T.D[bi] }; u.n++; under.set(k, u); }
}
console.log(`streets (with their sidewalks) reaching the barrier line: ${under.size}`);
for (const [k, u] of under) console.log(`  road ${k} (${t.roads[k].name || t.roads[k].hw}): ${u.n * 3} m of it, near ${u.x.toFixed(0)},${u.z.toFixed(0)} lap ${u.d.toFixed(0)} m`);
if (!process.env.ZOOM) console.log(near.length || folds ? 'FAIL: mouths overlapping or folding' : 'PASS');
// a picture of one spot: ZOOM=x,z,half OUT=file.png  (track grey, street pieces dark blue, junction aprons yellow,
// their sidewalk corners white, the barrier lines red, the raw street lines (track.roads) thin cyan)
if (process.env.ZOOM) {
  const [cx, cz, hs] = process.env.ZOOM.split(',').map(Number), S = 1000 / (2 * hs), x0 = cx - hs, z0 = cz - hs, W = 1000;
  const img = new Uint8Array(W * W * 3).fill(20);
  const px = (x, z) => [(x - x0) * S, (z - z0) * S];
  const dot = (X, Y, r, c) => { for (let y = Math.max(0, Math.floor(Y - r)); y <= Math.min(W - 1, Y + r); y++) for (let x = Math.max(0, Math.floor(X - r)); x <= Math.min(W - 1, X + r); x++) if ((x - X) ** 2 + (y - Y) ** 2 <= r * r) img.set(c, (y * W + x) * 3); };
  const seg = (a, b, r, c) => { const [ax, ay] = px(a.x ?? a[0], a.z ?? a[1]), [bx, by] = px(b.x ?? b[0], b.z ?? b[1]), k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(0.5, r * 0.7))); for (let q = 0; q <= k; q++) dot(ax + (bx - ax) * q / k, ay + (by - ay) * q / k, r, c); };
  for (let i = 0; i < T.N; i++) seg({ x: T.X[i], z: T.Z[i] }, { x: T.X[(i + 1) % T.N], z: T.Z[(i + 1) % T.N] }, T.W[i] / 2 * S, [110, 110, 110]);
  for (let i = 0; i < T.N; i++) { const n = (i + 1) % T.N; for (const sd of [-1, 1]) { const o = sd < 0 ? A.BL : A.BR; seg({ x: T.X[i] + T.RX[i] * sd * o[i], z: T.Z[i] + T.RZ[i] * sd * o[i] }, { x: T.X[n] + T.RX[n] * sd * o[n], z: T.Z[n] + T.RZ[n] * sd * o[n] }, 1.2, [220, 40, 40]); } }
  for (const pc of L.pieces) for (let q = 1; q < pc.s.length; q++) seg(pc.s[q - 1], pc.s[q], pc.w / 2 * S, [40, 50, 110]);
  for (const jn of J) { const P = jn.poly; for (let q = 0; q < P.length; q++) seg(P[q], P[(q + 1) % P.length], 1.5, [255, 214, 107]); for (const w of jn.walks) for (let q = 1; q < w.pts.length; q++) seg(w.pts[q - 1], w.pts[q], Math.max(1, jn.walk / 2 * S), [235, 235, 235]); }
  for (const r of t.roads) for (let q = 1; q < r.pts.length; q++) seg(r.pts[q - 1], r.pts[q], 0.8, [60, 220, 230]);
  const out = process.env.OUT || '.devtest/out/jn.png';
  fs.writeFileSync(out + '.ppm', Buffer.concat([Buffer.from(`P6 ${W} ${W} 255\n`), Buffer.from(img)]));
  (await import('node:child_process')).execSync(`magick "${out}.ppm" "${out}" && rm "${out}.ppm"`); console.log('wrote', out);
}
// each junction's angle to the track (90 = square on), shallow ones first
const ang = J.map((jn, k) => { const ss = L.pieces.find(p => p.road === jn.road && p.s.includes(jn.E)); const E = jn.E; const ti = jn.ti; const a = Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.abs(E.tx * T.RX[ti] + E.tz * T.RZ[ti]))))) * 57.3; return [k, a, jn]; }).sort((p, q) => p[1] - q[1]);
console.log('shallowest junctions:', ang.slice(0, 6).map(([k, a, jn]) => `${k} ${a.toFixed(0)}° ${t.roads[jn.road].name || ''} at ${jn.x.toFixed(0)},${jn.z.toFixed(0)} lap ${T.D[jn.ti].toFixed(0)}`).join(' | '));
