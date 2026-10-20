// A circuit's landmarks laid out where the real ones stand: tools/tracks/landmarks/<id>-places.json lists which of the
// map's named places to build (and as what) and which are grandstands; this measures each against the road as the
// game draws it and writes tools/tracks/landmarks/<id>-layout.json for the circuit's landmark script (<id>.py):
//   buildings: { key, name, x, z, hw, hd, rot, to: [x, z] (the way to the track, unit), gap (m from its edge), d (m
//     round the lap of the nearest bit), ...the entry's own fields }
//   stands: lines of the trackside pack's stands along a real grandstand's track-side edge: { pts, f (each one's way
//     to face, unit), fam } - a stand every 9 m, as js/standlines.js spaces them
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/landmarks/places.mjs <id>
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../../..');
const id = process.argv[2];
const TK = await import(join(ROOT, 'js/track.js')), SO = await import(join(ROOT, 'js/solids.js'));
const cfg = JSON.parse(readFileSync(join(HERE, `${id}-places.json`), 'utf8'));
const named = JSON.parse(execFileSync('node', [join(HERE, 'named.mjs'), id, '.', '--json'], { maxBuffer: 1 << 26 }).toString());
const t = JSON.parse(readFileSync(join(ROOT, 'tracks/real', id + '.json'), 'utf8')), T = TK.sampleTrack(t);
const A = TK.analyzeTrack(T, t.env, t.paint, t.osm, t.dress);
// how far out the barrier stands (m from the road's edge) by the road's sample i0 (and 6 m either way), on the side towards (x, z)
const barrierOut = (i0, x, z) => {
  const side = ((x - T.X[i0]) * T.RX[i0] + (z - T.Z[i0]) * T.RZ[i0]) > 0 ? 1 : -1, O = side < 0 ? A.BL : A.BR, H = side < 0 ? A.HAS_L : A.HAS_R;
  let m = 0; for (let k = -3; k <= 3; k++) { const i = ((i0 + k) % T.N + T.N) % T.N; if (H[i]) m = Math.max(m, O[i] - T.W[i] / 2); }
  return m;
};
const GAP = 9, DEPTH = { stand_roof: 11.2, stand_flags: 8.1 };
// the nearest bit of road to a point: [sample, distance from its edge]
const nearest = (x, z) => { let b = 1e9, bi = 0; for (let i = 0; i < T.N; i++) { const d = Math.hypot(x - T.X[i], z - T.Z[i]) - T.W[i] / 2; if (d < b) { b = d; bi = i; } } return [bi, b]; };
const find = (name) => { const o = named.find(n => n.name === name && n.kind !== 'parking'); if (!o) throw new Error(`${id}: no "${name}" on the map`); return o; };
const out = { buildings: [], stands: [] }, placed = [];
for (const b of cfg.buildings || []) {
  const o = find(b.name);
  let best = [0, 1e9]; for (const [x, z] of o.outline) { const n = nearest(x, z); if (n[1] < best[1]) best = n; }
  const i = best[0], dx = T.X[i] - o.x, dz = T.Z[i] - o.z, l = Math.hypot(dx, dz) || 1, to = [dx / l, dz / l];
  // (behind the barrier, as a real building is: where the map has it nearer, moved back whole, its size kept, along
  // the road's own sideways direction there, to 1.5 m past it)
  let { x, z } = o; const { hw, hd } = o, need = barrierOut(i, o.x, o.z) + 1.5 - best[1];
  if (need > 0) { const sg = Math.sign(to[0] * T.RX[i] + to[1] * T.RZ[i]) || 1; x -= T.RX[i] * sg * need; z -= T.RZ[i] * sg * need; }
  out.buildings.push({ key: b.key, name: b.name, x: +x.toFixed(1), z: +z.toFixed(1), hw: +hw.toFixed(1), hd: +hd.toFixed(1), rot: o.rot, to: [+to[0].toFixed(3), +to[1].toFixed(3)], gap: +(best[1] + Math.max(0, need)).toFixed(1), d: Math.round(T.D[i]), moved: need > 0 ? +need.toFixed(1) : 0, ...b });
}
for (const s of cfg.stands || []) {
  const o = find(s.name), fam = s.fam || 'stand_roof', dep = DEPTH[fam];
  // the outline's long edges: the one nearer the track is the front
  const c = Math.cos(o.rot), sn = Math.sin(o.rot), ax = [c, sn], nx = [-sn, c];
  const edge = (sgn) => [o.x + nx[0] * o.hd * sgn, o.z + nx[1] * o.hd * sgn];
  const e1 = edge(1), e2 = edge(-1), front = nearest(...e1)[1] < nearest(...e2)[1] ? 1 : -1;
  const F = edge(front), inward = [-nx[0] * front, -nx[1] * front];
  const len = 2 * o.hw - 8, us = []; for (let u = -len / 2; u <= len / 2 + 1e-6; u += GAP) us.push(u);
  // (each stand just behind the real front edge; where the barrier stands further out than that, the whole line moves
  // back behind it, as one, up to 25 m: past that it's dropped)
  let back = 0;
  for (const u of us) { const x = F[0] + ax[0] * u + inward[0] * (dep / 2 + 0.5), z = F[1] + ax[1] * u + inward[1] * (dep / 2 + 0.5), [i, g] = nearest(x, z); back = Math.max(back, Math.max(3, barrierOut(i, x, z) + 1) - (g - dep / 2)); }
  if (back > 25) { console.log(`(${s.name}: the barrier stands ${back.toFixed(0)} m past it: left out)`); continue; }
  const pts = [], f = [], mine = []; // (its own stands overlap at 9 m, as a line's do)
  for (const u of us) {
    const o2 = dep / 2 + 0.5 + Math.max(0, back), x = F[0] + ax[0] * u + inward[0] * o2, z = F[1] + ax[1] * u + inward[1] * o2;
    const dx = -inward[0], dz = -inward[1], l = 1; // (all facing out of the real stand's front, square to it, as one)
    // (never into a stand of a line already laid: two real stands meeting at an angle)
    const poly = SO.rectPoly(x, z, Math.cos(Math.atan2(dx, dz)), -Math.sin(Math.atan2(dx, dz)), 7, dep * 0.4);
    if (placed.some(q => SO.overlap(q, poly) > 0.6)) continue;
    mine.push(poly); pts.push([+x.toFixed(1), +z.toFixed(1)]); f.push([+(dx / l).toFixed(3), +(dz / l).toFixed(3)]);
  }
  placed.push(...mine);
  if (pts.length >= 2) out.stands.push({ name: s.name, pts, f, fam, back: +Math.max(0, back).toFixed(1) });
}
writeFileSync(join(HERE, `${id}-layout.json`), JSON.stringify(out, null, 1));
for (const b of out.buildings) console.log(`${b.key.padEnd(12)} ${b.name.padEnd(24)} ${(2 * b.hw).toFixed(0)} x ${(2 * b.hd).toFixed(0)} m, ${b.gap} m from the track at ${b.d} m${b.moved ? ` (moved ${b.moved} m back, behind the barrier)` : ''}`);
for (const s of out.stands) console.log(`stands      ${s.name.padEnd(24)} ${s.pts.length} ${s.fam}${s.back ? `, moved ${s.back} m back behind the barrier` : ''}`);
