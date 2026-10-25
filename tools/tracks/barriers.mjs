// A real circuit's barriers laid out to sculpt: one barrier down each side, an even distance from the track edge,
// with as few nodes as keep it smooth (js/evenbarriers.js: the editor's Even Out button does the same).
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/barriers.mjs <id> [distance m, default env.runoff] [--write]
// --write: into tracks/real/dress/<id>.json (build.mjs keeps it through rebuilds) and tracks/real/<id>.json.
// --mapped: each side as far out as the map's barriers (track.osm.walls) roughly are, not one distance: their gist,
// a rolling median over 120 m eased over 80 m, kept between MIN and MAX m (env), the distance arg where none is mapped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTrack, analyzeTrack } from '../../js/track.js';
import { evenBarriers } from '../../js/evenbarriers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), WRITE = args.includes('--write'), MAPPED = args.includes('--mapped'), pos = args.filter(a => !a.startsWith('--'));
const id = pos[0], f = path.join(ROOT, 'tracks/real', id + '.json');
const track = JSON.parse(fs.readFileSync(f, 'utf8'));
const TOL = +(process.env.TOL || 0.5); // (m: how far the fitted curve may stray from the even line)
const DIST = +(pos[1] || track.env.runoff || 14);

const T = sampleTrack(track), L = T.L;
const A = analyzeTrack(T, track.env, track.paint, track.osm, null);
const dists = MAPPED ? mappedDists() : null;
let { barriers, stats } = evenBarriers(T, A, track.env, { dist: DIST, tol: TOL, dists, type: process.env.TYPE || null });
// (mapped: where the fit had to come in (it doesn't fit that far out there), the asked-for line comes in too, as smoothly
// as the rest, so the barrier rounds it instead of being notched in)
if (MAPPED && !process.env.NONOTCH) for (let pass = 0; pass < 1; pass++) {
  let moved = 0;
  const A2 = analyzeTrack(T, track.env, track.paint, track.osm, { ...(track.dress || {}), barriers }); // (as the game reads them)
  for (const b of barriers) {
    const got = Float32Array.from((b.side < 0 ? A2.BL : A2.BR), (v, i) => v - T.W[i] / 2);
    const want = dists[b.side], short = Float32Array.from(want, (v, i) => (got[i] < v - 1 && got[i] >= +(process.env.MIN || 6) ? got[i] - 0.3 : Infinity)); // (a notch: > 1 m in; not a hairpin's apex, where the game folds an inside barrier in to the kerb whatever is asked)
    const m = Math.round(25 / T.ds), wrap = (i) => ((i % T.N) + T.N) % T.N;
    let o = Float32Array.from(want, (v, i) => { let r = v; for (let k = -m; k <= m; k++) r = Math.min(r, short[wrap(i + k)]); return r; });
    for (let q = 0; q < 3; q++) o = Float32Array.from(o, (_, i) => { let v = 0; for (let k = -m; k <= m; k++) v += o[wrap(i + k)]; return v / (2 * m + 1); });
    for (let i = 0; i < T.N; i++) { moved = Math.max(moved, want[i] - Math.min(want[i], o[i])); want[i] = Math.min(want[i], o[i]); }
  }
  if (moved < 0.05) break;
  ({ barriers, stats } = evenBarriers(T, A, track.env, { dist: DIST, tol: TOL, dists, type: process.env.TYPE || null }));
}

// how far out the map's rails / walls stand (fences only where a side has no rail): a ray across the road from each
// sample, the nearest crossing past the edge and within REACH m
function mappedDists() {
  const N = T.N, REACH = +(process.env.REACH || 70), MIN = +(process.env.MIN || 6), MAX = +(process.env.MAX || 45);
  const W = (track.osm && track.osm.walls) || [], segsOf = (ks) => W.filter(w => ks.includes(w.k)).flatMap(w => w.p.slice(1).map((q, k) => [w.p[k], q]));
  const wrap = (i) => ((i % N) + N) % N, out = {};
  for (const side of [-1, 1]) {
    const hit = (segs) => { const r = new Float32Array(N).fill(NaN);
      for (let i = 0; i < N; i++) {
        const ox = T.X[i], oz = T.Z[i], dx = -T.FZ[i] * side, dz = T.FX[i] * side, e = T.W[i] / 2;
        let best = Infinity;
        for (const [a, b] of segs) {
          if (Math.abs(a[0] - ox) > REACH + 60 && Math.abs(b[0] - ox) > REACH + 60) continue;
          const sx = b[0] - a[0], sz = b[1] - a[1], den = dx * sz - dz * sx; if (Math.abs(den) < 1e-9) continue;
          const t = ((a[0] - ox) * sz - (a[1] - oz) * sx) / den, u = ((a[0] - ox) * dz - (a[1] - oz) * dx) / den;
          if (u >= 0 && u <= 1 && t > e + 1 && t < e + REACH && t < best) best = t;
        }
        if (best < Infinity) r[i] = best - e;
      }
      return r; };
    let raw = hit(segsOf(['rail', 'wall', 'tires']));
    if (raw.filter(v => v === v).length < N * 0.3) raw = hit(segsOf(['rail', 'wall', 'tires', 'fence']));
    // the gist: the median over 120 m (gaps and stray bits of other roads' rails drop out), eased over 80 m twice
    const w = Math.round(60 / T.ds), m = Math.round(40 / T.ds);
    let o = Float32Array.from(raw, (_, i) => { const v = []; for (let k = -w; k <= w; k += 2) { const x = raw[wrap(i + k)]; if (x === x) v.push(x); } if (v.length < 6) return DIST; v.sort((a, b) => a - b); return Math.max(MIN, Math.min(MAX, v[v.length >> 1])); });
    // (on a corner's inside, never more than 60% of the room the corner leaves there, so it rounds the inside
    // instead of being notched in where it won't fit; the least within 40 m either side)
    const room = Float32Array.from(o, (_, i) => {
      const a = wrap(i - 3), b = wrap(i + 3), p = (j, q) => [T.X[j] - T.FZ[j] * side * q, T.Z[j] + T.FX[j] * side * q];
      const [ax, az] = p(a, 10), [bx, bz] = p(b, 10), inside = Math.hypot(bx - ax, bz - az) < Math.hypot(T.X[b] - T.X[a], T.Z[b] - T.Z[a]);
      return inside && Math.abs(T.K[i]) > 1e-4 ? Math.max(MIN, 0.6 * (1 / Math.abs(T.K[i]) - T.W[i] / 2)) : Infinity; });
    o = Float32Array.from(o, (v, i) => { let r = Infinity; for (let k = -m; k <= m; k++) r = Math.min(r, room[wrap(i + k)]); return Math.min(v, r); });
    for (let pass = 0; pass < 3; pass++) o = Float32Array.from(o, (_, i) => { let v = 0; for (let k = -m; k <= m; k++) v += o[wrap(i + k)]; return v / (2 * m + 1); });
    const got = raw.filter(v => v === v).length;
    console.log(`  ${side < 0 ? 'left ' : 'right'}: mapped barrier found at ${(got / N * 100).toFixed(0)}% of the lap, eased ${Math.min(...o).toFixed(1)}-${Math.max(...o).toFixed(1)} m out`);
    out[side] = o;
  }
  return out;
}
console.log(`${track.name}: ${stats.map(s => `${s.side < 0 ? 'left ' : 'right'}: ${s.nodes} nodes over ${s.km.toFixed(2)} km${s.closed ? ' (the whole lap)' : ''}, ` +
  `${DIST} m out (${s.closest.toFixed(1)} m at the closest), off the even line by ${s.worst.toFixed(2)} m at most`).join('\n  ')}`);
if (WRITE) {
  const df = path.join(ROOT, 'tracks/real/dress', id + '.json');
  const dress = fs.existsSync(df) ? JSON.parse(fs.readFileSync(df, 'utf8')) : { kerbs: [], walls: [] };
  dress.barriers = barriers;
  fs.mkdirSync(path.dirname(df), { recursive: true }); fs.writeFileSync(df, JSON.stringify(dress, null, 1));
  track.dress = { ...(track.dress || {}), barriers }; fs.writeFileSync(f, JSON.stringify(track));
  console.log(`written: tracks/real/dress/${id}.json and tracks/real/${id}.json`);
}
if (process.env.SEGS) for (const b of barriers) console.log(b.side, b.pts.map((p, k) => k ? Math.round(((p[0] - b.pts[k - 1][0]) % L + L) % L) : 0).join(' '));
