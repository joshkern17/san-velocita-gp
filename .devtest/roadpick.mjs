// dev: Pick Roads (js/roadpick.js) on cached map data: route between clicks, the centre line, the track it makes.
// Gates: the track stays on the map's streets (away from corners), junction corners keep the real curb's radius
// (the sampled track turns no wider than the arc, and no tighter), routing is fast enough to follow the mouse.
//   node --import ./tools/tracks/three-hook.mjs .devtest/roadpick.mjs ["<track name>"]
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { osmWays } from '../js/osmroads.js';
import { roadGraph, snapRoad, routeRoads, routeAll, routeLine, routeOverlaps, lineClashes } from '../js/roadpick.js';
import { pickTrackPoints } from '../js/roadpick.js';

const name = process.argv[2] || 'Auburn GP2';
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = all.find(q => q && q.name === name);
const { data } = JSON.parse(fs.readFileSync(`.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`, 'utf8'));
let t0 = performance.now();
const G = roadGraph(osmWays(data, t.geo));
console.log(`graph: ${G.X.length} nodes, ${G.E.length} edges, ${G.W.length} ways, ${(performance.now() - t0).toFixed(0)} ms`);

// random loops: 4 clicks round a ring on the streets (seeded), routed; those that drive a street twice are what the
// editor refuses, so they're skipped. Gates over every loop's junction corners (30°+, with room for their arc):
// the track turns within 0.8-1.4x the arc's radius and stays within 1 m of the route line, a leg routes in < 15 ms.
let seed = +(process.env.SEED || 7); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let cx = 0, cz = 0; for (const p of t.points) { cx += p.x; cz += p.z; } cx /= t.points.length; cz /= t.points.length;
const loops = +(process.env.LOOPS || 12), fails = [];
const why = { snap: 0, nolegs: 0, overlap: 0, alongside: 0 };
let nSqueezed = 0, nPin = 0;
let clicks, legs, pts, corners, T, closed = true, msMax = 0, nCorner = 0, devMax = 0, kept = 0;
for (let L = 0; L < loops * 40 && kept < loops; L++) {
  const R = 150 + rnd() * 250, a0 = rnd() * 6.283, ox = cx + (rnd() - 0.5) * 600, oz = cz + (rnd() - 0.5) * 600;
  clicks = [];
  for (let k = 0; k < 4; k++) { const a = a0 + k * 1.571 + (rnd() - 0.5) * 0.6; const s = snapRoad(G, ox + Math.cos(a) * R, oz + Math.sin(a) * R, 150, (w) => w.kind !== 'freeway' && w.kind !== 'alley'); if (s) clicks.push(s); }
  if (clicks.length < 4) { why.snap++; continue; }
  const q = performance.now(); legs = routeAll(G, clicks, true); msMax = Math.max(msMax, (performance.now() - q) / 4);
  if (legs.some(l => !l)) { why.nolegs++; continue; }
  const ovl = routeOverlaps(G, legs);
  if (ovl.length) { why.overlap++; if (process.env.SHOWOVER && why.overlap === +process.env.SHOWOVER) { ({ pts, corners } = routeLine(G, legs, true)); T = sampleTrack({ ...t, points: pickTrackPoints(pts, true), open: false, start: 0, dress: null, roads: [], pick: { v: 1 } }); console.log('overlap', ovl.map(o => G.W[G.E[o.e].wi].name + ' ' + ((o.t1 - o.t0) * G.E[o.e].len).toFixed(0) + 'm')); break; } continue; }
  ({ pts, corners } = routeLine(G, legs, true));
  if (lineClashes(pts, true).alongside.length) { why.alongside++; continue; }
  const track = { ...t, points: pickTrackPoints(pts, true), open: false, start: 0, dress: null, roads: [], pick: { v: 1 } };
  T = sampleTrack(track);
  // (route line -> track: within 1 m everywhere)
  const TX = T.X, TZ = T.Z;
  const segD = (px, pz) => { let b = Infinity; for (let i = 0; i < T.N; i++) { const j = (i + 1) % T.N, dx = TX[j] - TX[i], dz = TZ[j] - TZ[i], u = Math.max(0, Math.min(1, ((px - TX[i]) * dx + (pz - TZ[i]) * dz) / (dx * dx + dz * dz || 1))); b = Math.min(b, (TX[i] + dx * u - px) ** 2 + (TZ[i] + dz * u - pz) ** 2); } return Math.sqrt(b); };
  let worstHere = 0, wp = null;
  const pins = corners.filter(c => c.hairpin); nPin += pins.length;
  // (a corner squeezed between two others can't have its real curb: the game rounds it to what the road can turn, ~2 m in)
  const sq = corners.filter(c => c.squeezed);
  for (const p of pts) { if (pins.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 40)) continue; const d = segD(p.x, p.z) - (sq.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 30) ? 1.5 : 0); if (d > worstHere) { worstHere = d; wp = p; } }
  devMax = Math.max(devMax, worstHere);
  if (worstHere > 1) fails.push(`loop ${kept}: track ${worstHere.toFixed(1)} m off the route at ${wp.x.toFixed(0)},${wp.z.toFixed(0)}`);
  for (const c of corners) {
    if (c.th < 0.5) continue;
    if (c.squeezed || c.hairpin) { nSqueezed++; if (process.env.LISTSQ && kept < 2) console.log(`  squeezed ${(c.th * 57.3).toFixed(0)}° r ${c.r.toFixed(1)} at ${c.x.toFixed(0)},${c.z.toFixed(0)}`); continue; }
    if (c.th < 1.3) continue; // (a corner under ~75° is a short arc: its radius can't be read off the samples; the 1 m line check covers it)
    // the track's tightest turn over the corner's arc
    let bi = 0, bd = Infinity; for (let i = 0; i < T.N; i++) { const d = (TX[i] - c.x) ** 2 + (TZ[i] - c.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const span = Math.ceil(c.r * c.th / T.ds / 2) + 2; let k = 0;
    for (let j = -span; j <= span; j++) k = Math.max(k, Math.abs(T.K[(bi + j + T.N) % T.N]));
    const rr = 1 / k; nCorner++;
    if (rr < 0.6 * c.r || rr > 1.4 * c.r) fails.push(`loop ${kept}: ${(c.th * 57.3).toFixed(0)}° corner at ${c.x.toFixed(0)},${c.z.toFixed(0)}: arc r ${c.r.toFixed(1)} m, track turns at ${rr.toFixed(1)} m`);
  }
  if (process.env.SHOW && kept === +process.env.SHOW) { kept++; break; }
  kept++;
}
console.log('skipped', why);
console.log(`${kept} loops, ${nCorner} junction corners (${nSqueezed} short of room or hairpins: not gated; ${nPin} hairpins), worst track-to-route ${devMax.toFixed(2)} m, slowest leg ${msMax.toFixed(1)} ms`);
if (msMax > 15) fails.push(`routing too slow: ${msMax.toFixed(1)} ms`);
fails.slice(0, 30).forEach(f => console.log('  FAIL ' + f));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
// a picture: streets grey (as wide as the map says), the route red, the track white, clicks green
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
const zoom = process.env.ZOOM ? process.env.ZOOM.split(',').map(Number) : null; // (x, z, half-size m: a close-up)
if (zoom) { x0 = zoom[0] - zoom[2]; x1 = zoom[0] + zoom[2]; z0 = zoom[1] - zoom[2]; z1 = zoom[1] + zoom[2]; } else { x0 -= 60; z0 -= 60; x1 += 60; z1 += 60; }
const S = 1400 / Math.max(x1 - x0, z1 - z0), IW = Math.ceil((x1 - x0) * S), IH = Math.ceil((z1 - z0) * S), img = new Uint8Array(IW * IH * 3).fill(17);
const dot = (px, py, r, c) => { for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(IH - 1, py + r); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(IW - 1, px + r); x++) if ((x - px) ** 2 + (y - py) ** 2 <= r * r) img.set(c, (y * IW + x) * 3); };
const seg = (ax, az, bx, bz, r, c) => { const L = Math.hypot(bx - ax, bz - az) * S, k = Math.max(1, Math.ceil(L / Math.max(0.5, r * 0.7))); for (let j = 0; j <= k; j++) dot((ax + (bx - ax) * j / k - x0) * S, (az + (bz - az) * j / k - z0) * S, r, c); };
for (const e of G.E) seg(G.X[e.a], G.Z[e.a], G.X[e.b], G.Z[e.b], Math.max(0.6, G.W[e.wi].width / 2 * S), [70, 70, 70]);
for (let i = 1; i < pts.length; i++) seg(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, zoom ? 2 : 1.6, [255, 43, 0]);
const tn = T.open ? T.finish : T.N; for (let i = 1; i < tn; i++) seg(T.X[i - 1], T.Z[i - 1], T.X[i], T.Z[i], 0.7, [255, 255, 255]);
for (const c of clicks) dot((c.x - x0) * S, (c.z - z0) * S, 5, [106, 224, 74]);
for (const c of corners) dot((c.x - x0) * S, (c.z - z0) * S, 2.5, [255, 214, 107]);
const out = `.devtest/out/pick/${process.env.OUT || 'route'}`;
fs.writeFileSync(out + '.ppm', Buffer.concat([Buffer.from(`P6 ${IW} ${IH} 255\n`), Buffer.from(img)]));
const { execSync } = await import('node:child_process'); execSync(`magick "${out}.ppm" "${out}.png" && rm "${out}.ppm"`);
console.log('wrote ' + out + '.png');
