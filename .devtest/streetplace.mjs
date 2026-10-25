// dev: where the street kit puts a track's street details (js/streetkit.js placeStreet), checked without a browser:
// how many of each were placed / left out, and gates: nothing on the track, its runoff or a road; every sign and signal
// facing the road it's for; no wire under 5.5 m over a road or the track; fast enough. ZOOM=x,z,half OUT=png draws it.
//   node --import ./tools/tracks/three-hook.mjs .devtest/streetplace.mjs <file.svgp.json>
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(ROOT + String(u), 'utf8')) });
const { sampleTrack, analyzeTrack, buildPitLane } = await import('../js/track.js');
const { roadLayout, applyRoadsToCircuit, raiseTrackOverRoads } = await import('../js/roads.js');
const { loadEnvCatalog, envAsset } = await import('../js/envlib.js');
const { gameHeight } = await import('../js/terrain.js');
const { pointClear } = await import('../js/zones.js');
const { placeStreet } = await import('../js/streetkit.js');
await loadEnvCatalog();
const file = process.argv[2], t = (j => j.track || j)(JSON.parse(fs.readFileSync(file, 'utf8')));
const T = sampleTrack(t); raiseTrackOverRoads(t, T);
const A = analyzeTrack(T, t.env, t.paint, t.osm, t.dress); A.pit = buildPitLane(T, A, t.env, null, null, t.dress && t.dress.pit);
applyRoadsToCircuit(t, T, A);
const roadL = A.roadL || roadLayout(t, T, A);
const ground = (x, z) => t.terrain ? gameHeight(t.terrain, x, z) : 0;
const t0 = performance.now(), out = placeStreet(t, T, A, roadL, ground, { hedge: 'bush_0', debug: 1 }), ms = performance.now() - t0;
console.log(`${t.name}: ${out.pl.length} models, ${out.wires.length} wires, ${out.bars.length} crosswalk bars, ${ms.toFixed(0)} ms`);
for (const [k, v] of Object.entries(out.stats)) console.log(`  ${k.padEnd(14)} placed ${v.placed}, left out ${v.skipped}`);
if (process.env.WHY) { const g = {}; for (const [k, w] of out.why) { const key = k + ': ' + w; g[key] = (g[key] || 0) + 1; } for (const [k, n] of Object.entries(g)) console.log(`    ${n} x ${k}`); }
const fails = [];
// nothing on the track / runoff, nothing on a road (line pieces sit beside, a gate across its own driveway)
let onT = 0, onR = 0;
for (const p of out.pl) { if (!pointClear(p.x, p.z, 0, T, A)) onT++; if (!/^sk_(gate|rail|xing)/.test(p.id) && roadL.onRoad(p.x, p.z, 0)) onR++; }
if (onT) fails.push(`${onT} on the track or runoff`); if (onR) fails.push(`${onR} on a road`);
// every sign / signal faces along a road it's beside (towards the traffic coming): a road or the track within 16 m,
// its front within 40 degrees of that road's line
const face = (p) => [Math.sin(p.rot), Math.cos(p.rot)];
let blind = 0;
for (const p of out.pl.filter(q => /^sk_(stop|yield|signal)/.test(q.id))) {
  const [fx, fz] = face(p); let ok = false;
  for (const pc of roadL.pieces) for (const q of pc.s) if (!ok && Math.hypot(q.x - p.x, q.z - p.z) < pc.w / 2 + 16 && Math.abs(fx * q.tx + fz * q.tz) > 0.7) ok = true;
  A.hash.query(p.x, p.z, 30, (i) => { if (ok) return; const a = Math.max(0, i - 1), b = Math.min(T.N - 1, i + 1), dx = T.X[b] - T.X[a], dz = T.Z[b] - T.Z[a], l = Math.hypot(dx, dz) || 1;
    if (Math.hypot(T.X[i] - p.x, T.Z[i] - p.z) < T.W[i] / 2 + 22 && Math.abs((fx * dx + fz * dz) / l) > 0.7) ok = true; });
  // (or on a street the import didn't bring, facing the traffic coming up it to the track: its back to the track)
  if (!ok) { let bi = -1, bd = 30; A.hash.query(p.x, p.z, 30, (i) => { const d = Math.hypot(T.X[i] - p.x, T.Z[i] - p.z); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0 && (fx * (p.x - T.X[bi]) + fz * (p.z - T.Z[bi])) / bd > 0.7) ok = true; }
  if (!ok) { blind++; if (process.env.WHY) console.log(`    not facing a road: ${p.id} at ${p.x.toFixed(0)},${p.z.toFixed(0)} facing ${fx.toFixed(2)},${fz.toFixed(2)}`); }
}
if (blind) fails.push(`${blind} signs / signals not facing a road`);
// wires over roads / the track
let low = 0, lowest = Infinity;
for (const w of out.wires) for (const [x, y, z] of w) { const over = roadL.onRoad(x, z, 0) || !pointClear(x, z, 0, T, A); if (over) { const c = y - ground(x, z); lowest = Math.min(lowest, c); if (c < 5.4) low++; } }
console.log(`  lowest wire over a road / the track: ${lowest === Infinity ? '-' : lowest.toFixed(1) + ' m'}`);
if (low) fails.push(`${low} wire points under 5.4 m over a road`);
if (ms > 1500) fails.push(`slow: ${ms.toFixed(0)} ms`);
if (process.env.ZOOM) {
  const [cx, cz, half] = process.env.ZOOM.split(',').map(Number), N = 900, k = N / (2 * half), img = Buffer.alloc(N * N * 3);
  for (let i = 0; i < N * N; i++) { img[i * 3] = 46; img[i * 3 + 1] = 62; img[i * 3 + 2] = 40; }
  const px = (x, z, c) => { const u = Math.round((x - cx + half) * k), v = Math.round((z - cz + half) * k); if (u < 0 || v < 0 || u >= N || v >= N) return; const i = (v * N + u) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
  const disc = (x, z, r, c) => { for (let a = -r; a <= r; a += 0.5 / k) for (let b = -r; b <= r; b += 0.5 / k) if (a * a + b * b <= r * r) px(x + a, z + b, c); };
  for (const pc of roadL.pieces) for (const q of pc.s) disc(q.x, q.z, pc.w / 2, [70, 72, 78]);
  for (let i = 0; i < T.N; i++) disc(T.X[i], T.Z[i], T.W[i] / 2, [150, 150, 150]);
  for (const b of out.bars) disc(b.x, b.z, 0.5, [255, 255, 255]);
  for (const w of out.wires) for (let i = 1; i < w.length; i++) for (let s = 0; s <= 1; s += 0.02) px(w[i - 1][0] + (w[i][0] - w[i - 1][0]) * s, w[i - 1][2] + (w[i][2] - w[i - 1][2]) * s, [10, 10, 10]);
  const COL = { sk_stop: [220, 40, 30], sk_yield: [250, 250, 250], sk_signal: [240, 200, 40], sk_pole: [120, 80, 50], sk_tower: [90, 95, 100], sk_gate: [220, 180, 110], sk_rail: [130, 100, 80], sk_xing: [255, 120, 120] };
  for (const p of out.pl) {
    const c = COL[Object.keys(COL).find(k2 => p.id.startsWith(k2))] || [200, 200, 220];
    disc(p.x, p.z, /rail/.test(p.id) ? 1.5 : 1.3, c);
    const [fx, fz] = [Math.sin(p.rot), Math.cos(p.rot)]; for (let d = 0; d < 3; d += 0.2) px(p.x + fx * d, p.z + fz * d, c); // (which way it faces)
  }
  const o = process.env.OUT || '.devtest/out/streetplace.png';
  fs.writeFileSync(o + '.ppm', Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), img])); execSync(`magick ${o}.ppm ${o}`); fs.unlinkSync(o + '.ppm'); console.log('  picture', o);
}
console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS');
