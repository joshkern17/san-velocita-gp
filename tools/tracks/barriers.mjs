// A real circuit's barriers laid out to sculpt: one barrier down each side, an even distance from the track edge,
// with as few nodes as keep it smooth (js/evenbarriers.js: the editor's Even Out button does the same).
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/barriers.mjs <id> [distance m, default env.runoff] [--write]
// --write: into tracks/real/dress/<id>.json (build.mjs keeps it through rebuilds) and tracks/real/<id>.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTrack, analyzeTrack } from '../../js/track.js';
import { evenBarriers } from '../../js/evenbarriers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), WRITE = args.includes('--write'), pos = args.filter(a => !a.startsWith('--'));
const id = pos[0], f = path.join(ROOT, 'tracks/real', id + '.json');
const track = JSON.parse(fs.readFileSync(f, 'utf8'));
const TOL = +(process.env.TOL || 0.5); // (m: how far the fitted curve may stray from the even line)
const DIST = +(pos[1] || track.env.runoff || 14);

const T = sampleTrack(track), L = T.L;
const A = analyzeTrack(T, track.env, track.paint, track.osm, null);
const { barriers, stats } = evenBarriers(T, A, track.env, { dist: DIST, tol: TOL });
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
