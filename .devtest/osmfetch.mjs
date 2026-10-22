// dev: download (once, cached) the OpenStreetMap roads, buildings and trees around a saved track, for the road importer's
// checks.   node --import ./tools/tracks/three-hook.mjs .devtest/osmfetch.mjs "<track name>" [margin]
import fs from 'node:fs';
import { sampleTrack } from '../js/track.js';
import { toLatLon } from '../js/geo.js';
const [name, margin = 250] = process.argv.slice(2);
const all = [JSON.parse(fs.readFileSync('saves/storage/svgp.editorWork.txt', 'utf8')), ...JSON.parse(fs.readFileSync('saves/storage/svgp.tracks.txt', 'utf8'))];
const t = all.find(q => q && q.name === name); if (!t) throw new Error('no track ' + name);
const T = sampleTrack(t), m = +margin;
const box = [Math.min(...T.X) - m, Math.min(...T.Z) - m, Math.max(...T.X) + m, Math.max(...T.Z) + m];
const [n, w] = toLatLon(t.geo, box[0], box[1]), [s, e] = toLatLon(t.geo, box[2], box[3]);
const bb = `${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}`;
const q = `[out:json][timeout:90];(way["highway"](${bb});way["building"](${bb});node["natural"="tree"](${bb});way["natural"="wood"](${bb});way["landuse"="forest"](${bb}););out geom qt;`;
const out = `.devtest/out/roads/${name.replace(/\W+/g, '_')}.osm.json`;
if (!fs.existsSync(out)) {
  let r;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SanVelocitaGP-dev/1.0', 'Accept': 'application/json' } }).catch(e => ({ ok: false, status: e.message }));
    console.log(url, r.status); if (r.ok) break;
  }
  if (!r.ok) throw new Error('overpass ' + r.status);
  fs.writeFileSync(out, JSON.stringify({ box, data: await r.json() }));
}
const { data } = JSON.parse(fs.readFileSync(out, 'utf8'));
const c = {}; for (const el of data.elements) { const k = el.tags?.highway ? 'hw:' + el.tags.highway : el.tags?.building ? 'building' : el.type + ':' + (el.tags?.natural || el.tags?.landuse); c[k] = (c[k] || 0) + 1; }
console.log(out, 'box km²', ((box[2] - box[0]) * (box[3] - box[1]) / 1e6).toFixed(2), c);
const sw = {}; for (const el of data.elements) if (el.tags?.highway) { const v = el.tags.sidewalk || '-'; sw[v] = (sw[v] || 0) + 1; } console.log('sidewalk tags', sw, 'has nodes', !!data.elements.find(e => e.type === 'way')?.nodes);
