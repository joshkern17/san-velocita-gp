// Top-down map of a built real circuit: the road (lap metres every 250 m, green dot = d 0), the map's rails (blue),
// walls / tires (red), fences (purple), pit lane (yellow), other raceways (grey), buildings (tan: map, orange: scan),
// water, trees, props (cyan: kit stands), a 200 m grid with world coordinates. Read the PNG to plan by eye.
//   node --import ./tools/tracks/three-hook.mjs .claude/skills/real-track/scripts/map.mjs <id> <out.png> [--bar] [--zoom=x,z,r] [--stands=file.json]
//   --bar: the game's barrier lines (orange); --stands: outlines from stands.mjs --json (blue, labelled)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { sampleTrack, analyzeTrack } = await import(path.join(ROOT, 'js/track.js'));
const args = process.argv.slice(2), opt = (k) => { const a = args.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const [id, out] = args.filter(a => !a.startsWith('--'));
const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'tracks/real', id + '.json'), 'utf8')), T = sampleTrack(t);
const A = args.includes('--bar') ? analyzeTrack(T, t.env, t.paint, t.osm, t.dress) : null;
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.X[i]); x1 = Math.max(x1, T.X[i]); z0 = Math.min(z0, T.Z[i]); z1 = Math.max(z1, T.Z[i]); }
const zoom = opt('zoom') && opt('zoom').split(',').map(Number);
if (zoom) { x0 = zoom[0] - zoom[2]; x1 = zoom[0] + zoom[2]; z0 = zoom[1] - zoom[2]; z1 = zoom[1] + zoom[2]; } else { x0 -= 150; z0 -= 150; x1 += 150; z1 += 150; }
const S = 1800 / Math.max(x1 - x0, z1 - z0), X = (x) => ((x - x0) * S).toFixed(1), Z = (z) => ((z - z0) * S).toFixed(1);
const W = Math.ceil((x1 - x0) * S), H = Math.ceil((z1 - z0) * S), o = t.osm || {};
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#1d2a1d"/>`;
const poly = (p, f, st = 'none') => s += `<polygon points="${p.map(q => X(q[0]) + ',' + Z(q[1])).join(' ')}" fill="${f}" stroke="${st}" stroke-width="1"/>`;
const line = (p, c, w) => s += `<polyline points="${p.map(q => X(q[0]) + ',' + Z(q[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
const text = (x, z, str, c, sz) => s += `<text x="${X(x)}" y="${Z(z)}" fill="${c}" font-size="${sz}" font-family="sans-serif">${str}</text>`;
for (const w of o.water || []) poly(w.p || w, '#2a5a8a');
for (const b of o.buildings || []) poly(b.p, '#c8a060', '#000');
for (const tr of o.trees || []) s += `<circle cx="${X(tr[0])}" cy="${Z(tr[1])}" r="1.5" fill="#4a8a3a"/>`;
if (t.scan) for (const b of t.scan.houses) poly(b.p, '#ff9a30', '#000');
if (opt('stands')) for (const q of JSON.parse(fs.readFileSync(opt('stands'), 'utf8'))) { poly(q.p, '#3060ff88', '#8af'); const c = q.p.reduce((a, r) => [a[0] + r[0] / q.p.length, a[1] + r[1] / q.p.length], [0, 0]); text(c[0], c[1], q.n, '#fff', 11); }
for (const r of o.raceways || []) line(r, '#666', 1);
const pts = []; for (let i = 0; i <= T.N; i++) pts.push([T.X[i % T.N], T.Z[i % T.N]]);
line(pts, '#ddd', Math.max(1, 15 * S));
if (o.pitLane) line(o.pitLane, '#ff0', 2);
for (const w of o.walls || []) line(w.p, w.k === 'rail' ? '#8cf' : w.k === 'fence' ? '#c8c' : '#f88', 1.5);
if (A) for (const [O, sg] of [[A.BL, -1], [A.BR, 1]]) { const q = []; for (let i = 0; i < T.N; i += 2) q.push([T.X[i] + sg * T.RX[i] * O[i], T.Z[i] + sg * T.RZ[i] * O[i]]); line(q, '#f40', 1.5); }
for (const p of t.props || []) s += `<rect x="${(+X(p.x)) - 3}" y="${(+Z(p.z)) - 3}" width="6" height="6" fill="${/^gs_/.test(p.type) ? '#0ff' : '#f0f'}"/>`;
for (let d = 0; d < T.L; d += 250) { const i = Math.round(d / T.ds) % T.N; text(T.X[i], T.Z[i], d, '#ff2b00', 14); }
s += `<circle cx="${X(T.X[0])}" cy="${Z(T.Z[0])}" r="6" fill="#0f0"/>`;
for (let gx = Math.ceil(x0 / 200) * 200; gx < x1; gx += 200) s += `<text x="${X(gx)}" y="12" fill="#888" font-size="10">${gx}</text><line x1="${X(gx)}" y1="0" x2="${X(gx)}" y2="${H}" stroke="#ffffff18"/>`;
for (let gz = Math.ceil(z0 / 200) * 200; gz < z1; gz += 200) s += `<text x="2" y="${Z(gz)}" fill="#888" font-size="10">${gz}</text><line x1="0" y1="${Z(gz)}" x2="${W}" y2="${Z(gz)}" stroke="#ffffff18"/>`;
fs.writeFileSync(out + '.svg', s + '</svg>');
execSync(`rsvg-convert "${out}.svg" -o "${out}" 2>/dev/null || sips -s format png "${out}.svg" --out "${out}" >/dev/null`); // (ImageMagick chokes on the fonts)
console.log(`wrote ${out}: lap ${T.L.toFixed(0)} m, ${T.N} samples of ${T.ds.toFixed(2)} m`);
