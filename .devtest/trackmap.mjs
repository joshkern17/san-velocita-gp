// dev: a top-down picture of a track file: the track (white), its roads (grey, as wide as they are; imported ones
// lighter), Pick Roads clicks (green). ZOOM=x,z,half-size for a close-up.
//   node --import ./tools/tracks/three-hook.mjs .devtest/trackmap.mjs <file.svgp.json> <out.png>
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { roadSamples } from '../js/roads.js';
import { execSync } from 'node:child_process';
const [file, out] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j;
const T = sampleTrack(t);
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.X[i]); x1 = Math.max(x1, T.X[i]); z0 = Math.min(z0, T.Z[i]); z1 = Math.max(z1, T.Z[i]); }
const zoom = process.env.ZOOM ? process.env.ZOOM.split(',').map(Number) : null;
if (zoom) { x0 = zoom[0] - zoom[2]; x1 = zoom[0] + zoom[2]; z0 = zoom[1] - zoom[2]; z1 = zoom[1] + zoom[2]; } else { x0 -= 100; z0 -= 100; x1 += 100; z1 += 100; }
const S = 1600 / Math.max(x1 - x0, z1 - z0), IW = Math.ceil((x1 - x0) * S), IH = Math.ceil((z1 - z0) * S), img = new Uint8Array(IW * IH * 3).fill(17);
const dot = (px, py, r, c) => { for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(IH - 1, py + r); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(IW - 1, px + r); x++) if ((x - px) ** 2 + (y - py) ** 2 <= r * r) img.set(c, (y * IW + x) * 3); };
const seg = (ax, az, bx, bz, r, c) => { const L = Math.hypot(bx - ax, bz - az) * S, k = Math.max(1, Math.ceil(L / Math.max(0.5, r * 0.7))); for (let q = 0; q <= k; q++) dot((ax + (bx - ax) * q / k - x0) * S, (az + (bz - az) * q / k - z0) * S, r, c); };
(t.roads || []).forEach((r, ri) => { for (let i = 1; i < r.pts.length; i++) seg(r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], Math.max(0.8, r.w / 2 * S), r.osm ? [90, 90, 100] : [120, 80, 60]); });
const tn = T.open ? T.finish : T.N;
for (let i = 1; i <= tn; i++) { const a = (i - 1) % T.N, b = i % T.N; seg(T.X[a], T.Z[a], T.X[b], T.Z[b], Math.max(0.8, T.W[a] / 2 * S), [200, 200, 200]); }
for (let i = 1; i <= tn; i++) { const a = (i - 1) % T.N, b = i % T.N; seg(T.X[a], T.Z[a], T.X[b], T.Z[b], 0.6, [255, 43, 0]); }
for (const [x, z] of (t.pick && t.pick.clicks) || []) dot((x - x0) * S, (z - z0) * S, 6, [106, 224, 74]);
fs.writeFileSync(out + '.ppm', Buffer.concat([Buffer.from(`P6 ${IW} ${IH} 255\n`), Buffer.from(img)]));
execSync(`magick "${out}.ppm" "${out}" && rm "${out}.ppm"`);
console.log('wrote', out, `${T.N} samples, L ${T.L.toFixed(0)} m, roads ${(t.roads || []).length}`);
