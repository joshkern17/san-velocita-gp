// Move real circuits' start/finish lines to where the importer puts them now (js/startline.js: the middle of the
// straight beside the pit lane, else of the longest straight), keeping their barriers, curbs, pit lane and corner
// names where they are (in the circuit, its dress file and its edits file).
//   node --import ./tools/tracks/three-hook.mjs tools/tracks/fixstarts.mjs <id> [...] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTrack } from '../../js/track.js';
import { pitStraightStart, moveStart } from '../../js/startline.js';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tracks/real');
const args = process.argv.slice(2), DRY = args.includes('--dry'), ids = args.filter(a => !a.startsWith('--'));
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const xf = path.join(OUT, 'index.json'), index = read(xf);
for (const id of ids) {
  const f = path.join(OUT, id + '.json'), t = read(f), T = sampleTrack(t);
  const s = pitStraightStart(T, t.osm && t.osm.pitLane, t.points.length);
  const k = s ? s.node : 0, at = (d) => (d > T.L / 2 ? d - T.L : d), d = k ? at(T.D[Math.max(0, [...T.NODE].findIndex(v => Math.round(v) % t.points.length === k))]) : 0;
  console.log(`${t.name}: ${k ? `start moves ${d.toFixed(0)} m, to node ${k} (the middle of the ${s.how}, ${s.len.toFixed(0)} m)` : 'stays'}`);
  if (!k || DRY) continue;
  const df = path.join(OUT, 'dress', id + '.json'), ef = path.join(OUT, 'edits', id + '.json'), dress = read(df), edits = read(ef);
  moveStart(T, t, k, [...(dress ? [{ dress }] : []), ...(edits ? [edits] : [])]);
  fs.writeFileSync(f, JSON.stringify(t));
  if (dress) fs.writeFileSync(df, JSON.stringify(dress, null, 1));
  if (edits) fs.writeFileSync(ef, JSON.stringify(edits, null, 1));
  const { osm, terrain, dress: _d, ground, ...light } = t, i = index.findIndex(e => e.real && e.real.id === id);
  if (i >= 0) index[i] = { ...light, file: id + '.json' };
}
if (!DRY) fs.writeFileSync(xf, JSON.stringify(index));
