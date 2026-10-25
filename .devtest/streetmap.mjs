// dev: a picture of a track's street details from above (no browser): track grey, its roads dark, streams blue, rail
// brown dashes, power lines black, stops red, yields white, signals yellow, crosswalks white squares, gates tan bars, poles
// brown, towers grey. ZOOM=x,z,half (m) PX=size
//   node --import ./tools/tracks/three-hook.mjs .devtest/streetmap.mjs <file.svgp.json> out.png
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const { sampleTrack } = await import('../js/track.js');
const [file, out] = process.argv.slice(2), t = (j => j.track || j)(JSON.parse(fs.readFileSync(file, 'utf8'))), T = sampleTrack(t), st = t.osm.street;
const [cx, cz, half] = (process.env.ZOOM || '0,0,400').split(',').map(Number), N = +(process.env.PX || 900), k = N / (2 * half);
const img = Buffer.alloc(N * N * 3, 0); for (let i = 0; i < N * N; i++) { img[i * 3] = 46; img[i * 3 + 1] = 62; img[i * 3 + 2] = 40; }
const px = (x, z, c) => { const u = Math.round((x - cx + half) * k), v = Math.round((z - cz + half) * k); if (u < 0 || v < 0 || u >= N || v >= N) return; const i = (v * N + u) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
const disc = (x, z, r, c) => { for (let a = -r; a <= r; a += 0.5 / k) for (let b = -r; b <= r; b += 0.5 / k) if (a * a + b * b <= r * r) px(x + a, z + b, c); };
const seg = (p, q, w, c, dash) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); for (let s = 0; s <= L; s += 0.4 / k) { if (dash && (s % 8) > 5) continue; const x = p[0] + (q[0] - p[0]) * s / L, z = p[1] + (q[1] - p[1]) * s / L; if (w > 1 / k) disc(x, z, w / 2, c); else px(x, z, c); } };
const poly = (pts, w, c, dash) => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], w, c, dash); };
for (const w of st.water) poly(w.pts, Math.max(1.5, w.w), [70, 130, 200]);
for (const r of t.roads || []) poly(r.pts, r.w || 8, [70, 72, 78]);
for (const d of st.drives) poly(d.pts, 3, [95, 92, 86]);
for (let i = 1; i < T.N; i++) seg([T.X[i - 1], T.Z[i - 1]], [T.X[i], T.Z[i]], 10, [150, 150, 150]);
for (const r of st.rail) poly(r.pts, 3, [130, 100, 80], 1);
for (const b of st.barriers) poly(b.pts, 0.6, [210, 205, 190]);
for (const p of st.power) poly(p.pts, 0.3, [10, 10, 10]);
for (const q of st.poles) disc(q[0], q[1], 1.2, [120, 80, 50]);
for (const q of st.towers) disc(q[0], q[1], 2.5, [90, 95, 100]);
for (const q of st.crossings) { for (let a = -2; a <= 2; a += 0.25 / k) { px(q[0] + a, q[1] - 2, [255, 255, 255]); px(q[0] + a, q[1] + 2, [255, 255, 255]); px(q[0] - 2, q[1] + a, [255, 255, 255]); px(q[0] + 2, q[1] + a, [255, 255, 255]); } }
for (const q of st.gates) if (q.length >= 4) seg([q[0] + q[3] * 2.5, q[1] - q[2] * 2.5], [q[0] - q[3] * 2.5, q[1] + q[2] * 2.5], 0.8, [220, 180, 110]);
for (const q of st.signals) disc(q[0], q[1], 2, [240, 200, 40]);
for (const q of st.yield) disc(q[0], q[1], 1.6, [250, 250, 250]);
for (const q of st.stop) disc(q[0], q[1], 1.8, [220, 40, 30]);
fs.writeFileSync(out + '.ppm', Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), img])); execSync(`magick ${out}.ppm ${out}`); fs.unlinkSync(out + '.ppm');
console.log('wrote', out);
