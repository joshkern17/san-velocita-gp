// dev: download (once, cached) the OpenStreetMap water around a track file and add it to a copy of the track
// (track.osm.water, as the editor's MAP import does), for the water checks and shots.
//   node --import ./tools/tracks/three-hook.mjs .devtest/waterfetch.mjs <file.svgp.json> <out.json> [margin=300]
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { toLatLon } from '../js/geo.js';
import { WATER_QUERY, waterPolys, inWater } from '../js/water.js';
const [file, outFile, margin = 300] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(file, 'utf8')), t = j.track || j, T = sampleTrack(t), m = +margin;
const box = [Math.min(...T.X) - m, Math.min(...T.Z) - m, Math.max(...T.X) + m, Math.max(...T.Z) + m];
const [n, w] = toLatLon(t.geo, box[0], box[1]), [s, e] = toLatLon(t.geo, box[2], box[3]);
const bb = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
const cache = `.devtest/out/water/${t.name.replace(/\W+/g, '_')}.osm.json`;
if (!fs.existsSync(cache)) {
  const q = `[out:json][timeout:90];(${WATER_QUERY(bb)});out geom qt;`;
  let r;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SanVelocitaGP-dev/1.0' } }).catch(e => ({ ok: false, status: e.message }));
    console.log(url, r.status); if (r.ok) break;
  }
  if (!r.ok) throw new Error('overpass ' + r.status);
  fs.writeFileSync(cache, JSON.stringify(await r.json()));
}
const data = JSON.parse(fs.readFileSync(cache, 'utf8'));
const water = waterPolys(data.elements, t.geo, box);
console.log(`${data.elements.length} elements -> ${water.length} water areas:`, water.map(q => `${(Math.abs(q.p.reduce((s, a, i) => { const b = q.p[(i + 1) % q.p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2e4).toFixed(2)} ha${q.h && q.h.length ? ` (${q.h.length} islands)` : ''}`).join(', '));
t.osm = t.osm || { buildings: [], trees: [] };
t.osm.water = water;
const before = t.osm.trees.length; t.osm.trees = t.osm.trees.filter(q => !inWater(water, q[0], q[1], -1.5));
console.log(`trees in the water removed: ${before - t.osm.trees.length}`);
let wet = 0; for (let i = 0; i < T.N; i++) if (inWater(water, T.X[i], T.Z[i])) wet++;
console.log(`track samples over water: ${wet} (${(wet * T.ds).toFixed(0)} m: a bridge or a causeway)`);
fs.writeFileSync(outFile, JSON.stringify(j)); console.log('wrote', outFile);
